import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.services import model_providers as mp
from app.schemas.inference_schema import ChatRequestSchema
from app.services.inference_service import InferenceService
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.scenario_builder import ScenarioBuilder, build_events
from app.api.orchestration import router


class Providers(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        from app.services.hermes_authoring import EngineConfig
        engine=patch('app.services.hermes_authoring.configured_engine',return_value=EngineConfig(engine='bounded'))
        engine.start();self.addCleanup(engine.stop)
        for p in [patch.object(mp,'SETTINGS_PATH',Path(self.tmp.name)/'model-providers.json'),
                  patch.dict(os.environ,{},clear=True),
                  patch('app.services.orchestration_service.OrchestrationService._resolve_api_key_from_files',return_value='')]:
            p.start();self.addCleanup(p.stop)

    def provider(self,id):
        p=mp.resolve(id,require_key=False)
        return mp.Provider(p.id,p.label,p.base_url,p.model,'test-secret-'+id)

    def test_status_never_discloses_keys_and_provider_keys_are_isolated(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':'openai-secret','ANTHROPIC_API_KEY':'claude-secret'}):
            statuses=mp.statuses()
            self.assertFalse(statuses[0]['configured'])
            self.assertTrue(statuses[1]['configured'])
            self.assertNotIn('secret',json.dumps(statuses))
            self.assertNotIn('secret',repr(mp.resolve('openai')))
            self.assertEqual(mp.resolve('anthropic').api_key,'claude-secret')
            with self.assertRaises(HTTPException):mp.resolve('minimax')

    async def test_unconfigured_never_calls_network_or_other_provider(self):
        with patch.object(httpx.AsyncClient,'post',new=AsyncMock()) as post:
            with self.assertRaises(HTTPException):
                await ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='航海',provider_id='openai'))._complete([{'role':'system','content':'test'}])
            post.assert_not_called()

    def test_model_mismatch_and_redirect_are_rejected(self):
        for id,model in [('openai','MiniMax-M3'),('anthropic','gpt-4.1')]:
            with self.assertRaises(HTTPException):mp.resolve(id,model,require_key=False)
        with self.assertRaises(HTTPException):
            ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='a',provider_id='openai',provider_base_url='https://evil.invalid'))

    async def test_all_protocols_submit_tool_arguments_without_exposing_reasoning(self):
        schema={'type':'object','properties':{'ok':{'type':'boolean'}}}
        for id in mp.PROVIDERS:
            provider=self.provider(id);captured=[]
            async def post(client,url,**kw):
                captured.append((url,kw))
                data=({'stop_reason':'tool_use','content':[{'type':'thinking','thinking':'PRIVATE'},{'type':'tool_use','name':'submit_scenario','input':{'ok':True}}]} if id=='anthropic' else
                      {'choices':[{'finish_reason':'tool_calls','message':{'content':None,'reasoning_content':'PRIVATE','tool_calls':[{'function':{'name':'submit_scenario','arguments':'{"ok":true}'}}]}}]})
                return httpx.Response(200,json=data,request=httpx.Request('POST',url))
            with patch.object(httpx.AsyncClient,'post',new=post):
                result=await mp.complete(provider,[{'role':'system','content':'S'},{'role':'user','content':'U'}],schema)
            self.assertEqual(json.loads(result),{'ok':True});self.assertNotIn('PRIVATE',result)
            url,kw=captured[0];self.assertTrue(url.startswith(provider.base_url))
            if id=='anthropic':
                self.assertTrue(url.endswith('/messages'));self.assertEqual(kw['headers']['x-api-key'],provider.api_key)
                self.assertEqual(kw['json']['system'],'S');self.assertEqual(kw['json']['messages'],[{'role':'user','content':'U'}])
                self.assertEqual(kw['json']['tools'][0]['input_schema'],schema)
            else:
                self.assertEqual(kw['headers']['Authorization'],'Bearer '+provider.api_key)
                self.assertIn('parameters',kw['json']['tools'][0]['function'])
                if id=='openai':self.assertIn('max_completion_tokens',kw['json']);self.assertNotIn('temperature',kw['json'])

    def test_verified_gateway_uses_named_structured_submission_only_with_schema(self):
        p=mp.Provider('anthropic','Claude','https://www.fucheers.top/v1','claude-sonnet-5','test-key')
        _,_,payload=mp._request(p,[{'role':'user','content':'U'}],{'type':'object'})
        self.assertEqual(payload['tool_choice'],{'type':'tool','name':'submit_scenario','disable_parallel_tool_use':True})
        _,_,plain=mp._request(p,[{'role':'user','content':'U'}])
        self.assertNotIn('tool_choice',plain)

    async def test_provider_http_failure_is_sanitized_and_not_retried(self):
        url='https://api.openai.com/v1/chat/completions'
        response=httpx.Response(401,text='APIKEY test-secret-openai ACCOUNT PRIVATE',request=httpx.Request('POST',url))
        with patch.object(httpx.AsyncClient,'post',new=AsyncMock(return_value=response)) as post:
            with self.assertRaises(HTTPException) as exc:await mp.complete(self.provider('openai'),[{'role':'user','content':'U'}])
        self.assertEqual(post.call_count,1);self.assertIn('401',exc.exception.detail)
        self.assertNotIn('PRIVATE',exc.exception.detail);self.assertNotIn('test-secret',exc.exception.detail)

    def test_truncated_refused_empty_or_wrong_tool_are_rejected(self):
        p=self.provider('openai')
        for choice in [{'finish_reason':'length','message':{'content':'partial'}},{'finish_reason':'stop','message':{'content':None,'reasoning_content':'PRIVATE'}},{'finish_reason':'stop','message':{'refusal':'no'}},{'finish_reason':'tool_calls','message':{'tool_calls':[{'function':{'name':'other','arguments':'{}'}}]}}]:
            with self.assertRaises((ValueError,KeyError)):mp._result(p,{'choices':[choice]}, {})
        with self.assertRaises(ValueError):mp._result(self.provider('anthropic'),{'stop_reason':'max_tokens','content':[{'type':'text','text':'partial'}]},None)

    async def test_configuration_only_saves_after_validation_private_atomic_and_restart_readable(self):
        with patch.object(mp,'complete',new=AsyncMock(return_value='OK')):
            status=await mp.configure('openai','gpt-4.1','new-secret')
        self.assertTrue(status['configured']);self.assertNotIn('new-secret',json.dumps(status))
        self.assertEqual(mp.SETTINGS_PATH.stat().st_mode & 0o777,0o600)
        self.assertEqual(mp.resolve('openai').api_key,'new-secret')
        before=mp.SETTINGS_PATH.read_bytes()
        with patch.object(mp,'complete',new=AsyncMock(side_effect=HTTPException(503,'failed'))):
            with self.assertRaises(HTTPException):await mp.configure('openai','gpt-4.1','bad-secret')
        self.assertEqual(before,mp.SETTINGS_PATH.read_bytes())
        with patch.object(mp,'complete',new=AsyncMock(return_value='OK')):
            await mp.configure('openai','gpt-4.1',None)
        self.assertEqual(mp.resolve('openai').api_key,'new-secret')

    def test_runtime_uses_explicit_provider_and_normalizes_claude_usage(self):
        p=self.provider('anthropic')
        body={'id':'msg-1','model':p.model,'stop_reason':'end_turn','content':[{'type':'thinking','thinking':'PRIVATE'},{'type':'text','text':'欢迎'}],'usage':{'input_tokens':4,'output_tokens':2}}
        response=httpx.Response(200,json=body,request=httpx.Request('POST',p.base_url+'/messages'))
        with patch.object(mp,'resolve',return_value=p),patch.object(httpx.Client,'post',return_value=response) as post:
            result=InferenceService.chat_completions(ChatRequestSchema(model=p.model,provider_id='anthropic',messages=[{'role':'user','content':'U'}]))
        self.assertEqual(result['usage']['total_tokens'],6);self.assertEqual(result['choices'][0]['message']['content'],'欢迎')
        self.assertEqual(post.call_args.args[0],p.base_url+'/messages')

    def test_api_status_and_invalid_configuration_never_echo_keys(self):
        app=FastAPI();app.include_router(router,prefix='/v1/orchestration')
        with TestClient(app) as client:
            data=client.get('/v1/orchestration/providers');self.assertEqual(data.status_code,200)
            response=client.put('/v1/orchestration/providers/openai',json={'model':'gpt-4.1','api_key':{'secret':'DO_NOT_ECHO'}})
            self.assertEqual(response.status_code,400);self.assertNotIn('DO_NOT_ECHO',response.text)
            with patch.object(mp,'complete',new=AsyncMock(return_value='OK')):
                response=client.put('/v1/orchestration/providers/anthropic',json={'model':'claude-sonnet-5','api_key':'secret-claude'})
            self.assertEqual(response.status_code,200);self.assertNotIn('secret-claude',response.text)

    async def test_selected_provider_survives_entire_pipeline_and_result(self):
        from tests.test_scenario_builder import BRIEF,candidate
        from copy import deepcopy
        for id in ('openai','anthropic'):
            outputs=[deepcopy(BRIEF),candidate(),{'issues':[],'strengths':[]}]
            async def complete(p,*args,**kw):
                self.assertEqual(p.id,id)
                return json.dumps(outputs.pop(0),ensure_ascii=False)
            with patch.object(mp,'complete',new=complete):
                events=[e async for e in build_events(WorkflowGenerateRequestSchema(prompt='乘客文字探险',provider_id=id))]
            result=next(v for k,v in events if k=='result')
            self.assertEqual(result['provider']['id'],id);self.assertEqual(result['project']['meta']['authoring_provider'],id)
            self.assertTrue(result['validation']['passed']);self.assertFalse(outputs)

    async def test_gateway_configuration_keeps_endpoint_and_key_isolated(self):
        gateway = 'https://www.fucheers.top/v1'
        with patch.object(mp, 'complete', new=AsyncMock(return_value='OK')) as call:
            result = await mp.configure('anthropic', 'claude-sonnet-5', 'gateway-secret', base_url=gateway)
        self.assertEqual(call.call_args.args[0].base_url, gateway)
        self.assertIn('fucheers.top', result['label'])
        self.assertNotIn('gateway-secret', json.dumps(result))
        self.assertEqual(mp.resolve('anthropic').base_url, gateway)
        self.assertEqual(mp.SETTINGS_PATH.stat().st_mode & 0o777, 0o600)
        with patch.object(mp, 'complete', new=AsyncMock(return_value='OK')) as call:
            await mp.configure('anthropic', 'claude-sonnet-5', None)
        self.assertEqual(call.call_args.args[0].base_url, gateway)
        self.assertEqual(call.call_args.args[0].api_key, 'gateway-secret')
        before = mp.SETTINGS_PATH.read_bytes()
        with patch.object(mp, 'complete', new=AsyncMock(side_effect=HTTPException(503, 'failed'))):
            with self.assertRaises(HTTPException):
                await mp.configure('anthropic', 'claude-sonnet-5', 'bad-key')
        self.assertEqual(before, mp.SETTINGS_PATH.read_bytes())

    async def test_endpoint_switch_requires_new_key_and_rejects_unapproved_hosts(self):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY':'official-secret'}), patch.object(mp, 'complete', new=AsyncMock()) as call:
            for base, key in [('https://www.fucheers.top/v1', None), ('https://evil.invalid/v1', 'secret')]:
                with self.assertRaises(HTTPException):
                    await mp.configure('anthropic', 'claude-sonnet-5', key, base_url=base)
            call.assert_not_called()
        self.assertFalse(mp.SETTINGS_PATH.exists())

    def test_gateway_does_not_inherit_official_env_key_and_rejects_bad_saved_url(self):
        mp.SETTINGS_PATH.write_text(json.dumps({'anthropic':{'base_url':'https://www.fucheers.top/v1'}}))
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY':'official-secret'}):
            self.assertFalse(mp.resolve('anthropic', require_key=False).api_key)
            with self.assertRaises(HTTPException): mp.resolve('anthropic')
        mp.SETTINGS_PATH.write_text(json.dumps({'anthropic':{'base_url':'https://evil.invalid/v1','api_key':'secret'}}))
        with self.assertRaises(HTTPException): mp.resolve('anthropic')

    def test_generation_and_configuration_requests_cannot_redirect_gateway(self):
        mp.SETTINGS_PATH.write_text(json.dumps({'anthropic':{'base_url':'https://www.fucheers.top/v1','api_key':'gateway-secret'}}))
        with self.assertRaises(HTTPException):
            ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='test', provider_id='anthropic', provider_base_url='https://evil.invalid/v1'))
        app=FastAPI(); app.include_router(router, prefix='/v1/orchestration')
        with TestClient(app) as client:
            response=client.put('/v1/orchestration/providers/anthropic',json={'model':'claude-sonnet-5','api_key':'DO_NOT_ECHO','base_url':'https://evil.invalid/v1'})
        self.assertEqual(response.status_code,400)
        self.assertNotIn('DO_NOT_ECHO',response.text)
