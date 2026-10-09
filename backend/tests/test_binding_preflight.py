import copy,json,unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
from fastapi import HTTPException
from app.services.flow_contract import validate_bindings
from app.services.scenario_execution import api_model_binding_errors,execute_candidate
from app.services.authoring_session import AuthoringSession
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from tests.test_authoring_session import BRIEF,PATCH,PLAN

def node(id,kind,**data):return {'id':id,'type':kind,'data':data}

class BindingContractTests(unittest.TestCase):
    def test_shared_cases(self):
        cases=json.loads((Path(__file__).resolve().parents[2]/'studio/tests/fixtures/binding-preflight.json').read_text())
        nodes=[node('m','llm'),node('stage','stage')]
        for case in cases:
            with self.subTest(case=case['name']):
                self.assertEqual(not validate_bindings(node('o','output',**case['data']),nodes),case['valid'])
        self.assertEqual(validate_bindings(node('stage','stage',description='{{unknown}}'),nodes),[])

    def test_binding_readiness_requires_fixed_provider_and_checks_actual_configuration(self):
        for data in [{'model':'MiniMax-M3'},{'model':'MiniMax-M3','providerId':{'$ref':'state.provider'}},
                     {'providerId':'minimax','model':'{{state.model}}'},{'providerId':'minimax','model':''}]:
            with patch('app.services.scenario_execution.model_providers.resolve') as resolver:
                self.assertTrue(api_model_binding_errors([node('m','llm',**data)]));resolver.assert_not_called()
        with patch('app.services.scenario_execution.model_providers.resolve',side_effect=HTTPException(503,'请先接入模型')) as resolver:
            self.assertIn('请先接入模型',api_model_binding_errors([node('m','llm',model='MiniMax-M3',providerId='minimax')])[0])
            resolver.assert_called_once_with('minimax','MiniMax-M3')
        with patch('app.services.scenario_execution.model_providers.resolve',side_effect=RuntimeError('private secret')):
            self.assertNotIn('private secret',str(api_model_binding_errors([node('m','llm',model='MiniMax-M3',providerId='minimax')])))

class TrialPreflightTests(unittest.IsolatedAsyncioTestCase):
    async def test_bad_bindings_do_not_execute_or_consume_trial_budget_and_fixed_graph_can_run(self):
        execute=AsyncMock(return_value={'status':'passed','cases':[],'runtime_verified':True})
        review=AsyncMock(return_value={'status':'passed'})
        s=AuthoringSession(WorkflowGenerateRequestSchema(prompt='显示完成',acceptance_tests=PLAN),executor=execute,reviewer=review)
        s.record_brief(BRIEF);bad=copy.deepcopy(PATCH);bad['upsert_nodes'][1]['set_data']['responseText']='{{i.text}}'
        s.patch(bad);before=s.plan.model_dump()
        result=await s.trial({'revision':1});self.assertEqual(result['status'],'not_run')
        self.assertTrue(any('data.responseText' in i and 'outputs.i.text' in i for i in result['issues']))
        self.assertEqual(s.trials,0);execute.assert_not_called();review.assert_not_called()
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':'{{outputs.i.text}}'}}]})
        self.assertEqual((await s.trial({'revision':2}))['status'],'passed')
        self.assertEqual(s.trials,1);execute.assert_awaited_once();self.assertEqual(s.plan.model_dump(),before)

    async def test_missing_provider_blocks_current_graph_without_changing_explicit_model(self):
        execute=AsyncMock();s=AuthoringSession(WorkflowGenerateRequestSchema(prompt='显示完成',acceptance_tests=PLAN),executor=execute)
        s.record_brief(BRIEF);s.patch(PATCH)
        # A previously saved model binding must not be silently replaced with the author model.
        s.project.nodes[1]['type']='llm';s.project.nodes[1]['data']={'model':'local-model','outputFormat':'text'}
        result=await s.trial({'revision':1})
        self.assertEqual(result['status'],'not_run');self.assertEqual(s.trials,0);execute.assert_not_called()
        self.assertTrue(any('providerId' in e for e in result['issues']))
        self.assertEqual(s.project.nodes[1]['data']['model'],'local-model');self.assertNotIn('providerId',s.project.nodes[1]['data'])

    async def test_direct_cloud_trial_rejects_binding_before_building_child(self):
        with patch('app.services.scenario_execution.asyncio.create_subprocess_exec',new_callable=AsyncMock) as spawn:
            result=await execute_candidate({'nodes':[node('m','llm',model='local-model')],'edges':[]},PLAN)
        self.assertEqual(result['status'],'not_supported');self.assertIn('providerId',result['issue']);spawn.assert_not_called()
