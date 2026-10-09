"""Explicitly prepare or run a local snapshot. Never restart a running Studio."""
from datetime import datetime
from pathlib import Path
import argparse
import errno
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STABLE_ROOT = ROOT / '.demo-runtime/stable'
IGNORE = shutil.ignore_patterns('node_modules', '__pycache__', '*.pyc', '.DS_Store',
                               '.git', '.env', '.env.*', 'dist', 'target', '*.tsbuildinfo')


def copy_data(source, target):
    """Copy saved data; SQLite backup includes committed WAL transactions."""
    target.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        return
    for item in source.iterdir():
        dest = target / item.name
        if item.is_dir():
            copy_data(item, dest)
        elif item.name.endswith(('-wal', '-shm')):
            continue
        elif item.suffix == '.sqlite3':
            with sqlite3.connect(item.as_uri() + '?mode=ro', uri=True) as src:
                with sqlite3.connect(dest) as dst:
                    src.backup(dst)
        else:
            shutil.copy2(item, dest)


def seed_data():
    data = STABLE_ROOT / 'data'
    if data.exists():
        return data
    with tempfile.TemporaryDirectory(prefix='seed-', dir=STABLE_ROOT) as temporary:
        staging = Path(temporary) / 'data'
        staging.mkdir(mode=0o700)
        for name in ('projects', 'pipelines', 'state'):
            copy_data(ROOT / 'backend' / name, staging / name)
        config = staging / 'config'
        config.mkdir(mode=0o700)
        for name in ('model-providers.json', 'orchestration-engine.json', 'mcp-servers.json',
                     'mcp-runtime.json', 'access-key.txt', 'rear-seat-demo.mp4'):
            source = ROOT / '.demo-runtime' / name
            if source.exists():
                shutil.copy2(source, config / name)
                (config / name).chmod(0o600)
        key = ROOT / 'backend/API_KEY.txt'
        if key.exists():
            shutil.copy2(key, staging / 'API_KEY.txt')
            (staging / 'API_KEY.txt').chmod(0o600)
        # Existing per-package Python environments contain absolute paths; keep them
        # in place as dependencies. New installs belong to the isolated config tree.
        packages = config / 'mcp-packages'
        packages.mkdir()
        source = ROOT / '.demo-runtime/mcp-packages'
        if source.exists():
            for item in source.iterdir():
                if item.is_dir() and (item / 'bin/python').exists():
                    (packages / item.name).symlink_to(item, target_is_directory=True)
        staging.rename(data)
    return data


def prepare():
    STABLE_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    releases = STABLE_ROOT / 'releases'
    releases.mkdir(exist_ok=True)
    version = (ROOT / 'VERSION').read_text().strip()
    release = releases / f'{version}-{datetime.now():%Y%m%d-%H%M%S-%f}'
    release.mkdir()
    # Build from copies too: developer edits or subsequent builds cannot change
    # the already-running bundle. No source symlinks are retained.
    for name in ('studio', 'docs', 'backend/app', 'backend/config', 'core', 'hal',
                 'runtime', 'manifests', 'examples', 'scripts'):
        shutil.copytree(ROOT / name, release / name, ignore=IGNORE)
    for name in ('VERSION', 'CHANGELOG.md', 'CONTEXT.md'):
        shutil.copy2(ROOT / name, release / name)
    shutil.copy2(ROOT / 'backend/main_host_lite.py', release / 'backend/main_host_lite.py')
    modules = release / 'studio/node_modules'
    modules.symlink_to(ROOT / 'studio/node_modules', target_is_directory=True)
    try:
        env = {k: v for k, v in os.environ.items() if not k.startswith('VITE_')}
        subprocess.run(['npm', 'run', 'build'], cwd=release / 'studio', env=env, check=True)
    finally:
        modules.unlink()
    shutil.move(str(release / 'studio/dist'), release / 'frontend')
    data = seed_data()
    for name in ('projects', 'pipelines', 'state'):
        (release / 'backend' / name).symlink_to(data / name, target_is_directory=True)
    (release / '.demo-runtime').symlink_to(data / 'config', target_is_directory=True)
    if (data / 'API_KEY.txt').exists():
        (release / 'backend/API_KEY.txt').symlink_to(data / 'API_KEY.txt')
    (release / 'models').mkdir()
    model = ROOT / 'models/sensevoice-small-int8'
    if model.exists():
        (release / 'models/sensevoice-small-int8').symlink_to(model, target_is_directory=True)
    manifest = {'version': version, 'source': 'uncommitted workspace snapshot',
                'created_at': datetime.now().isoformat(), 'url': 'http://127.0.0.1:5175',
                'data': str(data), 'files': {}}
    for folder in ('frontend', 'backend/app', 'scripts'):
        for file in sorted((release / folder).rglob('*')):
            if file.is_file():
                manifest['files'][str(file.relative_to(release))] = hashlib.sha256(file.read_bytes()).hexdigest()
    file = release / 'backend/main_host_lite.py'
    manifest['files']['backend/main_host_lite.py'] = hashlib.sha256(file.read_bytes()).hexdigest()
    (release / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    # Selection only affects the next start. An active process keeps its absolute path.
    next_file = STABLE_ROOT / 'selected.next'
    next_file.write_text(str(release) + '\n')
    next_file.replace(STABLE_ROOT / 'selected')
    print(f'已准备 {release}\n日常数据：{data}\n运行：python3 scripts/studio_stable.py start')


def start():
    release = Path((STABLE_ROOT / 'selected').read_text().strip())
    release.relative_to(STABLE_ROOT / 'releases')
    if not (release / 'manifest.json').is_file():
        raise SystemExit('版本未准备完成，请先 prepare。')
    with socket.socket() as sock:
        sock.settimeout(2)
        result = sock.connect_ex(('127.0.0.1', 5175))
        if result == 0:
            raise SystemExit('5175 已占用；未停止或替换任何服务。')
        if result != errno.ECONNREFUSED:
            raise SystemExit('无法确认5175是否空闲；未启动新进程，请检查本机网络权限。')
    python = ROOT / 'backend/.venv_macos/bin/python'
    if not python.exists():
        raise SystemExit('本机 Python 环境不存在，请先配置后端依赖。')
    print(f'日常 Studio：http://127.0.0.1:5175\n固定版本：{release.name}', flush=True)
    os.execv(str(python), [str(python), '-B', str(release / 'scripts/studio_stable_server.py')])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'start'))
    args = parser.parse_args()
    prepare() if args.action == 'prepare' else start()
