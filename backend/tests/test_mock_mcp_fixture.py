import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import mcp_runtime as mcp


@unittest.skipUnless(
    os.environ.get("OAKEGDE_TEST_MCP_PYTHON"),
    "set OAKEGDE_TEST_MCP_PYTHON to the mcp-venv python",
)
class MockMCPFixtureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server_python = os.environ["OAKEGDE_TEST_MCP_PYTHON"]
        self.process = await asyncio.create_subprocess_exec(
            server_python,
            str(Path(__file__).resolve().parents[1] / "fixtures" / "mock_mcp_server.py"),
            "--port",
            "0",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        line = await asyncio.wait_for(self.process.stdout.readline(), timeout=10)
        payload = json.loads(line)
        self.url = payload["url"]

        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.settings = root / "mcp-servers.json"
        self.runtime = root / "mcp-runtime.json"
        self.settings.write_text(json.dumps({
            "servers": {
                "mock_vehicle": {
                    "url": self.url,
                    "tools": {
                        "window.set": {"allow_trials": True},
                        "window.status": {"allow_trials": True},
                    },
                }
            }
        }))
        self.runtime.write_text(json.dumps({"python": server_python}))
        self.patches = [
            patch.object(mcp, "SETTINGS_PATH", self.settings),
            patch.object(mcp, "RUNTIME_PATH", self.runtime),
        ]
        for item in self.patches:
            item.start()

    async def asyncTearDown(self):
        for item in self.patches:
            item.stop()
        self.temp.cleanup()
        if self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()

    async def test_mock_window_set_returns_assertable_source_status_and_state(self):
        tools = await mcp.discover("mock_vehicle")
        self.assertEqual({tool["name"] for tool in tools}, {"window.set", "window.status"})

        result = await mcp.invoke("mock_vehicle", "window.set", {"window": "front_left", "position": 25}, trial=True)

        self.assertEqual(result["source"], "mcp")
        self.assertEqual(result["data"]["source"], "mock")
        self.assertEqual(result["data"]["status"], "completed")
        self.assertEqual(result["data"]["window"], "front_left")
        self.assertEqual(result["data"]["position"], 25)
        self.assertEqual(result["data"]["state"]["front_left"], 25)

        status = await mcp.invoke("mock_vehicle", "window.status", {}, trial=True)
        self.assertEqual(status["data"]["source"], "mock")
        self.assertEqual(status["data"]["status"], "completed")
        self.assertEqual(status["data"]["windows"]["front_left"], 25)

    async def test_mock_window_set_reports_timeout_and_failures_as_errors(self):
        with self.assertRaisesRegex(mcp.MCPRuntimeError, "返回失败"):
            await mcp.invoke("mock_vehicle", "window.set", {"window": "rear_right", "position": 50, "simulate": "timeout"}, trial=True)

        with self.assertRaisesRegex(mcp.MCPRuntimeError, "返回失败"):
            await mcp.invoke("mock_vehicle", "window.set", {"window": "rear_right", "position": 50, "simulate": "failure"}, trial=True)
