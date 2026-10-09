import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from app.services.authoring_team import AuthoringTeam, CompletionBudget, bind_specialist_delivery
from app.services.authoring_session import AuthoringSession
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.model_providers import Provider

BRIEF={'title':'测试','goal':'显示你好','requirements':[{'id':'r1','description':'显示你好','acceptance':'显示你好','source_quote':'显示你好'}],'experience_outline':['显示你好']}
ARCH={'states':[],'transitions':['输入→显示'],'data_bindings':[],'capability_gaps':[],'verification':['核对显示']}
PLAN={'cases':[{'name':'正常','steps':[{'input':'开始','assertions':[{'path':['hmi','message'],'op':'equals','value':'你好'}]}]}]}
PATCH={'base_revision':0,'upsert_nodes':[{'id':'in','type':'input','position':{'x':0,'y':0},'set_data':{'inputFormat':'text'}},{'id':'out','type':'output','position':{'x':200,'y':0},'set_data':{'responseText':'你好'}}],'upsert_edges':[{'id':'e','source':'in','target':'out'}],'coverage':[{'requirement_id':'r1','status':'implemented','node_ids':['out'],'note':'固定显示'}]}
class FakeRegistry:
    def __init__(self):self.handlers={};self.schemas={}
    def register(self,**kwargs):
        self.handlers[kwargs['name']]=kwargs['handler'];self.schemas[kwargs['name']]=kwargs['schema']

class TeamTests(unittest.TestCase):
    def setUp(self):
        self.resolve=patch('app.services.model_providers.resolve',return_value=Provider('anthropic','test','https://example.com','claude-test','synthetic-secret'));self.resolve.start()
        self.session=AuthoringSession(WorkflowGenerateRequestSchema(prompt='显示你好',provider_id='anthropic',acceptance_tests=PLAN))
        self.registry=FakeRegistry();self.payloads={'requirements':BRIEF,'architect':ARCH,'builder':PATCH,'tester':{'assessment':'沿用锁定测试','proposed_plan':None}}
        self.prompts=[];self.closed=0;self.interrupts=0;self.cleared=0
        owner=self
        def factory(toolsets,iterations):
            role=toolsets[-1].removeprefix('oakegde_role_'); tool='oakegde_deliver_'+role
            class FakeAgent:
                valid_tool_names={'oakegde_capabilities','oakegde_read_graph',tool}
                def run_conversation(self,prompt,**kwargs):
                    owner.prompts.append(json.loads(prompt))
                    self.feedback=json.loads(owner.registry.handlers[tool](copy.deepcopy(owner.payloads[role])))
                def interrupt(self):owner.interrupts+=1
                def clear_interrupt(self):owner.cleared+=1
                def close(self):owner.closed+=1
            return FakeAgent()
        self.team=AuthoringTeam(self.session,self.registry,factory,lambda *x:None,CompletionBudget())
    def tearDown(self):self.resolve.stop()
    def delegate(self,role,refs=None):return self.team.delegate({'role':role,'task':'完成分工','base_revision':self.session.revision,'artifact_ids':refs or []})
    def apply(self,artifact):return self.team.apply({'artifact_id':artifact['id']})
    def build(self):
        b=self.delegate('requirements');self.apply(b)
        a=self.delegate('architect',[b['id']]);g=self.delegate('builder',[b['id'],a['id']]);return self.apply(g)
    def test_children_only_propose_parent_applies_and_locked_tests_unchanged(self):
        b=self.delegate('requirements');self.assertIsNone(self.session.brief);self.apply(b)
        a=self.delegate('architect');g=self.delegate('builder',[a['id']]);self.assertEqual(self.session.revision,0)
        self.apply(g);self.assertEqual(self.session.revision,1)
        t=self.delegate('tester');self.apply(t)
        self.assertIsNone(self.team.submission_error());self.assertEqual(self.session.plan.model_dump(),WorkflowGenerateRequestSchema(prompt='x',acceptance_tests=PLAN).acceptance_tests.model_dump())
        self.assertIn('nodes',self.prompts[0]['capabilities_snapshot']);self.assertEqual(self.prompts[0]['snapshot']['revision'],0);self.assertEqual(self.closed,4);self.assertEqual(self.interrupts,4);self.assertEqual(self.cleared,4);self.assertEqual(self.prompts[2]['related_artifacts'][0]['role'],'architect')
        self.assertNotIn('synthetic-secret',json.dumps(self.team.report(SimpleNamespace()))+json.dumps(self.prompts))
    def test_stale_and_duplicate_artifacts_never_overwrite_graph(self):
        b=self.delegate('requirements');self.apply(b);self.delegate('architect');g=self.delegate('builder');g2=self.delegate('builder')
        self.apply(g);before=self.session.project.model_dump()
        with self.assertRaises(ValueError):self.apply(g2)
        self.assertIn('error',self.apply(g));self.assertEqual(self.session.project.model_dump(),before)
    def test_child_cannot_replace_caller_tests(self):
        self.build();self.payloads['tester']={'assessment':'更改预期','proposed_plan':{'revision':1,'plan':PLAN}}
        result=self.delegate('tester');self.assertIn('error',result);self.assertIsNotNone(self.team.submission_error())
    def test_requirements_provenance_still_validated(self):
        self.payloads['requirements']=dict(BRIEF,requirements=[dict(BRIEF['requirements'][0],source_quote='伪造')])
        result=self.delegate('requirements')
        self.assertIn('error',result)
        self.assertEqual(result['run']['status'],'incomplete')
        self.assertIn('source_quote',result['run']['delivery_feedback']['error'])
        self.assertEqual(self.interrupts,0)
        self.assertEqual(self.team.artifacts,{})
        self.assertIsNone(self.session.brief)
    def test_requirements_can_repair_before_child_finishes(self):
        owner=self
        class RepairAgent:
            valid_tool_names={'oakegde_capabilities','oakegde_read_graph','oakegde_deliver_requirements'}
            def run_conversation(self,*args,**kwargs):
                deliver=owner.registry.handlers['oakegde_deliver_requirements']
                bad=dict(BRIEF,requirements=[dict(BRIEF['requirements'][0],source_quote='伪造')])
                owner.assertIn('source_quote',json.loads(deliver(bad))['error'])
                owner.assertEqual(owner.interrupts,0)
                owner.assertIsNone(owner.session.brief)
                owner.assertTrue(json.loads(deliver(BRIEF))['delivered'])
            def interrupt(self):owner.interrupts+=1
            def clear_interrupt(self):pass
            def close(self):pass
        self.team.factory=lambda *args:RepairAgent()
        result=self.delegate('requirements')
        self.assertEqual(self.team.runs[0]['delivery_attempts'],2)
        self.assertEqual(len(self.team.runs),1)
        self.assertIsNone(self.session.brief)
        self.apply(result)
        self.assertIsNotNone(self.session.brief)

    def test_specialist_has_role_attributed_discussion_context(self):
        from app.schemas.orchestration_schema import WorkflowConversationTurnSchema
        self.session.request.conversation_history=[
            WorkflowConversationTurnSchema(role='assistant',content='建议开启安全锁'),
            WorkflowConversationTurnSchema(role='user',content='这个可以')]
        self.delegate('requirements')
        self.assertEqual(self.prompts[0]['conversation_history'],[
            {'role':'assistant','content':'建议开启安全锁'}, {'role':'user','content':'这个可以'}])
        # Context does not turn assistant suggestions into valid user quotes.
        with self.assertRaises(ValueError):
            self.session.validate_brief(dict(BRIEF,requirements=[dict(BRIEF['requirements'][0],source_quote='建议开启安全锁')]))

    def test_graph_delivery_has_room_for_reasoning_and_structured_output(self):
        from app.services.authoring_team import output_token_limit
        self.assertEqual(output_token_limit(['oakegde_readonly','oakegde_role_builder']),32000)
        self.assertEqual(output_token_limit(['oakegde_intake']),12000)
        self.assertEqual(output_token_limit(['oakegde_team']),12000)

    def test_truncated_specialist_returns_reason_and_split_hint(self):
        self.build()
        before=self.session.project.model_dump()
        self.team.factory=lambda *args:SimpleNamespace(
            valid_tool_names={'oakegde_capabilities','oakegde_read_graph','oakegde_deliver_builder'},
            run_conversation=lambda *a,**k:{'failed':False,'partial':True,'failure_reason':'truncated','api_calls':1,'messages':['private']},
            clear_interrupt=lambda:None,close=lambda:None)
        result=self.delegate('builder')
        self.assertIn('分阶段交付',result['error'])
        self.assertEqual(result['run']['model_outcome']['failure_reason'],'truncated')
        self.assertEqual(result['run']['delivery_attempts'],0)
        self.assertNotIn('private',json.dumps(result))
        self.assertEqual(self.session.project.model_dump(),before)

    def test_no_agent_output_cannot_satisfy_role(self):
        self.payloads['requirements']={'bad':'not brief'}
        self.assertIn('error',self.delegate('requirements'));self.assertIsNotNone(self.team.submission_error());self.assertEqual(self.closed,1);self.assertEqual(self.interrupts,0);self.assertEqual(self.cleared,1)
    def test_budget_shared_across_agents_and_deadline(self):
        called=[];budget=CompletionBudget(limit=2)
        a=SimpleNamespace(_interruptible_api_call=lambda x:called.append(x));b=SimpleNamespace(_interruptible_api_call=lambda x:called.append(x))
        budget.bind(a);budget.bind(b);a._interruptible_api_call({});b._interruptible_api_call({})
        with self.assertRaises(RuntimeError):a._interruptible_api_call({})
        self.assertEqual(len(called),2);budget=CompletionBudget(seconds=-1);budget.bind(b)
        with self.assertRaises(RuntimeError):b._interruptible_api_call({})
    def test_capability_gap_stays_non_executable_and_marked(self):
        b=self.delegate('requirements');self.apply(b);self.delegate('architect')
        self.payloads['builder']=copy.deepcopy(PATCH);self.payloads['builder']['coverage'][0].update(status='missing',note='没有真实设备接口')
        self.apply(self.delegate('builder'));self.delegate('tester')
        self.session.inspect({'revision':1})
        with self.assertRaisesRegex(ValueError,'SUBMIT_TRIAL_REQUIRED'):self.session.submit({'revision':1})
        self.session.incomplete_result()
        report=self.session.result['build_report'];self.assertFalse(report['can_apply']);self.assertEqual(report['status'],'capability_gap')
        self.assertTrue(all(n['data'].get('designOnly') for n in self.session.result['project']['nodes']))
    def test_tester_waits_for_actual_candidate_without_spending_child_budget(self):
        self.apply(self.delegate('requirements'));self.delegate('architect')
        before=len(self.team.runs);result=self.delegate('tester')
        self.assertIn('error',result);self.assertEqual(len(self.team.runs),before)
        self.apply(self.delegate('builder'))
        self.assertEqual(self.delegate('tester')['role'],'tester')

    def test_reference_and_delegation_limit(self):
        self.assertIn('error',self.delegate('requirements',['missing']))
        for _ in range(8):self.delegate('requirements')
        self.assertIn('error',self.delegate('requirements'));self.assertEqual(len(self.team.runs),8)

    def test_named_delivery_is_scoped_preserves_request_and_shared_budget(self):
        calls=[];provider={'id':'minimax','model':'MiniMax-M3','base_url':'https://api.minimaxi.com/v1'}
        def agent():return SimpleNamespace(valid_tool_names={'oakegde_deliver_builder'},_interruptible_api_call=lambda x:calls.append(x))
        parent=agent();bind_specialist_delivery(parent,provider,['oakegde_team'])
        request={'messages':[{'role':'user','content':'synthetic'}],'tool_choice':'auto'}
        parent._interruptible_api_call(request);self.assertIs(calls[-1],request)
        other=agent();bind_specialist_delivery(other,dict(provider,base_url='https://example.com'),['oakegde_role_builder'])
        other._interruptible_api_call(request);self.assertIs(calls[-1],request)
        child=agent();bind_specialist_delivery(child,provider,['oakegde_readonly','oakegde_role_builder'])
        budget=CompletionBudget(limit=1);budget.bind(child);child._interruptible_api_call(request)
        self.assertEqual(calls[-1]['tool_choice'],{'type':'function','function':{'name':'oakegde_deliver_builder'}})
        self.assertEqual(request['tool_choice'],'auto');self.assertEqual(calls[-1]['messages'],request['messages'])
        with self.assertRaises(RuntimeError):child._interruptible_api_call(request)

    def test_invalid_delivery_returns_actionable_contract_feedback(self):
        self.payloads['requirements']={'bad':'not brief'}
        result=self.delegate('requirements')
        self.assertEqual(result['run']['delivery_attempts'],1)
        self.assertIn('delivery_feedback',result['run'])
        self.assertNotIn('not brief',json.dumps(result))

    def test_locked_tester_schema_cannot_offer_a_new_plan(self):
        self.build();self.delegate('tester')
        schema=self.registry.schemas['oakegde_deliver_tester']['parameters']
        self.assertEqual(schema['properties']['proposed_plan']['type'],'null')
        self.assertNotIn('cases',json.dumps(schema))
        # The same role can design a plan only when the caller/session has none.
        self.session.plan=None;self.payloads['tester']={'assessment':'检查图','proposed_plan':None}
        self.delegate('tester')
        schema=self.registry.schemas['oakegde_deliver_tester']['parameters']
        self.assertIn('cases',json.dumps(schema))

    def verify_candidate(self):
        import asyncio
        self.build();self.apply(self.delegate('tester'))
        async def reviewer(request,brief,evidence,**kwargs):
            return {'status':'passed','artifact_sha256':evidence['artifact_sha256'],'issues':[]}
        self.session.reviewer=reviewer
        outcome=asyncio.run(self.session.trial({'revision':self.session.revision}))
        self.assertTrue(outcome['can_submit'])

    def test_host_finalizes_verified_roles_after_budget_without_new_model_calls(self):
        self.verify_candidate();self.team.budget.attempts=24
        before=len(self.team.runs)
        self.assertTrue(self.team.finalize_verified())
        self.assertTrue(self.session.result['build_report']['can_apply'])
        self.assertEqual(self.session.trace[-1]['source'],'host_verified_finalize')
        self.assertEqual(self.session.result['build_report']['finalization']['model_submit_called'],False)
        self.assertEqual(len(self.team.runs),before);self.assertEqual(self.team.budget.attempts,24)
        self.assertFalse(self.team.finalize_verified())

    def test_host_finalization_never_bypasses_roles_or_stale_failed_evidence(self):
        self.verify_candidate();s=self.session
        tester=next(a for a in self.team.artifacts.values() if a['role']=='tester')
        with patch.dict(tester,applied=False):self.assertFalse(self.team.finalize_verified())
        with patch.object(s,'execution',(s.revision-1,s.execution[1])):self.assertFalse(self.team.finalize_verified())
        with patch.dict(s.execution[1],status='failed'):self.assertFalse(self.team.finalize_verified())
        with patch.dict(s.content_review[1],status='needs_changes'):self.assertFalse(self.team.finalize_verified())
        with patch.dict(s.content_review[1],artifact_sha256='stale'):self.assertFalse(self.team.finalize_verified())
        with patch.dict(s.inspection[1],passed=False):self.assertFalse(self.team.finalize_verified())
        s.patch({'base_revision':s.revision,'upsert_nodes':[{'id':'out','set_data':{'responseText':'changed'}}]})
        self.assertFalse(self.team.finalize_verified());self.assertIsNone(s.result)

    def test_missing_capability_still_requires_explicit_draft_submission(self):
        self.verify_candidate()
        self.session.coverage['r1'].status='missing'
        self.assertFalse(self.team.finalize_verified());self.assertIsNone(self.session.result)
