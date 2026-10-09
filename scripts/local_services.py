"""Run the local stack in the foreground; Ctrl+C stops only its child services."""
from pathlib import Path
import os
import signal
import socket
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
SERVICES = [('opensparx', 11435, 'start_opensparx.sh'), ('backend', 8000, 'start_backend_host_lite.sh'), ('studio', 5173, 'start_studio_host.sh')]
processes = []
handles = []

def stop(*_):
    for process in processes:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
    for process in processes:
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
    for handle in handles:
        handle.close()

if __name__ == '__main__':
    for name, port, _ in SERVICES:
        with socket.socket() as sock:
            sock.settimeout(1)
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                raise SystemExit(f'{name}: 端口 {port} 已被占用，请先停止原服务；未启动新进程。')
    logs = ROOT / '.demo-runtime' / 'logs'
    logs.mkdir(parents=True, exist_ok=True)
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        for name, _, script in SERVICES:
            log = (logs / f'{name}.log').open('a')
            handles.append(log)
            process = subprocess.Popen(['bash', str(ROOT / 'scripts' / script)], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            processes.append(process)
        print('正在启动 OAKEgde Studio：http://127.0.0.1:5173；日志 .demo-runtime/logs；Ctrl+C 停止全部服务。', flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(1)
        raise SystemExit('服务退出，请查看 .demo-runtime/logs。')
    except KeyboardInterrupt:
        pass
    finally:
        stop()
