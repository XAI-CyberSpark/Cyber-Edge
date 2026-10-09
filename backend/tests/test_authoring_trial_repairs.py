import copy
import unittest
from unittest.mock import AsyncMock, patch

from app.services.hmi_control_contract import CONTROLS, validate_request
from app.services.node_data_schema import patch_data_schema
from app.services.scenario_execution import execute_candidate, execution_feedback
from app.schemas.execution_schema import InitialControl
from tests.test_authoring_session import session, ready, PLAN
from tests.test_scenario_execution import project, ROOT


class HmiPreflightTests(unittest.IsolatedAsyncioTestCase):
    def test_control_schema_tracks_registry(self):
        self.assertEqual(patch_data_schema()['properties']['controlId']['enum'], list(CONTROLS))
        with patch.dict(CONTROLS, {'test.registered': {'type': 'boolean'}}):
            self.assertIn('test.registered', patch_data_schema()['properties']['controlId']['enum'])

    def test_unknown_control_has_suggestions_and_missing_guidance(self):
        for value in ('ac.tem', 'unregistered.example'):
            with self.assertRaises(ValueError) as caught:
                validate_request(value, 'get')
            text = str(caught.exception)
            self.assertIn(value, text)
            self.assertIn('相近', text)
            self.assertIn('missing', text)
            self.assertIn('simulated', text)
            if value=='ac.tem':self.assertIn('ac.temp',text)

    async def test_inspect_checks_graph_and_initial_controls_without_execution(self):
        for initial in (False, True):
            s = session(executor=AsyncMock()); ready(s)
            if initial:
                s.plan.cases[0].controls = [InitialControl(control='unregistered.example', value=True)]
            else:
                s.project.nodes[-1].update(type='car_control', data={'executionMode':'hmi', 'controlId':'unregistered.example','controlValue':True})
            checked = s.inspect({'revision':1})
            self.assertFalse(checked['passed'])
            self.assertIn('unregistered.example', ' '.join(checked['issues']))
            self.assertIn('controls.0.control' if initial else 'o', ' '.join(checked['issues']))
            self.assertEqual((await s.trial({'revision':1}))['status'], 'not_run')
            s.executor.assert_not_called()

    def test_invalid_initial_controls_cannot_lock_plan_but_registered_controls_can(self):
        s=session();ready(s);s.plan=None
        bad=copy.deepcopy(PLAN);bad['cases'][0]['controls']=[{'control':'unknown','value':True}]
        with self.assertRaises(ValueError):s.set_plan({'revision':1,'plan':bad})
        self.assertIsNone(s.plan)
        bad['cases'][0]['controls']=[{'control':'ac.temp','value':22}]
        s.set_plan({'revision':1,'plan':bad})
        self.assertEqual(s.plan.cases[0].controls[0].control,'ac.temp')


class WaitingFeedbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_wait_evidence_and_feedback_do_not_change_plan(self):
        p = project(); p['nodes'][-1].update(type='wait', data={'prompt':'请选择模式','eventName':'mode_answer','inputType':'text','match':'exact','answers':['确认'],'hintInputs':['提示']})
        plan = copy.deepcopy(PLAN); plan['cases'][0]['steps'][0]['assertions']=[{'path':['nodes','o'],'op':'equals','value':'waiting'}]
        original = copy.deepcopy(plan)
        result = await execute_candidate(p, plan, source_root=ROOT)
        self.assertEqual(result['status'], 'failed')
        waiting = result['cases'][0]['steps'][0]['waiting_nodes'][0]
        self.assertEqual(waiting['node_id'], 'o'); self.assertEqual(waiting['prompt'], '请选择模式')
        self.assertEqual(waiting['eventName'], 'mode_answer'); self.assertEqual(waiting['answers'], ['确认'])
        feedback = ' '.join(execution_feedback(result))
        for part in ('o', '请选择模式', 'mode_answer', 'text', '确认', 'expected_status', 'waiting', '下一步', '修改图'):
            self.assertIn(part, feedback)
        self.assertEqual(plan, original)

    async def test_explicit_wait_repair_executes_answer_without_resetting_trials(self):
        s=session();ready(s)
        s.project.nodes[-1].update(type='wait',data={'prompt':'请选择模式','storeAs':'mode','eventName':'message'})
        s.plan.cases[0].steps[0].assertions[0].path=['nodes','o']
        s.plan.cases[0].steps[0].assertions[0].value='waiting'
        first=await s.trial({'revision':1})
        self.assertFalse(first['can_submit'])
        revised=s.plan.model_dump();revised['cases'][0]['steps'][0]['status']='waiting'
        revised['cases'][0]['steps'].append({'input':'展览','status':'completed','assertions':[{'path':['state','mode'],'op':'equals','value':'展览'}]})
        s.set_plan({'revision':1,'plan':revised})
        second=await s.trial({'revision':1})
        self.assertTrue(second['can_submit'],second);self.assertEqual(s.trials,2)
        self.assertEqual(s.plan.cases[0].steps[0].assertions[0].value,'waiting')


class ReferenceRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_anyof_nested_reference_restored_before_session_and_counted(self):
        from app.services.hermes_tool_arguments import invoke_hermes_tool
        self.assertTrue(any('$ref' in part.get('properties',{}) for part in patch_data_schema()['properties']['responseText']['anyOf']))
        s = session(); ready(s)
        raw = {'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':{'_ref':'state.answer'}, 'custom':[{'_ref':'state.other'}]}}]}
        original = copy.deepcopy(raw)
        result = await invoke_hermes_tool(s, 'oakegde_patch_graph', raw)
        self.assertNotIn('error', result)
        self.assertEqual(result['reference_restorations'], 2)
        self.assertEqual(s.trace[-1]['reference_restorations'], 2)
        self.assertEqual(s.project.nodes[-1]['data']['responseText'], {'$ref':'state.answer'})
        self.assertEqual(raw, original)

    async def test_rejected_tool_call_still_records_restore_count(self):
        from app.services.hermes_tool_arguments import invoke_hermes_tool
        s=session();ready(s)
        result=await invoke_hermes_tool(s,'oakegde_patch_graph',{'base_revision':0,'upsert_nodes':[{'id':'o','set_data':{'responseText':{'_ref':'state.answer'}}}]})
        self.assertIn('error',result);self.assertEqual(result['reference_restorations'],1)
        self.assertFalse(s.trace[-1]['ok']);self.assertEqual(s.revision,1)

    def test_non_reference_objects_and_xml_unchanged(self):
        from app.services.hermes_tool_arguments import restore_reference_objects
        values = [{'_ref':'state.x','extra':1},{'_ref':3},{'$ref':'state.x'},'<$ref>state.x</$ref>',{'item':['x']}]
        restored, count = restore_reference_objects(values)
        self.assertEqual(restored, values); self.assertEqual(count, 0)


class RestrictedPlanRepairTests(unittest.TestCase):
    def setup_session(self):
        s=session(); ready(s)
        s.execution=(1, {'status':'failed','cases':[{'name':'normal','steps':[{'index':0,'status':'waiting','expected_status':'completed','passed':False,'waiting_nodes':[{'node_id':'w'}]}]}]})
        s.trials=1
        fixed=copy.deepcopy(PLAN);fixed['cases'][0]['steps'][0]['status']='waiting'
        fixed['cases'][0]['steps'].append({'input':'回答','status':'completed','assertions':[{'path':['hmi','message'],'op':'equals','value':'完成'}]})
        return s,fixed

    def test_explicit_agent_repair_preserves_assertions_and_budget(self):
        s,fixed=self.setup_session()
        result=s.set_plan({'revision':1,'plan':fixed})
        self.assertTrue(result['revised_waiting_expectation']);self.assertEqual(s.trials,1)
        self.assertIsNone(s.execution);self.assertEqual(s.plan.cases[0].steps[0].assertions[0].value,'完成')

    def test_caller_plan_stale_evidence_assertion_changes_and_missing_answer_stay_locked(self):
        for mode in ('caller','stale','assertion','input','unobserved'):
            s,fixed=self.setup_session()
            if mode=='caller':s.plan_source='caller'
            if mode=='stale':s.revision=2
            if mode=='assertion':fixed['cases'][0]['steps'][0]['assertions']=[]
            if mode=='input':fixed['cases'][0]['steps'][0]['input']='changed'
            if mode=='unobserved':s.execution=None
            original=s.plan.model_dump()
            with self.subTest(mode=mode),self.assertRaises(ValueError):s.set_plan({'revision':s.revision,'plan':fixed})
            self.assertEqual(s.plan.model_dump(),original)
