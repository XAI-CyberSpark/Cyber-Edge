"""DeepSeek provider contracts with isolated settings and fake HTTP responses."""
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.orchestration import router
from app.schemas.inference_schema import ChatRequestSchema
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services import model_providers as mp
from app.services.model_reasoning import capabilities, request_fields, bind_hermes_reasoning
from app.services.scenario_builder import ScenarioBuilder


class DeepSeekProviderTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for item in (
            patch.object(mp, "SETTINGS_PATH", Path(self.temp.name) / "providers.json"),
            patch.dict(os.environ, {}, clear=True),
            patch("app.services.orchestration_service.OrchestrationService._resolve_api_key_from_files", return_value=""),
        ):
            item.start()
            self.addCleanup(item.stop)

    def provider(self, model="deepseek-flash"):
        return mp.Provider("deepseek", "DeepSeek", "https://api.deepseek.com", model, "synthetic-deepseek-key")

    def test_deepseek_default_and_credentials_are_independent_of_legacy_providers(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "synthetic-openai", "ANTHROPIC_API_KEY": "synthetic-claude",
                                    "MINIMAX_API_KEY": "synthetic-minimax"}):
            selected = mp.resolve("deepseek", require_key=False)
            self.assertEqual(selected.model, "deepseek-flash")
            self.assertEqual(selected.base_url, "https://api.deepseek.com")
            self.assertEqual(selected.api_key, "")
            with self.assertRaises(HTTPException) as missing:
                mp.resolve("deepseek")
            self.assertEqual(missing.exception.status_code, 503)
            with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "synthetic-deepseek"}):
                self.assertEqual(mp.resolve("deepseek").api_key, "synthetic-deepseek")
                self.assertEqual(mp.resolve("openai").api_key, "synthetic-openai")
                self.assertEqual(mp.resolve("minimax").api_key, "synthetic-minimax")
                self.assertEqual(mp.resolve("anthropic").api_key, "synthetic-claude")
                statuses = mp.statuses()
                self.assertEqual(next(row for row in statuses if row["id"] == "deepseek")["model"], "deepseek-flash")
                self.assertNotIn("synthetic-", json.dumps(statuses))
                self.assertNotIn("synthetic-deepseek", repr(mp.resolve("deepseek")))

    def test_unknown_legal_alias_needs_real_validation_but_has_no_invented_reasoning_controls(self):
        self.assertEqual(mp.resolve("deepseek", "deepseek-chat", require_key=False).model, "deepseek-chat")
        self.assertFalse(capabilities("deepseek", "deepseek-chat")["supported"])
        self.assertFalse(capabilities("deepseek", "deepseek-unverified")["supported"])
        with self.assertRaises(HTTPException):
            request_fields("deepseek", "deepseek-chat", {"enabled": False})
        for wrong in ("gpt-4.1", "MiniMax-M3", "claude-sonnet-5", "deepseek-bad name"):
            with self.subTest(model=wrong), self.assertRaises(HTTPException):
                mp.resolve("deepseek", wrong, require_key=False)
        for legacy in ("minimax", "openai", "anthropic"):
            with self.subTest(provider=legacy), self.assertRaises(HTTPException):
                mp.resolve(legacy, "deepseek-chat", require_key=False)

    def test_request_schema_accepts_explicit_deepseek_without_redirecting_endpoint(self):
        request = WorkflowGenerateRequestSchema(prompt="独立测试", provider_id="deepseek", model="deepseek-flash")
        self.assertEqual(request.model_dump()["provider_id"], "deepseek")
        self.assertEqual(ChatRequestSchema(model="deepseek-flash", provider_id="deepseek", messages=[]).provider_id, "deepseek")
        with self.assertRaises(HTTPException):
            ScenarioBuilder(WorkflowGenerateRequestSchema(prompt="a", provider_id="deepseek",
                                                         provider_base_url="https://evil.invalid"))

    def test_known_models_expose_exact_documented_reasoning_fields(self):
        for model in ("deepseek-flash", "deepseek-v4-pro"):
            with self.subTest(model=model):
                cap = capabilities("deepseek", model)
                self.assertTrue(cap["supported"])
                self.assertTrue(cap["can_disable"])
                self.assertTrue(cap["default_enabled"])
                self.assertEqual(cap["efforts"], ["low", "high", "max"])
                self.assertEqual(cap["default_effort"], "high")
                self.assertEqual(request_fields("deepseek", model, {"enabled": False}), {"thinking": {"type": "disabled"}})
                self.assertEqual(request_fields("deepseek", model, {"enabled": True, "effort": "low"}),
                                 {"thinking": {"type": "enabled"}, "reasoning_effort": "low"})
                self.assertEqual(request_fields("deepseek", model, None), {})
                for invalid in ({"enabled": True, "effort": "medium"}, {"enabled": False, "effort": "high"}):
                    with self.assertRaises(HTTPException):
                        request_fields("deepseek", model, invalid)

    def test_deepseek_wire_uses_openai_tools_and_max_tokens_without_minimax_extensions(self):
        path, headers, payload = mp._request(self.provider(), [{"role": "user", "content": "U"}],
                                             {"type": "object"}, max_tokens=123,
                                             reasoning={"enabled": False})
        self.assertEqual(path, "/chat/completions")
        self.assertEqual(headers, {"Authorization": "Bearer synthetic-deepseek-key"})
        self.assertEqual(payload["max_tokens"], 123)
        self.assertEqual(payload["thinking"], {"type": "disabled"})
        self.assertEqual(payload["tools"][0]["function"]["name"], "submit_scenario")
        self.assertEqual(payload["tool_choice"], "auto")
        self.assertNotIn("reasoning_split", payload)
        self.assertNotIn("max_completion_tokens", payload)

    async def test_http_tool_result_returns_arguments_without_reasoning_content(self):
        def server(request):
            payload = json.loads(request.content)
            if (str(request.url) != "https://api.deepseek.com/chat/completions"
                    or payload.get("max_tokens") != 14000 or "reasoning_split" in payload):
                return httpx.Response(400)
            return httpx.Response(200, json={"choices": [{"finish_reason": "tool_calls", "message": {
                "content": None, "reasoning_content": "PRIVATE-REASONING",
                "tool_calls": [{"function": {"name": "submit_scenario", "arguments": '{"ok":true}'}}]}}]})

        original = httpx.AsyncClient
        with patch.object(mp.httpx, "AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(server), **kw)):
            result = await mp.complete(self.provider(), [{"role": "user", "content": "U"}], {"type": "object"})
        self.assertEqual(json.loads(result), {"ok": True})
        self.assertNotIn("PRIVATE-REASONING", result)
        plain = mp._result(self.provider(), {"choices": [{"finish_reason": "stop", "message": {
            "content": "最终答案", "reasoning_content": "PRIVATE-REASONING"}}]}, None)
        self.assertEqual(plain, "最终答案")

    async def test_configuration_disables_known_model_thinking_and_saves_only_after_validation(self):
        def verified(request):
            body = json.loads(request.content)
            if body.get("max_tokens") != 512 or body.get("thinking") != {"type": "disabled"}:
                return httpx.Response(400)
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "OK"}}]})

        original = httpx.AsyncClient
        with patch.object(mp.httpx, "AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(verified), **kw)):
            status = await mp.configure("deepseek", "deepseek-flash", "synthetic-valid-key")
        self.assertTrue(status["configured"])
        self.assertNotIn("synthetic-valid-key", json.dumps(status))
        self.assertEqual(mp.resolve("deepseek").api_key, "synthetic-valid-key")
        before = mp.SETTINGS_PATH.read_bytes()
        with patch.object(mp.httpx, "AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(
                lambda request: httpx.Response(401, text="PRIVATE-ACCOUNT synthetic-invalid-key")), **kw)):
            with self.assertRaises(HTTPException) as failed:
                await mp.configure("deepseek", "deepseek-v4-pro", "synthetic-invalid-key")
        self.assertEqual(mp.SETTINGS_PATH.read_bytes(), before)
        self.assertNotIn("PRIVATE-ACCOUNT", failed.exception.detail)
        self.assertNotIn("synthetic-invalid-key", failed.exception.detail)

    async def test_unknown_alias_validation_does_not_guess_control_fields(self):
        def server(request):
            body = json.loads(request.content)
            if "thinking" in body or "reasoning_effort" in body or "reasoning_split" in body:
                return httpx.Response(400)
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "OK"}}]})
        original = httpx.AsyncClient
        with patch.object(mp.httpx, "AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(server), **kw)):
            status = await mp.configure("deepseek", "deepseek-unverified", "synthetic-alias-key")
        self.assertEqual(status["model"], "deepseek-unverified")

    async def test_deepseek_configuration_cannot_accept_caller_endpoint(self):
        with self.assertRaises(HTTPException):
            await mp.configure("deepseek", "deepseek-flash", "synthetic-key", base_url="https://evil.invalid")
        self.assertFalse(mp.SETTINGS_PATH.exists())

    def test_api_exposes_deepseek_reasoning_and_rejects_endpoint_in_settings(self):
        app = FastAPI()
        app.include_router(router, prefix="/v1/orchestration")
        with TestClient(app) as client:
            response = client.get("/v1/orchestration/providers/deepseek/reasoning", params={"model": "deepseek-flash"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["efforts"], ["low", "high", "max"])
            response = client.put("/v1/orchestration/providers/deepseek", json={"model": "deepseek-flash",
                                  "api_key": "synthetic-do-not-echo", "base_url": "https://evil.invalid"})
            self.assertEqual(response.status_code, 400)
            self.assertNotIn("synthetic-do-not-echo", response.text)

    def test_hermes_binding_uses_enabled_control_without_stale_minimax_fields(self):
        calls = []
        agent = SimpleNamespace(_interruptible_api_call=lambda kwargs: calls.append(kwargs))
        bind_hermes_reasoning(agent, {"id": "deepseek", "model": "deepseek-flash"}, {"enabled": True, "effort": "high"})
        source = {"extra_body": {"reasoning_split": True, "thinking": {"type": "adaptive"}}, "reasoning_effort": "medium"}
        agent._interruptible_api_call(source)
        self.assertEqual(calls[0]["extra_body"]["thinking"], {"type": "enabled"})
        self.assertEqual(calls[0]["reasoning_effort"], "high")
        self.assertNotIn("reasoning_split", calls[0]["extra_body"])
        self.assertEqual(source["extra_body"]["thinking"], {"type": "adaptive"})


if __name__ == "__main__":
    unittest.main()
