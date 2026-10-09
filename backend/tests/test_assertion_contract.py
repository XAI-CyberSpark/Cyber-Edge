import copy
import unittest
from types import SimpleNamespace
from app.services.test_plan_preflight import inspect_test_plan
from app.services.scenario_execution import execution_feedback
from app.services.authoring_team import CompletionBudget
from app.services.authoring_diagnostics import sanitize_run_diagnostics
from app.schemas.execution_schema import ExecutionPlan
from tests.test_authoring_session import session,ready,PLAN

def assertion_plan(path,value):
    p=copy.deepcopy(PLAN);p['cases'][0]['steps'][0]['assertions']=[{'path':path,'op':'equals','value':value}];return p

class AssertionContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_submit_type_and_path_reject_before_lock(self):
        for path,value,code in [(['car','ac','fan'],'3','PLAN_ASSERTION_TYPE'),(['car','locks','child'],True,'PLAN_ASSERTION_PATH'),(['nodes','absent'],'success','PLAN_ASSERTION_PATH'),(['nodes','i'],'done','PLAN_ASSERTION_TYPE')]:
            s=session();ready(s);s.plan=None
            r=await s.invoke('oakegde_test_plan',{'revision':1,'plan':assertion_plan(path,value)})
            self.assertIsNone(s.plan);self.assertEqual(r['category'],'assertion');self.assertEqual(r['contract_diagnostics'][0]['code'],code)
            self.assertIn('cases[0].steps[0].assertions[0]',r['error'])
            if path==['car','locks','child']:self.assertEqual(r['contract_diagnostics'][0]['suggestions'][0],['car','hmiSettings','locks.child'])

    def test_inspect_checks_latest_graph_and_output_fields(self):
        s=session();ready(s);s.plan=ExecutionPlan.model_validate(assertion_plan(['outputs','i','data','v'],3))
        s.project.nodes[0]['data'].update(inputFormat='json',outputFields={'v':'number'})
        s.plan.cases[0].steps[0].input={'v':3}
        self.assertFalse(any(d['code'].startswith('PLAN_ASSERTION') for d in s.inspect({'revision':1})['contract_diagnostics']))
        s.project.nodes[0]['data']['outputFields']={'v':'string'}
        self.assertIn('PLAN_ASSERTION_TYPE',[d['code'] for d in s.inspect({'revision':1})['contract_diagnostics']])

    def test_locked_semantic_type_revision_and_rejected_changes(self):
        for old,new,path in [('3',3,['car','ac','fan']),('true',True,['car','hmiSettings','locks.child'])]:
            s=session();ready(s);s.plan=ExecutionPlan.model_validate(assertion_plan(path,old));s.trials=2
            r=s.set_plan({'revision':1,'plan':assertion_plan(path,new)});self.assertEqual(r['revision_kind'],'assertion_type');self.assertEqual(s.trials,2);self.assertIsNone(s.execution)
        for new,op,source in [(4,'equals','agent'),(3,'gte','agent'),(3,'equals','caller')]:
            s=session();ready(s);s.plan=ExecutionPlan.model_validate(assertion_plan(['car','ac','fan'],'3'));s.plan_source=source
            p=assertion_plan(['car','ac','fan'],new);p['cases'][0]['steps'][0]['assertions'][0]['op']=op
            with self.assertRaisesRegex(ValueError,'锁定'):s.set_plan({'revision':1,'plan':p})

    def test_boolean_number_equality_cannot_bypass_lock_or_status_revision(self):
        for source in ['agent','caller']:
            for status in [None,'waiting']:
                s=session();ready(s);s.plan=ExecutionPlan.model_validate(assertion_plan(['hmi','flag'],True));s.plan_source=source
                p=assertion_plan(['hmi','flag'],1)
                if status:p['cases'][0]['steps'][0]['status']=status
                with self.assertRaisesRegex(ValueError,'锁定'):s.set_plan({'revision':1,'plan':p})

    def test_type_revision_can_use_current_actual_type_without_weakening_value(self):
        for stale in [False,True]:
            s=session();ready(s);s.plan=ExecutionPlan.model_validate(assertion_plan(['hmi','dynamic'],'3'))
            s.execution=(0 if stale else 1,{'cases':[{'steps':[{'index':0,'assertions':[{'path':['hmi','dynamic'],'actual':2,'actual_missing':False}]}]}]})
            args={'revision':1,'plan':assertion_plan(['hmi','dynamic'],3)}
            if stale:
                with self.assertRaisesRegex(ValueError,'锁定'):s.set_plan(args)
            else:
                self.assertEqual(s.set_plan(args)['revision_kind'],'assertion_type')
                self.assertEqual(s.plan.cases[0].steps[0].assertions[0].value,3)

    def test_prototype_paths_are_not_evidence(self):
        s=session();ready(s)
        for path in [['nodes','constructor'],['outputs','__proto__'],['car','hmiSettings','prototype']]:
            r=inspect_test_plan(s.project,assertion_plan(path,None))
            self.assertEqual(r['errors'][0]['code'],'PLAN_ASSERTION_PATH')

    def test_path_and_equal_type_can_be_corrected_together(self):
        s=session();ready(s);s.plan=ExecutionPlan.model_validate(assertion_plan(['car','ac','fann'],'3'))
        r=s.set_plan({'revision':1,'plan':assertion_plan(['car','ac','fan'],3)})
        self.assertEqual(r['revision_kind'],'assertion_path+assertion_type')

    def test_memory_assertion_shape_uses_actual_graph_role(self):
        n=lambda id,type,data:dict(id=id,type=type,data=data)
        g={'nodes':[n('i','input',{'inputFormat':'json','outputFields':{'n':'number'}}),n('b','memory',{'type':'buffer'})],'edges':[dict(source='i',target='b')]}
        p=assertion_plan(['outputs','b','short_term_memory_count'],0);p['cases'][0]['steps'][0]['input']={'n':1}
        self.assertEqual(inspect_test_plan(g,p)['errors'][0]['code'],'PLAN_ASSERTION_PATH')
        g['nodes'].append(n('m','llm',{}));g['edges'].append(dict(source='b',target='m'))
        self.assertFalse(inspect_test_plan(g,p)['errors'])

    def test_only_illegal_path_to_suggestion_is_allowed(self):
        s=session();ready(s);s.plan=ExecutionPlan.model_validate(assertion_plan(['car','locks','child'],True))
        r=s.set_plan({'revision':1,'plan':assertion_plan(['car','hmiSettings','locks.child'],True)})
        self.assertEqual(r['revision_kind'],'assertion_path')
        with self.assertRaisesRegex(ValueError,'锁定'):s.set_plan({'revision':1,'plan':assertion_plan(['car','doors','locked'],True)})
        s.plan=ExecutionPlan.model_validate(assertion_plan(['car','locks','child'],True))
        p=assertion_plan(['car','hmiSettings','locks.child'],True);p['cases'][0]['steps'][0]['input']='other'
        with self.assertRaisesRegex(ValueError,'锁定'):s.set_plan({'revision':1,'plan':p})

    def test_feedback_json_types_and_missing(self):
        report={'cases':[{'name':'case','steps':[{'passed':False,'index':0,'status':'completed','expected_status':'completed','assertions':[{'passed':False,'path':['car','ac','fan'],'op':'equals','value':'3','actual':3},{'passed':False,'path':['x'],'op':'equals','value':'true','actual':True},{'passed':False,'path':['missing'],'op':'exists','actual':None,'actual_missing':True}]}]}]}
        text='\n'.join(execution_feedback(report));self.assertIn('期望 "3"(string)，实际 3(number)',text);self.assertIn('期望 "true"(string)，实际 true(boolean)',text);self.assertIn('undefined(missing)',text)

    def test_state_reference_warning_is_generic(self):
        n=lambda id,type,data:dict(id=id,type=type,data=data)
        g={'nodes':[n('w','input',{'eventName':'set'}),n('s','state',{'values':{'flagX':True}}),n('r','input',{'eventName':'get'}),n('l','logic',{'condition':'input.flagX === true'})],'edges':[dict(source='w',target='s'),dict(source='r',target='l')]}
        p={'cases':[{'name':'first','steps':[{'input':{'$event':{'name':'set'}}}]},{'name':'second','steps':[{'input':{'$event':{'name':'get'}}}]}]}
        self.assertIn('PLAN_CASE_MEMORY_ISOLATION',[d['code'] for d in inspect_test_plan(g,p)['warnings']])
        p['cases'][1]['steps'].insert(0,p['cases'][0]['steps'][0]);self.assertFalse(inspect_test_plan(g,p)['warnings'])

class TruncationTests(unittest.TestCase):
    def agent(self,responses):
        calls=[]
        def call(kwargs):calls.append(copy.deepcopy(kwargs));return responses[min(len(calls)-1,len(responses)-1)]
        return SimpleNamespace(_interruptible_api_call=call),calls

    def test_protocol_variants_retry_once_and_charge_shared_budget(self):
        for response in [{'choices':[{'finish_reason':'length'}]},SimpleNamespace(choices=[SimpleNamespace(finish_reason='length')]),{'stop_reason':'max_tokens'},{'status':'incomplete','incomplete_details':{'reason':'max_output_tokens'}}]:
            a,calls=self.agent([response,{'choices':[{'finish_reason':'stop'}]}]);b=CompletionBudget();b.bind(a)
            original={'max_tokens':12000,'messages':[{'role':'user','content':'x'}]}
            result=a._interruptible_api_call(original)
            self.assertEqual(result['choices'][0]['finish_reason'],'stop');self.assertEqual(b.attempts,2);self.assertEqual(b.truncation_retries,1);self.assertEqual(calls[1]['max_tokens'],24000);self.assertEqual(original['max_tokens'],12000)

    def test_retry_exhaustion_and_budget_skips_cannot_trigger_sdk_extra_calls(self):
        for limit,seconds,reason,retries in [(1,720,'call_budget',0),(40,100,'time_budget',0),(40,720,'retry_limit',1)]:
            a,calls=self.agent([{'choices':[{'finish_reason':'length'}]}]);b=CompletionBudget(limit=limit,seconds=seconds);b.bind(a)
            with self.assertRaisesRegex(RuntimeError,'truncated'):a._interruptible_api_call({'max_tokens':12000})
            self.assertEqual(b.truncation_retries,retries);self.assertEqual(b.truncation_skip_reason,reason)
            with self.assertRaisesRegex(RuntimeError,'truncated'):a._interruptible_api_call({})
            self.assertEqual(len(calls),1+retries)
            self.assertEqual(sanitize_run_diagnostics({'truncation_retries':retries,'truncation_skip_reason':reason})['truncation_skip_reason'],reason)

    def test_normal_responses_untouched_and_retry_budget_is_request_wide(self):
        a,calls=self.agent([{'choices':[{'finish_reason':'stop'}]}]);b=CompletionBudget();b.bind(a);a._interruptible_api_call({});self.assertEqual(len(calls),1);self.assertEqual(b.truncation_retries,0)
        a,calls=self.agent([{'stop_reason':'max_tokens'},{}]);b.bind(a);a._interruptible_api_call({});other,other_calls=self.agent([{'stop_reason':'max_tokens'}]);b.bind(other)
        with self.assertRaisesRegex(RuntimeError,'truncated'):other._interruptible_api_call({})
        self.assertEqual(len(other_calls),1);self.assertEqual(b.truncation_skip_reason,'retry_limit')
