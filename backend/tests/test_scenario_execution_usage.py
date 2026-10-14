"""Graph inference retains provider counts without exposing response content."""
import unittest
import json
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import httpx

from app.services import model_providers
from app.services.scenario_execution import _cloud_inference, execute_candidate


class CloudInferenceUsageTests(unittest.IsolatedAsyncioTestCase):
    async def test_anthropic_partial_cache_keeps_graph_input_total_unknown(self):
        provider=model_providers.Provider('anthropic','Claude','https://fixture.invalid','claude-sonnet-5','test-key')
        def respond(request):
            return httpx.Response(200,json={'stop_reason':'end_turn','content':[{'type':'text','text':'正文'}],
                'usage':{'input_tokens':9,'output_tokens':3,'cache_read_input_tokens':17}})
        original=httpx.AsyncClient
        with patch.object(model_providers,'resolve',return_value=provider),\
             patch.object(httpx,'AsyncClient',side_effect=lambda **kw:original(transport=httpx.MockTransport(respond),**kw)):
            result=await _cloud_inference({'provider_id':'anthropic','model':provider.model,
                'messages':[{'role':'user','content':'request'}]})
        self.assertNotIn('prompt_tokens',result['usage'])
        self.assertEqual(result['usage']['input_tokens_lower_bound'],26)
        self.assertEqual(result['usage']['input_uncached_tokens'],9)

    async def test_provider_counts_reach_graph_response_and_existing_observer(self):
        observed=[]
        raw={'input_tokens':11,'output_tokens':7,'reasoning_tokens':3,
             'cache_read_tokens':None,'cache_write_tokens':None,
             'cache_hit_tokens':5,'cache_miss_tokens':6}

        async def complete(*args, **kwargs):
            model_providers.COMPLETION_USAGE_OBSERVER.get()(raw)
            return '模型正文'

        original_observer=observed.append
        token=model_providers.COMPLETION_USAGE_OBSERVER.set(original_observer)
        try:
            with patch.object(model_providers,'resolve',return_value=SimpleNamespace(model='gpt-test')), \
                 patch.object(model_providers,'runtime_options',return_value={}), \
                 patch.object(model_providers,'complete',side_effect=complete):
                result=await _cloud_inference({'provider_id':'openai','model':'gpt-test',
                    'messages':[{'role':'user','content':'private-input'}]})
            self.assertEqual(observed,[raw])
            self.assertEqual(result.get('usage'),{'prompt_tokens':11,'completion_tokens':7,
                'completion_tokens_details':{'reasoning_tokens':3},
                'prompt_cache_hit_tokens':5,'prompt_cache_miss_tokens':6})
            self.assertNotIn('private-input',str(result['usage']))
            self.assertIs(model_providers.COMPLETION_USAGE_OBSERVER.get(),original_observer)
        finally:
            model_providers.COMPLETION_USAGE_OBSERVER.reset(token)

    async def test_unknown_or_invalid_counts_are_not_reported_as_zero(self):
        async def complete(*args, **kwargs):
            observer=model_providers.COMPLETION_USAGE_OBSERVER.get()
            if observer:observer({'input_tokens':None,
                'output_tokens':True,'reasoning_tokens':-1,'cache_read_tokens':'4'})
            return '正文'

        with patch.object(model_providers,'resolve',return_value=SimpleNamespace(model='gpt-test')), \
             patch.object(model_providers,'runtime_options',return_value={}), \
             patch.object(model_providers,'complete',side_effect=complete):
            result=await _cloud_inference({'provider_id':'openai','model':'gpt-test',
                'messages':[{'role':'user','content':'request'}]})
        self.assertEqual(result.get('usage'),{})

    async def test_graph_calls_keep_completed_usage_when_the_next_model_fails(self):
        records=[]
        project={'id':'usage-trial','name':'usage-trial','meta':{},'nodes':[
            {'id':name,'type':kind,'position':{'x':0,'y':0},'data':data}
            for name,kind,data in [('i','input',{'flowVersion':2}),
                ('first','llm',{'providerId':'openai','model':'gpt-test','outputFormat':'text'}),
                ('second','llm',{'providerId':'openai','model':'gpt-test','outputFormat':'text'}),
                ('o','output',{})]],'edges':[
                    {'id':a+b,'source':a,'target':b} for a,b in [('i','first'),('first','second'),('second','o')]]}
        plan={'cases':[{'name':'completed then failure','steps':[{'input':'PRIVATE-INPUT','status':'failed',
            'assertions':[{'path':['outputs','first','text'],'op':'equals','value':'PRIVATE-OUTPUT'}]}]}]}
        provider=model_providers.Provider('openai','OpenAI','https://fixture.invalid','gpt-test','PRIVATE-KEY')
        posts=0
        def respond(request):
            nonlocal posts
            posts+=1
            if posts==2:raise httpx.ReadTimeout('PRIVATE-UPSTREAM')
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'PRIVATE-OUTPUT'}}],
                'usage':{'prompt_tokens':25,'completion_tokens':11,'completion_tokens_details':{'reasoning_tokens':7}}})
        def deny_authoring_call():
            self.fail('Graph inference must keep its separate 12-call budget')
        observer_token=model_providers.COMPLETION_CALL_OBSERVER.set(records.append)
        budget_token=model_providers.COMPLETION_BUDGET_HOOK.set(deny_authoring_call)
        original=httpx.AsyncClient
        try:
            with patch.object(model_providers,'resolve',return_value=provider), \
                 patch.object(model_providers.httpx,'AsyncClient',side_effect=lambda **kw:original(transport=httpx.MockTransport(respond),**kw)):
                report=await execute_candidate(project,plan,source_root=Path(__file__).resolve().parents[2])
            self.assertEqual(report['status'],'passed',report)
            self.assertEqual(report['model_calls'],2)
            self.assertEqual([r['event'] for r in records],['started','completed','started','completed'])
            self.assertTrue(all(r['stage']=='runtime' and r['call_scope']=='graph_inference' for r in records))
            self.assertEqual(report.get('model_usage'),[records[1],records[3]])
            self.assertEqual(records[1]['input_tokens'],25)
            self.assertEqual(records[1]['output_tokens'],11)
            self.assertIsNone(records[3]['input_tokens'])
            self.assertEqual(records[3]['failure_code'],'timeout')
            self.assertEqual(records[0]['call_id'],records[1]['call_id'])
            self.assertEqual(records[2]['call_id'],records[3]['call_id'])
            self.assertNotEqual(records[0]['call_id'],records[2]['call_id'])
            self.assertNotIn('PRIVATE',json.dumps(records))
            self.assertIs(model_providers.COMPLETION_BUDGET_HOOK.get(),deny_authoring_call)
        finally:
            model_providers.COMPLETION_CALL_OBSERVER.reset(observer_token)
            model_providers.COMPLETION_BUDGET_HOOK.reset(budget_token)


if __name__=='__main__':
    unittest.main()
