import copy
import unittest
from unittest.mock import AsyncMock
from app.services.authoring_team import CompletionBudget
from app.services.hermes_tool_arguments import invoke_hermes_tool
from tests.test_authoring_session import session, ready, PLAN

class ArgumentNormalizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_nested_literals_references_and_diagnostics(self):
        s=session();ready(s)
        raw={'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':{'$text':'hello'},'aliases':{'item':['a','b']},'flowVersion':{'$text':'2'},'custom':{'item':['keep']},'prompt':{'$text':'keep'},'controlValue':{'_ref':'state.x'}}}]}
        original=copy.deepcopy(raw)
        result=await invoke_hermes_tool(s,'oakegde_patch_graph',raw)
        self.assertNotIn('error',result)
        data=s.project.nodes[-1]['data']
        for key,value in {'responseText':'hello','aliases':['a','b'],'flowVersion':2,'custom':{'item':['keep']},'prompt':{'$text':'keep'},'controlValue':{'$ref':'state.x'}}.items():self.assertEqual(data[key],value)
        self.assertEqual(result['diagnostics']['normalizations'],3)
        self.assertEqual(s.trace[-1]['diagnostics'],result['diagnostics']);self.assertEqual(raw,original)

    async def test_top_level_patch_only_if_whole_schema_valid(self):
        for candidate,expected in [({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':'hi'}}]},True),({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'outputFormat':'nonsense'}}]},False),({'base_revision':1,'unexpected':True},False)]:
            s=session();ready(s)
            result=await invoke_hermes_tool(s,'oakegde_patch_graph',{'item':candidate})
            self.assertEqual('error' not in result,expected,result)
            self.assertEqual(result['diagnostics']['normalizations'],int(expected))

    def test_lossless_conversion_and_unchanged_boundaries(self):
        from app.services.hermes_tool_arguments import normalize_arguments
        for spec,value,expected in [({'type':'number'},{'$text':'22'},22),({'type':'boolean'},{'$text':'true'},True),({'type':'integer'},{'item':'2.5'},{'item':'2.5'}),({'type':'number'},{'item':'no'},{'item':'no'}),({'type':'string'},{'item':'x','extra':1},{'item':'x','extra':1}),({}, {'item':[1]}, {'item':[1]}),({'anyOf':[{'type':'array','items':{'type':'integer'}},{'type':'null'}]},{'item':[1,2]},[1,2]),({'type':'array','items':{'type':'integer'}},{'item':['no']},{'item':['no']})]:
            result,notes=normalize_arguments(value,spec)
            self.assertEqual(result,expected);self.assertEqual(bool(notes),result!=value)
        result,_=normalize_arguments({'$text':'22'},{'type':['string','number','boolean']})
        self.assertIs(type(result),str)

    async def test_plan_feedback_path_example_and_no_top_unwrap(self):
        s=session();ready(s);s.plan=None
        result=await invoke_hermes_tool(s,'oakegde_test_plan',{'revision':1,'plan':{'cases':[{'name':'case','input':'start','status':'completed','assertions':[]}]}})
        self.assertIn('error',result);self.assertIsNone(s.plan)
        self.assertIn('plan.cases.0.input',str(result));self.assertIn('steps',str(result['correct_structure_example']))
        result=await invoke_hermes_tool(s,'oakegde_test_plan',{'item':{'revision':1,'plan':PLAN}})
        self.assertIn('error',result);self.assertEqual(result['diagnostics']['normalizations'],0)

class BudgetFinalizationTests(unittest.IsolatedAsyncioTestCase):
    def test_defaults(self):
        b=CompletionBudget();self.assertEqual(b.limit,40);self.assertGreater(b.remaining_seconds(),719)

    async def test_finalize_only_current_untried_plan(self):
        from app.services.authoring_team import finalize_near_budget
        s=session();ready(s);s.inspect({'revision':1});b=CompletionBudget();b.attempts=37
        before=s.project.model_dump();s.executor=AsyncMock(wraps=s.executor)
        info=await finalize_near_budget(s,b)
        self.assertTrue(info['host_finalized']);self.assertTrue(s.result['build_report']['can_apply'])
        self.assertEqual(s.project.model_dump(),before);self.assertEqual(s.executor.await_count,1);self.assertEqual(b.attempts,37)
        self.assertFalse(await finalize_near_budget(s,b))

    async def test_missing_plan_stale_failed_already_trialed_do_not_run(self):
        from app.services.authoring_team import finalize_near_budget
        for mode in ('plan','stale','failed','trialed','budget'):
            s=session();ready(s);s.inspect({'revision':1});b=CompletionBudget();b.attempts=37
            if mode=='plan':s.plan=None
            if mode=='stale':s.revision+=1
            if mode=='failed':s.inspection[1]['passed']=False
            if mode=='trialed':s.execution=(1,{'status':'failed'})
            if mode=='budget':b.attempts=36
            s.executor=AsyncMock()
            self.assertFalse(await finalize_near_budget(s,b));s.executor.assert_not_called();self.assertIsNone(s.result)

    async def test_failed_trial_or_review_never_submits(self):
        from app.services.authoring_team import finalize_near_budget
        for review in (False,True):
            s=session();ready(s);s.inspect({'revision':1});b=CompletionBudget();b.attempts=39
            if review:s.reviewer=AsyncMock(return_value={'status':'needs_changes','issues':[]})
            else:s.executor=AsyncMock(return_value={'status':'failed','issue':'fixture failure'})
            info=await finalize_near_budget(s,b)
            self.assertTrue(info['host_finalized']);self.assertIsNone(s.result)
            self.assertFalse(await finalize_near_budget(s,b))

class HostFinalizationAccountingTests(unittest.IsolatedAsyncioTestCase):
    async def test_review_unavailable_retries_only_review_and_counts(self):
        from app.services.authoring_team import finalize_near_budget
        s=session();ready(s);s.inspect({'revision':1});b=CompletionBudget();b.attempts=37
        s.executor=AsyncMock(return_value={'status':'passed','model_calls':2})
        s.reviewer=AsyncMock(side_effect=[{'status':'error','issues':[]},{'status':'passed','issues':[]}])
        info=await finalize_near_budget(s,b)
        self.assertTrue(info['host_finalized']);self.assertTrue(s.result['build_report']['can_apply'])
        self.assertEqual(info['host_trial_model_calls'],2);self.assertEqual(info['review_calls'],2)
        self.assertEqual(s.executor.await_count,1);self.assertEqual(s.reviewer.await_count,2);self.assertEqual(b.attempts,37)

    async def test_insufficient_time_skips_without_mutation(self):
        import time
        from app.services.authoring_team import finalize_near_budget
        s=session();ready(s);s.inspect({'revision':1});b=CompletionBudget();b.attempts=37;b.host_deadline=time.monotonic()+200
        s.executor=AsyncMock();before=s.project.model_dump()
        info=await finalize_near_budget(s,b)
        self.assertFalse(info['host_finalized']);self.assertIn('剩余时间不足，未执行兜底',info['reason'])
        s.executor.assert_not_called();self.assertEqual(s.project.model_dump(),before)

class GeneratedSchemaGuardTests(unittest.TestCase):
    def test_guard_matches_jsonschema_for_generated_patch_and_plan(self):
        from jsonschema import Draft202012Validator
        from app.services.authoring_session import GraphPatch,TestPlanInput
        from app.services.scenario_builder import inline_schema
        from app.services.hermes_tool_arguments import _matches
        for contract,values in [(GraphPatch,[{'base_revision':0},{'base_revision':True},{'base_revision':-1},{'base_revision':0,'unknown':1},{'base_revision':0,'upsert_nodes':[{'id':'x','set_data':{'aliases':['a'],'flowVersion':2}}]},{'base_revision':0,'upsert_nodes':[{'id':'x','set_data':{'aliases':{'item':['a']}}}]}]),(TestPlanInput,[{'revision':0,'plan':PLAN},{'revision':0,'plan':{'cases':[{'name':'bad','input':'x'}]}},{'item':{'revision':0,'plan':PLAN}}])]:
            schema=inline_schema(contract.model_json_schema());validator=Draft202012Validator(schema)
            for value in values:self.assertEqual(_matches(value,schema),validator.is_valid(value),value)
        self.assertFalse(_matches(2,{'type':'number','multipleOf':2}))  # unknown keyword declines unwrap

    def test_plan_schema_is_strict_and_generated_from_execution_contract(self):
        from app.services.authoring_session import TestPlanInput
        from app.services.scenario_builder import inline_schema
        from app.schemas.execution_schema import ExecutionPlan
        schema=inline_schema(TestPlanInput.model_json_schema())
        actual=copy.deepcopy(schema['properties']['plan']);actual.pop('title',None)
        expected=inline_schema(ExecutionPlan.model_json_schema());expected.pop('title',None)
        self.assertEqual(actual,expected)
        case=actual['properties']['cases']['items'];step=case['properties']['steps']['items']
        self.assertFalse(schema['additionalProperties']);self.assertFalse(case['additionalProperties']);self.assertFalse(step['additionalProperties'])
        self.assertNotIn('input',case['properties']);self.assertIn('input',step['properties'])

class WorkerHostWiringTests(unittest.TestCase):
    def test_worker_finalizes_before_next_authoring_completion(self):
        from unittest.mock import patch
        from tests import test_authoring_intake_worker as fixture
        extra=r'''
        if self.toolsets!=['oakegde_intake']:
            from tests.test_authoring_session import PATCH,PLAN
            def call(name,args):
                result=json.loads(registry.entries[name]['handler'](args))
                assert 'error' not in result,result
            call('oakegde_brief',{'title':'fixture','goal':'显示完成','requirements':[{'id':'R1','description':'显示完成','acceptance':'显示完成','source_quote':'现在按刚才讨论的做'}],'experience_outline':['展示']})
            call('oakegde_patch_graph',PATCH)
            call('oakegde_test_plan',{'revision':1,'plan':PLAN})
            call('oakegde_inspect',{'revision':1})
            # Isolated fake review: never a network call in this protocol test.
            from app.services.authoring_session import AuthoringSession
            async def reviewed(s):
                s.review_history=[{'status':'passed','issues':[]}]
                s.content_review=(s.revision,s.review_history[0])
            AuthoringSession._review_current_execution=reviewed
            for _ in range(50):
                try:self._interruptible_api_call({})
                except RuntimeError:break
                self.session_api_calls+=1
'''
        sdk=fixture.SDK.replace("        return {'completed':True,'final_response'",extra+"        return {'completed':True,'final_response'")
        with patch.object(fixture,'SDK',sdk):events,_,_=fixture.IntakeWorkerTests().run_worker('build','single')
        report=next(e['data']['build_report'] for e in events if e['type']=='result')
        self.assertTrue(report['host_finalized']);self.assertTrue(report['can_apply'])
        self.assertEqual(report['collaboration']['completion_attempts'],37)
        self.assertEqual(report['review_calls'],1)
        self.assertEqual(sum(c['tool']=='oakegde_trial' for c in report['calls']),1)
