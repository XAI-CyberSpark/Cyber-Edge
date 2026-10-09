import copy
import json
import unittest
from unittest.mock import AsyncMock,patch
from fastapi import HTTPException
from tests.test_authoring_session import session,ready,PLAN

class StatusRevisionTests(unittest.IsolatedAsyncioTestCase):
    async def test_status_only_change_and_removal_without_evidence(self):
        s=session();ready(s);s.trials=2
        for status in ('waiting',None,'completed'):
            plan=s.plan.model_dump();step=plan['cases'][0]['steps'][0]
            if status is None:step.pop('status',None)
            else:step['status']=status
            s.execution=(1,{'status':'passed'});s.content_review=(1,{'status':'passed'})
            result=s.set_plan({'revision':1,'plan':plan})
            self.assertTrue(result['revised_status']);self.assertEqual(s.plan.cases[0].steps[0].status,status)
            self.assertIsNone(s.execution);self.assertIsNone(s.content_review);self.assertEqual(s.trials,2)
        self.assertEqual(s.status_revisions,3)

    def test_other_fields_and_caller_plan_still_locked(self):
        for kind in ('caller','input','assertion','controls','steps'):
            s=session();ready(s);plan=copy.deepcopy(PLAN);step=plan['cases'][0]['steps'][0];step.pop('status')
            if kind=='caller':s.plan_source='caller'
            elif kind=='input':step['input']='different'
            elif kind=='assertion':step['assertions'][0]['value']='different'
            elif kind=='controls':plan['cases'][0]['controls']=[{'control':'ac.temp','value':20}]
            else:plan['cases'][0]['steps'].append(copy.deepcopy(step))
            with self.subTest(kind=kind),self.assertRaises(ValueError):s.set_plan({'revision':1,'plan':plan})

    def test_schema_and_instruction_default_omit_status(self):
        from app.schemas.execution_schema import ExecutionStep
        from app.services.scenario_execution import EXECUTION_INSTRUCTIONS
        self.assertIn('一般不要写status',ExecutionStep.model_json_schema()['properties']['status']['description'])
        example=EXECUTION_INSTRUCTIONS.split('结构：',1)[1].split('。',1)[0]
        self.assertTrue(all('status' not in step for c in json.loads(example)['cases'] for step in c['steps']))

class ReachabilityFeedbackTests(unittest.TestCase):
    def test_remove_edges_warns_only_newly_unreachable_nodes(self):
        s=session();ready(s)
        result=s.patch({'base_revision':1,'remove_edge_ids':['io']})
        warning=next(w for w in result['warnings'] if w['code']=='newly_unreachable_nodes')
        self.assertEqual(warning['node_ids'],['o']);self.assertIn('remove_node_ids',warning['message'])
        checked=s.inspect({'revision':2})
        self.assertIn('remove_node_ids',' '.join(checked['issues']));self.assertEqual(len(s.project.nodes),2)
        nochange=s.patch({'base_revision':2,'upsert_nodes':[{'id':'o','set_data':{'name':'renamed'}}]})
        self.assertFalse(any(w['code']=='newly_unreachable_nodes' for w in nochange['warnings']))

class TrialOverloadTests(unittest.IsolatedAsyncioTestCase):
    async def run_graph(self,side_effect):
        from app.services.scenario_execution import execute_candidate
        from tests.test_scenario_execution import project,ROOT
        p=project();p['nodes']=[{'id':'i','type':'input','data':{'flowVersion':2},'position':{'x':0,'y':0}},{'id':'m','type':'llm','data':{'model':'test','providerId':'minimax','outputFormat':'text'},'position':{'x':1,'y':0}},{'id':'o','type':'output','data':{'responseText':{'$ref':'outputs.m.text'}},'position':{'x':2,'y':0}}];p['edges']=[{'id':'im','source':'i','target':'m'},{'id':'mo','source':'m','target':'o'}]
        inference=AsyncMock(side_effect=side_effect)
        with patch('app.services.scenario_execution.OVERLOAD_RETRY_DELAY_SECONDS',0):
            result=await execute_candidate(p,PLAN,inference=inference,source_root=ROOT)
        return result,inference

    async def test_overload_retries_once_and_counts_actual_calls(self):
        for code in (529,503):
            error=HTTPException(503,'overloaded');error.upstream_status_code=code
            result,inference=await self.run_graph([error,{'choices':[{'message':{'content':'完成'}}]}])
            self.assertEqual(inference.await_count,2);self.assertEqual(result['model_calls'],2);self.assertEqual(result['overload_retries'],1)
            self.assertEqual(result['status'],'passed',result)

    async def test_other_errors_and_repeat_overload_do_not_loop(self):
        for code in (401,429,500,None,529):
            error=HTTPException(503,'fixture');error.upstream_status_code=code
            result,inference=await self.run_graph([error,error])
            count=2 if code==529 else 1
            self.assertEqual(inference.await_count,count);self.assertEqual(result['model_calls'],count)
            self.assertEqual(result['overload_retries'],count-1);self.assertEqual(result['status'],'failed')

    def test_provider_preserves_real_status_without_changing_public_detail(self):
        import httpx
        from app.services.model_providers import _failure,Provider
        request=httpx.Request('POST','https://example.com');response=httpx.Response(529,request=request)
        result=_failure(Provider('minimax','fixture','https://example.com','test','not-a-secret'),httpx.HTTPStatusError('error',request=request,response=response))
        self.assertEqual(result.upstream_status_code,529);self.assertIsInstance(result.detail,str)

class CheckpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_retains_snapshot_counts_and_sse(self):
        from app.services.authoring_checkpoint import checkpoint
        from app.services.authoring_team import CompletionBudget
        from tests.test_hermes_timeout_diagnostics import HostTimeoutDiagnosticsTests
        s=session();ready(s);b=CompletionBudget();b.attempts=9;b.call_timeouts=2
        s.trace=[{'tool':'oakegde_patch_graph','ok':True,'diagnostics':{'normalizations':3}}]
        cp=checkpoint(s,b);fixture=HostTimeoutDiagnosticsTests();fixture.setUp()
        try:exc=await fixture.run_timeout([{'type':'checkpoint','data':cp}])
        finally:fixture.tearDown()
        self.assertEqual(exc.detail['checkpoint']['project']['nodes'],s.project.nodes)
        self.assertEqual(exc.detail['checkpoint']['revision'],1)
        self.assertEqual(exc.detail['diagnostics']['completion_attempts'],9);self.assertEqual(exc.detail['diagnostics']['normalizations'],3)
        self.assertEqual(exc.detail['diagnostics']['call_timeouts'],2)
        from app.api.orchestration import _stream_orchestration
        async def events(_):raise exc;yield
        with patch('app.api.orchestration.build_events',events):
            frames=[frame async for frame in _stream_orchestration(s.request)]
        self.assertIn('"checkpoint"', ''.join(frames));self.assertNotIn('synthetic-secret',''.join(frames))

class CallTimeoutTests(unittest.TestCase):
    def test_shared_timeout_default_and_count_even_when_sdk_retries(self):
        from app.services.hermes_authoring import EngineConfig
        from app.services.authoring_team import CompletionBudget
        from types import SimpleNamespace
        self.assertEqual(EngineConfig().api_call_timeout_seconds,150)
        calls=[]
        def request(_):
            calls.append(1)
            if len(calls)==1:raise TimeoutError('synthetic slow service')
            return {'ok':True}
        b=CompletionBudget();a=SimpleNamespace(_interruptible_api_call=request);b.bind(a)
        with self.assertRaises(TimeoutError):a._interruptible_api_call({})
        self.assertEqual(a._interruptible_api_call({}),{'ok':True})
        self.assertEqual(b.attempts,2);self.assertEqual(b.call_timeouts,1)

    def test_sdk_watchdog_socket_abort_also_counts_as_timeout(self):
        from app.services.authoring_team import CompletionBudget
        from types import SimpleNamespace
        a=SimpleNamespace(_consecutive_stale_streams=0)
        def request(_):
            a._consecutive_stale_streams+=1
            raise ConnectionError('socket aborted by SDK stale watchdog')
        a._interruptible_api_call=request;b=CompletionBudget();b.bind(a)
        with self.assertRaises(ConnectionError):a._interruptible_api_call({})
        self.assertEqual(b.call_timeouts,1)
