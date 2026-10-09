import asyncio
import json
import os
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from app.services import mcp_packages as packages, mcp_runtime as runtime, mcp_catalog as catalog


class RecipeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = patch.object(packages, 'ROOT', Path(self.temp.name))
        self.root.start()
        self.recipe = packages.RECIPES['catalog-fetch']

    def tearDown(self):
        self.root.stop()
        self.temp.cleanup()

    async def test_browse_binding_and_trials_never_install(self):
        with patch.object(packages, 'command', new_callable=AsyncMock) as command:
            info = packages.presentation('@modelcontextprotocol/fetch')
            self.assertEqual(info['status'], 'on_first_run')
            self.assertEqual(runtime.binding('catalog-fetch', 'fetch')['managed_id'], 'catalog-fetch')
            with self.assertRaisesRegex(runtime.MCPRuntimeError, '试跑'):
                await runtime.invoke('catalog-fetch', 'fetch', {'url': 'https://example.com'}, trial=True)
            with self.assertRaises(runtime.MCPRuntimeError):
                await runtime.invoke('catalog-fetch', 'other', {})
            command.assert_not_called()

    async def test_multiple_tools_keep_distinct_parameters_and_no_discovery_install(self):
        with patch.object(packages, 'command', new_callable=AsyncMock) as command:
            info = packages.presentation('@modelcontextprotocol/time')
            self.assertEqual([tool['name'] for tool in info['tools']], ['get_current_time', 'convert_time'])
            self.assertEqual([p['name'] for p in info['tools'][1]['parameters']], ['source_timezone', 'time', 'target_timezone'])
            for tool in info['tools']:
                runtime.binding('catalog-time', tool['name'])
                with self.assertRaisesRegex(runtime.MCPRuntimeError, '试跑'):
                    runtime.binding('catalog-time', tool['name'], trial=True)
            with self.assertRaisesRegex(runtime.MCPRuntimeError, '首次Run'):
                await runtime.discover('catalog-time')
            command.assert_not_called()

    async def test_concurrent_first_runs_share_install_and_later_runs_reuse(self):
        async def fake_command(*args):
            if 'venv' in args:
                folder = Path(args[-1]); python = packages.python_at(folder)
                python.parent.mkdir(parents=True, exist_ok=True); python.touch()
            await asyncio.sleep(.01)
        with patch.object(packages, 'command', side_effect=fake_command) as command:
            first, second = await asyncio.gather(packages.prepare('catalog-fetch'), packages.prepare('catalog-fetch'))
            self.assertEqual(first, second)
            self.assertEqual(command.call_count, 3)
            self.assertEqual(first['args'], ['-m', 'mcp_server_fetch'])
            await packages.prepare('catalog-fetch')
            self.assertEqual(command.call_count, 3)
            self.assertEqual(packages.presentation(self.recipe['catalog_id'])['status'], 'installed')
            install = command.call_args_list[1].args
            self.assertIn('mcp-server-fetch==2026.8.18', install)
            self.assertIn('--isolated', install)

    async def test_failed_or_cancelled_install_has_no_ready_marker_and_can_retry(self):
        for failure in [packages.PackageError('failed'), asyncio.CancelledError()]:
            with patch.object(packages, 'command', side_effect=failure):
                with self.assertRaises(type(failure)):
                    await packages.prepare('catalog-fetch')
            self.assertFalse(packages.installed(self.recipe))
            # The OS lock must have been released despite the failure.
            async with asyncio.timeout(1):
                async with packages.install_lock(packages.folder_for(self.recipe)):
                    pass

    async def test_bad_managed_arguments_do_not_call_tool(self):
        with patch.object(runtime, '_worker', new_callable=AsyncMock) as worker:
            with self.assertRaises(runtime.MCPRuntimeError):
                await runtime.invoke('catalog-fetch', 'fetch', [])
            worker.assert_not_called()

    async def test_cancel_stops_real_installer_process(self):
        pid_file = Path(self.temp.name) / 'pid'
        task = asyncio.create_task(packages.command(sys.executable, '-c',
            'import os,time,pathlib,sys; pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(30)',
            str(pid_file)))
        try:
            async with asyncio.timeout(3):
                while not pid_file.exists():
                    await asyncio.sleep(.01)
            pid = int(pid_file.read_text())
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)
        finally:
            if not task.done():
                task.cancel()
                try: await task
                except asyncio.CancelledError: pass

    async def test_http_disconnect_cancels_invoke(self):
        from app.api.mcp_runtime import invoke
        from fastapi import HTTPException
        ended = asyncio.Event()
        class Request:
            async def stream(self):
                yield b'{"server_id":"catalog-fetch","tool_name":"fetch","arguments":{}}'
            async def is_disconnected(self): return True
        async def pending(*args):
            try: await asyncio.sleep(10)
            finally: ended.set()
        with patch.object(runtime, 'invoke', side_effect=pending):
            with self.assertRaises(HTTPException) as error:
                await invoke(Request())
        self.assertEqual(error.exception.status_code, 499)
        self.assertTrue(ended.is_set())

    async def test_detail_uses_reviewed_recipe_not_upstream_commands(self):
        data = {'id': self.recipe['catalog_id'], 'readme': '# Documentation\n\n<script>bad</script>',
                'server_config': [{'mcpServers': {'fetch': {'command': 'sh', 'args': ['bad'], 'env': {'KEY': 'secret'}}}}],
                'env_schema': {'properties': {'KEY': {'description': 'API key', 'default': 'secret'}}, 'required': ['KEY']}}
        with patch.object(catalog, '_request', return_value=data):
            detail = catalog.get_detail(data['id'])
        self.assertEqual(detail['readme'], data['readme'])
        self.assertEqual(detail['installation']['package'], 'mcp-server-fetch')
        self.assertEqual(detail['installation_methods'], [])
        self.assertNotIn('secret', json.dumps(detail))
        self.assertEqual(detail['configuration_fields'][0]['name'], 'KEY')


@unittest.skipUnless(os.environ.get('OAKEGDE_TEST_MCP_STDIO_PYTHON'), 'set isolated MCP2 Python for real stdio cancellation')
class StdioLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_and_timeout_reap_sdk_child_process(self):
        python = os.environ['OAKEGDE_TEST_MCP_STDIO_PYTHON']
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            script = folder / 'server.py'
            pid_file = folder / 'pid'
            script.write_text('''import asyncio,os,sys
from pathlib import Path
from mcp.server.mcpserver import MCPServer
server=MCPServer('cancellation-fixture')
@server.tool()
async def fetch() -> str:
    Path(sys.argv[1]).write_text(str(os.getpid()))
    await asyncio.sleep(60)
    return 'unexpected'
server.run()
''')
            transport = {'command': python, 'args': [str(script), str(pid_file)]}
            server = {'managed_id': 'catalog-fetch', 'tools': {'fetch': {}}}
            with patch.object(packages, 'prepare', new=AsyncMock(return_value=transport)), patch.object(packages, 'ensure_environment', new=AsyncMock(return_value=python)):
                task = asyncio.create_task(runtime._worker(server, 'call', 'fetch', {}))
                try:
                    async with asyncio.timeout(10):
                        while not pid_file.exists(): await asyncio.sleep(.02)
                    pid = int(pid_file.read_text())
                    task.cancel()
                    with self.assertRaises(asyncio.CancelledError): await task
                    with self.assertRaises(ProcessLookupError): os.kill(pid, 0)
                finally:
                    if not task.done():
                        task.cancel()
                        try: await task
                        except asyncio.CancelledError: pass
                pid_file.unlink()
                with self.assertRaisesRegex(runtime.MCPRuntimeError, '超时'):
                    # Allow SDK startup under build load; the tool still sleeps for 60 seconds.
                    await runtime._worker(server, 'call', 'fetch', {}, timeout=10)
                self.assertTrue(pid_file.exists())
                with self.assertRaises(ProcessLookupError): os.kill(int(pid_file.read_text()), 0)


if __name__ == '__main__':
    unittest.main()
