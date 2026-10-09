import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.scenario_execution import execute_candidate, ExecutionPlan, execution_feedback
from app.services.scenario_builder import ScenarioBuilder
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema

ROOT=Path(__file__).resolve().parents[2]
def project(text='完成'):
    return {'id':'test','name':'test','nodes':[
        {'id':'i','type':'input','position':{'x':0,'y':0},'data':{'flowVersion':2}},
        {'id':'o','type':'output','position':{'x':300,'y':0},'data':{'responseText':text}}],
        'edges':[{'id':'io','source':'i','target':'o'}],'meta':{}}
def plan(text='完成'):
    return {'cases':[{'name':'正常路径','steps':[{'input':'start','status':'completed','assertions':[{'path':['hmi','message'],'op':'equals','value':text}]}]}]}

class ExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_predicate_acceptance_crosses_ipc_and_rejects_old_keyword_only_success(self):
        tests=plan();tests['cases'][0]['steps'][0]['assertions']=[{'path':['hmi','message'],'op':'satisfies','value':'input.split("。").filter(s => s.trim().length > 0).length === 2'}]
        for message,status in [('仅一句。','failed'),('第一句。第二句。','passed')]:
            report=await execute_candidate(project(message),tests,source_root=ROOT)
            self.assertEqual(report['status'],status,report)
        tests['cases'][0]['steps'][0]['assertions'][0]['value']='input.nonexistent.value === 2'
        report=await execute_candidate(project(),tests,source_root=ROOT)
        self.assertEqual(report['status'],'failed')
        self.assertIn('表达式错误',' '.join(execution_feedback(report)))

    def test_predicate_contract_requires_bounded_expression_text(self):
        from app.schemas.execution_schema import ExecutionAssertion
        for value in [None,True,{},'', ' '*3, 'a'*8001]:
            with self.assertRaises(ValueError):ExecutionAssertion.model_validate({'path':['hmi','message'],'op':'satisfies','value':value})
        self.assertEqual(ExecutionAssertion.model_validate({'path':['hmi','message'],'op':'satisfies','value':'input.length > 0'}).value,'input.length > 0')

    async def test_real_process_engine_reports_actual_state_and_assertion_failure(self):
        good=await execute_candidate(project(),plan(),source_root=ROOT)
        self.assertEqual(good['status'],'passed',good)
        self.assertEqual(good['model_calls'],0)
        bad=await execute_candidate(project('不一致'),plan(),source_root=ROOT)
        self.assertEqual(bad['status'],'failed')
        self.assertIn('不一致',' '.join(execution_feedback(bad)))

    async def test_null_assertion_is_not_converted_to_missing_at_process_boundary(self):
        p=project();p['nodes'].insert(1,{'id':'s','type':'state','position':{'x':150,'y':0},'data':{'values':{'optional':None}}})
        p['edges']=[{'id':'is','source':'i','target':'s'},{'id':'so','source':'s','target':'o'}]
        tests=plan();tests['cases'][0]['steps'][0]['assertions']=[{'path':['state','optional'],'op':'equals','value':None}]
        result=await execute_candidate(p,tests,source_root=ROOT)
        self.assertEqual(result['status'],'passed',result)
        tests['cases'][0]['steps'][0]['assertions'][0]['path']=['state','missing']
        result=await execute_candidate(p,tests,source_root=ROOT)
        self.assertEqual(result['status'],'failed',result)
        self.assertTrue(result['cases'][0]['steps'][0]['assertions'][0]['actual_missing'])

    async def test_model_ipc_uses_explicit_binding_and_records_injection(self):
        p=project();p['nodes'][-1]['data']={};p['nodes'].insert(1,{'id':'m','type':'llm','position':{'x':100,'y':0},'data':{'model':'gpt-test','providerId':'openai','outputFormat':'text'}})
        p['edges']=[{'id':'im','source':'i','target':'m'},{'id':'mo','source':'m','target':'o'}]
        calls=[]
        async def inference(body):
            calls.append(body)
            return {'model':'gpt-test','choices':[{'finish_reason':'stop','message':{'content':'实际模型替身'}}]}
        r=await execute_candidate(p,plan('实际模型替身'),inference=inference,source_root=ROOT)
        self.assertEqual(r['status'],'passed',r)
        self.assertEqual(calls[0]['provider_id'],'openai')
        self.assertEqual(r['model_source'],'injected_test_adapter')
        self.assertEqual(r['model_calls'],1)

    async def test_empty_or_assertionless_plan_cannot_certify_runtime(self):
        r=await execute_candidate(project(),{'cases':[{'name':'空断言','steps':[{'input':'start'}]}]},source_root=ROOT)
        self.assertEqual(r['status'],'failed')
        with self.assertRaises(ValueError):ExecutionPlan.model_validate({'cases':[]})

    def test_invalid_test_paths_are_rejected_before_execution(self):
        from app.services.scenario_execution import ExecutionAssertion
        for value in [dict(path=['run'],op='equals',value='waiting'),dict(path=['state','a'],op='exists',value=False)]:
            with self.assertRaises(ValueError):ExecutionAssertion.model_validate(value)
        from app.services.test_plan_preflight import inspect_test_plan
        p=plan();p['cases'][0]['steps'][0]['assertions']=[dict(path=['nodes','i','status'],op='equals',value='success')]
        self.assertEqual(inspect_test_plan(project(),p)['errors'][0]['code'],'PLAN_ASSERTION_PATH')

    async def test_timeout_reaps_worker_instead_of_reporting_pass(self):
        p=project();p['nodes'][1]['data']['displayDelayMs']=60000
        r=await execute_candidate(p,plan(),source_root=ROOT,timeout=.5)
        self.assertEqual(r['status'],'failed')
        self.assertIn('预算',r['issue'])

    async def test_builder_repairs_from_actual_engine_feedback(self):
        brief={'title':'反馈修复','goal':'完成后显示确认','requirements':[{'id':'R1','description':'显示确认','acceptance':'显示完成','source_quote':'显示完成'}],'experience_outline':['显示完成'],'questions':[],'assumptions':[]}
        def draft(text):return {'project_name':'反馈修复','summary':'测试','workflow':project(text),'requirement_coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['o'],'note':'展示文字'}],'execution_plan':plan()}
        first=draft('错误文案');second=draft('完成')
        for d in [first,second]:d['workflow']={k:v for k,v in d['workflow'].items() if k in ('nodes','edges','meta')}
        outputs=[brief,first,{'issues':[],'strengths':[]},second,{'issues':[],'strengths':[]}];prompts=[]
        async def complete(messages):prompts.append(copy.deepcopy(messages));return json.dumps(outputs.pop(0),ensure_ascii=False)
        result=next(d for e,d in [e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),complete).events()] if e=='result')
        self.assertTrue(result['build_report']['can_apply'],result)
        self.assertTrue(result['build_report']['runtime_verified'])
        self.assertEqual(len(result['build_report']['attempts']),2)
        self.assertIn('actual_execution',prompts[2][-1]['content'])
        self.assertIn('错误文案',prompts[2][-1]['content'])
        self.assertIn('实际试跑',json.dumps(prompts[3],ensure_ascii=False))
        self.assertIn('错误文案',json.dumps(prompts[3],ensure_ascii=False))
        self.assertEqual(result['build_report']['artifact_sha256'],result['build_report']['execution']['artifact_sha256'])

    async def test_repair_cannot_drop_test_plan_to_evade_failed_execution(self):
        brief={'title':'test','goal':'test','requirements':[{'id':'R1','description':'显示','acceptance':'完成','source_quote':'test'}],'experience_outline':['显示']}
        candidate={'project_name':'test','summary':'test','workflow':{k:v for k,v in project().items() if k in ('nodes','edges','meta')},'requirement_coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['o'],'note':'显示'}]}
        first={**candidate,'execution_plan':plan('错误期望')}
        outputs=[brief,first,{'issues':[],'strengths':[]},candidate,{'issues':[],'strengths':[]}]
        async def complete(_):return json.dumps(outputs.pop(0))
        result=next(d for e,d in [e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='test'),complete).events()] if e=='result')
        self.assertFalse(result['build_report']['can_apply'])
        self.assertFalse(result['build_report']['runtime_verified'])
        self.assertTrue(any('execution_plan' in issue for issue in result['build_report']['issues']))

    async def test_repair_cannot_change_assertions_to_fit_wrong_output(self):
        brief={'title':'test','goal':'test','requirements':[{'id':'R1','description':'显示','acceptance':'完成','source_quote':'test'}],'experience_outline':['显示']}
        candidate={'project_name':'test','summary':'test','workflow':{k:v for k,v in project('错误结果').items() if k in ('nodes','edges','meta')},'requirement_coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['o'],'note':'显示'}]}
        first={**candidate,'execution_plan':plan('完成')}
        altered={**candidate,'execution_plan':plan('错误结果')}
        outputs=[brief,first,{'issues':[],'strengths':[]},altered]
        async def complete(_):return json.dumps(outputs.pop(0))
        result=next(d for e,d in [e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='test'),complete).events()] if e=='result')
        self.assertFalse(result['build_report']['can_apply'])
        self.assertFalse(result['build_report']['runtime_verified'])
        self.assertTrue(any('不能改写测试' in issue for issue in result['build_report']['issues']))

    async def test_three_attempt_budget_leaves_room_for_execution_repair(self):
        brief={'title':'test','goal':'test','requirements':[{'id':'R1','description':'显示','acceptance':'完成','source_quote':'test'}],'experience_outline':['显示']}
        def draft(text):
            return {'project_name':'test','summary':'test','workflow':{k:v for k,v in project(text).items() if k in ('nodes','edges','meta')},'execution_plan':plan(),'requirement_coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['o'],'note':'显示'}]}
        outputs=[brief,{'wrong':'schema'},draft('错误'),{'issues':[],'strengths':[]},draft('完成'),{'issues':[],'strengths':[]}]
        async def complete(_):return json.dumps(outputs.pop(0))
        result=next(d for e,d in [e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='test'),complete,max_attempts=3).events()] if e=='result')
        self.assertTrue(result['build_report']['runtime_verified'])
        self.assertEqual(len(result['build_report']['attempts']),3)
