"""Isolated data and ASGI transport checks; no real models or user projects."""
import asyncio
import errno
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import httpx
from starlette.responses import JSONResponse, StreamingResponse
import studio_stable
from studio_stable_server import StudioApp


class StableTests(unittest.TestCase):
    def test_start_refuses_occupied_or_unverifiable_port(self):
        with tempfile.TemporaryDirectory() as temporary:
            stable = Path(temporary)
            release = stable / 'releases/example'
            release.mkdir(parents=True)
            (release / 'manifest.json').write_text('{}')
            (stable / 'selected').write_text(str(release))
            with patch.object(studio_stable, 'STABLE_ROOT', stable), patch.object(studio_stable.socket, 'socket') as socket, patch.object(studio_stable.os, 'execv') as execute:
                for result in (0, errno.EPERM):
                    socket.return_value.__enter__.return_value.connect_ex.return_value = result
                    with self.assertRaises(SystemExit):
                        studio_stable.start()
                execute.assert_not_called()

    def test_seed_once_and_sqlite_wal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'backend/projects').mkdir(parents=True)
            (root / 'backend/state').mkdir()
            project = root / 'backend/projects/example.json'
            project.write_text('{"name":"original"}')
            db = sqlite3.connect(root / 'backend/state/example.sqlite3')
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE records (value TEXT)')
            db.execute("INSERT INTO records VALUES ('committed')")
            db.commit()
            stable = root / 'stable'
            stable.mkdir()
            with patch.object(studio_stable, 'ROOT', root), patch.object(studio_stable, 'STABLE_ROOT', stable):
                data = studio_stable.seed_data()
                self.assertFalse((data / 'projects').is_symlink())
                with sqlite3.connect(data / 'state/example.sqlite3') as copied:
                    self.assertEqual(copied.execute('SELECT value FROM records').fetchone(), ('committed',))
                saved = data / 'projects/example.json'
                saved.write_text('{"name":"daily edit"}')
                project.write_text('{"name":"dev edit"}')
                studio_stable.seed_data()
                self.assertEqual(json.loads(saved.read_text())['name'], 'daily edit')
            db.close()

    def test_http_routing_and_private_files(self):
        async def check():
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                front = root / 'frontend'
                front.mkdir()
                (front / 'index.html').write_text('<html>frozen</html>')
                (root / 'API_KEY.txt').write_text('private fixture')
                async def backend(scope, receive, send):
                    await JSONResponse({'path': scope['path']})(scope, receive, send)
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=StudioApp(backend, front)), base_url='http://test') as client:
                    for path in ('/', '/docs', '/docs/?doc=api'):
                        self.assertIn('frozen', (await client.get(path)).text)
                    self.assertEqual((await client.get('/v1/projects/')).json()['path'], '/v1/projects/')
                    self.assertEqual((await client.get('/health')).status_code, 200)
                    for path in ('/API_KEY.txt', '/%2e%2e/API_KEY.txt', '/.demo-runtime/model-providers.json', '/assets/missing.js'):
                        self.assertEqual((await client.get(path)).status_code, 404)
        asyncio.run(check())

    def test_sse_is_forwarded_before_completion(self):
        async def check():
            with tempfile.TemporaryDirectory() as temporary:
                received = []
                first_chunk = asyncio.Event()
                finish = asyncio.Event()
                async def events():
                    yield 'event: thinking\ndata: {}\n\n'
                    await finish.wait()
                    yield 'event: result\ndata: {}\n\n'
                async def backend(scope, receive, send):
                    await StreamingResponse(events(), media_type='text/event-stream')(scope, receive, send)
                async def send(message):
                    if message['type'] == 'http.response.body':
                        received.append(message.get('body', b''))
                        first_chunk.set()
                async def receive():
                    await asyncio.Event().wait()
                scope = {'type': 'http', 'method': 'POST', 'path': '/v1/orchestration/generate-stream',
                         'headers': [], 'asgi': {'spec_version': '2.4'}}
                task = asyncio.create_task(StudioApp(backend, Path(temporary))(scope, receive, send))
                await asyncio.wait_for(first_chunk.wait(), 2)
                self.assertFalse(task.done())
                self.assertIn(b'event: thinking', b''.join(received))
                finish.set()
                await asyncio.wait_for(task, 2)
                self.assertIn(b'event: result', b''.join(received))
        asyncio.run(check())

    def test_non_http_reaches_backend(self):
        async def check():
            seen = []
            async def backend(scope, receive, send):
                seen.append(scope['type'])
            with tempfile.TemporaryDirectory() as temporary:
                app = StudioApp(backend, Path(temporary))
                await app({'type': 'lifespan'}, None, None)
                await app({'type': 'websocket', 'path': '/telemetry/ws'}, None, None)
                self.assertEqual(seen, ['lifespan', 'websocket'])
        asyncio.run(check())


if __name__ == '__main__':
    unittest.main()
