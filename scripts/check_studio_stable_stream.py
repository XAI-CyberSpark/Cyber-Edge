"""Real TCP regression: restart a disposable Vite proxy during two fixture streams.

No production service, saved project or model is touched.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import socket
import subprocess
import sys
import tempfile
import threading
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def ready(url, process):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Fixture process exited')
        try:
            if httpx.get(url, timeout=1).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(.1)
    raise TimeoutError(url)


def read_stream(url, started):
    result = []
    try:
        with httpx.stream('POST', url + '/v1/orchestration/generate-stream', timeout=15) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line.startswith('event:'):
                    result.append(line)
                    started.set()
        return result, None
    except httpx.HTTPError as exc:
        return result, type(exc).__name__


def main():
    processes = []
    try:
        with tempfile.TemporaryDirectory(prefix='oakegde-stream-check-') as temporary:
            root = Path(temporary)
            (root / 'index.html').write_text('fixture')
            stable_port, dev_port = free_port(), free_port()
            fixture = root / 'fixture.py'
            fixture.write_text('''import asyncio, sys
from pathlib import Path
from starlette.responses import JSONResponse, StreamingResponse
import uvicorn
sys.path.insert(0, sys.argv[1])
from studio_stable_server import StudioApp
async def events():
    yield 'event: thinking\\ndata: {}\\n\\n'
    await asyncio.sleep(5)
    yield 'event: result\\ndata: {}\\n\\n'
async def backend(scope, receive, send):
    response = StreamingResponse(events(), media_type='text/event-stream') if scope['path'].endswith('generate-stream') else JSONResponse({'ok': True})
    await response(scope, receive, send)
uvicorn.run(StudioApp(backend, Path(__file__).parent), host='127.0.0.1', port=int(sys.argv[2]), lifespan='off', log_level='error')
''')
            stable = f'http://127.0.0.1:{stable_port}'
            dev = f'http://127.0.0.1:{dev_port}'
            backend = subprocess.Popen([sys.executable, str(fixture), str(ROOT / 'scripts'), str(stable_port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            processes.append(backend)
            ready(stable + '/health', backend)
            config = root / 'vite.config.mjs'
            config.write_text('export default ' + json.dumps({'server': {'host': '127.0.0.1', 'port': dev_port, 'strictPort': True, 'proxy': {'/v1': {'target': stable}}}}))
            command = ['node', str(ROOT / 'studio/node_modules/vite/bin/vite.js'), '--config', str(config)]
            proxy = subprocess.Popen(command, cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            processes.append(proxy)
            ready(dev, proxy)
            with ThreadPoolExecutor(max_workers=2) as pool:
                direct_first, proxy_first = threading.Event(), threading.Event()
                direct = pool.submit(read_stream, stable, direct_first)
                indirect = pool.submit(read_stream, dev, proxy_first)
                assert direct_first.wait(5) and proxy_first.wait(5), 'First SSE event missing'
                proxy.terminate()
                proxy.wait(timeout=10)
                restarted = subprocess.Popen(command, cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                processes.append(restarted)
                ready(dev, restarted)
                direct_events, direct_error = direct.result(timeout=15)
                proxy_events, proxy_error = indirect.result(timeout=15)
                assert direct_error is None and 'event: result' in direct_events, (direct_events, direct_error)
                assert 'event: result' not in proxy_events, proxy_events
                assert backend.poll() is None
                print(json.dumps({'stable_stream': direct_events, 'stable_error': direct_error,
                                  'dev_stream': proxy_events, 'dev_error': proxy_error,
                                  'dev_restarted': True, 'model_calls': 0}, ensure_ascii=False))
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)


if __name__ == '__main__':
    main()
