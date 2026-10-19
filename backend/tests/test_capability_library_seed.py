import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.capabilities import router
from app.services import capability_library as library


class CapabilityLibrarySeedTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / 'catalog.sqlite3'
        env = patch.dict(os.environ, {'OAKEGDE_CAPABILITY_DB': str(self.database)})
        env.start()
        self.addCleanup(env.stop)

    def test_empty_database_receives_bundled_catalog_once(self):
        self.assertEqual(library.initialize_library(), 473)
        imported = library.library()
        self.assertEqual(sum(len(record['items']) for record in imported), 473)
        self.assertTrue(all(record['status'] == 'confirmed' for record in imported))
        for record in imported:
            for item in record['items']:
                self.assertEqual(item['invocation'], '未接入')
                self.assertEqual(item['verification'], '未验证')
                self.assertNotIn('binding', item)
                self.assertNotIn('connection', item)
        before = self.database.read_bytes()
        self.assertEqual(library.initialize_library(), 0)
        self.assertEqual(self.database.read_bytes(), before)

    def test_existing_draft_or_confirmed_records_are_not_overwritten(self):
        draft = library.preview('custom.json', json.dumps({'capabilities': [
            {'name': '读取测试值', 'interface': 'read_test_value'}
        ]}).encode())
        self.assertEqual(library.initialize_library(), 0)
        self.assertEqual(library.library(), [])
        library.confirm(draft['id'], [draft['items'][0]['id']])
        before = self.database.read_bytes()
        self.assertEqual(library.initialize_library(), 0)
        self.assertEqual(len(library.library()[0]['items']), 1)
        self.assertEqual(self.database.read_bytes(), before)

    def test_startup_exposes_seed_through_existing_api(self):
        app = FastAPI()
        app.router.add_event_handler('startup', library.initialize_library)
        app.include_router(router, prefix='/v1/capabilities')
        with TestClient(app) as client:
            result = client.get('/v1/capabilities')
            self.assertEqual(result.status_code, 200)
            records = result.json()['imports']
            self.assertEqual(sum(len(record['items']) for record in records), 473)
            self.assertTrue(all(item['binding_status']['state'] == '未接入'
                                for record in records for item in record['items']))

    def test_invalid_seed_rolls_back_without_partial_import(self):
        seed = Path(self.directory.name) / 'invalid.json'
        seed.write_text(json.dumps({'schema_version': 1, 'imports': [
            {'fingerprint': 'first', 'record': {'id': 'first', 'created': 0,
             'status': 'confirmed', 'items': []}},
            {'fingerprint': 'second', 'record': {'created': 0,
             'status': 'confirmed', 'items': []}}
        ]}))
        with patch.object(library, 'SEED_PATH', seed):
            with self.assertRaises((KeyError, ValueError)):
                library.initialize_library()
        self.assertEqual(library.library(), [])


if __name__ == '__main__':
    unittest.main()
