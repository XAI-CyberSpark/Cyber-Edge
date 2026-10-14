"""Protocol/integrity tests; fixture vectors are not real model quality evidence."""
import hashlib
import importlib
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch


class CapabilityEmbeddingTests(unittest.TestCase):
    def setUp(self):
        if importlib.util.find_spec('app.services.capability_embeddings') is None:
            self.fail('the isolated local embedding adapter has not been implemented')
        self.api = importlib.import_module('app.services.capability_embeddings')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runtime = Path(self.temp.name)
        model = self.runtime / 'model'
        model.mkdir()
        data = b'protocol fixture, not model weights'
        (model / 'model.safetensors').write_bytes(data)
        self.files = {'model.safetensors': hashlib.sha256(data).hexdigest()}
        self.worker = self.runtime / 'protocol_worker.py'
        self.worker.write_text('''import json, sys, time
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    if request['texts'] == ['timeout']:
        time.sleep(3)
    if request['texts'] == ['malformed']:
        result = [[float('nan')]]
    else:
        result = [[0.0, 1.0] + [0.0] * 510 if text.startswith('为这个句子生成表示以用于检索相关文章：')
                  else [1.0, 0.0] + [0.0] * 510 for text in request['texts']]
    print(json.dumps({'vectors': result}), flush=True)
''', encoding='utf-8')
        self.addCleanup(self.api.get_embedding_provider.cache_clear)

    def provider(self, **kwargs):
        with patch.object(self.api, 'MODEL_FILES', self.files), \
                patch.object(self.api, '_python_path', return_value=Path(sys.executable)), \
                patch.object(self.api, 'WORKER_SCRIPT', self.worker):
            provider = self.api.LocalEmbeddingProvider(self.runtime, **kwargs)
        self.addCleanup(provider.close)
        # Worker script is selected on first inference, preserving lazy startup.
        return provider

    def run_fixture(self, provider, callback):
        with patch.object(self.api, 'WORKER_SCRIPT', self.worker):
            return callback()

    def test_missing_files_are_explicit_and_import_does_not_load_torch(self):
        with self.assertRaises(self.api.EmbeddingUnavailable) as raised:
            self.api.LocalEmbeddingProvider(self.runtime / 'absent')
        self.assertEqual('embedding_runtime_missing', raised.exception.code)
        self.assertNotIn('torch', sys.modules)

    def test_tampered_weight_is_rejected_before_process_start(self):
        (self.runtime / 'model' / 'model.safetensors').write_bytes(b'tampered')
        with patch.object(self.api, 'MODEL_FILES', self.files), \
                patch.object(self.api, '_python_path', return_value=Path(sys.executable)):
            with self.assertRaises(self.api.EmbeddingUnavailable) as raised:
                self.api.LocalEmbeddingProvider(self.runtime)
        self.assertEqual('embedding_model_integrity', raised.exception.code)

    def test_documents_are_unprefixed_query_is_prefixed_and_worker_is_reused(self):
        provider = self.provider()
        self.assertIsNone(provider._process)
        documents = self.run_fixture(provider, lambda: provider.embed_documents(['关窗', '暖风']))
        process = provider._process
        query = provider.embed_query('关窗')
        self.assertEqual([1.0, 0.0], documents[0][:2])
        self.assertEqual([0.0, 1.0], query[:2])
        self.assertEqual(512, len(query))
        self.assertIs(process, provider._process)
        self.assertEqual([], provider.embed_documents([]))
        self.assertEqual('cpu', provider.metadata['device'])
        provider.close()
        self.assertIsNotNone(process.poll())

    def test_invalid_vector_is_explicit_instead_of_lexical_substitution(self):
        provider = self.provider()
        with self.assertRaises(self.api.EmbeddingUnavailable) as raised:
            self.run_fixture(provider, lambda: provider.embed_documents(['malformed']))
        self.assertEqual('embedding_invalid_output', raised.exception.code)

    def test_inference_timeout_terminates_worker_and_later_call_can_restart(self):
        provider = self.provider(inference_timeout=0.15)
        self.run_fixture(provider, lambda: provider.embed_documents(['ready']))
        process = provider._process
        with self.assertRaises(self.api.EmbeddingUnavailable) as raised:
            provider.embed_documents(['timeout'])
        self.assertEqual('embedding_inference_timeout', raised.exception.code)
        self.assertIsNotNone(process.poll())
        result = self.run_fixture(provider, lambda: provider.embed_documents(['restart']))
        self.assertEqual([1.0, 0.0], result[0][:2])

    def test_concurrent_document_and_query_calls_do_not_mix_responses(self):
        provider = self.provider()
        self.run_fixture(provider, lambda: provider.embed_documents(['ready']))
        with ThreadPoolExecutor(max_workers=4) as executor:
            calls = [executor.submit(provider.embed_documents, ['窗']) if i % 2 == 0
                     else executor.submit(provider.embed_query, '窗') for i in range(8)]
            results = [future.result() for future in calls]
        for i, result in enumerate(results):
            self.assertEqual([1.0, 0.0] if i % 2 == 0 else [0.0, 1.0],
                             (result[0] if i % 2 == 0 else result)[:2])

    def test_setup_check_reports_missing_runtime_without_downloading(self):
        script = Path(__file__).resolve().parents[2] / 'scripts' / 'setup_capability_embeddings.py'
        self.assertTrue(script.is_file(), 'explicit isolated setup/check command is missing')
        spec = importlib.util.spec_from_file_location('capability_embedding_setup_test', script)
        setup = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(setup)
        output = io.StringIO()
        with patch.object(setup, 'DEFAULT_RUNTIME_DIR', self.runtime / 'absent'), contextlib.redirect_stdout(output):
            status = setup.main(['--check'])
        self.assertEqual(1, status)
        self.assertEqual('embedding_runtime_missing', json.loads(output.getvalue())['error'])
        self.assertFalse((self.runtime / 'absent').exists())

    def test_concurrent_factory_calls_share_one_lazy_provider(self):
        with patch.object(self.api, 'MODEL_FILES', self.files), \
                patch.object(self.api, '_python_path', return_value=Path(sys.executable)), \
                patch.dict('os.environ', {'CAPABILITY_EMBEDDING_RUNTIME_DIR': str(self.runtime)}):
            with ThreadPoolExecutor(max_workers=8) as executor:
                providers = list(executor.map(lambda _: self.api.get_embedding_provider(), range(24)))
        self.addCleanup(providers[0].close)
        self.assertEqual(1, len({id(provider) for provider in providers}))
        self.assertIsNone(providers[0]._process)

    def test_setup_subprocess_ignores_inherited_pip_install_redirects_and_configuration(self):
        script = Path(__file__).resolve().parents[2] / 'scripts' / 'setup_capability_embeddings.py'
        spec = importlib.util.spec_from_file_location('capability_embedding_setup_environment_test', script)
        setup = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(setup)
        outside = str(self.runtime / 'outside-runtime')
        inherited = {name: outside for name in ('PIP_TARGET', 'PIP_PREFIX', 'PIP_ROOT', 'PIP_CONFIG_FILE',
                                                'PIP_CACHE_DIR', 'PYTHONPATH', 'PYTHONHOME')}
        inherited.update(PIP_USER='1', PIP_EXTRA_INDEX_URL='https://example.invalid/simple',
                         PIP_REQUIRE_VIRTUALENV='0', PYTHONNOUSERSITE='0')
        # Run an environment reporter only; no pip command or installation.
        command = [sys.executable, '-c',
                   "import os,json; print(json.dumps({k:v for k,v in os.environ.items() "
                   "if k.startswith(('PIP_', 'PYTHON'))}))"]
        with patch.dict('os.environ', inherited):
            result = setup._run(command, self.runtime, capture=True)
        environment = json.loads(result.stdout)
        self.assertEqual({'PIP_CONFIG_FILE', 'PIP_CACHE_DIR'},
                         {name for name in environment if name.startswith('PIP_')})
        self.assertEqual(os.devnull, environment['PIP_CONFIG_FILE'])
        self.assertEqual(str(self.runtime / 'pip-cache'), environment['PIP_CACHE_DIR'])
        self.assertEqual('1', environment['PYTHONNOUSERSITE'])
        self.assertNotIn('PYTHONHOME', environment)
        self.assertNotIn('PYTHONPATH', environment)
        self.assertFalse((self.runtime / 'outside-runtime').exists())


if __name__ == '__main__':
    unittest.main()
