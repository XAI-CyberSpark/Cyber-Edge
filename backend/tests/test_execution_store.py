import concurrent.futures
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api import executions
from app.services.execution_store import ExecutionStore, ExecutionConflict, LEASE_SECONDS

class ExecutionStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'execution.sqlite3'
        self.now = 1000.0
        self.store = ExecutionStore(self.path, lambda: self.now)
        self.key = 'a' * 64
        self.payload = {'version': 1, 'flow': {'seen': ['one'], 'state': {'count': 2}}, 'simulator': {'color': '#123456'}}
    def tearDown(self):
        self.tmp.cleanup()
    def start(self):
        return self.store.begin(self.key, self.store.read(self.key)['revision'])
    def finish(self, lease):
        return self.store.finish(self.key, lease['revision'], lease['token'], self.payload)

    def test_survives_new_interpreter_and_isolates_projects(self):
        lease = self.start()
        self.finish(lease)
        script = 'import json,sys;from pathlib import Path;from app.services.execution_store import ExecutionStore;print(json.dumps(ExecutionStore(Path(sys.argv[1])).read(sys.argv[2])))'
        result = json.loads(subprocess.check_output([sys.executable, '-c', script, str(self.path), self.key], text=True))
        self.assertEqual(result['payload'], self.payload)
        self.assertEqual(result['phase'], 'ready')
        self.assertEqual(self.store.read('b' * 64)['phase'], 'empty')
        self.assertNotIn('token', result)

    def test_only_one_concurrent_claim_succeeds(self):
        def claim(_):
            try:
                return ExecutionStore(self.path, lambda: self.now).begin(self.key, 0)
            except ExecutionConflict:
                return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(claim, range(8)))
        self.assertEqual(sum(r is not None for r in results), 1)

    def test_expired_turn_never_auto_replays_and_fences_old_writer(self):
        old = self.start()
        self.now += LEASE_SECONDS + 1
        with self.assertRaises(ExecutionConflict): self.start()
        with self.assertRaises(ExecutionConflict): self.finish(old)
        new = self.store.begin(self.key, old['revision'], restart=True)
        with self.assertRaises(ExecutionConflict): self.finish(old)
        self.finish(new)
        self.assertEqual(self.store.read(self.key)['revision'], 3)

    def test_active_turn_cannot_be_restarted_even_by_current_revision(self):
        lease = self.start()
        with self.assertRaises(ExecutionConflict): self.store.begin(self.key, lease['revision'], True)
        self.store.renew(self.key, lease['revision'], lease['token'])
        with self.assertRaises(ExecutionConflict): self.store.renew(self.key, lease['revision'], 'wrong-token')
        self.finish(lease)
        with self.assertRaises(ExecutionConflict): self.finish(lease)

    def test_failed_snapshot_save_keeps_previous_payload_and_running_marker(self):
        lease = self.start(); self.finish(lease)
        lease = self.start()
        with self.assertRaises(ValueError): self.store.finish(self.key, lease['revision'], lease['token'], {'version': 1, 'value': float('nan')})
        result = self.store.read(self.key)
        self.assertEqual(result['phase'], 'running')
        self.assertEqual(result['payload'], self.payload)
        with self.assertRaises(ValueError): self.store.read('../somewhere')
        with self.assertRaises(ValueError): self.store.encode({'version': 999})

    def test_api_revision_validation_and_conflicts(self):
        app = FastAPI(); app.include_router(executions.router, prefix='/v1/executions')
        original = executions.store
        executions.store = lambda: self.store
        try:
            with TestClient(app) as client:
                url = '/v1/executions/' + self.key
                self.assertEqual(client.post(url + '/begin', json={'revision': True}).status_code, 422)
                self.assertEqual(client.post(url + '/begin', json={'revision': 0, 'restart': 'false'}).status_code, 422)
                lease = client.post(url + '/begin', json={'revision': 0}).json()
                self.assertEqual(client.post(url + '/begin', json={'revision': 0}).status_code, 409)
                self.assertEqual(client.post(url + '/finish', json={**lease, 'payload': self.payload}).status_code, 200)
                self.assertEqual(client.get(url).json()['payload'], self.payload)
        finally:
            executions.store = original
