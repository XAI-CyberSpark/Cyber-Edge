"""Build a source + prebuilt-web Windows bundle, excluding OpenSparX weights/runtime."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import zipfile
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
IGNORE = shutil.ignore_patterns('node_modules', '.git', '__pycache__', '*.pyc', '.DS_Store', '.venv*', 'target', 'dist', 'build', '*.zip', '*.log', '.env', '.env.*')

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''): value.update(block)
    return value.hexdigest()

def prepare(destination):
    destination.mkdir(parents=True, exist_ok=False)
    def copy(relative):
        source = ROOT / relative; target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_dir(): shutil.copytree(source, target, ignore=IGNORE)
        else: shutil.copy2(source, target)
    for relative in ['backend/app', 'backend/projects', 'backend/pipelines', 'backend/state',
                     'studio/src', 'studio/public', 'studio/scripts', 'studio/tests',
                     'scripts', 'deploy/windows', 'docs/product', 'core', 'hal', 'runtime', 'manifests', 'examples']:
        copy(relative)
    for name in ['VERSION', 'CONTEXT.md', 'CHANGELOG.md', 'AGENTS.md']:
        copy(name)
    for source in (ROOT / 'backend').glob('*.py'): copy(str(source.relative_to(ROOT)))
    for source in (ROOT / 'backend').glob('requirements*.txt'): copy(str(source.relative_to(ROOT)))
    for source in (ROOT / 'studio').iterdir():
        if source.is_file() and (source.suffix in ('.json', '.js', '.ts', '.html') or source.name.startswith('README')):
            copy(str(source.relative_to(ROOT)))
    copy('backend/API_KEY.txt')  # User explicitly authorized carrying the existing cloud API key.
    (destination / 'backend/API_KEY.txt').chmod(0o600)
    copy('models/sensevoice-small-int8')
    (destination / 'config').mkdir()
    shutil.copy2(ROOT / '.demo-runtime/access-key.txt', destination / 'config/access-key.txt')
    (destination / 'config/access-key.txt').chmod(0o600)
    (destination / 'config/server.json').write_text(json.dumps({
        'host': '127.0.0.1', 'port': 5175, 'public_url': 'http://127.0.0.1:5175',
        'workflow_base_url': 'https://api.minimaxi.com/v1', 'workflow_model': 'MiniMax-M3',
        'opensparx_base_url': 'http://127.0.0.1:11435/v1', 'ollama_base_url': 'http://127.0.0.1:11435/v1',
        'extra_origins': []}, indent=2) + '\n')
    for name in ('INSTALL.cmd', 'START.cmd', 'CHECK.cmd'):
        shutil.copy2(ROOT / 'deploy/windows' / name, destination / name)
    shutil.copy2(ROOT / 'deploy/windows/README.md', destination / '先读我-Windows部署.md')
    modules = destination / 'studio/node_modules'
    modules.symlink_to(ROOT / 'studio/node_modules', target_is_directory=True)
    try:
        env = dict(os.environ); env.pop('VITE_API_URL', None)
        subprocess.run(['npm', 'run', 'build'], cwd=destination / 'studio', env=env, check=True)
    finally:
        if modules.is_symlink(): modules.unlink()
    shutil.move(str(destination / 'studio/dist'), str(destination / 'frontend'))
    print('PREPARED', destination, flush=True)


def finish(destination, wheels):
    shutil.copytree(wheels, destination / 'wheels', dirs_exist_ok=True)
    # The root requirement lock is resolved from the exact Windows wheel set.
    from email.parser import Parser
    versions = {}
    for wheel in (destination / 'wheels').glob('*.whl'):
        with zipfile.ZipFile(wheel) as archive:
            name = next(name for name in archive.namelist() if name.endswith('.dist-info/METADATA'))
            metadata = Parser().parsestr(archive.read(name).decode())
            versions[metadata['Name']] = metadata['Version']
    (destination / 'deploy/windows/requirements.txt').write_text(''.join(f'{name}=={version}\n' for name, version in sorted(versions.items())))
    files = sorted(path for path in destination.rglob('*') if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc')
    relative = [str(path.relative_to(destination)).replace(os.sep, '/') for path in files]
    assert not any('models/OpenSparX-' in name or 'models/ollama-opensparx/' in name or '/node_modules/' in name or '/.venv' in name or name.endswith(('.safetensors', '.gguf')) for name in relative)
    manifest = {'product_version': (destination/'VERSION').read_text().strip(), 'created_at': datetime.now().isoformat(),
        'target': 'Windows x64, Python 3.12', 'contains_api_credentials': True,
        'excludes': ['OpenSparX raw weights', 'Ollama model blobs', 'Ollama runtime', 'macOS virtualenv', 'node_modules'],
        'includes': ['frontend build', 'frontend source', 'backend API source', 'saved projects', 'SU7', 'ASR model', 'Windows dependency wheels'],
        'files': {name: digest(path) for path, name in zip(files, relative)}}
    (destination / 'PACKAGE-MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    # Do not include temporary testing logs or Python bytecode generated by an extraction test.
    archive_path = Path(str(destination) + '.zip')
    with zipfile.ZipFile(archive_path, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name in [*relative, 'PACKAGE-MANIFEST.json']:
            archive.write(destination / name, 'OAKEgde-Studio-Windows/' + name)
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.testzip() is None
    checksum = digest(archive_path)
    archive_path.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive_path.name}\n')
    print(json.dumps({'zip': str(archive_path), 'bytes': archive_path.stat().st_size, 'sha256': checksum, 'files': len(relative)}, ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('action', choices=['prepare', 'finish']); parser.add_argument('destination', type=Path); parser.add_argument('--wheels', type=Path, default=ROOT/'.demo-runtime/windows-wheels'); args = parser.parse_args()
    if args.action == 'prepare': prepare(args.destination.resolve())
    else: finish(args.destination.resolve(), args.wheels.resolve())
