import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import mcp_runtime


class MCPSelectedDiscoveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings_path = Path(self.directory.name) / 'servers.json'
        self.settings_path.write_text(json.dumps({'servers': {
            'chosen': {'url': 'https://example.test/mcp?token=DO_NOT_COPY', 'description': '读取已登记测量',
                       'headers_env': {'Authorization': 'SECRET_ENV_NAME'},
                       'tools': {'read': {'description': '读取数据', 'allow_trials': False}, 'other': {'allow_trials': True}}},
            'unused': {'url': 'https://unused.test', 'tools': {'unused': {'allow_trials': True}}},
        }}))
        self.settings_patch = patch.object(mcp_runtime, 'SETTINGS_PATH', self.settings_path)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)

    async def test_safe_snapshot_has_only_bound_non_secret_metadata_and_no_discovery(self):
        self.assertTrue(hasattr(mcp_runtime, 'safe_connection_snapshot'), 'safe snapshot is missing')
        snapshot = mcp_runtime.safe_connection_snapshot()
        encoded = json.dumps(snapshot)
        self.assertNotIn('DO_NOT_COPY', encoded)
        self.assertNotIn('SECRET_ENV_NAME', encoded)
        self.assertNotIn('https:', encoded)
        chosen = next(record for record in snapshot if record['server_id'] == 'chosen')
        self.assertIsNone(chosen['available'])
        self.assertFalse(chosen['tools'][0]['allow_trials'])

    async def test_only_selected_server_discovered_and_permissions_preserved(self):
        self.assertTrue(hasattr(mcp_runtime, 'discover_selected'), 'selected discovery is missing')
        async def worker(server, operation, **kwargs):
            if server['url'].startswith('https://unused'):
                self.fail('unselected server was discovered')
            return [{'name': 'read', 'description': '读取数据', 'inputSchema': {'type': 'object'},
                     'headers': {'Authorization': 'SHOULD_NOT_SURFACE'}, 'allow_trials': True},
                    {'name': 'not_authorized', 'description': '不能加入本地授权'}]
        with patch.object(mcp_runtime, '_worker', worker):
            records = await mcp_runtime.discover_selected(['chosen'])
        self.assertEqual(['chosen'], [record['server_id'] for record in records])
        self.assertTrue(records[0]['available'])
        self.assertFalse(records[0]['tools'][0]['allow_trials'])
        self.assertNotIn('SHOULD_NOT_SURFACE', json.dumps(records))
        self.assertNotIn('not_authorized', json.dumps(records))
        with self.assertRaisesRegex(mcp_runtime.MCPRuntimeError, '未授权自动试跑'):
            mcp_runtime.binding('chosen', 'read', trial=True)

    async def test_discovery_timeout_remains_unavailable_unknown_and_honors_total_budget(self):
        self.assertTrue(hasattr(mcp_runtime, 'discover_selected'), 'selected discovery is missing')
        async def worker(*args, **kwargs):
            await asyncio.sleep(1)
        with patch.object(mcp_runtime, '_worker', worker):
            records = await mcp_runtime.discover_selected(['chosen'], timeout=0.01, budget_seconds=0.01)
        self.assertFalse(records[0]['available'])
        self.assertFalse(records[0]['tools'][0]['allow_trials'])
        self.assertIn('issue', records[0])
        self.assertNotIn('capability_gap', json.dumps(records))

    async def test_malformed_discovery_keeps_binding_facts(self):
        async def worker(*args, **kwargs):
            return {'unexpected': 'not a tool list'}
        with patch.object(mcp_runtime, '_worker', worker):
            records = await mcp_runtime.discover_selected(['chosen'])
        self.assertFalse(records[0]['available'])
        self.assertEqual('read', records[0]['tools'][0]['name'])
        self.assertFalse(records[0]['tools'][0]['allow_trials'])


if __name__ == '__main__':
    unittest.main()
