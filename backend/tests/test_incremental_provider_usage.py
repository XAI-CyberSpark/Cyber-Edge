"""Request lifecycle telemetry at real provider/log/batch boundaries; no network."""
import asyncio
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from app.services import model_providers as mp
from app.services import orchestration_logging as ol


ROOT = Path(__file__).resolve().parents[2]
PROVIDER = mp.Provider('deepseek', 'DeepSeek', 'https://api.deepseek.com', 'deepseek-flash', 'PRIVATE-KEY')
BODY = {'choices': [{'finish_reason': 'stop', 'message': {'content': 'PRIVATE-OUTPUT',
        'reasoning_content': 'PRIVATE-REASONING'}}], 'usage': {'prompt_tokens': 25,
        'completion_tokens': 11, 'completion_tokens_details': {'reasoning_tokens': 7},
        'prompt_cache_hit_tokens': 20, 'prompt_cache_miss_tokens': 5}}


class IncrementalProviderUsageTests(unittest.IsolatedAsyncioTestCase):
    def observer(self, name, value):
        context = getattr(mp, name, None)
        self.assertIsNotNone(context, f'{name} must exist at the provider boundary')
        token = context.set(value)
        self.addCleanup(context.reset, token)

    async def invoke(self, server, provider=PROVIDER):
        original = httpx.AsyncClient
        with patch.object(mp.httpx, 'AsyncClient', side_effect=lambda **kw: original(
                transport=httpx.MockTransport(server), **kw)):
            return await mp.complete(provider, [{'role': 'user', 'content': 'PRIVATE-INPUT'}])

    async def test_anthropic_counts_uncached_reads_and_writes_in_total_input(self):
        calls, usage = [], []
        self.observer('COMPLETION_CALL_OBSERVER', calls.append)
        self.observer('COMPLETION_USAGE_OBSERVER', usage.append)
        provider = mp.Provider('anthropic', 'Claude', 'https://api.anthropic.com/v1', 'claude-test', 'PRIVATE')
        body = {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'OK'}],
                'usage': {'input_tokens': 9, 'output_tokens': 3, 'cache_read_input_tokens': 17,
                          'cache_creation_input_tokens': 5}}
        self.assertEqual(await self.invoke(lambda _: httpx.Response(200, json=body), provider), 'OK')
        self.assertEqual(calls[-1]['input_tokens'], 31)
        self.assertEqual(calls[-1].get('input_uncached_tokens'), 9)
        self.assertEqual(calls[-1].get('input_tokens_lower_bound'), 31)
        self.assertEqual(usage[-1]['input_tokens'], 31)
        self.assertEqual(usage[-1].get('input_uncached_tokens'), 9)
        self.assertEqual(usage[-1].get('input_tokens_lower_bound'), 31)

    async def test_anthropic_missing_cache_fields_keep_unknown_total_and_measured_lower_bound(self):
        calls = []
        self.observer('COMPLETION_CALL_OBSERVER', calls.append)
        provider = mp.Provider('anthropic', 'Claude', 'https://api.anthropic.com/v1', 'claude-test', 'PRIVATE')
        for fields, total, lower in (({}, None, 9), ({'cache_read_input_tokens': 17}, None, 26),
                                    ({'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0}, 9, 9),
                                    ({'cache_read_input_tokens': True, 'cache_creation_input_tokens': 5}, None, 14)):
            body = {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'OK'}],
                    'usage': {'input_tokens': 9, 'output_tokens': 3, **fields}}
            await self.invoke(lambda _: httpx.Response(200, json=body), provider)
            self.assertEqual(calls[-1]['input_tokens'], total)
            self.assertEqual(calls[-1].get('input_tokens_lower_bound'), lower)
            self.assertEqual(calls[-1].get('input_uncached_tokens'), 9)
            self.assertEqual(calls[-1]['cache_read_tokens'], fields.get('cache_read_input_tokens') if
                             type(fields.get('cache_read_input_tokens')) is int else None)

    async def test_openai_and_deepseek_total_input_does_not_add_cache_counts(self):
        calls = []
        self.observer('COMPLETION_CALL_OBSERVER', calls.append)
        for provider_id, model in (('openai', 'gpt-4.1'), ('deepseek', 'deepseek-flash')):
            provider = mp.Provider(provider_id, 'Test', 'https://example.invalid', model, 'PRIVATE')
            body = {'choices': [{'finish_reason': 'stop', 'message': {'content': 'OK'}}],
                    'usage': {'prompt_tokens': 31, 'completion_tokens': 3, 'prompt_cache_hit_tokens': 17,
                              'prompt_cache_miss_tokens': 14}}
            await self.invoke(lambda _: httpx.Response(200, json=body), provider)
            self.assertEqual(calls[-1]['input_tokens'], 31)
            self.assertEqual(calls[-1].get('input_tokens_lower_bound'), 31)
            self.assertIsNone(calls[-1].get('input_uncached_tokens'))

    async def test_anthropic_graph_inference_uses_same_total_input_as_lifecycle(self):
        from app.services.scenario_execution import _cloud_inference
        calls = []
        self.observer('COMPLETION_CALL_OBSERVER', calls.append)
        provider = mp.Provider('anthropic', 'Claude', 'https://api.anthropic.com/v1', 'claude-test', 'PRIVATE')
        body = {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'OK'}],
                'usage': {'input_tokens': 9, 'output_tokens': 3, 'cache_read_input_tokens': 17,
                          'cache_creation_input_tokens': 5}}
        original = httpx.AsyncClient
        with patch.object(mp, 'resolve', return_value=provider), patch.object(mp.httpx, 'AsyncClient',
                side_effect=lambda **kw: original(transport=httpx.MockTransport(
                    lambda _: httpx.Response(200, json=body)), **kw)):
            response = await _cloud_inference({'provider_id': 'anthropic', 'model': 'claude-test',
                                               'messages': [{'role': 'user', 'content': 'PRIVATE'}]})
        self.assertEqual(response['usage']['prompt_tokens'], 31)
        self.assertEqual(calls[-1]['input_tokens'], 31)

    async def test_started_precedes_transport_and_completed_maps_actual_cache_usage(self):
        records, legacy = [], []
        self.observer('COMPLETION_CALL_OBSERVER', records.append)
        self.observer('COMPLETION_METADATA_OBSERVER', legacy.append)
        self.observer('COMPLETION_CALL_CONTEXT', {'stage': 'build', 'attempt': 2,
                     'call_scope': 'authoring', 'context_sizes': {'schema': {'bytes': 91,
                     'characters': 73, 'estimated_tokens': 21}, 'content': 'PRIVATE-CONTEXT'},
                     'policy_version': 'bounded-dev109', 'messages': 'PRIVATE-MESSAGES'})
        def respond(request):
            self.assertEqual([r['event'] for r in records], ['started'])
            return httpx.Response(200, json=BODY)
        self.assertEqual(await self.invoke(respond), 'PRIVATE-OUTPUT')
        self.assertEqual([r['event'] for r in records], ['started', 'completed'])
        start, end = records
        self.assertRegex(start['call_id'], r'^[0-9a-f]{32}$')
        self.assertEqual(start['call_id'], end['call_id'])
        self.assertEqual(end['stage'], 'build')
        self.assertEqual(end['attempt'], 2)
        self.assertEqual(end['context_sizes'], {'schema': {'bytes': 91, 'characters': 73, 'estimated_tokens': 21}})
        self.assertEqual((end['input_tokens'], end['output_tokens'], end['reasoning_tokens']), (25, 11, 7))
        self.assertEqual((end['cache_hit_tokens'], end['cache_miss_tokens']), (20, 5))
        self.assertEqual(end['cache_read_tokens'], 20)
        self.assertIsNone(end['cache_write_tokens'])
        self.assertEqual(end['cache_status'], 'known')
        self.assertGreaterEqual(end['duration_ms'], 0)
        self.assertEqual(len(legacy), 1)
        self.assertEqual(legacy[0]['call_id'], start['call_id'])
        self.assertNotIn('PRIVATE', json.dumps(records + legacy))

    async def test_missing_usage_timeout_and_cancel_remain_unknown(self):
        records = []
        self.observer('COMPLETION_CALL_OBSERVER', records.append)
        for exception, code in ((httpx.ReadTimeout('PRIVATE-UPSTREAM'), 'timeout'),
                                (asyncio.CancelledError('PRIVATE-CANCEL'), 'cancelled')):
            async def respond(request):
                raise exception
            with self.assertRaises((HTTPException, asyncio.CancelledError)):
                await self.invoke(respond)
            self.assertEqual(records[-1]['event'], 'completed')
            self.assertEqual(records[-1]['failure_code'], code)
            for field in ('input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_hit_tokens', 'cache_miss_tokens'):
                self.assertIsNone(records[-1][field])
            self.assertEqual(records[-1]['usage_status'], 'unknown')
            self.assertEqual(records[-1]['cache_status'], 'unknown')
        self.assertNotIn('PRIVATE', json.dumps(records))

    async def test_budget_hook_blocks_before_started_or_network(self):
        records, posted = [], []
        self.observer('COMPLETION_CALL_OBSERVER', records.append)
        def deny():
            raise HTTPException(503, 'call_budget_exhausted')
        self.observer('COMPLETION_BUDGET_HOOK', deny)
        def respond(request):
            posted.append(request)
            return httpx.Response(200, json=BODY)
        with self.assertRaises(HTTPException) as stopped:
            await self.invoke(respond)
        self.assertEqual(stopped.exception.detail, 'call_budget_exhausted')
        self.assertEqual(records, [])
        self.assertEqual(posted, [])

    async def test_bad_usage_and_observer_do_not_turn_valid_response_into_failure(self):
        records = []
        self.observer('COMPLETION_CALL_OBSERVER', records.append)
        self.observer('COMPLETION_USAGE_OBSERVER', lambda _: (_ for _ in ()).throw(OSError('PRIVATE')))
        body = {'choices': [{'finish_reason': 'stop', 'message': {'content': 'OK'}}],
                'usage': {'prompt_tokens': True, 'completion_tokens': -1,
                          'prompt_cache_hit_tokens': 'SECRET', 'prompt_cache_miss_tokens': 0}}
        self.assertEqual(await self.invoke(lambda _: httpx.Response(200, json=body)), 'OK')
        self.assertIsNone(records[-1]['input_tokens'])
        self.assertIsNone(records[-1]['output_tokens'])
        self.assertIsNone(records[-1]['cache_hit_tokens'])
        self.assertEqual(records[-1]['cache_miss_tokens'], 0)

    def test_provider_usage_maps_openai_and_anthropic_cache_without_inventing_misses(self):
        for usage, read, write in (({'prompt_tokens': 40, 'completion_tokens': 3,
                                    'prompt_tokens_details': {'cached_tokens': 31}}, 31, None),
                                  ({'input_tokens': 9, 'output_tokens': 3, 'cache_read_input_tokens': 17,
                                    'cache_creation_input_tokens': 5}, 17, 5)):
            row = mp.completion_metadata({'usage': usage}, 512)
            self.assertEqual(row.get('cache_hit_tokens'), read)
            self.assertEqual(row.get('cache_read_tokens'), read)
            self.assertEqual(row.get('cache_write_tokens'), write)
            self.assertIsNone(row.get('cache_miss_tokens'))

    def test_known_deepseek_keeps_frozen_budget_and_explicit_reasoning(self):
        explicit = {'enabled': True, 'effort': 'max'}
        for stage, maximum in (('understand', 16384), ('build', 32768), ('repair', 32768), ('review', 8192)):
            self.assertEqual(mp.authoring_options(PROVIDER, stage, explicit),
                             {'max_tokens': maximum, 'reasoning': explicit})


class IncrementalRunLogTests(unittest.TestCase):
    def test_unknown_input_total_keeps_measured_lower_bound_once_without_cache_double_count(self):
        records = [{'event': 'model_completion', 'call_id': 'a' * 32, 'input_tokens': None,
                    'input_tokens_lower_bound': 26, 'input_uncached_tokens': 9, 'output_tokens': 3,
                    'cache_read_tokens': 17, 'cache_hit_tokens': 17, 'cache_write_tokens': None},
                   {'event': 'model_completion', 'call_id': 'b' * 32, 'input_tokens': 31,
                    'input_tokens_lower_bound': 31, 'input_uncached_tokens': 9, 'output_tokens': 3,
                    'cache_read_tokens': 17, 'cache_hit_tokens': 17, 'cache_write_tokens': 5}]
        summary = ol.summarize_usage_records(records + records)
        self.assertIsNone(summary['input_tokens'])
        self.assertEqual(summary['known_input_tokens'], 57)
        self.assertEqual(summary['unknown_input_calls'], 1)
        safe = ol.safe_call_metadata(records[0])
        self.assertEqual(safe.get('input_uncached_tokens'), 9)
        self.assertEqual(safe.get('input_tokens_lower_bound'), 26)

    def test_unidentified_legacy_completions_do_not_report_zero_consumption(self):
        summary = ol.summarize_usage_records([{'event': 'model_completion', 'input_tokens': 25,
                                               'output_tokens': 11, 'content': 'PRIVATE'}])
        self.assertEqual(summary['status'], 'unknown')
        self.assertIsNone(summary['input_tokens'])
        self.assertIsNone(summary['calls_started'])

    def test_unsupported_engine_telemetry_stays_unknown_in_batch(self):
        spec = importlib.util.spec_from_file_location('legacy_batch', ROOT / 'scripts/test_workflow_batch.py')
        batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(batch)
        with tempfile.TemporaryDirectory(dir=ROOT / '.demo-runtime/optimization-dev109') as temporary:
            path = Path(temporary) / 'log.jsonl'
            path.write_text(json.dumps({'run_id': 'a' * 32, 'event': 'engine_selected', 'engine': 'hermes'}), encoding='utf-8')
            summary = batch.request_usage(path, 'a' * 32, True)
        self.assertIsNone(summary['input_tokens'])
        self.assertIsNone(summary['calls_started'])

    def test_completed_usage_survives_failure_and_replay_does_not_double_count(self):
        request = SimpleNamespace(provider_id='deepseek', model='deepseek-flash', agent_mode='single')
        completed = {'event': 'completed', 'call_id': 'a' * 32, 'stage': 'build', 'call_scope': 'authoring',
                     'attempt': 1, 'input_tokens': 25, 'output_tokens': 11, 'reasoning_tokens': 7,
                     'cache_hit_tokens': 20, 'cache_miss_tokens': 5, 'failure_code': None,
                     'finish_reason': 'stop', 'content': 'PRIVATE'}
        with patch.object(mp, 'resolve', return_value=PROVIDER), patch.object(ol, '_write') as write:
            log = ol.OrchestrationRunLog(request)
            self.assertTrue(callable(getattr(log, 'call', None)), 'incremental call entrypoint is required')
            log.call({**completed, 'event': 'started'})
            log.call(completed)
            log.call(completed)
            log.event('result', {'project': {'nodes': []}, 'build_report': {'calls': [
                {'stage': 'build', 'completions': [completed]}]}})
            failure = HTTPException(503, 'PRIVATE-FATAL')
            failure.provider_completion_metadata = completed
            log.failed(failure)
            log.finish('exception')
        rows = [call.args[0] for call in write.call_args_list]
        self.assertEqual(len([r for r in rows if r['event'] == 'model_call_started']), 1)
        ends = [r for r in rows if r['event'] == 'model_completion']
        self.assertEqual(len(ends), 1)
        self.assertEqual(ends[0]['cache_hit_tokens'], 20)
        self.assertEqual(ends[0]['input_tokens'], 25)
        self.assertNotIn('PRIVATE', json.dumps(rows))


class IncrementalBatchUsageTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_sse_reads_matching_server_log_and_keeps_known_lower_bounds(self):
        spec = importlib.util.spec_from_file_location('incremental_batch', ROOT / 'scripts/test_workflow_batch.py')
        batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(batch)
        with tempfile.TemporaryDirectory(dir=ROOT / '.demo-runtime/optimization-dev109') as temporary:
            path = Path(temporary)
            run_id = 'b' * 32
            log_path = path / 'calls.jsonl'
            records = [
                {'run_id': 'c' * 32, 'event': 'model_completion', 'call_id': 'd' * 32, 'input_tokens': 9999},
                {'run_id': run_id, 'event': 'started'},
                {'run_id': run_id, 'event': 'model_call_started', 'call_id': 'e' * 32, 'call_scope': 'authoring'},
                {'run_id': run_id, 'event': 'model_completion', 'call_id': 'e' * 32, 'call_scope': 'authoring',
                 'input_tokens': 25, 'output_tokens': 11, 'reasoning_tokens': 7, 'cache_hit_tokens': 20, 'cache_miss_tokens': 5},
                {'run_id': run_id, 'event': 'model_completion', 'call_id': 'e' * 32, 'call_scope': 'authoring',
                 'input_tokens': 25, 'output_tokens': 11, 'reasoning_tokens': 7, 'cache_hit_tokens': 20, 'cache_miss_tokens': 5},
                {'run_id': run_id, 'event': 'model_call_started', 'call_id': 'f' * 32, 'call_scope': 'graph_inference'},
                {'run_id': run_id, 'event': 'terminal', 'termination': 'exception', 'error': 'PRIVATE-UPSTREAM'}]
            log_path.write_text('\n'.join(json.dumps(r) for r in records), encoding='utf-8')
            args = batch.parse_args(['--provider', 'deepseek', '--cases', 'IN-02', '--output-root', str(path)])
            args.log_path = log_path
            async def server(request):
                if request.url.path.endswith('/providers'):
                    return httpx.Response(200, json={'providers': [{'id': 'deepseek', 'model': 'deepseek-flash', 'configured': True}]})
                if request.url.path.endswith('/engine'):
                    return httpx.Response(200, json={'engine': 'bounded'})
                return httpx.Response(200, text='event: error\ndata: {"code":"invalid_json"}\n\n',
                                      headers={'content-type': 'text/event-stream', 'x-orchestration-run-id': run_id})
            async with httpx.AsyncClient(transport=httpx.MockTransport(server)) as client:
                _, report, code = await batch.run_batch(args, json.loads(batch.SUITE.read_text(encoding='utf-8')), client=client)
            self.assertEqual(code, 1)
            self.assertIn('usage', report['results'][0], 'failed requests must retain incrementally logged usage')
            usage = report['results'][0]['usage']
            self.assertEqual((usage['calls_started'], usage['calls_completed']), (2, 1))
            self.assertEqual(usage['known_input_tokens'], 25)
            self.assertIsNone(usage['input_tokens'])
            self.assertEqual(usage['unknown_input_calls'], 1)
            self.assertEqual(usage['by_scope']['authoring']['input_tokens'], 25)
            self.assertIsNone(usage['by_scope']['graph_inference']['input_tokens'])
            self.assertEqual(report['summary']['usage']['known_output_tokens'], 11)
            self.assertNotIn('PRIVATE', json.dumps(report))


if __name__ == '__main__':
    unittest.main()
