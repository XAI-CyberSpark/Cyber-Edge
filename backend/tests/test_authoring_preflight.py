import copy
import unittest
from tests.test_authoring_session import session,ready,PLAN

class InspectExpressionTests(unittest.TestCase):
    def with_logic(self,condition):
        s=session();ready(s)
        s.patch({'base_revision':1,'remove_edge_ids':['io'],'upsert_nodes':[{'id':'logic_x','type':'logic','position':{'x':100,'y':0},'set_data':{'logic_type':'filter','condition':condition}}], 'upsert_edges':[{'id':'il','source':'i','target':'logic_x'},{'id':'lo','source':'logic_x','target':'o'}]})
        return s
    def test_logic_bad_roots_rejected_with_path_value_example(self):
        for code in ('state.count > 0','outputs.i.text === "go"','event.text === "go"'):
            s=self.with_logic(code);r=s.inspect({'revision':s.revision})
            self.assertFalse(r['passed']);issues=' '.join(r['issues'])
            for token in ('logic_x','data.condition',code,'示例','input'):self.assertIn(token,issues)
            self.assertEqual(s.trials,0)
    def test_satisfies_preflight_rejects_bare_roots_and_missing_output_nodes(self):
        for path,code in [(['hmi','message'],'state.ready === true'),(['outputs'],'input.absent.text === "ok"')]:
            s=session();ready(s);p=copy.deepcopy(PLAN);p['cases'][0]['steps'][0]['assertions']=[{'path':path,'op':'satisfies','value':code}];s.plan=s.plan.model_validate(p)
            r=s.inspect({'revision':1});self.assertFalse(r['passed']);issues=' '.join(r['issues'])
            self.assertIn('plan.cases[0].steps[0].assertions[0]',issues);self.assertIn(code,issues);self.assertIn('示例',issues)
    def test_binding_error_contains_bad_value_and_actual_field_path(self):
        for value in ('{{missing.text}}',{'$ref':'outputs.absent.text'}):
            s=session();ready(s);s.project.nodes[1]['data']['responseText']=value;issues=' '.join(s.inspect({'revision':1})['issues'])
            self.assertIn('data.responseText',issues);self.assertIn('missing.text' if isinstance(value,str) else 'outputs.absent.text',issues);self.assertIn('示例',issues)
    def test_valid_roots_builtins_callback_locals_and_dynamic_bindings(self):
        for code in ('input.state.count > 0','value.ready === true','input.items.some(state => state.ready) && Number.isFinite(input.count)', 'input.text === "outputs.absent.text"','{{state.count}} > 0'):
            s=self.with_logic(code);r=s.inspect({'revision':s.revision});self.assertTrue(r['passed'],r)
        s=session();ready(s);s.project.nodes[1]['data']['responseText']={'$ref':'outputs.i.text'}
        p=copy.deepcopy(PLAN);p['cases'][0]['steps'][0]['assertions']=[{'path':['outputs'],'op':'satisfies','value':'input.i.text === "start"'}];s.plan=s.plan.model_validate(p)
        self.assertTrue(s.inspect({'revision':1})['passed'])

class PlanIsolationInstructionsTests(unittest.TestCase):
    def test_description_and_example_state_case_isolation(self):
        from app.services.scenario_execution import EXECUTION_INSTRUCTIONS
        s=session();description=next(t[1] for t in s.tools() if t[0]=='oakegde_test_plan')
        for text in (description,EXECUTION_INSTRUCTIONS):
            self.assertIn('独立记忆',text);self.assertIn('不共享',text);self.assertIn('本case',text)
        from app.services.scenario_execution import MEMORY_CASE_EXAMPLE
        from app.schemas.execution_schema import ExecutionPlan
        p=ExecutionPlan.model_validate(MEMORY_CASE_EXAMPLE);self.assertEqual(len(p.cases[0].steps),2)
        self.assertTrue(all(step.status is None for step in p.cases[0].steps))

class MemoryExampleExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_documented_example_runs_with_independent_case_memories(self):
        from app.services.scenario_execution import MEMORY_CASE_EXAMPLE,execute_candidate
        from tests.test_scenario_execution import ROOT
        from unittest.mock import AsyncMock
        nodes=[('write_input','input',{'flowVersion':2}),('memory_write','memory',{'type':'buffer'}),('read_input','input',{'flowVersion':2,'eventName':'read_memory'}),('memory_read','memory',{'type':'buffer'}),('model','llm',{'providerId':'minimax','model':'test','outputFormat':'text'})]
        project={'id':'fixture','name':'fixture','nodes':[{'id':id,'type':type,'data':data,'position':{'x':0,'y':0}} for id,type,data in nodes], 'edges':[{'id':a+b,'source':a,'target':b} for a,b in [('write_input','memory_write'),('read_input','memory_read'),('memory_read','model')]]}
        plan=copy.deepcopy(MEMORY_CASE_EXAMPLE);plan['cases']*=2
        for case in plan['cases']:case['steps'][-1]['assertions'].append({'path':['outputs','memory_read','short_term_memory_count'],'op':'equals','value':1})
        result=await execute_candidate(project,plan,source_root=ROOT,inference=AsyncMock(return_value={'choices':[{'message':{'content':'已读取'}}]}))
        self.assertEqual(result['status'],'passed',result)
