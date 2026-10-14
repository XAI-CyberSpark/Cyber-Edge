"""HTTP boundary tests for the serial batch runner; no model calls are made."""
import asyncio
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx


ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "scripts/test_workflow_batch.py"
SUITE = json.loads((ROOT / "benchmarks/scenarios/cases.json").read_text(encoding="utf-8"))


class Chunks(httpx.AsyncByteStream):
    def __init__(self, chunks):
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk


def sse(event, data):
    return (f"event: {event}\ndata: " + json.dumps(data, ensure_ascii=False) + "\n\n").encode("utf-8")


def clarification():
    return {"project": {"nodes": [], "edges": []}, "validation": {"passed": False},
            "build_report": {"status": "needs_input", "can_apply": False, "runtime_verified": False,
                             "brief": {"questions": ["那里和那个分别指什么？"]}}}


class WorkflowBatchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        if not RUNNER.is_file():
            self.fail("HTTP/SSE workflow batch runner has not been implemented")
        spec = importlib.util.spec_from_file_location("workflow_batch_runner", RUNNER)
        self.batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.batch)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    async def run_batch(self, chunks, *, cases="IN-02", configured=True, allow=False,
                        timeout=10, limit=1024 * 1024, repeat=1, status=200,
                        provider="minimax", model="MiniMax-M3", suite=None, extra=(),
                        headers=None, engine="bounded"):
        """Only the external HTTP server is substituted; parsing and files are real."""
        suite = suite or SUITE
        async def server(request):
            if request.url.path.endswith("/providers"):
                return httpx.Response(200, json={"providers": [
                    {"id": provider, "model": model, "configured": configured}]})
            if request.url.path.endswith("/engine"):
                return httpx.Response(200, json={"engine": engine, "configured": True,
                                               "sdk_commit": None})
            body = json.loads(request.content)
            # Enforce isolation at the boundary: accepting an unsafe request would
            # otherwise make a report look successful without protecting projects.
            if (request.method != "POST" or body.get("provider_id") != provider
                    or body.get("model") != model or body.get("save_on_success") is not False
                    or body.get("overwrite") is not False or "api_key" in body
                    or "rules" in body or "expected" in body):
                return httpx.Response(422)
            stream = chunks() if callable(chunks) else Chunks(chunks)
            return httpx.Response(status, stream=stream,
                                  headers={"content-type": "text/event-stream", **(headers or {})})

        options = self.batch.parse_args([
            "--provider", provider, "--base-url", "http://127.0.0.1:8001",
            "--cases", cases, "--repeat", str(repeat), "--output-root", self.temp.name,
            "--timeout", str(timeout), "--max-stream-bytes", str(limit),
            *extra,
            *(["--allow-unconfigured"] if allow else []),
        ])
        async with httpx.AsyncClient(transport=httpx.MockTransport(server),
                                     trust_env=False) as client:
            return await self.batch.run_batch(options, suite, client=client)

    def runtime_suite(self, *, expected="完成"):
        suite = copy.deepcopy(SUITE)
        case = next(case for case in suite["cases"] if case["id"] == "CT-01")
        case["rules"] = {"required_types": ["input", "output"]}
        case["request_context"] = {"acceptance_tests": {"cases": [{
            "name": "预登记输出与初态", "initial_windows": {"fl": 17, "fr": 29, "rl": 43, "rr": 68},
            "steps": [{"input": "开始", "assertions": [
                {"path": ["hmi", "message"], "op": "equals", "value": expected},
                {"path": ["car", "windows", "rr"], "op": "equals", "value": 68}]}]}]}}
        suite["cases"] = [case]
        return suite

    def preview(self):
        return {"project": {"id": "batch-fixture", "name": "batch-fixture", "nodes": [
            {"id": "i", "type": "input", "position": {"x": 0, "y": 0}, "data": {"flowVersion": 2}},
            {"id": "o", "type": "output", "position": {"x": 100, "y": 0}, "data": {"responseText": "完成"}},
        ], "edges": [{"id": "io", "source": "i", "target": "o"}], "meta": {}},
            "validation": {"passed": True},
            "build_report": {"status": "preview", "can_apply": True, "runtime_verified": True}}

    def test_suite_path_keeps_original_default_and_accepts_another_frozen_suite(self):
        args = self.batch.parse_args(["--provider", "minimax"])
        self.assertEqual(args.suite, ROOT / "benchmarks/scenarios/cases.json")
        custom = Path(self.temp.name) / "holdout.json"
        args = self.batch.parse_args(["--provider", "minimax", "--suite", str(custom)])
        self.assertEqual(args.suite, custom)

    async def test_case_context_reaches_schema_validated_request_without_save_permissions(self):
        suite = self.runtime_suite()
        context = suite["cases"][0]["request_context"]
        context["conversation_history"] = [{"role": "user", "content": "保留这句更正"}]
        context["current_project"] = self.preview()["project"]
        directory, report, _ = await self.run_batch([sse("result", self.preview())], cases="CT-01", suite=suite)
        request = json.loads((directory / "CT-01-1/request.json").read_text(encoding="utf-8"))
        for key in context:
            self.assertEqual(request[key], context[key])
        self.assertIs(request["save_on_success"], False)
        self.assertIs(request["overwrite"], False)
        self.assertEqual(report["results"][0]["runtime"]["status"], "not_run")

    async def test_case_context_rejects_overrides_and_invalid_schema_before_http(self):
        for context in ({"save_on_success": True}, {"provider_id": "openai"}, {"api_key": "secret"},
                        {"conversation_history": [{"role": "user"}]}, {"current_project": {"nodes": []}},
                        {"acceptance_tests": {"cases": []}}):
            with self.subTest(context=context):
                suite = self.runtime_suite()
                suite["cases"][0]["request_context"] = context
                with self.assertRaises(ValueError):
                    await self.run_batch([sse("result", self.preview())], cases="CT-01", suite=suite)

    async def test_independent_runtime_checks_actual_output_and_ignores_builder_claim(self):
        for expected, status in (("完成", "passed"), ("未发生的输出", "failed")):
            with self.subTest(expected=expected):
                directory, report, code = await self.run_batch([sse("result", self.preview())], cases="CT-01",
                    suite=self.runtime_suite(expected=expected), extra=["--execute-runtime"])
                row = report["results"][0]
                self.assertEqual(row["runtime"]["status"], status, row["runtime"])
                self.assertEqual(row["runtime"]["model_calls"], 0)
                self.assertTrue((directory / "CT-01-1/runtime.json").is_file())
                self.assertTrue(all(item["status"] == "pending" for item in row["manual"]))
                self.assertNotEqual(row["status"], "accepted")
                self.assertEqual(code, int(status == "failed"))

    async def test_replay_uses_frozen_original_candidate_and_hash_without_http(self):
        suite = self.runtime_suite()
        source, report, _ = await self.run_batch([sse("result", self.preview())], cases="CT-01", suite=suite)
        async def no_http(request):
            self.fail("Independent replay must not query or post to the authoring server")
        options = self.batch.parse_args(["--provider", "minimax", "--cases", "CT-01", "--output-root", self.temp.name,
                                         "--replay-batch", str(source)])
        async with httpx.AsyncClient(transport=httpx.MockTransport(no_http)) as client:
            target, replay, code = await self.batch.run_batch(options, suite, client=client)
        row = replay["results"][0]
        self.assertEqual(code, 0)
        self.assertEqual(row["artifact_sha256"], report["results"][0]["artifact_sha256"])
        self.assertEqual(row["runtime"]["status"], "passed")
        self.assertEqual(replay["summary"]["attempted"], 0)
        self.assertTrue((target / "CT-01-1/runtime.json").is_file())

    async def test_replay_rejects_changed_candidate_or_preregistered_plan(self):
        suite = self.runtime_suite()
        source, _, _ = await self.run_batch([sse("result", self.preview())], cases="CT-01", suite=suite)
        options = self.batch.parse_args(["--provider", "minimax", "--cases", "CT-01", "--output-root", self.temp.name,
                                         "--replay-batch", str(source)])
        altered = self.runtime_suite(expected="删掉之前失败的断言")
        with self.assertRaises(ValueError):
            await self.batch.run_batch(options, altered)
        candidate = source / "CT-01-1/result.json"
        candidate.write_text(json.dumps(clarification()), encoding="utf-8")
        with self.assertRaises(ValueError):
            await self.batch.run_batch(options, suite)

    async def test_request_call_and_token_admission_budgets_stop_later_requests(self):
        for options, category in ((["--max-requests", "1"], "budget_requests"),
                (["--max-model-calls", "44"], "budget_model_calls"),
                (["--max-tokens", "766144", "--request-input-token-reserve", "0"], "budget_tokens")):
            with self.subTest(options=options):
                _, report, code = await self.run_batch([sse("result", clarification())], repeat=2, extra=options)
                self.assertEqual(code, 1)
                self.assertEqual(report["summary"]["attempted"], 1)
                self.assertEqual(report["results"][1]["category"], category)
                self.assertEqual(report["results"][1]["status"], "blocked")
                self.assertIsNone(report["summary"]["usage"]["input_tokens"])

    async def test_known_matching_usage_releases_conservative_call_reservation(self):
        run_id, call_id = "a" * 32, "b" * 32
        log = Path(self.temp.name) / "usage.jsonl"
        log.write_text(json.dumps({"run_id": run_id, "call_id": call_id, "engine": "bounded",
            "event": "model_completion", "call_scope": "authoring", "input_tokens": 10,
            "output_tokens": 20}) + "\n", encoding="utf-8")
        _, report, code = await self.run_batch([sse("result", clarification())], repeat=2,
            headers={"x-orchestration-run-id": run_id}, extra=["--max-model-calls", "45", "--log-path", str(log)])
        self.assertEqual(code, 0)
        self.assertEqual(report["summary"]["attempted"], 2)
        self.assertEqual(report["budget"]["charged_model_calls"], 2)
        self.assertEqual(report["budget"]["charged_tokens"], 60)

    async def test_matching_run_without_call_records_stays_unknown_and_cannot_refund(self):
        run_id = "a" * 32
        log = Path(self.temp.name) / "rotated-call-records.jsonl"
        log.write_text(json.dumps({"run_id": run_id, "event": "terminal", "engine": "bounded"}) + "\n",
                       encoding="utf-8")
        _, report, code = await self.run_batch([sse("result", clarification())], repeat=2,
            headers={"x-orchestration-run-id": run_id}, extra=["--max-model-calls", "44", "--log-path", str(log)])
        self.assertEqual(code, 1)
        self.assertEqual(report["summary"]["attempted"], 1)
        self.assertEqual(report["results"][1]["category"], "budget_model_calls")
        self.assertEqual(report["results"][0]["usage"]["status"], "unknown")
        self.assertIsNone(report["results"][0]["usage"]["calls_started"])
        self.assertIsNone(report["results"][0]["usage"]["input_tokens"])
        self.assertEqual(report["budget"]["charged_model_calls"], 44)
        self.assertEqual(report["budget"]["charged_tokens"], 897216)

    async def test_nonbounded_engine_is_blocked_before_paid_generation_post(self):
        for engine in ("hermes", "unknown", None):
            with self.subTest(engine=engine):
                _, report, code = await self.run_batch([sse("result", clarification())], engine=engine)
                self.assertEqual(code, 1)
                self.assertEqual(report["summary"]["attempted"], 0)
                self.assertEqual(report["results"][0]["category"], "budget_unsupported_engine")
                self.assertEqual(report["results"][0]["status"], "blocked")
                self.assertEqual(report["budget"]["requests"], 0)
                self.assertEqual(report["engine"]["engine"], engine)

    async def test_real_sse_api_header_matches_actual_log_for_success_and_fatal_failure(self):
        # A fabricated MockTransport header hides a missing real route header.
        # Keep the ASGI route, run logger and SSE adapter real; substitute only
        # the paid authoring implementation below its shared run boundary.
        from fastapi import FastAPI, HTTPException
        from app.api.orchestration import router
        from app.services import scenario_builder, orchestration_logging, model_providers, hermes_authoring
        def close_log_handles():
            for handler in list(orchestration_logging._LOGGER.handlers):
                orchestration_logging._LOGGER.removeHandler(handler)
                handler.close()
        self.addCleanup(close_log_handles)
        app = FastAPI()
        app.include_router(router, prefix="/v1/orchestration")
        for failed in (False, True):
            with self.subTest(failed=failed):
                log = Path(self.temp.name) / ("failed.jsonl" if failed else "success.jsonl")
                async def authoring(request, run):
                    run.configure("bounded", "single")
                    run.call({"event": "started", "call_id": "c" * 32, "stage": "understand", "call_scope": "authoring"})
                    run.call({"event": "completed", "call_id": "c" * 32, "stage": "understand", "call_scope": "authoring",
                              "input_tokens": 25, "output_tokens": 11})
                    yield "thinking", {"content": "模拟付费边界以下的输出"}
                    if failed:
                        run.call({"event": "started", "call_id": "d" * 32, "stage": "build", "call_scope": "authoring"})
                        run.call({"event": "completed", "call_id": "d" * 32, "stage": "build", "call_scope": "authoring",
                                  "failure_code": "upstream_http"})
                        raise HTTPException(503, "fixture upstream failed")
                    yield "result", clarification()
                args = self.batch.parse_args(["--provider", "deepseek", "--cases", "IN-02", "--output-root", self.temp.name,
                                              "--log-path", str(log)])
                with patch.object(scenario_builder, "_build_events", side_effect=authoring), \
                     patch.object(orchestration_logging, "LOG_PATH", log), \
                     patch.object(model_providers, "statuses", return_value=[
                         {"id": "deepseek", "model": "deepseek-flash", "configured": True}]), \
                     patch.object(hermes_authoring, "configured_engine", return_value=SimpleNamespace(engine="bounded")):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as client:
                        _, report, code = await self.batch.run_batch(args, SUITE, client=client)
                row = report["results"][0]
                self.assertRegex(row["server_run_id"] or "", r"^[0-9a-f]{32}$")
                self.assertEqual(code, int(failed))
                self.assertEqual(row["usage"]["calls_started"], 2 if failed else 1)
                self.assertEqual(row["usage"]["known_input_tokens"], 25)
                self.assertEqual(row["usage"]["known_output_tokens"], 11)
                self.assertEqual(row["usage"]["unknown_input_calls"], int(failed))
                if failed:
                    self.assertIsNone(row["usage"]["input_tokens"])
                else:
                    self.assertEqual(row["usage"]["input_tokens"], 25)
                records = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
                self.assertEqual({record["run_id"] for record in records}, {row["server_run_id"]})

    async def test_total_deadline_limits_active_request_and_blocks_following_requests(self):
        class Stalled(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield sse("progress", {"message": "slow"})
                await asyncio.sleep(1)
        _, report, code = await self.run_batch(Stalled, repeat=2, timeout=10,
                                              extra=["--max-total-seconds", "0.05"])
        self.assertEqual(code, 1)
        self.assertEqual(report["summary"]["attempted"], 1)
        self.assertEqual(report["results"][0]["category"], "budget_time")
        self.assertEqual(report["results"][1]["category"], "budget_time")
        self.assertLess(report["results"][0]["duration_seconds"], 0.5)

    async def test_deepseek_keeps_server_model_and_explicit_provider_at_http_boundary(self):
        directory, report, exit_code = await self.run_batch(
            [sse("result", clarification())], provider="deepseek", model="deepseek-flash")
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["provider"]["id"], "deepseek")
        self.assertEqual(report["provider"]["model"], "deepseek-flash")
        request = json.loads((directory / "IN-02-1/request.json").read_text(encoding="utf-8"))
        self.assertEqual(request["provider_id"], "deepseek")
        self.assertEqual(request["model"], "deepseek-flash")

    async def test_split_utf8_crlf_and_multiline_sse_preserve_result_and_evidence(self):
        # Dropping a split codepoint or treating each data line separately loses
        # the Chinese question or final result and must make this test fail.
        raw = (': keepalive\r\nevent: progress\r\ndata: {"message":\r\ndata: "开始"}\r\n\r\n').encode()
        raw += sse("result", clarification())
        directory, report, exit_code = await self.run_batch([raw[i:i + 1] for i in range(len(raw))])
        row = report["results"][0]
        self.assertEqual(exit_code, 0)
        self.assertEqual(row["category"], "needs_input")
        self.assertEqual(row["status"], "needs_review")
        self.assertTrue(row["automatic_pass"])
        result = json.loads((directory / "IN-02-1/result.json").read_text(encoding="utf-8"))
        self.assertEqual(result["build_report"]["brief"]["questions"], ["那里和那个分别指什么？"])
        events = [json.loads(line) for line in (directory / "IN-02-1/events.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual([event["event"] for event in events], ["progress", "result"])
        self.assertEqual(events[0]["data"]["message"], "开始")
        self.assertEqual(report["engine"]["engine"], "bounded")
        self.assertEqual(report["provider"]["model"], "MiniMax-M3")
        self.assertTrue(report["git_sha"])
        self.assertTrue(report["product_version"].startswith("2.8.0-dev."))
        self.assertTrue((directory / "SUMMARY.md").is_file())
        self.assertEqual(json.loads((directory / "cases.json").read_text(encoding="utf-8")), SUITE)

    async def test_http_200_error_event_is_failed_not_success(self):
        directory, report, exit_code = await self.run_batch([sse("error", {"message": "生成未完成"})])
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "sse_error")
        self.assertEqual(report["summary"]["automatic_pass"], 0)
        self.assertFalse((directory / "IN-02-1/result.json").exists())

    async def test_eof_without_result_is_disconnected(self):
        _, report, exit_code = await self.run_batch([sse("progress", {"phase": "build"})])
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "stream_disconnected")

    async def test_error_after_result_prevents_success_and_keeps_candidate_evidence(self):
        directory, report, exit_code = await self.run_batch([
            sse("result", clarification()), sse("error", {"message": "收尾失败"})])
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "sse_error")
        self.assertFalse(report["results"][0]["automatic_pass"])
        self.assertTrue((directory / "IN-02-1/result.json").exists())

    async def test_stream_failure_after_result_keeps_first_candidate_without_success(self):
        # The real runner must persist a received result even when awaiting the
        # remaining response raises; a local return value alone loses it.
        for mode, category in (("read_error", "stream_disconnected"),
                               ("deadline", "timeout"),
                               ("byte_limit", "stream_byte_limit"),
                               ("duplicate", "invalid_sse")):
            with self.subTest(mode=mode):
                class FailedTail(httpx.AsyncByteStream):
                    async def __aiter__(self):
                        yield sse("result", clarification())
                        if mode == "read_error":
                            raise httpx.ReadError("connection lost")
                        if mode == "deadline":
                            await asyncio.sleep(1)
                        elif mode == "byte_limit":
                            yield b"data: " + b"x" * 2000
                        else:
                            yield sse("result", {"chat_reply": "第二个结果"})

                directory, report, exit_code = await self.run_batch(
                    FailedTail, timeout=0.05, limit=1024)
                row = report["results"][0]
                self.assertEqual(exit_code, 1)
                self.assertEqual(row["category"], category)
                self.assertEqual(row["status"], "failed")
                self.assertFalse(row["automatic_pass"])
                self.assertEqual(report["summary"]["results_returned"], 1)
                self.assertEqual(report["summary"]["automatic_pass"], 0)
                result = json.loads((directory / "IN-02-1/result.json").read_text(encoding="utf-8"))
                self.assertEqual(result["build_report"]["brief"]["questions"], ["那里和那个分别指什么？"])
                candidate = json.loads((directory / "IN-02-1/candidate.json").read_text(encoding="utf-8"))
                self.assertEqual(candidate, {"nodes": [], "edges": []})

    async def test_unconfigured_provider_is_blocked_without_posting_generation(self):
        # If the preflight guard is removed, this returned result would wrongly
        # turn a missing-provider batch into an automatic pass.
        _, report, exit_code = await self.run_batch([sse("result", clarification())], configured=False)
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["summary"]["attempted"], 0)
        self.assertEqual(report["summary"]["blocked"], 1)
        self.assertEqual(report["summary"]["automatic_pass"], 0)
        self.assertEqual(report["results"][0]["category"], "provider_not_configured")

    async def test_allow_unconfigured_records_real_sse_error_but_remains_blocked(self):
        directory, report, exit_code = await self.run_batch([
            sse("error", {"message": "请先在模型选项中接入 MiniMax，当前项目已保留。"})
        ], configured=False, allow=True)
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["summary"]["attempted"], 1)
        self.assertEqual(report["summary"]["blocked"], 1)
        row = report["results"][0]
        self.assertEqual(row["category"], "provider_not_configured")
        self.assertEqual(row["transport_outcome"], "sse_error")
        self.assertTrue((directory / "IN-02-1/events.jsonl").read_text(encoding="utf-8"))

    async def test_non_applicable_preview_fails_existing_acceptance_rules(self):
        result = {"project": {"nodes": [], "edges": []}, "validation": {"passed": False},
                  "build_report": {"status": "needs_changes", "can_apply": False}}
        _, report, exit_code = await self.run_batch([sse("result", result)], cases="CT-01")
        row = report["results"][0]
        self.assertEqual(exit_code, 1)
        self.assertEqual(row["category"], "needs_changes")
        self.assertEqual(row["status"], "failed")
        self.assertFalse(row["automatic_pass"])
        self.assertTrue(any(check["id"] == "disposition" and check["status"] == "fail" for check in row["checks"]))

    async def test_chat_reply_is_recorded_without_counting_as_workflow_success(self):
        _, report, exit_code = await self.run_batch([sse("result", {"chat_reply": "你好"})])
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "chat_reply")
        self.assertEqual(report["summary"]["automatic_pass"], 0)

    async def test_malformed_result_is_reported_and_later_cases_still_run(self):
        _, report, exit_code = await self.run_batch([sse("result", {"project": "invalid", "build_report": "invalid"})], repeat=2)
        self.assertEqual(exit_code, 1)
        self.assertEqual([row["category"] for row in report["results"]], ["invalid_result", "invalid_result"])

    async def test_valid_capability_gap_reuses_existing_rules_without_claiming_apply(self):
        result = {"project": {"nodes": [], "edges": []}, "validation": {"passed": False},
                  "build_report": {"status": "capability_gap", "can_apply": False,
                                   "runtime_verified": False,
                                   "coverage": [{"status": "missing", "note": "没有真实空调接口"}]}}
        _, report, exit_code = await self.run_batch([sse("result", result)], cases="CT-03")
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["results"][0]["category"], "capability_gap")
        self.assertEqual(report["summary"]["can_apply"], 0)
        self.assertEqual(report["summary"]["accepted"], 0)

    async def test_gap_cannot_claim_runtime_verified_even_with_valid_missing_coverage(self):
        for flag in (True, None):
            with self.subTest(flag=flag):
                result = {"project": {"nodes": [], "edges": []}, "validation": {"passed": False},
                          "build_report": {"status": "capability_gap", "can_apply": False,
                                           "runtime_verified": flag,
                                           "coverage": [{"status": "missing", "note": "未连接真实空调"}]}}
                _, report, code = await self.run_batch([sse("result", result)], cases="CT-03")
                self.assertEqual(code, 1)
                self.assertFalse(report["results"][0]["automatic_pass"])
                self.assertEqual(report["results"][0]["status"], "failed")

    async def test_total_timeout_is_bounded_and_reported(self):
        class Stalled(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield sse("progress", {"message": "等待模型"})
                await asyncio.sleep(1)
                yield sse("result", clarification())

        _, report, exit_code = await self.run_batch(Stalled, timeout=0.02)
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "timeout")
        self.assertLess(report["results"][0]["duration_seconds"], 0.5)

    async def test_response_byte_limit_stops_oversized_stream(self):
        _, report, exit_code = await self.run_batch([b"data: " + b"x" * 400], limit=64)
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "stream_byte_limit")

    async def test_repeat_requests_are_serial_and_isolated(self):
        active = 0

        class SerialStream(httpx.AsyncByteStream):
            async def __aiter__(self):
                nonlocal active
                active += 1
                try:
                    await asyncio.sleep(0)
                    if active != 1:
                        yield sse("error", {"message": "parallel requests"})
                    else:
                        yield sse("result", clarification())
                finally:
                    active -= 1

        _, report, exit_code = await self.run_batch(SerialStream, repeat=2)
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["summary"]["automatic_pass"], 2)
        self.assertEqual([row["repeat"] for row in report["results"]], [1, 2])

    async def test_http_failure_and_invalid_sse_have_separate_categories(self):
        _, report, exit_code = await self.run_batch([b""], status=503)
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "http_error")
        _, report, exit_code = await self.run_batch([b"event: result\ndata: {bad}\n\n"])
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["results"][0]["category"], "invalid_sse")

    def test_unknown_case_and_remote_base_url_are_rejected_before_requests(self):
        with self.assertRaises(ValueError):
            self.batch.select_cases(SUITE, "NOT-A-CASE")
        with self.assertRaises(SystemExit):
            self.batch.parse_args(["--provider", "minimax", "--base-url", "https://example.com"])


if __name__ == "__main__":
    unittest.main()
