import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

path = Path(__file__).resolve().parents[1] / 'app/services/qualcomm_catalog.py'
spec = importlib.util.spec_from_file_location('catalog_under_test', path)
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class CatalogTests(unittest.TestCase):
    def setUp(self):
        s._cached, s._checked, s._warning = None, 0, ''
        self.snapshot = s._snapshot()

    def test_official_snapshot_integrity(self):
        self.assertEqual(self.snapshot['version'], '0.63.0')
        items = self.snapshot['items']
        self.assertEqual(len(items), 235)
        self.assertEqual(len({m['id'] for m in items}), 235)
        self.assertTrue(all(m['connection_status'] == 'not_connected' for m in items))
        self.assertTrue(any('qualcomm-sa8295p' in m['chipsets'] for m in items))
        self.assertTrue(all('path' not in m and 'is_downloaded' not in m for m in items))

    def test_offline_snapshot_and_retry_cooldown(self):
        with patch.object(s, '_fetch', side_effect=TimeoutError) as fetch:
            first = s.get_catalog()
            second = s.get_catalog(refresh=True)
            self.assertEqual(first['cache_status'], 'stale')
            self.assertEqual(first['synced_at'], self.snapshot['synced_at'])
            self.assertEqual(first, second)
            self.assertEqual(fetch.call_count, 1)

    def test_success_cache_and_failed_refresh_retains_success(self):
        with patch.object(s, '_fetch', return_value=self.snapshot) as fetch:
            self.assertEqual(s.get_catalog()['cache_status'], 'live')
            self.assertEqual(s.get_catalog()['cache_status'], 'cached')
            self.assertEqual(fetch.call_count, 1)
        s._checked -= s.TTL + 1
        with patch.object(s, '_fetch', side_effect=ValueError):
            result = s.get_catalog(refresh=True)
            self.assertEqual(result['items'], self.snapshot['items'])
            self.assertEqual(result['cache_status'], 'stale')
        s._checked -= s.RETRY_DELAY + 1
        with patch.object(s, '_fetch', return_value=self.snapshot):
            self.assertEqual(s.get_catalog(refresh=True)['warning'], '')

    def test_no_snapshot_failure_can_retry(self):
        with patch.object(s, '_fetch', side_effect=TimeoutError), patch.object(s, '_snapshot', return_value=None):
            for refresh in [False, True]:
                with self.assertRaises(s.CatalogError): s.get_catalog(refresh)

    def test_manifest_rejects_invalid_and_duplicate_ids(self):
        from qai_hub_models_cli.proto.manifest_pb2 import ReleaseManifest
        for ids in [['../bad'], ['one', 'one']]:
            manifest = ReleaseManifest(version=s.VERSION)
            for id in ids: manifest.models.add(id=id)
            with self.assertRaises(ValueError): s.parse_manifest(manifest.SerializeToString())
        for data in [b'not protobuf', b'']:
            with self.assertRaises(Exception): s.parse_manifest(data)

    def test_fetch_rejects_redirect_and_oversize(self):
        from unittest.mock import MagicMock
        response = MagicMock(); response.__enter__.return_value = response
        response.status_code = 302
        with patch.object(s.requests, 'get', return_value=response):
            with self.assertRaises(s.CatalogError): s._fetch()
        response.status_code = 200
        response.iter_content.return_value = [b'a' * (8*1024*1024+1)]
        with patch.object(s.requests, 'get', return_value=response):
            with self.assertRaises(s.CatalogError): s._fetch()

if __name__ == '__main__': unittest.main()
