"""Explicit official-weight setup/check for the isolated local BGE runtime.

Run from the repository root with host-lite Python:
  python scripts/setup_capability_embeddings.py --prepare
  python scripts/setup_capability_embeddings.py --check
Only --prepare installs/downloads, exclusively under the dedicated runtime.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.services.capability_embeddings import (DEFAULT_RUNTIME_DIR, MODEL_FILES, MODEL_ID,
                                                MODEL_REVISION, EmbeddingUnavailable,
                                                LocalEmbeddingProvider, verify_model_files)


def _run(command, runtime_dir, *, capture=False):
    environment = os.environ.copy()
    for name in list(environment):
        if name.upper().startswith('PIP_') or name.upper() in ('PYTHONPATH', 'PYTHONHOME'):
            environment.pop(name)
    environment['PYTHONUTF8'] = '1'
    environment['PYTHONNOUSERSITE'] = '1'
    # Disallow user/global pip configuration and environment install redirects.
    environment['PIP_CONFIG_FILE'] = os.devnull
    environment['PIP_CACHE_DIR'] = str(runtime_dir / 'pip-cache')
    return subprocess.run(command, check=True, timeout=600, env=environment,
                          text=True, encoding='utf-8', capture_output=capture,
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)


def prepare_runtime(runtime_dir):
    """All mutations stay inside the dedicated directory, never daily/stable."""
    runtime_dir = Path(runtime_dir).resolve()
    allowed = (ROOT / '.demo-runtime' / 'capability-embeddings').resolve()
    if runtime_dir != allowed:
        raise EmbeddingUnavailable('embedding_setup_path_not_allowed')
    runtime_dir.mkdir(parents=True, exist_ok=True)
    python = runtime_dir / 'venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.is_file():
        _run([sys.executable, '-m', 'venv', str(runtime_dir / 'venv')], runtime_dir)
    requirements = str(ROOT / 'backend' / 'requirements-capability-embeddings.txt')
    _run([str(python), '-m', 'pip', 'install', '--index-url', 'https://download.pytorch.org/whl/cpu',
          '-c', requirements, 'torch==2.8.0+cpu'], runtime_dir)
    _run([str(python), '-m', 'pip', 'install', '--index-url', 'https://pypi.org/simple',
          '-r', requirements], runtime_dir)
    model_dir = runtime_dir / 'model'
    model_dir.mkdir(exist_ok=True)
    for name, expected in MODEL_FILES.items():
        target = model_dir / name
        if target.is_file():
            with target.open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() == expected:
                    continue
        temporary = target.with_suffix(target.suffix + '.download')
        url = f'https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}/{name}'
        digest = hashlib.sha256()
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as output:
            for chunk in iter(lambda: response.read(1024 * 1024), b''):
                output.write(chunk)
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise EmbeddingUnavailable('embedding_model_integrity')
        os.replace(temporary, target)
    verify_model_files(model_dir)
    return _run([str(python), '-m', 'pip', 'freeze'], runtime_dir, capture=True).stdout.splitlines()


def check_runtime(runtime_dir):
    """Offline real-model smoke; quality evaluation belongs to the gold suite."""
    provider = LocalEmbeddingProvider(runtime_dir)
    try:
        start = time.perf_counter()
        documents = provider.embed_documents(['关闭车窗，让玻璃上升到最顶部',
                                               '播放音乐或音频', '设置座舱目标温度和暖风'])
        cold_seconds = time.perf_counter() - start
        start = time.perf_counter()
        query = provider.embed_query('把玻璃升到最顶端')
        query_seconds = time.perf_counter() - start
        scores = [sum(a * b for a, b in zip(query, document)) for document in documents]
        return {'model': provider.metadata, 'fingerprint': provider.fingerprint,
                'model_files_verified': True, 'dimension': len(query),
                'query_norm': math.sqrt(sum(value * value for value in query)),
                'synthetic_document_cosines': scores,
                'semantic_smoke_passed': scores[0] > max(scores[1:]),
                'cold_documents_seconds': cold_seconds, 'warm_query_seconds': query_seconds,
                'host_torch_imported': 'torch' in sys.modules}
    finally:
        provider.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--prepare', action='store_true', help='Install/download into the dedicated runtime only.')
    mode.add_argument('--check', action='store_true', help='Offline real inference check; this is the default.')
    arguments = parser.parse_args(argv)
    try:
        dependencies = prepare_runtime(DEFAULT_RUNTIME_DIR) if arguments.prepare else None
        result = check_runtime(DEFAULT_RUNTIME_DIR)
        if dependencies is not None:
            result['installed_dependencies'] = dependencies
            result['prepared_at'] = datetime.now(timezone.utc).isoformat()
            (DEFAULT_RUNTIME_DIR / 'setup-receipt.json').write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result['semantic_smoke_passed'] else 1
    except EmbeddingUnavailable as error:
        print(json.dumps({'error': error.code}))
    except subprocess.TimeoutExpired:
        print(json.dumps({'error': 'embedding_setup_timeout'}))
    except subprocess.CalledProcessError:
        print(json.dumps({'error': 'embedding_dependency_install_failed'}))
    except OSError:
        print(json.dumps({'error': 'embedding_setup_io_failed'}))
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
