import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.projects import router


class AutosaveTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        patcher = patch('app.services.project_service.PROJECTS_DIR', self.temp.name)
        patcher.start()
        self.addCleanup(patcher.stop)
        app = FastAPI()
        app.include_router(router, prefix='/v1/projects')
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.payload = {'id': 'stable-id', 'name': '同名项目', 'nodes': [], 'edges': [], 'meta': {'chat_messages': [{'content': 'first'}]}}

    def save(self, **changes):
        return self.client.post('/v1/projects/autosave', json={**self.payload, **changes})

    def test_create_update_and_reopen_chat(self):
        first = self.save().json()
        response = self.save(expected_updated_at=first['updated_at'], meta={'chat_messages': [{'content': 'latest'}]})
        self.assertEqual(response.status_code, 200)
        loaded = self.client.get('/v1/projects/stable-id').json()
        self.assertEqual(loaded['meta']['chat_messages'][0]['content'], 'latest')
        self.assertEqual(len(list(Path(self.temp.name).glob('*.json'))), 1)
        self.assertEqual(list(Path(self.temp.name).glob('*.tmp')), [])

    def test_stale_save_and_deleted_project_are_rejected(self):
        first = self.save().json()
        latest = self.save(expected_updated_at=first['updated_at'], name='new').json()
        self.assertEqual(self.save(expected_updated_at=first['updated_at'], name='stale').status_code, 409)
        self.assertEqual(self.client.get('/v1/projects/stable-id').json()['name'], 'new')
        self.client.delete('/v1/projects/stable-id')
        self.assertEqual(self.save(expected_updated_at=latest['updated_at']).status_code, 409)
        self.assertFalse((Path(self.temp.name) / 'stable-id.json').exists())

    def test_lost_ack_retry_is_idempotent_and_titles_do_not_collide(self):
        first = self.save().json()
        self.assertEqual(self.save().json()['updated_at'], first['updated_at'])
        self.assertEqual(self.save(id='another-id').status_code, 200)
        self.assertEqual(len(self.client.get('/v1/projects/').json()), 2)

    def test_atomic_failure_preserves_previous_file(self):
        first = self.save().json()
        path = Path(self.temp.name) / 'stable-id.json'
        original = path.read_bytes()
        with patch('app.services.project_service.os.replace', side_effect=OSError('disk error')):
            self.assertEqual(self.save(expected_updated_at=first['updated_at'], name='new').status_code, 500)
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(list(Path(self.temp.name).glob('*.tmp')), [])

    def test_legacy_project_receives_revision_on_read(self):
        path = Path(self.temp.name) / 'stable-id.json'
        path.write_text(json.dumps(self.payload))
        loaded = self.client.get('/v1/projects/stable-id').json()
        self.assertIsInstance(loaded['updated_at'], float)
        self.assertEqual(self.save(expected_updated_at=loaded['updated_at'], name='updated').status_code, 200)

    def test_host_lite_exposes_the_same_autosave_contract(self):
        from tests.test_project_file_boundaries import host
        with TestClient(host.app) as client:
            saved = client.post('/v1/projects/autosave', json=self.payload)
            self.assertEqual(saved.status_code, 200)
            stale = client.post('/v1/projects/autosave', json={**self.payload, 'name': 'stale'})
            self.assertEqual(stale.status_code, 409)
