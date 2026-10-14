"""Pinned BGE CPU inference in a dedicated process, with no host model imports.

Preparation is explicit: scripts/setup_capability_embeddings.py creates the
isolated runtime. Normal recall never installs dependencies or accesses the Hub.
"""
from __future__ import annotations

import atexit
from functools import lru_cache
import hashlib
import json
import math
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading


MODEL_ID = 'BAAI/bge-small-zh-v1.5'
MODEL_REVISION = '7999e1d3359715c523056ef9478215996d62a620'
MODEL_FILES = {
    'config.json': '3853a7979202c348751b753e36f579c41d8da7d36af617d3d907e1fc9b441f2a',
    'tokenizer.json': '48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26',
    'tokenizer_config.json': 'e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a',
    'special_tokens_map.json': 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3',
    'vocab.txt': '45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c',
    'model.safetensors': '354763b9b1357bc9c44f62c6be2276321081ed2567773608c0d0785b61d5a026',
}
QUERY_INSTRUCTION = '为这个句子生成表示以用于检索相关文章：'
DIMENSION = 512
MAX_TOKENS = 512
WORKER_SCRIPT = Path(__file__).resolve()
DEFAULT_RUNTIME_DIR = WORKER_SCRIPT.parents[3] / '.demo-runtime' / 'capability-embeddings'


class EmbeddingUnavailable(RuntimeError):
    """Safe reason code; callers must report fallback, never invent vectors."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _python_path(runtime_dir: Path) -> Path:
    return runtime_dir / 'venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')


def _file_hash(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify_model_files(model_dir: Path) -> None:
    """Accept only the pinned official weights/tokenizer, before loading them."""
    for name, expected in MODEL_FILES.items():
        path = model_dir / name
        if not path.is_file():
            raise EmbeddingUnavailable('embedding_model_missing')
        try:
            actual = _file_hash(path)
        except OSError:
            raise EmbeddingUnavailable('embedding_model_unreadable') from None
        if actual != expected:
            raise EmbeddingUnavailable('embedding_model_integrity')


class LocalEmbeddingProvider:
    """Serialize bounded requests to one lazy CPU worker per backend process."""

    def __init__(self, runtime_dir=None, *, startup_timeout=60.0, inference_timeout=30.0):
        self.runtime_dir = Path(runtime_dir or os.environ.get('CAPABILITY_EMBEDDING_RUNTIME_DIR') or DEFAULT_RUNTIME_DIR).resolve()
        self.python_path = _python_path(self.runtime_dir)
        self.model_dir = self.runtime_dir / 'model'
        if not self.python_path.is_file():
            raise EmbeddingUnavailable('embedding_runtime_missing')
        verify_model_files(self.model_dir)
        self.startup_timeout = startup_timeout
        self.inference_timeout = inference_timeout
        self.metadata = {
            'model_id': MODEL_ID, 'revision': MODEL_REVISION, 'dimension': DIMENSION,
            'device': 'cpu', 'dtype': 'float32', 'pooling': 'cls', 'normalized': True,
            'max_tokens': MAX_TOKENS, 'query_instruction': QUERY_INSTRUCTION,
            'backend': 'torch_cpu_worker', 'torch_version': '2.8.0+cpu',
            'transformers_version': '4.57.1', 'model_files': dict(MODEL_FILES),
        }
        self.fingerprint = hashlib.sha256(json.dumps(self.metadata, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
        self._lock = threading.RLock()
        self._process = None
        self._responses = None
        atexit.register(self.close)

    def _read_response(self, timeout, timeout_code):
        try:
            line = self._responses.get(timeout=timeout)
        except queue.Empty:
            raise EmbeddingUnavailable(timeout_code) from None
        if line is None:
            raise EmbeddingUnavailable('embedding_worker_stopped')
        try:
            response = json.loads(line)
        except (ValueError, TypeError):
            raise EmbeddingUnavailable('embedding_invalid_output') from None
        if not isinstance(response, dict):
            raise EmbeddingUnavailable('embedding_invalid_output')
        if 'error' in response:
            code = response['error']
            known = {'embedding_dependency_unavailable', 'embedding_dependency_version',
                     'embedding_model_load_failed', 'embedding_inference_failed'}
            raise EmbeddingUnavailable(code if code in known else 'embedding_invalid_output')
        return response

    def _start_process(self):
        environment = os.environ.copy()
        for name in ('PYTHONPATH', 'PYTHONHOME'):
            environment.pop(name, None)
        environment.update(PYTHONUTF8='1', HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
                           TOKENIZERS_PARALLELISM='false', CUDA_VISIBLE_DEVICES='')
        try:
            process = subprocess.Popen(
                [str(self.python_path), '-X', 'utf8', '-u', str(WORKER_SCRIPT), '--worker', str(self.model_dir)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, encoding='utf-8', env=environment,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            )
        except OSError:
            raise EmbeddingUnavailable('embedding_worker_start_failed') from None
        self._process = process
        responses = self._responses = queue.Queue()

        def read_lines():
            try:
                for line in process.stdout:
                    responses.put(line)
            except (OSError, ValueError):
                pass
            finally:
                responses.put(None)

        threading.Thread(target=read_lines, name='capability-embedding-output', daemon=True).start()
        ready = self._read_response(self.startup_timeout, 'embedding_startup_timeout')
        if ready.get('ready') is not True:
            raise EmbeddingUnavailable('embedding_invalid_output')

    def _embed(self, texts):
        if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
            raise ValueError('embedding texts must be a list of strings')
        if not texts:
            return []
        # Bound contention as well as startup/inference; a busy worker expands
        # recall safely instead of allowing an unbounded authoring wait.
        if not self._lock.acquire(timeout=self.startup_timeout + self.inference_timeout):
            raise EmbeddingUnavailable('embedding_worker_busy')
        try:
            if self._process is None or self._process.poll() is not None:
                self._close_process()
                self._start_process()
            try:
                self._process.stdin.write(json.dumps({'texts': texts}, ensure_ascii=False) + '\n')
                self._process.stdin.flush()
            except (OSError, ValueError):
                raise EmbeddingUnavailable('embedding_worker_stopped') from None
            vectors = self._read_response(self.inference_timeout, 'embedding_inference_timeout').get('vectors')
            if not isinstance(vectors, list) or len(vectors) != len(texts):
                raise EmbeddingUnavailable('embedding_invalid_output')
            for vector in vectors:
                if not isinstance(vector, list) or len(vector) != DIMENSION or not all(
                        isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in vector):
                    raise EmbeddingUnavailable('embedding_invalid_output')
                if not math.isclose(sum(value * value for value in vector), 1.0, abs_tol=1e-3):
                    raise EmbeddingUnavailable('embedding_invalid_output')
            return vectors
        except EmbeddingUnavailable:
            self._close_process()
            raise
        finally:
            self._lock.release()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts)

    def embed_query(self, text: str) -> list[float]:
        if not isinstance(text, str):
            raise ValueError('embedding query must be a string')
        return self._embed([QUERY_INSTRUCTION + text])[0]

    def _close_process(self):
        process, self._process = self._process, None
        self._responses = None
        if process is None:
            return
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)
        for stream in (process.stdin, process.stdout):
            if stream is not None:
                stream.close()

    def close(self):
        with self._lock:
            self._close_process()


_factory_lock = threading.Lock()


@lru_cache(maxsize=1)
def _cached_provider() -> LocalEmbeddingProvider:
    return LocalEmbeddingProvider()


def get_embedding_provider() -> LocalEmbeddingProvider:
    """Lazy shared factory; a missing setup raises a safe unavailable reason."""
    # lru_cache alone may execute the constructor concurrently on initial misses.
    with _factory_lock:
        return _cached_provider()


def _clear_provider_cache():
    with _factory_lock:
        if _cached_provider.cache_info().currsize:
            _cached_provider().close()
        _cached_provider.cache_clear()


get_embedding_provider.cache_clear = _clear_provider_cache


def _worker_main(model_dir: Path) -> int:
    """Only this dedicated interpreter imports torch/transformers."""
    try:
        import torch
        import transformers
        from transformers import AutoModel, AutoTokenizer
    except (ImportError, OSError):
        print(json.dumps({'error': 'embedding_dependency_unavailable'}), flush=True)
        return 1
    if torch.__version__ != '2.8.0+cpu' or transformers.__version__ != '4.57.1':
        print(json.dumps({'error': 'embedding_dependency_version'}), flush=True)
        return 1
    try:
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False)
        model = AutoModel.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False,
                                          use_safetensors=True, attn_implementation='eager').to('cpu').float().eval()
    except Exception:
        print(json.dumps({'error': 'embedding_model_load_failed'}), flush=True)
        return 1
    print(json.dumps({'ready': True}), flush=True)
    for line in sys.stdin:
        try:
            texts = json.loads(line)['texts']
            if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
                raise ValueError('invalid request')
            vectors = []
            with torch.inference_mode():
                for offset in range(0, len(texts), 16):
                    inputs = tokenizer(texts[offset:offset + 16], padding=True, truncation=True,
                                       max_length=MAX_TOKENS, return_tensors='pt')
                    cls = model(**inputs).last_hidden_state[:, 0]
                    vectors.extend(torch.nn.functional.normalize(cls, p=2, dim=1).tolist())
            print(json.dumps({'vectors': vectors}, allow_nan=False), flush=True)
        except Exception:
            print(json.dumps({'error': 'embedding_inference_failed'}), flush=True)
    return 0


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--worker':
        raise SystemExit(_worker_main(Path(sys.argv[2])))
    raise SystemExit('internal embedding worker; prepare with scripts/setup_capability_embeddings.py')
