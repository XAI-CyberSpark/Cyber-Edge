import unittest
from app.services.interaction_contract import validate_interaction_plan
from app.services.node_capability_service import validate_capabilities
from app.services.orchestration_service import OrchestrationService
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema

PLAN={'mode':'live','model':'MiniMax-M3','premise':'乘客生日航海','ending':'生日快乐','steps':[{'id':'riddle','title':'启航谜题','waitFor':'answer','brief':'创作一个航海谜题'}]}
def graph(plan=PLAN):
    return {'nodes':[{'id':'i','type':'input','data':{}},{'id':'s','type':'interaction','data':{'plan':plan}}], 'edges':[{'id':'is','source':'i','target':'s'}]}
class InteractionTests(unittest.TestCase):
    def test_live_and_authored_contracts(self):
        self.assertEqual(validate_interaction_plan(PLAN),[])
        authored={**PLAN,'mode':'authored','steps':[{'id':'s','title':'谜题','waitFor':'answer','content':{'message':'开始','question':'q','answers':['a'],'hint':'h'}}]}
        self.assertEqual(validate_interaction_plan(authored),[])
        authored['steps'][0]['content']['answers']=[]
        self.assertTrue(validate_interaction_plan(authored))
    def test_bounds_and_unimplemented_events(self):
        for steps in ([],[PLAN['steps'][0]]*2,[{**PLAN['steps'][0],'waitFor':'gps'}]):
            self.assertTrue(validate_interaction_plan({**PLAN,'steps':steps}))
    def test_generator_accepts_interaction_as_terminal(self):
        req=WorkflowGenerateRequestSchema(prompt='生日航海')
        project=OrchestrationService._normalize_project_payload({'workflow':graph()},req)
        self.assertTrue(OrchestrationService._validate_project(project,'model output').passed)
    def test_invalid_interaction_blocks_generation(self):
        g=graph({**PLAN,'steps':[]});self.assertTrue(validate_capabilities(g['nodes'],g['edges'])[0])
    def test_prompt_carries_runtime_contract_without_capping_creativity(self):
        prompt=OrchestrationService._build_messages(WorkflowGenerateRequestSchema(prompt='航海'))[0]['content']
        for phrase in ('interaction','input.data.nav_needed','sourceHandle="error"','未来创新提案','进度','模拟'):
            self.assertIn(phrase,prompt)
    def test_failure_route_must_be_explicit(self):
        nodes=[{'id':'i','type':'input','data':{}},{'id':'m','type':'llm','data':{'model':'test'}},{'id':'f','type':'fallback','data':{'responseText':'请重试'}}]
        edges=[{'source':'i','target':'m'},{'source':'m','target':'f'}]
        self.assertTrue(validate_capabilities(nodes,edges)[0]);edges[-1]['sourceHandle']='error';self.assertEqual(validate_capabilities(nodes,edges)[0],[])
    def test_json_cannot_bypass_action_contract(self):
        nodes=[{'id':'i','type':'input','data':{}},{'id':'m','type':'llm','data':{'model':'test','outputFormat':'json','outputFields':{'go':'boolean'}}},{'id':'t','type':'tool','data':{'tool':'nav'}}]
        self.assertTrue(validate_capabilities(nodes,[{'source':'i','target':'m'},{'source':'m','target':'t'}])[0])
    def test_no_upstream_actions_repeated_for_every_answer(self):
        g=graph();g['nodes'].append({'id':'t','type':'tool','data':{'tool':'nav'}});g['edges']=[{'source':'i','target':'t'},{'source':'t','target':'s'}]
        self.assertTrue(validate_capabilities(g['nodes'],g['edges'])[0])
if __name__=='__main__':unittest.main()

from unittest.mock import patch, MagicMock
from app.services.inference_service import InferenceService
from app.schemas.inference_schema import ChatRequestSchema
from fastapi import HTTPException
class RuntimeProviderTests(unittest.TestCase):
    def test_configured_model_routes_to_same_provider_with_server_only_credentials(self):
        session=MagicMock();response=MagicMock();response.json.return_value={'id':'real','choices':[{'message':{'content':'{"message":"hello"}'}}]};session.post.return_value=response
        with patch.object(OrchestrationService,'_resolve_model',return_value='MiniMax-M3'),patch.object(OrchestrationService,'_resolve_api_key',return_value='test-secret'),patch.object(OrchestrationService,'_resolve_base_url',return_value='https://provider.invalid/v1'),patch('app.services.inference_service.requests.Session') as factory,patch('app.services.inference_service.requests.post') as local:
            factory.return_value.__enter__.return_value=session
            result=InferenceService.chat_completions(ChatRequestSchema(model='MiniMax-M3',messages=[{'role':'user','content':'hello'}]))
            self.assertEqual(result['id'],'real');local.assert_not_called();args,kwargs=session.post.call_args
            self.assertEqual(args[0],'https://provider.invalid/v1/chat/completions');self.assertEqual(kwargs['headers']['Authorization'],'Bearer test-secret');self.assertFalse(session.trust_env);self.assertTrue(kwargs['json']['reasoning_split']);self.assertEqual(kwargs['json']['thinking'],{'type':'disabled'})
    def test_provider_error_does_not_leak_or_fallback(self):
        with patch.object(OrchestrationService,'_resolve_model',return_value='MiniMax-M3'),patch.object(OrchestrationService,'_resolve_api_key',return_value='test-secret'),patch('app.services.inference_service.requests.Session',side_effect=RuntimeError('test-secret')),patch('app.services.inference_service.requests.post') as local:
            with self.assertRaises(HTTPException) as caught:InferenceService.chat_completions(ChatRequestSchema(model='MiniMax-M3',messages=[]))
            self.assertNotIn('test-secret',caught.exception.detail);local.assert_not_called()

class ProjectUpdateTests(unittest.TestCase):
    def test_existing_project_update_accepts_save_schema(self):
        import tempfile
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.api.projects import router
        app=FastAPI();app.include_router(router)
        with tempfile.TemporaryDirectory() as directory,patch('app.services.project_service.PROJECTS_DIR',directory):
            client=TestClient(app);payload={'id':'voyage','name':'voyage',**graph()}
            self.assertEqual(client.post('/',json=payload).status_code,200)
            payload['nodes'][1]['data']['plan']={**PLAN,'ending':'更新后的结局'}
            result=client.post('/',json=payload);self.assertEqual(result.status_code,200)
            self.assertEqual(client.get('/voyage').json()['nodes'][1]['data']['plan']['ending'],'更新后的结局')
