import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.capabilities import router
from app.services import capability_library as lib
from app.services import mcp_runtime as mcp

CATALOG = {'capabilities': [{'name': '设置车窗开度', 'interface': 'window.set'}, {'name': '读取车窗状态', 'interface': 'window.status'}]}


def servers(url='http://127.0.0.1:8765/mcp', trials=True):
    return {'servers': {'mock_vehicle': {'url': url, 'tools': {
        'window.set': {'allow_trials': trials}, 'window.status': {'allow_trials': trials}}}}}


class BindingBase:
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.settings = root / 'mcp-servers.json'
        self.settings.write_text(json.dumps(servers()))
        self.patches = [patch.dict(os.environ, {'OAKEGDE_CAPABILITY_DB': str(root / 'catalog.sqlite3')}),
                        patch.object(mcp, 'SETTINGS_PATH', self.settings),
                        patch.object(mcp, 'RUNTIME_PATH', root / 'mcp-runtime.json')]
        for p in self.patches: p.start()
        draft = lib.preview('catalog.json', json.dumps(CATALOG, ensure_ascii=False).encode())
        self.record = lib.confirm(draft['id'], [i['id'] for i in draft['items']])
        self.item = self.record['items'][0]

    def tearDown(self):
        for p in self.patches: p.stop()
        self.tmp.cleanup()


class CapabilityBindingTest(BindingBase, unittest.TestCase):
    def stored(self):
        return next(i for i in lib.library()[0]['items'] if i['id'] == self.item['id'])

    def test_bind_moves_to_bound_but_not_verified(self):
        item = lib.bind(self.record['id'], self.item['id'], 'mock_vehicle', 'window.set')
        self.assertEqual(item['invocation'], '已绑定'); self.assertEqual(item['verification'], '未验证')
        self.assertEqual(self.stored()['binding']['tool_name'], 'window.set')
        self.assertEqual(lib.binding_status(self.stored())['allow_trials'], True)

    def test_unregistered_server_or_tool_is_rejected_and_not_saved(self):
        with self.assertRaisesRegex(lib.ImportProblem, '未登记'):
            lib.bind(self.record['id'], self.item['id'], 'other', 'window.set')
        with self.assertRaisesRegex(lib.ImportProblem, '未获得执行授权'):
            lib.bind(self.record['id'], self.item['id'], 'mock_vehicle', 'door.open')
        self.assertEqual(self.stored()['invocation'], '未接入'); self.assertNotIn('binding', self.stored())

    def test_draft_items_cannot_be_bound(self):
        draft = lib.preview('other.json', json.dumps({'capabilities': [{'name': '车灯'}]}).encode())
        with self.assertRaisesRegex(lib.ImportProblem, '尚未确认'):
            lib.bind(draft['id'], draft['items'][0]['id'], 'mock_vehicle', 'window.set')

    def test_status_rechecks_registration_after_config_change(self):
        lib.bind(self.record['id'], self.item['id'], 'mock_vehicle', 'window.set')
        self.settings.write_text(json.dumps({'servers': {}}))
        self.assertEqual(lib.binding_status(self.stored())['state'], '绑定失效')

    def test_unbind_resets_state(self):
        lib.bind(self.record['id'], self.item['id'], 'mock_vehicle', 'window.set')
        item = lib.unbind(self.record['id'], self.item['id'])
        self.assertEqual(item['invocation'], '未接入'); self.assertNotIn('binding', item)

    def test_offline_check_keeps_bound_and_records_issue(self):
        self.settings.write_text(json.dumps(servers('http://127.0.0.1:9/mcp')))
        lib.bind(self.record['id'], self.item['id'], 'mock_vehicle', 'window.set')
        item = asyncio.run(lib.check_connection(self.record['id'], self.item['id']))
        self.assertEqual(item['invocation'], '已绑定'); self.assertFalse(item['connection']['available'])
        self.assertTrue(item['connection']['issue']); self.assertEqual(item['verification'], '未验证')

    def test_api_bind_check_unbind(self):
        app = FastAPI(); app.include_router(router, prefix='/v1/capabilities')
        base = f"/v1/capabilities/{self.record['id']}/items/{self.item['id']}/binding"
        with TestClient(app) as client:
            r = client.put(base, json={'server_id': 'mock_vehicle', 'tool_name': 'window.set'})
            self.assertEqual(r.status_code, 200); self.assertEqual(r.json()['binding_status']['state'], '已绑定')
            self.assertEqual(client.put(base, json={'server_id': 'mock_vehicle', 'tool_name': 'x', 'url': 'http://evil'}).status_code, 422)
            self.assertEqual(client.delete(base).json()['invocation'], '未接入')

    def listed(self, client):
        items = client.get('/v1/capabilities').json()['imports'][0]['items']
        return next(i for i in items if i['id'] == self.item['id'])

    def test_library_listing_rechecks_binding_status(self):
        app = FastAPI(); app.include_router(router, prefix='/v1/capabilities')
        base = f"/v1/capabilities/{self.record['id']}/items/{self.item['id']}/binding"
        with TestClient(app) as client:
            self.assertEqual(self.listed(client)['binding_status']['state'], '未接入')
            client.put(base, json={'server_id': 'mock_vehicle', 'tool_name': 'window.set'})
            status = self.listed(client)['binding_status']
            self.assertEqual(status['state'], '已绑定'); self.assertTrue(status['allow_trials'])
            self.settings.write_text(json.dumps({'servers': {}}))
            self.assertEqual(self.listed(client)['binding_status']['state'], '绑定失效')

    def test_binding_flow_messages_are_localizable(self):
        en = json.loads((Path(__file__).resolve().parents[2] / 'studio' / 'src' / 'i18n' / 'en.json').read_text())
        messages = ['MCP服务未登记，不能通过节点自定义连接地址。', '该MCP工具未获得执行授权。',
                    '能力所在资料不存在或尚未确认入库。', '能力项不存在。', '能力尚未绑定MCP工具。',
                    '绑定已在检查期间变更，请重试。', '服务在线，但未发现该工具。']
        for message in messages:
            self.assertIn(message, en, f'missing en.json translation: {message}')


@unittest.skipUnless(os.environ.get('OAKEGDE_TEST_MCP_PYTHON'), 'set OAKEGDE_TEST_MCP_PYTHON to the mcp-venv python')
class LiveMockBindingTest(BindingBase, unittest.TestCase):
    def test_discovery_against_mock_server_marks_connected(self):
        python = os.environ['OAKEGDE_TEST_MCP_PYTHON']
        async def run():
            proc = await asyncio.create_subprocess_exec(python, str(Path(__file__).resolve().parents[1] / 'fixtures' / 'mock_mcp_server.py'),
                '--port', '0', stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            try:
                url = json.loads(await asyncio.wait_for(proc.stdout.readline(), 10))['url']
                self.settings.write_text(json.dumps(servers(url)))
                Path(self.tmp.name, 'mcp-runtime.json').write_text(json.dumps({'python': python}))
                lib.bind(self.record['id'], self.item['id'], 'mock_vehicle', 'window.set')
                return await lib.check_connection(self.record['id'], self.item['id'])
            finally:
                proc.terminate(); await proc.wait()
        item = asyncio.run(run())
        self.assertEqual(item['invocation'], '已接入'); self.assertTrue(item['connection']['available'])
        self.assertEqual(item['connection']['source'], 'mcp_discovery'); self.assertEqual(item['verification'], '未验证')
        self.assertIn('position', json.dumps(item['connection'].get('input_schema')))
