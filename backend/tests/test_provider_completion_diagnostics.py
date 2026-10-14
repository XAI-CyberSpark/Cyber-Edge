"""Regression checks for incomplete model responses and bounded output policies."""
import json
import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from app.services import model_providers as mp


class CompletionDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    def provider(self, model='deepseek-flash', provider_id='deepseek'):
        return mp.Provider(provider_id, 'Test provider', 'https://api.deepseek.com', model, 'synthetic-key')

    async def invoke(self, body):
        original = httpx.AsyncClient
        def client(**kw):
            return original(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body)), **kw)
        with patch.object(mp.httpx, 'AsyncClient', side_effect=client):
            return await mp.complete(self.provider(), [{'role':'user','content':'PRIVATE-INPUT'}], {'type':'object'})

    async def test_truncation_reports_budget_failure_without_partial_arguments(self):
        body = {'choices':[{'finish_reason':'length','message':{'content':'PRIVATE-CONTENT',
                'reasoning_content':'PRIVATE-THINKING','tool_calls':[{'function':{
                'name':'submit_scenario','arguments':'{"PRIVATE-PARTIAL":'}}]}}],
                'usage':{'prompt_tokens':123,'completion_tokens':14000,
                         'completion_tokens_details':{'reasoning_tokens':11858}}}
        with self.assertRaises(HTTPException) as failed:
            await self.invoke(body)
        self.assertEqual(getattr(failed.exception, 'provider_failure_code', None), 'output_truncated')
        self.assertIn('输出', failed.exception.detail)
        self.assertNotIn('连接失败', failed.exception.detail)
        self.assertNotIn('PRIVATE', str(failed.exception.__dict__))

    async def test_invalid_json_empty_and_wrong_tool_are_distinct(self):
        cases = [
            ('invalid_json', {'choices':[{'finish_reason':'tool_calls','message':{'tool_calls':[
                {'function':{'name':'submit_scenario','arguments':'{"private":'}}]}}]}),
            ('empty_response', {'choices':[{'finish_reason':'stop','message':{'content':None}}]}),
            ('tool_protocol', {'choices':[{'finish_reason':'tool_calls','message':{'tool_calls':[
                {'function':{'name':'private-tool','arguments':'{}'}}]}}]}),
            ('invalid_response', {'choices':[]}),
        ]
        for code, body in cases:
            with self.subTest(code=code):
                with self.assertRaises(HTTPException) as failed:
                    await self.invoke(body)
                self.assertEqual(getattr(failed.exception, 'provider_failure_code', None), code)

    async def test_metadata_is_safe_numeric_and_request_local_even_on_rejection(self):
        records = []
        observer = getattr(mp, 'COMPLETION_METADATA_OBSERVER', None)
        self.assertIsNotNone(observer)
        token = observer.set(records.append)
        try:
            with self.assertRaises(HTTPException):
                await self.invoke({'choices':[{'finish_reason':'length','message':{'content':'PRIVATE'}}],
                                   'usage':{'prompt_tokens':True,'completion_tokens':14000,
                                            'completion_tokens_details':{'reasoning_tokens':14000},
                                            'private':'SECRET'}})
        finally:
            observer.reset(token)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['finish_reason'], 'length')
        self.assertEqual(records[0]['failure_code'], 'output_truncated')
        self.assertEqual(records[0]['output_tokens'], 14000)
        self.assertEqual(records[0]['reasoning_tokens'], 14000)
        self.assertIsNone(records[0]['input_tokens'])
        self.assertNotIn('PRIVATE', json.dumps(records))
        self.assertNotIn('SECRET', json.dumps(records))
        self.assertIsNone(observer.get())

    def test_phase_budgets_preserve_explicit_reasoning_and_other_providers(self):
        options = getattr(mp, 'authoring_options', None)
        self.assertIsNotNone(options)
        explicit = {'enabled':True,'effort':'max'}
        for stage, maximum in [('understand',16384),('build',32768),('repair',32768),('review',8192)]:
            with self.subTest(stage=stage):
                self.assertEqual(options(self.provider(), stage, explicit), {'max_tokens':maximum,'reasoning':explicit})
        self.assertEqual(options(self.provider(), 'build', {'enabled':False})['reasoning'], {'enabled':False})
        self.assertEqual(options(self.provider('deepseek-unverified'), 'build', None), {'max_tokens':14000})
        self.assertEqual(options(self.provider('gpt-4.1','openai'), 'build', None), {'max_tokens':14000})

    def test_larger_graph_budget_has_finite_whole_run_deadline(self):
        timeout = getattr(mp, 'authoring_timeout', None)
        self.assertIsNotNone(timeout)
        self.assertEqual(timeout(self.provider()), 720)
        self.assertEqual(timeout(self.provider('deepseek-unverified')), 240)
        self.assertEqual(timeout(self.provider('gpt-4.1','openai')), 240)

    def test_runtime_does_not_spend_small_result_budget_on_implicit_thinking(self):
        request = SimpleNamespace(provider_id='deepseek',model='deepseek-flash',messages=[{'role':'user','content':'U'}],max_tokens=2048)
        response = httpx.Response(200, json={'choices':[{'finish_reason':'stop','message':{'content':'OK'}}]},
                                  request=httpx.Request('POST','https://api.deepseek.com/chat/completions'))
        with patch.object(mp, 'resolve', return_value=self.provider()), patch.object(httpx.Client, 'post', return_value=response) as post:
            result = mp.runtime_chat(request)
        self.assertEqual(post.call_args.kwargs['json'].get('thinking'), {'type':'disabled'})
        self.assertEqual(post.call_args.kwargs['json']['max_tokens'], 2048)
        self.assertEqual(result['choices'][0]['message']['content'], 'OK')

    def test_transport_and_refusal_never_expose_upstream_text(self):
        for exc, code in [(httpx.ReadError('PRIVATE-KEY'), 'transport_error'),
                          (httpx.ReadTimeout('PRIVATE-KEY'), 'timeout')]:
            failure = mp._failure(self.provider(), exc)
            self.assertEqual(getattr(failure, 'provider_failure_code', None), code)
            self.assertNotIn('PRIVATE', failure.detail)

    async def test_trial_and_runtime_share_short_result_policy(self):
        from app.services.scenario_execution import _cloud_inference
        with patch.object(mp, 'resolve', return_value=self.provider()), patch.object(mp, 'complete', new=AsyncMock(return_value='OK')) as complete:
            result = await _cloud_inference({'provider_id':'deepseek','model':'deepseek-flash',
                                            'messages':[{'role':'user','content':'U'}],'max_tokens':2048})
        self.assertEqual(complete.call_args.kwargs, {'max_tokens':2048,'reasoning':{'enabled':False}})
        self.assertEqual(result['choices'][0]['message']['content'], 'OK')

    async def test_parallel_metadata_and_failing_observer_do_not_change_completion(self):
        async def collect(count):
            records = []
            token = mp.COMPLETION_METADATA_OBSERVER.set(records.append)
            try:
                await asyncio.sleep(0)
                await self.invoke({'choices':[{'finish_reason':'stop','message':{'content':'OK'}}],
                                   'usage':{'prompt_tokens':count,'completion_tokens':2}})
                return records
            finally:
                mp.COMPLETION_METADATA_OBSERVER.reset(token)
        first, second = await asyncio.gather(collect(3), collect(9))
        self.assertEqual([r['input_tokens'] for r in first], [3])
        self.assertEqual([r['input_tokens'] for r in second], [9])
        self.assertIsNone(mp.COMPLETION_METADATA_OBSERVER.get())
        def fail(_): raise OSError('private observer error')
        token = mp.COMPLETION_METADATA_OBSERVER.set(fail)
        try:
            self.assertEqual(await self.invoke({'choices':[{'finish_reason':'stop','message':{'content':'OK'}}]}), 'OK')
        finally:
            mp.COMPLETION_METADATA_OBSERVER.reset(token)

    async def test_sse_and_terminal_log_have_fixed_failure_code_and_safe_counts(self):
        from app.api.orchestration import _stream_orchestration
        from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
        from app.services.orchestration_logging import OrchestrationRunLog
        failure = mp._failure(self.provider(), mp.ProviderResponseError('output_truncated'))
        failure.provider_completion_metadata = {'finish_reason':'length','output_tokens':14000,
                                              'reasoning_tokens':11858,'failure_code':'output_truncated',
                                              'content':'PRIVATE', 'input_tokens':True}
        async def events(_request):
            raise failure
            yield
        request = WorkflowGenerateRequestSchema(prompt='PRIVATE-PROMPT',provider_id='deepseek')
        with patch('app.api.orchestration.build_events', events):
            stream = ''.join([chunk async for chunk in _stream_orchestration(request)])
        self.assertIn('"code": "output_truncated"', stream)
        with patch('app.services.orchestration_logging._write') as write:
            log = OrchestrationRunLog(request)
            log.failed(failure)
            log.finish('exception')
        records = [call.args[0] for call in write.call_args_list]
        metadata = next(r for r in records if r['event']=='model_completion')
        self.assertEqual(metadata['reasoning_tokens'],11858)
        self.assertNotIn('input_tokens', metadata)
        self.assertEqual(records[-1]['provider_failure_code'],'output_truncated')
        self.assertNotIn('PRIVATE', json.dumps(records))

    async def test_two_invalid_planning_responses_keep_safe_diagnostics_at_terminal(self):
        from app.api.orchestration import _stream_orchestration
        from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
        from app.services.hermes_authoring import EngineConfig
        original = httpx.AsyncClient
        calls = []
        def respond(request):
            calls.append(request)
            return httpx.Response(200,json={'choices':[{'finish_reason':'tool_calls','message':{'tool_calls':[
                {'function':{'name':'submit_scenario','arguments':'{"PRIVATE":'}}]}}],
                'usage':{'prompt_tokens':100,'completion_tokens':200,'completion_tokens_details':{'reasoning_tokens':150}}})
        def client(**kw): return original(transport=httpx.MockTransport(respond), **kw)
        with patch.object(mp, 'resolve', return_value=self.provider()), \
                patch.object(mp.httpx, 'AsyncClient', side_effect=client), \
                patch('app.services.hermes_authoring.configured_engine',return_value=EngineConfig()), \
                patch('app.services.orchestration_logging._write') as write:
            stream = ''.join([chunk async for chunk in _stream_orchestration(
                WorkflowGenerateRequestSchema(prompt='PRIVATE-PROMPT',provider_id='deepseek'))])
        self.assertEqual(len(calls),2)
        self.assertIn('"code": "invalid_json"',stream)
        records = [call.args[0] for call in write.call_args_list]
        completions = [r for r in records if r['event']=='model_completion']
        self.assertEqual(len(completions),2)
        self.assertEqual([r['finish_reason'] for r in completions],['tool_calls','tool_calls'])
        self.assertTrue(all(r['reasoning_tokens']==150 for r in completions))
        self.assertEqual(records[-1]['provider_failure_code'],'invalid_json')
        self.assertNotIn('PRIVATE',json.dumps(records))


if __name__ == '__main__':
    unittest.main()
