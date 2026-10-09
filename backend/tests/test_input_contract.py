import copy
import unittest
from unittest.mock import AsyncMock
from tests.test_authoring_session import session, BRIEF, PATCH, PLAN, ready
from app.services.test_plan_preflight import inspect_test_plan, PlanContractError
from app.services.scenario_execution import execute_candidate, execution_feedback, execution_diagnostics


def json_session():
    s=session();s.record_brief(BRIEF);patch=copy.deepcopy(PATCH)
    patch['upsert_nodes'][0]['set_data']={'inputFormat':'json','outputFields':{'temp':'number'}}
    s.patch(patch);return s

def plan(value):
    result=copy.deepcopy(PLAN);result['cases'][0]['steps'][0]['input']=value;return result

class InputContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_supported_input_shapes_use_real_trial_adapter(self):
        for value in ({'temp':22},'{"temp":22}',{'text':'{"temp":22}'}):
            s=json_session();s.set_plan({'revision':1,'plan':plan(value)})
            self.assertTrue(s.inspect({'revision':1})['passed'])
            report=await s.trial({'revision':1});self.assertEqual(report['status'],'passed',report);self.assertEqual(report['model_calls'],0)

    async def test_submission_rejects_with_location_and_does_not_lock(self):
        for value,code in (({},'INPUT_FIELD_MISSING'),({'temp':'22'},'INPUT_FIELD_TYPE'),('broken','INPUT_JSON_PARSE'),([], 'INPUT_OBJECT_REQUIRED')):
            s=json_session();r=await s.invoke('oakegde_test_plan',{'revision':1,'plan':plan(value)})
            self.assertIsNone(s.plan);self.assertEqual(r['category'],'input_contract');self.assertEqual(r['contract_diagnostics'][0]['code'],code)
            self.assertIn('plan.cases[0].steps[0].input',r['error']);self.assertIn('入口节点 i',r['error']);self.assertNotIn('模型未按约定',r['error'])
        s=json_session()
        with self.assertRaisesRegex(PlanContractError,'缺少 temp（number）'):s.set_plan({'revision':1,'plan':plan({})})

    async def test_inspect_rechecks_after_graph_changes_and_trial_does_not_run(self):
        s=json_session();s.set_plan({'revision':1,'plan':plan({'temp':22})})
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'i','set_data':{'outputFields':{'temp':'string'}}}]})
        s.executor=AsyncMock();r=s.inspect({'revision':2});self.assertFalse(r['passed']);self.assertEqual(r['contract_diagnostics'][0]['code'],'INPUT_FIELD_TYPE')
        trial=await s.trial({'revision':2});self.assertEqual(trial['status'],'not_run');s.executor.assert_not_called();self.assertEqual(s.trials,0)

    async def test_direct_backend_trial_rejects_invalid_later_case_before_model(self):
        s=json_session();p=plan({'temp':22});p['cases'].append(plan({})['cases'][0]);model=AsyncMock()
        r=await execute_candidate(s.project.model_dump(),p,inference=model)
        self.assertEqual(r['status'],'failed');self.assertEqual(r['model_calls'],0);model.assert_not_called()
        self.assertIn('plan.cases[1].steps[0].input',r['issue'])

    def test_inspect_warns_waiting_completed_and_missing_followup(self):
        s=session();ready(s);s.patch({'base_revision':1,'upsert_nodes':[{'id':'w','type':'wait','position':{'x':400,'y':0},'set_data':{'eventName':'message','prompt':'continue'}}], 'upsert_edges':[{'id':'ow','source':'o','target':'w'}]})
        r=s.inspect({'revision':2});self.assertTrue(r['passed'],r)
        warning=next(d for d in r['contract_diagnostics'] if d['code']=='PLAN_WAITING_PATH')
        self.assertIn('completed',warning['message']);self.assertIn('后续 step',warning['message']);self.assertEqual(warning['node_id'],'w')

    def test_memory_warning_uses_reachable_read_write_roles(self):
        node=lambda id,type,data={}:dict(id=id,type=type,data=data)
        project={'nodes':[node('i','input',{'eventName':'write'}),node('w','memory',{'type':'buffer'}),node('r','input',{'eventName':'read'}),node('m','memory',{'type':'buffer'}),node('l','llm')], 'edges':[dict(source=a,target=b) for a,b in [('i','w'),('r','m'),('m','l')]]}
        write={'input':{'$event':{'name':'write','text':'x'}}};read={'input':{'$event':{'name':'read'}}}
        p={'cases':[{'name':'first','steps':[write]},{'name':'second','steps':[read]}]}
        r=inspect_test_plan(project,p);self.assertEqual(r['warnings'][0]['code'],'PLAN_CASE_MEMORY_ISOLATION')
        p['cases'][1]['steps'].insert(0,write);self.assertEqual(inspect_test_plan(project,p)['warnings'],[])
        s=session();ready(s);s.project.nodes=project['nodes'];s.project.edges=project['edges'];p['cases'][1]['steps'].pop(0)
        for c in p['cases']:c['steps'][0]['assertions']=[{'path':['outputs','m'],'op':'exists'}]
        s.plan=s.plan.model_validate(p)
        self.assertTrue(any(d['code']=='PLAN_CASE_MEMORY_ISOLATION' for d in s.inspect({'revision':1})['contract_diagnostics']))

    async def test_real_model_failure_preserves_code_in_backend_feedback(self):
        s=json_session();project=s.project.model_dump();project['nodes'][1]={'id':'m','type':'llm','data':{'providerId':'minimax','model':'test','outputFormat':'json','outputFields':{'temp':'number'}},'position':{'x':0,'y':0}};project['edges'][0]['target']='m'
        r=await execute_candidate(project,plan({'temp':22}),inference=AsyncMock(return_value={'choices':[{'message':{'content':'invalid'}}]}))
        d=execution_diagnostics(r);self.assertTrue(any(x['category']=='model_output' and x['code']=='MODEL_JSON_PARSE' for x in d),d)
        self.assertIn('model_output',' '.join(execution_feedback(r)));self.assertEqual(r['model_calls'],1)

    def test_four_categories_have_repair_hints_and_valid_status_is_not_mismatch(self):
        report={'cases':[{'name':'x','steps':[{'index':0,'passed':False,'status':'waiting','expected_status':'not_failed','failed_nodes':[{'node_id':'n','error':'wrong','category':c,'code':'TEST'} for c in ['input_contract','model_output','graph_logic']], 'assertions':[{'path':['state','count'],'op':'equals','value':2,'actual':1,'passed':False}]}]}]}
        d=execution_diagnostics(report);self.assertEqual({x['category'] for x in d},{'input_contract','model_output','graph_logic','assertion'})
        self.assertTrue(all(x['repair_hint'] for x in d));self.assertFalse(any(x['code']=='ASSERTION_STATUS' for x in d));self.assertNotIn('状态waiting，期望not_failed',' '.join(execution_feedback(report)))

    def test_contract_instructions_cover_shape_fields_and_isolation(self):
        from app.services.scenario_builder import BRIEF_INSTRUCTIONS
        from app.services.scenario_execution import EXECUTION_INSTRUCTIONS
        import json
        from pathlib import Path
        catalog=json.loads((Path(__file__).parents[1]/'app/services/node_capabilities.json').read_text())
        for text in [BRIEF_INSTRUCTIONS,EXECUTION_INSTRUCTIONS,next(t[1] for t in session().tools() if t[0]=='oakegde_test_plan')]:
            self.assertIn('outputFields',text);self.assertIn('直接',text);self.assertIn('同一个 case',text)
        self.assertIn('step.input',json.dumps(catalog,ensure_ascii=False))

    async def test_json_business_media_fields_match_preflight_and_runtime(self):
        for event_name in (None,'sensor'):
            s=json_session();project=s.project.model_dump();entry=project['nodes'][0]
            entry['data']['outputFields']={'type':'string','content':'string'}
            if event_name:entry['data']['eventName']=event_name
            for content in ('','data:image/example'):
                value={'type':'image','content':content};payload={'$event':{'name':event_name,'value':value}} if event_name else value
                p=plan(payload);p['cases'][0]['steps'][0]['assertions']=[{'path':['outputs','i','data'],'op':'equals','value':value}]
                self.assertFalse(inspect_test_plan(project,p)['errors'])
                result=await execute_candidate(project,p,inference=AsyncMock())
                self.assertEqual(result['status'],'passed',result);self.assertEqual(result['model_calls'],0)
