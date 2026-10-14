#!/usr/bin/env python3
"""Serial HTTP/SSE checks against an already running local Studio backend.

Frozen suites may supply schema-validated history, project and caller-owned
acceptance tests. Saving and overwriting are always disabled. Independent replay
uses the production graph executor and never trusts the builder's runtime flag.
This runner never starts services, configures providers or changes engines.
"""
from __future__ import annotations

import argparse
import asyncio
import codecs
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlparse
import uuid

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.services.scenario_benchmark import check_candidate, digest, manual_review, validate_suite, verdict
from app.services.orchestration_logging import (LOG_PATH, BACKUP_COUNT, MAX_BYTES,
    summarize_usage_records, combine_usage_summaries)
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services import model_providers

SUITE = ROOT / "benchmarks/scenarios/cases.json"
DEFAULT_CASES = "CT-01,CT-02,CT-03,IN-02,BT-02,CR-01"
REQUEST_CONTEXT_KEYS = frozenset(("conversation_history", "current_project", "acceptance_tests"))
# Conservative server ceilings: 8 authoring calls and 3 trials of 12 graph calls.
REQUEST_MODEL_CALL_RESERVE = 44
REQUEST_OUTPUT_TOKEN_RESERVE = 8 * 32768 + 3 * 12 * 14000


def stamp():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def select_cases(suite, selection):
    validate_suite(suite)
    by_id = {case["id"]: case for case in suite["cases"]}
    ids = list(by_id) if selection == "all" else selection.split(",")
    if not ids or len(ids) != len(set(ids)) or any(id not in by_id for id in ids):
        raise ValueError("Case IDs must be known, unique IDs from the existing scenario suite")
    cases = [by_id[id] for id in ids]
    for case in cases:
        request_payload(case, "minimax")
    return cases


def request_payload(case, provider, model=None):
    context = case.get("request_context", {})
    if not isinstance(context, dict) or set(context) - REQUEST_CONTEXT_KEYS:
        raise ValueError(f'{case["id"]}: request_context only permits history, project and acceptance_tests')
    payload = {"provider_id": provider, "prompt": case["prompt"], **context,
               "save_on_success": False, "overwrite": False}
    if model:
        payload["model"] = model
    # Validate against the same HTTP request schema; preserve the preregistered
    # JSON exactly rather than inserting optional/default fields into the plan.
    WorkflowGenerateRequestSchema.model_validate(payload)
    return payload


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=("minimax", "openai", "anthropic", "deepseek"), required=True,
                        help="Explicit provider; never switch to another provider")
    parser.add_argument("--model", help="Omit to use the selected provider's server model")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Running local backend URL")
    parser.add_argument("--suite", type=Path, default=SUITE, help="Frozen scenario suite JSON")
    parser.add_argument("--cases", default=DEFAULT_CASES, help="Comma-separated existing case IDs, or all")
    parser.add_argument("--repeat", type=int, default=1, help="Serial repeats per case, 1 to 5")
    parser.add_argument("--output-root", type=Path, default=ROOT / ".demo-runtime/workflow-batches")
    parser.add_argument("--log-path", type=Path, default=LOG_PATH,
                        help="Local content-free orchestration JSONL for matching server run usage")
    parser.add_argument("--timeout", type=float, default=900, help="Total seconds per request, at most 1800")
    parser.add_argument("--max-stream-bytes", type=int, default=16 * 1024 * 1024,
                        help="Response byte limit per case, at most 64 MiB")
    parser.add_argument("--allow-unconfigured", action="store_true",
                        help="Probe missing-provider API/SSE errors; these remain blocked, not successful")
    parser.add_argument("--execute-runtime", action="store_true", help="Independently execute caller-owned acceptance_tests after generation")
    parser.add_argument("--replay-batch", type=Path, help="Replay an existing batch's immutable results without HTTP generation")
    parser.add_argument("--runtime-model-calls", type=int, default=0,
                        help="Maximum extra real API model calls across independent replay; default denies model calls")
    parser.add_argument("--runtime-timeout", type=float, default=150, help="Seconds per independent graph replay")
    parser.add_argument("--max-requests", type=int, default=30, help="Maximum generation POST requests across the batch")
    parser.add_argument("--max-model-calls", type=int, default=1320, help="Whole-batch model-call admission budget, including independent replay")
    parser.add_argument("--max-tokens", type=int, default=30 * (REQUEST_OUTPUT_TOKEN_RESERVE + 131072),
                        help="Whole-batch conservative token admission budget; unknown usage retains its reserve")
    parser.add_argument("--max-total-seconds", type=float, default=18000, help="Whole-batch deadline including generation and replay")
    parser.add_argument("--request-input-token-reserve", type=int, default=131072,
                        help="Input estimate per HTTP request, in addition to worst-case output reserve; not an input hard cap")
    parser.add_argument("--runtime-input-token-reserve", type=int, default=32768, help="Input estimate per independent API inference")
    args = parser.parse_args(argv)
    parsed = urlparse(args.base_url)
    if (parsed.scheme not in ("http", "https") or parsed.hostname not in ("localhost", "127.0.0.1", "::1")
            or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        parser.error("--base-url must be a loopback HTTP(S) origin without credentials or query")
    if not 1 <= args.repeat <= 5:
        parser.error("--repeat must be between 1 and 5")
    if not 0 < args.timeout <= 1800:
        parser.error("--timeout must be greater than 0 and at most 1800 seconds")
    if not 1 <= args.max_stream_bytes <= 64 * 1024 * 1024:
        parser.error("--max-stream-bytes must be between 1 and 67108864")
    for name in ("max_requests", "max_model_calls", "max_tokens", "max_total_seconds", "runtime_timeout"):
        if getattr(args, name) <= 0:
            parser.error("--" + name.replace("_", "-") + " must be greater than zero")
    for name in ("runtime_model_calls", "request_input_token_reserve", "runtime_input_token_reserve"):
        if getattr(args, name) < 0:
            parser.error("--" + name.replace("_", "-") + " must be nonnegative")
    args.base_url = args.base_url.rstrip("/")
    return args


class BatchBudget:
    """HTTP admission cannot interrupt individual server calls or cap unknown input."""
    def __init__(self, args):
        self.args, self.started = args, time.monotonic()
        self.state = {"requests": 0, "charged_model_calls": 0, "charged_tokens": 0,
                      "independent_model_calls": 0, "unknown_usage_reservations": 0,
                      "policy": "conservative_admission_v1",
                      "request_model_call_reserve": REQUEST_MODEL_CALL_RESERVE,
                      "request_output_token_reserve": REQUEST_OUTPUT_TOKEN_RESERVE,
                      "request_input_token_reserve": args.request_input_token_reserve,
                      "limitations": "HTTP cannot enforce server-side per-call token limits. Input reserves are estimates; unknown usage retains the reserve and known lower bounds. A server-side budget hook is required for a hard total token ceiling."}

    def remaining_seconds(self):
        return max(0, self.args.max_total_seconds - (time.monotonic() - self.started))

    def reserve(self, *, requests=0, calls=0, tokens=0):
        if self.remaining_seconds() <= 0:
            return "budget_time"
        for field, increment, maximum, reason in (
            ("requests", requests, self.args.max_requests, "budget_requests"),
            ("charged_model_calls", calls, self.args.max_model_calls, "budget_model_calls"),
            ("charged_tokens", tokens, self.args.max_tokens, "budget_tokens")):
            if self.state[field] + increment > maximum:
                return reason
        self.state["requests"] += requests
        self.state["charged_model_calls"] += calls
        self.state["charged_tokens"] += tokens
        return None

    def settle(self, usage, *, calls, tokens):
        known_calls = usage.get("calls_started")
        if known_calls is not None:
            self.state["charged_model_calls"] += known_calls - calls
        measured = usage.get("input_tokens"), usage.get("output_tokens")
        if all(value is not None for value in measured):
            actual = sum(measured)
        else:
            actual = max(tokens, usage["known_input_tokens"] + usage["known_output_tokens"])
            self.state["unknown_usage_reservations"] += 1
        self.state["charged_tokens"] += actual - tokens


def replay_results(source, cases, repeat):
    report = json.loads((source / "summary.json").read_text(encoding="utf-8"))
    by_case = {(row["case_id"], row["repeat"]): row for row in report["results"]}
    results = {}
    for case in cases:
        for iteration in range(1, repeat + 1):
            row = by_case.get((case["id"], iteration))
            if not row or row.get("case_sha256") != digest(case):
                raise ValueError(f'{case["id"]}: replay requires the original case and preregistered plan')
            result = None
            if row.get("artifact"):
                path = (source / row["artifact"]).resolve()
                if not path.is_relative_to(source.resolve()):
                    raise ValueError("Replay artifact must remain within its original batch")
                result = json.loads(path.read_text(encoding="utf-8"))
                if digest(result) != row.get("artifact_sha256"):
                    raise ValueError(f'{case["id"]}: original artifact hash mismatch')
            results[(case["id"], iteration)] = (result, row)
    return report, results


async def independent_runtime(case, result, args, budget, *, inference=None):
    if case["runtime_profile"] == "none":
        return {"status": "not_required", "checks": []}, summarize_usage_records([])
    plan = (case.get("request_context") or {}).get("acceptance_tests")
    if plan is None or not isinstance((result or {}).get("project"), dict):
        return {"status": "not_run", "runtime_verified": False, "checks": [],
                "issue": "Independent replay requires a candidate and preregistered acceptance_tests"}, summarize_usage_records([])
    from app.services.scenario_execution import execute_candidate, _cloud_inference
    records = []
    async def infer(body):
        if inference is not None:
            return await inference(body)
        if budget.state["independent_model_calls"] >= args.runtime_model_calls:
            raise ValueError("Independent API inference not authorized or its call budget is exhausted")
        reservation = 14000 + args.runtime_input_token_reserve
        reason = budget.reserve(calls=1, tokens=reservation)
        if reason:
            raise ValueError(reason)
        budget.state["independent_model_calls"] += 1
        call_records = []
        observer = model_providers.COMPLETION_CALL_OBSERVER.get()
        def observe(metadata):
            record = {**metadata, "event": "model_call_started" if metadata.get("event") == "started" else "model_completion"}
            call_records.append(record)
            records.append(record)
            if observer:
                observer(metadata)
        token = model_providers.COMPLETION_CALL_OBSERVER.set(observe)
        try:
            return await _cloud_inference(body)
        finally:
            model_providers.COMPLETION_CALL_OBSERVER.reset(token)
            budget.settle(summarize_usage_records(call_records, available=bool(call_records)), calls=1, tokens=reservation)
    async def deny_mcp(_):
        raise ValueError("Independent batch replay does not authorize real MCP tool calls")
    remaining = budget.remaining_seconds()
    if remaining <= 0:
        return {"status": "not_run", "runtime_verified": False, "checks": [], "issue": "budget_time"}, summarize_usage_records([])
    report = await execute_candidate(result["project"], plan, inference=infer, mcp=deny_mcp,
                                     timeout=min(args.runtime_timeout, remaining), source_root=ROOT)
    report.update(independent=True, plan_sha256=digest(plan),
                  adapter_source="injected_test_adapter" if inference else "configured_api_with_batch_budget",
                  real_mcp_authorized=False)
    return report, summarize_usage_records(records)


class StreamFailure(Exception):
    def __init__(self, category):
        self.category = category
        super().__init__(category)


async def sse_events(response, limit, state):
    """Decode UTF-8 across byte chunks and dispatch only complete SSE records."""
    decoder = codecs.getincrementaldecoder("utf-8")()
    buffer = ""
    event = "message"
    data_lines = []
    async for chunk in response.aiter_bytes():
        state["bytes_received"] += len(chunk)
        if state["bytes_received"] > limit:
            raise StreamFailure("stream_byte_limit")
        buffer += decoder.decode(chunk)
        while match := re.search(r"\r\n|\r(?!$)|\n", buffer):
            line, buffer = buffer[:match.start()], buffer[match.end():]
            if not line:
                if data_lines:
                    data = json.loads("\n".join(data_lines))
                    if not isinstance(data, dict):
                        raise StreamFailure("invalid_sse")
                    yield event, data
                event, data_lines = "message", []
            elif not line.startswith(":"):
                field, _, value = line.partition(":")
                value = value[1:] if value.startswith(" ") else value
                if field == "event":
                    event = value
                elif field == "data":
                    data_lines.append(value)
    decoder.decode(b"", final=True)


async def public_config(client, url):
    raw = bytearray()
    async with client.stream("GET", url, timeout=10) as response:
        response.raise_for_status()
        async for chunk in response.aiter_bytes():
            raw.extend(chunk)
            if len(raw) > 65536:
                raise StreamFailure("config_byte_limit")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("Invalid public configuration")
    return value


async def consume(client, args, payload, target, state, started):
    timeout = httpx.Timeout(args.timeout, connect=min(5, args.timeout))
    result, outcome = None, None
    async with client.stream("POST", args.base_url + "/v1/orchestration/generate-stream",
                             json=payload, headers={"Accept": "text/event-stream"}, timeout=timeout) as response:
        state["http_status"] = response.status_code
        state["server_run_id"] = response.headers.get("x-orchestration-run-id")
        response.raise_for_status()
        if "text/event-stream" not in response.headers.get("content-type", "").lower():
            raise StreamFailure("invalid_sse")
        with (target / "events.jsonl").open("w", encoding="utf-8") as output:
            async for event, data in sse_events(response, args.max_stream_bytes, state):
                record = {"event": event, "data": data, "received_at": stamp(),
                          "elapsed_seconds": round(time.monotonic() - started, 3)}
                output.write(json.dumps(record, ensure_ascii=False) + "\n")
                output.flush()
                state["event_count"] += 1
                if event == "result":
                    if result is not None:
                        raise StreamFailure("invalid_sse")
                    result = data
                    state["received_result"] = data
                if event == "error":
                    outcome = "sse_error"
    return result, outcome or ("stream_disconnected" if result is None else None)


def result_category(result):
    if result.get("chat_reply"):
        return "chat_reply"
    report = result.get("build_report") or {}
    if report.get("can_apply") is True:
        return "can_apply"
    if report.get("status") in ("needs_input", "needs_changes", "capability_gap"):
        return report["status"]
    return "unexpected_result"


def git_value(*arguments):
    try:
        return subprocess.run(["git", "-C", str(ROOT), *arguments], capture_output=True,
                              text=True, encoding="utf-8", errors="replace", timeout=5, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def request_usage(log_path, run_id, attempted):
    """Read only the matching local run, including failures with no final result."""
    if not attempted:
        return summarize_usage_records([])
    if not isinstance(run_id, str) or not re.fullmatch(r'[0-9a-f]{32}', run_id):
        return summarize_usage_records([], available=False)
    records, matched, unsupported = [], False, False
    for path in [log_path, *(Path(str(log_path) + f'.{i}') for i in range(1, BACKUP_COUNT + 1))]:
        try:
            with path.open('rb') as source:
                raw = source.read(MAX_BYTES + 65537)
            if len(raw) > MAX_BYTES + 65536: continue
            for line in raw.decode('utf-8', errors='replace').splitlines():
                try: record = json.loads(line)
                except ValueError: continue
                if not isinstance(record, dict) or record.get('run_id') != run_id: continue
                matched = True
                if record.get('engine') == 'hermes': unsupported = True
                if record.get('event') in ('model_call_started', 'model_completion'):
                    records.append(record)
        except OSError:
            continue
    # A surviving run/terminal record cannot prove there were no calls: the
    # incremental call records may already have rotated out of this log set.
    return summarize_usage_records(records, available=matched and bool(records) and not unsupported)


def render_report(document, directory):
    rows = document["results"]
    document["summary"] = {
        "selected": len(rows), "attempted": sum(row["attempted"] for row in rows),
        "results_returned": sum(row["artifact"] is not None for row in rows),
        "automatic_pass": sum(row["automatic_pass"] for row in rows),
        "can_apply": sum(row["category"] == "can_apply" for row in rows),
        "blocked": sum(row["status"] == "blocked" for row in rows),
        "failed": sum(row["status"] == "failed" for row in rows),
        "needs_review": sum(row["status"] == "needs_review" for row in rows),
        "accepted": sum(row["status"] == "accepted" for row in rows),
        "categories": dict(Counter(row["category"] for row in rows)),
        "duration_seconds": round(sum(row["duration_seconds"] for row in rows), 3),
        "usage": combine_usage_summaries([row['usage'] for row in rows]),
        "verification_usage": combine_usage_summaries([row['verification_usage'] for row in rows]),
        "independent_runtime_pass": sum(row['runtime'].get('status') == 'passed' for row in rows),
    }
    document["summary"]["total_usage"] = combine_usage_summaries([document["summary"]["usage"], document["summary"]["verification_usage"]])
    document["summary"]["quality_groups"] = {name: {
        "denominator": len(group), "accepted": sum(row["status"] == "accepted" for row in group),
        "runtime_passed": sum(row["runtime"].get("status") == "passed" for row in group),
        "pending": sum(row["status"] == "needs_review" for row in group),
    } for name, group in (("executable", [row for row in rows if row["expected"] == "preview"]),
                         ("disposition", [row for row in rows if row["expected"] != "preview"]))}
    write_json(directory / "summary.json", document)
    stats = document["summary"]
    provider = document["provider"]
    lines = ["# Workflow HTTP/SSE batch", "",
             f'Provider: {provider["id"]}; model: {provider.get("model") or "unknown"}; engine: {document["engine"].get("engine", "unknown")}.',
             f'Product: {document["product_version"]}; Git HEAD: {document["git_sha"] or "unknown"}; working tree changed: {document["git_dirty"]}.',
             f'Backend: {document["base_url"]}; suite: {document["suite_id"]} / {document["suite_version"]}; started: {document["started_at"]}.', "",
             f'Selected {stats["selected"]}; attempted {stats["attempted"]}; returned {stats["results_returned"]}; automatic checks passed {stats["automatic_pass"]}; can_apply {stats["can_apply"]}; blocked {stats["blocked"]}; failed {stats["failed"]}; pending review {stats["needs_review"]}.', "",
             "Automatic checks reuse the frozen scenario suite. Independent runtime results, when enabled, use only its preregistered acceptance_tests; builder runtime_verified is not independent evidence. Human criteria remain pending until separately reviewed. Blocked cases never count as successful generation.", "",
             f'All attempted requests, including failures: {stats["usage"]["calls_started"] if stats["usage"]["calls_started"] is not None else "unknown"} model calls; known input/output lower bounds {stats["usage"]["known_input_tokens"]}/{stats["usage"]["known_output_tokens"]} tokens. Missing usage or cache fields remain unknown. Reasoning is a reported output subset and is not added again; no currency is inferred.', "",
             f'Independent verification: {stats["verification_usage"]["calls_started"] if stats["verification_usage"]["calls_started"] is not None else "unknown"} extra real API calls; known input/output lower bounds {stats["verification_usage"]["known_input_tokens"]}/{stats["verification_usage"]["known_output_tokens"]}; runtime passed {stats["independent_runtime_pass"]}.', "",
             f'Budget charged {document["budget"]["requests"]} requests, {document["budget"]["charged_model_calls"]} model calls and {document["budget"]["charged_tokens"]} tokens. {document["budget"]["limitations"]}', "",
             f'Generation admission requires bounded engine: {document["engine_budget_policy"]}.', "",
             "| Case | Repeat | Expected | Observed | Status | HTTP | Events | Seconds | Evidence |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for row in rows:
        lines.append(f'| {row["case_id"]} | {row["repeat"]} | {row["expected"]} | {row["category"]} | {row["status"]} | {row.get("http_status") or "—"} | {row["event_count"]} | {row["duration_seconds"]:.3f} | [{row["title"]}]({row["directory"]}/evaluation.json) |')
    lines.extend(["", "Each request sent the original case prompt with only schema-validated, explicitly preregistered request_context. save_on_success and overwrite were false. Independent playback never uses a model-authored replacement plan. Evidence is stored in a new batch directory. HEAD and hashes identify inputs; this uncommitted working tree is not a recoverable Git snapshot.",
                  "", f'Suite SHA256: `{document["suite_sha256"]}`; runner SHA256: `{document["runner_sha256"]}`; check code SHA256: `{document["checks_sha256"]}`.', ""])
    (directory / "SUMMARY.md").write_text("\n".join(lines), encoding="utf-8")


async def run_batch(args, suite, *, client=None, inference=None):
    cases = select_cases(suite, args.cases)
    replay = None
    if args.replay_batch:
        source_report, replay = replay_results(args.replay_batch.resolve(), cases, args.repeat)
    if client is None and replay is None:
        async with httpx.AsyncClient(trust_env=False, follow_redirects=False) as local_client:
            return await run_batch(args, suite, client=local_client, inference=inference)
    directory = args.output_root.resolve() / (datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8])
    directory.mkdir(parents=True)
    write_json(directory / "cases.json", suite)
    status = {"id": args.provider, "model": args.model, "configured": False}
    engine = {}
    preflight_error = None
    try:
        if replay is not None:
            status, engine = source_report["provider"], source_report["engine"]
        else:
            providers = await asyncio.wait_for(public_config(client, args.base_url + "/v1/orchestration/providers"), 15)
            selected = next(provider for provider in providers["providers"] if provider["id"] == args.provider)
            status.update({key: selected.get(key) for key in ("label", "model", "configured")})
            if args.model:
                status["model"] = args.model
            engine = await asyncio.wait_for(public_config(client, args.base_url + "/v1/orchestration/engine"), 15)
            if engine.get("engine") != "bounded":
                preflight_error = "budget_unsupported_engine"
    except (httpx.HTTPError, TimeoutError, ValueError, KeyError, StopIteration, StreamFailure):
        preflight_error = "provider_status_unavailable"
    import hashlib
    document = {"schema_version": 1, "mode": "independent_replay" if replay is not None else "live_http_sse", "started_at": stamp(),
                "base_url": args.base_url, "provider": status, "engine": engine,
                "engine_budget_policy": "44-call and 766144-output-token request reserves use bounded authoring/trial limits and its incremental telemetry. Other engines are blocked before generation POST; the runner never switches the server engine.",
                "product_version": (ROOT / "VERSION").read_text(encoding="utf-8").strip(),
                "git_sha": git_value("rev-parse", "HEAD"), "git_dirty": bool(git_value("status", "--porcelain")),
                "suite_id": suite["suite_id"], "suite_version": suite["version"], "suite_sha256": digest(suite),
                "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "checks_sha256": hashlib.sha256((ROOT / "backend/app/services/scenario_benchmark.py").read_bytes()).hexdigest(),
                "limits": {"timeout_seconds": args.timeout, "max_stream_bytes": args.max_stream_bytes,
                           "max_requests": args.max_requests, "max_model_calls": args.max_model_calls,
                           "max_tokens": args.max_tokens, "max_total_seconds": args.max_total_seconds,
                           "runtime_model_calls": args.runtime_model_calls, "runtime_timeout": args.runtime_timeout},
                "allow_unconfigured": args.allow_unconfigured, "results": []}
    budget = BatchBudget(args)
    document["budget"] = budget.state
    if replay is not None:
        document["source_batch"] = str(args.replay_batch.resolve())
    for case in cases:
        for repeat in range(1, args.repeat + 1):
            started = time.monotonic()
            target = directory / f'{case["id"]}-{repeat}'
            target.mkdir()
            (target / "events.jsonl").write_text("", encoding="utf-8")
            payload = request_payload(case, status["id"], status.get("model"))
            write_json(target / "request.json", payload)
            state = {"bytes_received": 0, "event_count": 0, "http_status": None, "server_run_id": None}
            result = None
            outcome = preflight_error
            attempted = replay is None and not outcome and (status.get("configured") is True or args.allow_unconfigured)
            token_reservation = REQUEST_OUTPUT_TOKEN_RESERVE + args.request_input_token_reserve
            if attempted:
                outcome = budget.reserve(requests=1, calls=REQUEST_MODEL_CALL_RESERVE, tokens=token_reservation)
                attempted = outcome is None
            print(f'{case["id"]} #{repeat}: {case["title"]}', flush=True)
            if attempted:
                try:
                    result, outcome = await asyncio.wait_for(consume(client, args, payload, target, state, started), min(args.timeout, budget.remaining_seconds()))
                except (TimeoutError, httpx.TimeoutException):
                    outcome = "budget_time" if budget.remaining_seconds() <= 0 else "timeout"
                except httpx.HTTPStatusError:
                    outcome = "http_error"
                except httpx.HTTPError:
                    outcome = "stream_disconnected"
                except (ValueError, UnicodeError):
                    outcome = "invalid_sse"
                except StreamFailure as exc:
                    outcome = exc.category
            elif replay is not None:
                result, source_row = replay[(case["id"], repeat)]
                outcome = source_row.get("transport_outcome")
                if outcome == "result":
                    outcome = None
            elif not outcome:
                outcome = "provider_not_configured"
            result = state.pop("received_result", result)
            usage = request_usage(args.log_path, state.get('server_run_id'), attempted)
            if attempted:
                budget.settle(usage, calls=REQUEST_MODEL_CALL_RESERVE, tokens=token_reservation)
            checks = []
            try:
                category = result_category(result) if result is not None and not outcome else outcome
                if result is not None:
                    checks = check_candidate(case, result)
                    if case["expected"] != "preview" and not any(check["id"] == "not_runtime_verified" for check in checks):
                        checks.append({"id": "not_runtime_verified", "category": "flow",
                            "status": "pass" if (result.get("build_report") or {}).get("runtime_verified") is False else "fail",
                            "detail": "澄清/能力缺口必须明确未通过运行验证"})
            except (AttributeError, KeyError, TypeError, ValueError):
                category = outcome = "invalid_result"
            if outcome == "sse_error" and status.get("configured") is False:
                category = "provider_not_configured"
            artifact_hash = digest(result) if result is not None else None
            manual = manual_review(case, artifact_hash, None)
            runtime = {"status": "not_required" if case["runtime_profile"] == "none" else "not_run", "checks": [],
                       "issue": "Independent runtime was not requested"}
            verification_usage = summarize_usage_records([])
            if (args.execute_runtime or replay is not None) and result is not None:
                runtime, verification_usage = await independent_runtime(case, result, args, budget, inference=inference)
                write_json(target / "runtime.json", runtime)
            error = "not_configured" if category == "provider_not_configured" else outcome
            if preflight_error or (outcome or "").startswith("budget_"):
                row_status = "blocked"
            else:
                row_status = verdict(case, checks, runtime, manual, error=error)
            row = {"case_id": case["id"], "case_sha256": digest(case), "title": case["title"], "repeat": repeat,
                   "expected": case["expected"], "category": category, "transport_outcome": outcome or "result",
                   "status": row_status, "attempted": bool(attempted), **state,
                   "duration_seconds": round(time.monotonic() - started, 3),
                   "checks": checks, "runtime": runtime, "manual": manual, "artifact_sha256": artifact_hash,
                   "verification_usage": verification_usage,
                   "automatic_pass": bool(checks) and all(check["status"] == "pass" for check in checks) and not error,
                   "directory": target.name, "artifact": f"{target.name}/result.json" if result is not None else None}
            row['usage'] = usage
            if replay is not None:
                row["source_generation_usage"] = source_row.get("usage")
                row["source_artifact_sha256"] = source_row.get("artifact_sha256")
            if result is not None:
                write_json(target / "result.json", result)
                if isinstance(result.get("project"), dict):
                    write_json(target / "candidate.json", result["project"])
            write_json(target / "evaluation.json", row)
            document["results"].append(row)
            render_report(document, directory)
            print(f'  {category}; {row_status}; {row["duration_seconds"]:.3f}s', flush=True)
    document["finished_at"] = stamp()
    render_report(document, directory)
    exit_code = int(any(row["status"] in ("blocked", "failed") for row in document["results"]))
    print(str(directory / "SUMMARY.md"), flush=True)
    return directory, document, exit_code


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    try:
        suite = json.loads(args.suite.read_text(encoding="utf-8"))
        _, _, code = asyncio.run(run_batch(args, suite))
        return code
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
