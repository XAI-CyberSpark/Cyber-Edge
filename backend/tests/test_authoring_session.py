import copy
import unittest
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.schemas.project_schema import ProjectSchema
from app.services.authoring_session import AuthoringSession

BRIEF={'title':'test','goal':'显示完成','requirements':[{'id':'R1','description':'显示完成','acceptance':'展示指定文本','source_quote':'显示完成'}],'experience_outline':['展示']}
PATCH={'base_revision':0,'upsert_nodes':[
 {'id':'i','type':'input','position':{'x':0,'y':0}},
 {'id':'o','type':'output','position':{'x':200,'y':0},'set_data':{'responseText':'完成'}}],
 'upsert_edges':[{'id':'io','source':'i','target':'o'}],
 'coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['o'],'note':'展示实际输出'}]}
PLAN={'cases':[{'name':'normal','steps':[{'input':'start','status':'completed','assertions':[{'path':['hmi','message'],'op':'equals','value':'完成'}]}]}]}

async def reviewed(*args,**kwargs):return {'status':'passed','source':'test_adapter','issues':[],'independent_verification':False}

def session(**kwargs):
    kwargs.setdefault('reviewer',reviewed)
    return AuthoringSession(WorkflowGenerateRequestSchema(prompt='显示完成'),**kwargs)
def ready(s):s.record_brief(BRIEF);s.patch(PATCH);s.set_plan({'revision':1,'plan':PLAN})

class AuthoringTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_flow_version_is_atomic_and_loaded_graph_cannot_trial(self):
        for invalid in ['二', '2.0', True, 1, 2.5, None]:
            s=session();s.record_brief(BRIEF);bad=copy.deepcopy(PATCH)
            bad['upsert_nodes'][0]['set_data']={'flowVersion':invalid}
            result=await s.invoke('oakegde_patch_graph',bad)
            self.assertIn('error',result);self.assertEqual(s.revision,0);self.assertEqual(s.project.nodes,[])
        s=session();s.record_brief(BRIEF);candidate=copy.deepcopy(PATCH)
        candidate['upsert_nodes'][1]['set_data']['responseText']='{{input.text}}'
        s.patch(candidate);plan=copy.deepcopy(PLAN);plan['cases'][0]['steps'][0]['input']='完成'
        s.set_plan({'revision':1,'plan':plan})
        s.project.nodes[0]['data']['flowVersion']='2'  # Malformed imported graph.
        result=await s.trial({'revision':1})
        self.assertEqual(result['status'],'not_run');self.assertEqual(s.trials,0)
        self.assertTrue(any('flowVersion' in issue for issue in result['issues']))
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'i','set_data':{'flowVersion':2}}]})
        result=await s.trial({'revision':2})
        self.assertEqual(result['status'],'passed');self.assertEqual(result['cases'][0]['steps'][0]['displayed'],'完成')

    async def test_review_retry_receives_prior_error_copy_without_extra_execution_or_budget(self):
        from unittest.mock import AsyncMock
        prior=[]
        async def reviewer(*args,previous_error=None,**kwargs):
            prior.append(copy.deepcopy(previous_error))
            if previous_error is not None:previous_error['details'][0]['field']='mutated'
            return {'status':'error','failure_stage':'validate_response','error_code':'response_schema',
                    'details':[{'field':'checks.0.case_index','issue':'integer required'}]}
        s=session(reviewer=reviewer);ready(s);s.executor=AsyncMock(wraps=s.executor)
        await s.trial({'revision':1});await s.trial({'revision':1});third=await s.trial({'revision':1})
        self.assertIsNone(prior[0]);self.assertEqual(prior[1]['error_code'],'response_schema')
        self.assertEqual(s.review_history[0]['details'][0]['field'],'checks.0.case_index')
        self.assertEqual(s.executor.await_count,1);self.assertEqual(len(prior),2)
        self.assertEqual(third['trial_action'],'review_budget_exhausted');self.assertFalse(third['can_submit'])
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'name':'新的展示标题'}}]})
        await s.trial({'revision':2});self.assertIsNone(prior[-1])

    async def test_nested_storage_wrapper_rejected_before_any_graph_mutation(self):
        s=session();s.record_brief(BRIEF)
        bad=copy.deepcopy(PATCH)
        bad['upsert_nodes'][1]['set_data']={'name':'展示','data':{'responseText':'完成'}}
        result=await s.invoke('oakegde_patch_graph',bad)
        self.assertIn('error',result)
        self.assertEqual(result['details'][0]['field'],'upsert_nodes.1.set_data')
        self.assertIn('不能再嵌套data',result['details'][0]['issue'])
        self.assertEqual(s.revision,0);self.assertEqual(s.project.nodes,[]);self.assertEqual(s.project.edges,[])
        fixed=await s.invoke('oakegde_patch_graph',PATCH)
        self.assertNotIn('error',fixed);self.assertEqual(s.revision,1)
        self.assertEqual(s.project.nodes[1]['data']['responseText'],'完成')

    async def test_business_data_inside_declared_field_and_legacy_wrapper_removal_remain_valid(self):
        s=session();ready(s)
        # Existing projects remain readable; remove_data_keys repairs only the specified key.
        s.project.nodes[1]['data'].update(data={'responseText':'ignored'},customMetadata={'data':'keep'})
        result=await s.invoke('oakegde_patch_graph',{'base_revision':1,'upsert_nodes':[
            {'id':'o','remove_data_keys':['data'],'set_data':{'responseText':'新文字'}},
            {'id':'state','type':'state','position':{'x':100,'y':100},'set_data':{'values':{'payload':{'data':{'score':2}}}}}]})
        self.assertNotIn('error',result)
        output=next(n for n in s.project.nodes if n['id']=='o')
        self.assertNotIn('data',output['data']);self.assertEqual(output['data']['customMetadata'],{'data':'keep'})
        self.assertEqual(next(n for n in s.project.nodes if n['id']=='state')['data']['values']['payload']['data'],{'score':2})

    async def test_review_error_retries_same_evidence_without_replaying_executor(self):
        from unittest.mock import AsyncMock
        seen=[]
        async def reviewer(request,brief,evidence,**kwargs):
            seen.append(copy.deepcopy(evidence))
            return {'status':'error','message':'transient'} if len(seen)==1 else await reviewed()
        s=session(reviewer=reviewer);ready(s);s.executor=AsyncMock(wraps=s.executor)
        first=await s.trial({'revision':1});original=copy.deepcopy(s.execution)
        self.assertFalse(first['can_submit']);self.assertEqual(first['review_retries_remaining'],1)
        second=await s.trial({'revision':1})
        self.assertTrue(second['can_submit']);self.assertTrue(second['execution_reused'])
        self.assertEqual(second['trial_action'],'review_retried');self.assertEqual(s.trials,1)
        self.assertEqual(second['review_attempts'],2);self.assertEqual(second['review_retries_remaining'],0)
        self.assertEqual(s.executor.await_count,1);self.assertEqual(seen[0],seen[1]);self.assertEqual(s.execution,original)
        self.assertEqual([r['status'] for r in second['content_review_history']],['error','passed'])
        s.submit({'revision':1});self.assertTrue(s.result['build_report']['can_apply'])
        self.assertEqual(s.result['build_report']['content_review_history'],second['content_review_history'])

    async def test_pass_or_semantic_rejection_is_cached_without_reroll(self):
        from unittest.mock import AsyncMock
        for status in ['passed','needs_changes']:
            reviewer=AsyncMock(return_value={'status':status,'issues':[]})
            s=session(reviewer=reviewer);ready(s);s.executor=AsyncMock(wraps=s.executor)
            await s.trial({'revision':1})
            for _ in range(4):
                result=await s.trial({'revision':1})
                self.assertEqual(result['trial_action'],'cached');self.assertEqual(result['review_retries_remaining'],0)
                self.assertEqual(result['can_submit'],status=='passed')
            self.assertEqual(s.executor.await_count,1);self.assertEqual(reviewer.await_count,1)

    async def test_review_retry_budget_exhaustion_preserves_failure_without_reexecution(self):
        from unittest.mock import AsyncMock
        reviewer=AsyncMock(return_value={'status':'error','message':'unavailable'})
        s=session(reviewer=reviewer);ready(s);s.executor=AsyncMock(wraps=s.executor)
        await s.trial({'revision':1});await s.trial({'revision':1})
        for _ in range(3):
            result=await s.trial({'revision':1})
            self.assertEqual(result['trial_action'],'review_budget_exhausted');self.assertFalse(result['can_submit'])
        self.assertEqual(s.trials,1);self.assertEqual(s.executor.await_count,1);self.assertEqual(reviewer.await_count,2)
        s.submit({'revision':1});self.assertFalse(s.result['build_report']['can_apply'])
        self.assertEqual(len(s.result['build_report']['content_review_history']),2)

    async def test_last_execution_can_retry_review_after_execution_budget_is_used(self):
        from unittest.mock import AsyncMock
        reviewer=AsyncMock(side_effect=[await reviewed(),await reviewed(),{'status':'error'},await reviewed()])
        s=session(reviewer=reviewer);ready(s);s.executor=AsyncMock(wraps=s.executor)
        for revision in [1,2,3]:
            if revision>1:s.patch({'base_revision':revision-1,'upsert_nodes':[{'id':'o','set_data':{'name':str(revision)}}]})
            await s.trial({'revision':revision})
        self.assertEqual(s.trials,3)
        result=await s.trial({'revision':3})
        self.assertTrue(result['can_submit']);self.assertEqual(result['trials_remaining'],0)
        self.assertEqual(s.executor.await_count,3);self.assertEqual(reviewer.await_count,4)
        s.patch({'base_revision':3,'upsert_nodes':[{'id':'o','set_data':{'responseText':'changed'}}]})
        self.assertEqual(s.review_history,[])
        with self.assertRaisesRegex(ValueError,'三次'):await s.trial({'revision':4})

    async def test_changed_graph_reexecutes_and_cannot_reuse_prior_review(self):
        from unittest.mock import AsyncMock
        reviewer=AsyncMock(return_value={'status':'error'})
        s=session(reviewer=reviewer);ready(s);s.executor=AsyncMock(wraps=s.executor)
        await s.trial({'revision':1});first=copy.deepcopy(s.execution)
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'name':'updated'}}]})
        self.assertEqual(s.review_history,[])
        with self.assertRaises(ValueError):await s.trial({'revision':1})
        result=await s.trial({'revision':2})
        self.assertFalse(result['execution_reused']);self.assertFalse(result['can_submit'])
        self.assertEqual(s.executor.await_count,2);self.assertEqual(result['review_attempts'],1)
        self.assertNotEqual(s.execution[1]['artifact_sha256'],first[1]['artifact_sha256'])

    async def test_interrupted_review_keeps_execution_and_counts_against_review_budget(self):
        import asyncio
        from unittest.mock import AsyncMock
        reviewer=AsyncMock(side_effect=[asyncio.CancelledError(),await reviewed()])
        s=session(reviewer=reviewer);ready(s);s.executor=AsyncMock(wraps=s.executor)
        with self.assertRaises(asyncio.CancelledError):await s.trial({'revision':1})
        self.assertEqual(s._content_review()['status'],'error');self.assertEqual(len(s.review_history),1)
        self.assertTrue((await s.trial({'revision':1}))['can_submit'])
        self.assertEqual(s.executor.await_count,1)

    async def test_reviewer_exception_or_invalid_result_never_exposes_body_or_unlocks(self):
        from unittest.mock import AsyncMock
        s=session(reviewer=AsyncMock(side_effect=[RuntimeError('synthetic-private-token'),{'unexpected':'bad'}]));ready(s)
        first=await s.trial({'revision':1});second=await s.trial({'revision':1})
        self.assertFalse(first['can_submit']);self.assertFalse(second['can_submit'])
        self.assertNotIn('synthetic-private-token',str(s.read()))
        self.assertEqual([r['error_type'] for r in s.review_history],['RuntimeError','ValueError'])

    async def test_reviewer_cannot_mutate_preserved_execution_evidence(self):
        async def reviewer(request,brief,evidence,**kwargs):
            evidence['cases'].clear();return await reviewed()
        s=session(reviewer=reviewer);ready(s);await s.trial({'revision':1})
        self.assertEqual(len(s.execution[1]['cases']),1)

    async def test_removing_node_and_its_explicit_incident_edges_is_one_atomic_patch(self):
        s=session();ready(s);await s.trial({'revision':1});locked=s.plan.model_dump()
        result=s.patch({'base_revision':1,'remove_node_ids':['o'],'remove_edge_ids':['io'],
            'upsert_nodes':[{'id':'replacement','type':'output','position':{'x':240,'y':0},'set_data':{'responseText':'完成'}}],
            'upsert_edges':[{'id':'new_edge','source':'i','target':'replacement'}],
            'coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['replacement'],'note':'替换输出'}]})
        self.assertEqual(result['revision'],2)
        self.assertEqual({n['id'] for n in s.project.nodes},{'i','replacement'})
        self.assertEqual([e['id'] for e in s.project.edges],['new_edge'])
        self.assertEqual(s.plan.model_dump(),locked);self.assertIsNone(s.execution);self.assertIsNone(s.content_review)
        self.assertTrue((await s.trial({'revision':2}))['can_submit'])

    async def test_unknown_or_duplicate_edge_removal_still_rejects_without_partial_mutation(self):
        s=session();ready(s);await s.trial({'revision':1});before=s.read()
        for edge_ids in [['io','never_existed'],['io','io']]:
            with self.assertRaises(ValueError):
                s.patch({'base_revision':1,'remove_node_ids':['o'],'remove_edge_ids':edge_ids})
            self.assertEqual(s.read(),before)

    async def test_node_removal_still_cascades_unlisted_edges_and_rejects_rewrite_conflict(self):
        s=session();ready(s);before=s.read()
        with self.assertRaises(ValueError):
            s.patch({'base_revision':1,'remove_node_ids':['o'],'remove_edge_ids':['io'],
                     'upsert_edges':[{'id':'io','source':'i','target':'i'}]})
        self.assertEqual(s.read(),before)
        s.patch({'base_revision':1,'remove_node_ids':['o']})
        self.assertEqual(s.project.edges,[])
        self.assertEqual([n['id'] for n in s.project.nodes],['i'])

    async def test_content_failure_blocks_apply_and_repairs_with_locked_plan(self):
        reviews=[]
        async def reject_then_accept(request,brief,execution,**kwargs):
            reviews.append(execution['artifact_sha256'])
            return {'status':'needs_changes' if len(reviews)==1 else 'passed','source':'test_adapter','issues':[{'case_index':0,'step_index':0,'problem':'实际内容不满足需求','correction':'补充实际内容'}] if len(reviews)==1 else [],'independent_verification':False}
        s=session(reviewer=reject_then_accept);ready(s)
        locked_plan=s.plan.model_dump()
        result=await s.trial({'revision':1})
        self.assertTrue(result['runtime_verified']);self.assertFalse(result['can_submit'])
        s.submit({'revision':1});self.assertFalse(s.result['build_report']['can_apply'])
        self.assertIn('补充实际内容',' '.join(s.result['build_report']['issues']))
        # Continue through the direct transaction surface to test revision invalidation.
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'name':'补充后的标题'}}]})
        self.assertEqual(s._content_review()['status'],'not_run')
        self.assertEqual(s.plan.model_dump(),locked_plan)
        self.assertTrue((await s.trial({'revision':2}))['can_submit'])
        s.submit({'revision':2});self.assertTrue(s.result['build_report']['can_apply'])
        self.assertNotEqual(reviews[0],reviews[1])

    async def test_review_error_or_missing_review_cannot_reuse_runtime_pass(self):
        async def unavailable(*args,**kwargs):return {'status':'error','message':'核验未完成','issues':[]}
        for adapter in [unavailable,reviewed]:
            s=session(reviewer=adapter);ready(s);await s.trial({'revision':1})
            if adapter is reviewed:s.content_review=None
            s.submit({'revision':1})
            self.assertTrue(s.result['build_report']['runtime_verified'])
            self.assertFalse(s.result['build_report']['can_apply'])

    async def test_failed_runtime_does_not_call_content_reviewer(self):
        from unittest.mock import AsyncMock
        adapter=AsyncMock();s=session(reviewer=adapter);ready(s)
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':'wrong'}}]})
        result=await s.trial({'revision':2})
        self.assertFalse(result['can_submit']);adapter.assert_not_called()

    async def test_bad_stored_node_shape_has_actionable_patch_contract_without_mutating_graph(self):
        s=session();ready(s);await s.trial({'revision':1});before=s.read()
        result=await s.invoke('oakegde_patch_graph',{'base_revision':1,'upsert_nodes':[
            {'id':'i','data':{'name':'synthetic-private-value'}},
            {'id':'o','data':{'responseText':'changed'}}]})
        self.assertEqual(s.read(),before)
        self.assertEqual([d['field'] for d in result['details']],['upsert_nodes.0.data','upsert_nodes.1.data'])
        self.assertEqual(len(result['argument_contracts']),1)
        contract=result['argument_contracts'][0]
        self.assertEqual(contract['path'],'upsert_nodes.*')
        self.assertIn('id',contract['required'])
        self.assertNotIn('data',contract['fields'])
        self.assertIn('不是读图存储格式中的data',contract['fields']['set_data']['description'])
        self.assertNotIn('synthetic-private-value',str(result))
        self.assertTrue(result['session_state']['execution_current'])
        # A corrected retry changes only the named field and invalidates old evidence.
        fixed=await s.invoke('oakegde_patch_graph',{'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'name':'new title'}}]})
        self.assertEqual(fixed['revision'],2)
        self.assertEqual(s.project.nodes[1]['data']['responseText'],'完成')
        self.assertEqual(s.plan.model_dump(),before['locked_test_plan'])
        self.assertIsNone(s.execution)

    async def test_schema_feedback_handles_nested_test_fields_and_root_missing_fields(self):
        s=session();s.record_brief(BRIEF);s.patch(PATCH)
        bad=copy.deepcopy(PLAN);bad['cases'][0]['steps'][0]['assertions'][0]['operator']='equals'
        result=await s.invoke('oakegde_test_plan',{'revision':1,'plan':bad})
        contract=result['argument_contracts'][0]
        self.assertEqual(contract['path'],'plan.cases.*.steps.*.assertions.*')
        self.assertIn('satisfies',contract['fields']['op']['enum'])
        self.assertIsNone(s.plan)
        result=await s.invoke('oakegde_patch_graph',{'revision':1})
        self.assertEqual(result['argument_contracts'][0]['required'],['base_revision'])
        self.assertEqual(s.revision,1)

    async def test_internal_node_validation_does_not_claim_to_be_tool_argument_schema(self):
        s=session();s.record_brief(BRIEF)
        result=await s.invoke('oakegde_patch_graph',{'base_revision':0,'upsert_nodes':[{'id':'bad','type':'unsupported','position':{'x':0,'y':0}}]})
        self.assertIn('error',result)
        self.assertNotIn('argument_contracts',result)
        self.assertEqual(s.revision,0)
        self.assertEqual(s.project.nodes,[])

    async def test_string_requirement_item_returns_required_object_fields_for_repair(self):
        s=session();bad=copy.deepcopy(BRIEF);bad['requirements']=['synthetic-private-requirement']
        result=await s.invoke('oakegde_brief',bad)
        contract=result['argument_contracts'][0]
        self.assertEqual(contract['path'],'requirements.*')
        self.assertIn('source_quote',contract['required'])
        self.assertEqual(contract['fields']['description']['type'],'string')
        self.assertNotIn('synthetic-private-requirement',str(result))
        self.assertIsNone(s.brief)
        fixed=await s.invoke('oakegde_brief',BRIEF)
        self.assertTrue(fixed['recorded'])

    async def test_missing_brief_points_to_registration_and_reports_current_session_state(self):
        s=session();result=await s.invoke('oakegde_inspect',{'revision':0})
        self.assertIn('oakegde_brief',result['error'])
        self.assertFalse(result['session_state']['brief_registered'])
        self.assertFalse(result['session_state']['inspection_current'])
        self.assertEqual(result['session_state']['revision'],0)

    async def test_actual_graph_trial_and_latest_submission(self):
        s=session();ready(s)
        r=await s.invoke('oakegde_trial',{'revision':1})
        self.assertEqual(r['status'],'passed',r)
        self.assertEqual(r['model_calls'],0)
        result=await s.invoke('oakegde_submit',{'revision':1})
        self.assertTrue(result['runtime_verified'])
        self.assertTrue(s.result['build_report']['can_apply'])
        self.assertEqual(s.result['build_report']['artifact_sha256'],s.result['build_report']['execution']['artifact_sha256'])
        self.assertIn('error',await s.invoke('oakegde_patch_graph',{'base_revision':1}))

    async def test_atomic_patch_stale_revision_and_no_fabricated_requirements(self):
        s=session();ready(s);before=s.read()
        for bad in [dict(base_revision=0,remove_node_ids=['o']),
                    dict(base_revision=1,upsert_nodes=[{'id':'new','type':'unsupported','position':{'x':0,'y':0}}],remove_node_ids=['o']),
                    dict(base_revision=1,coverage=[{'requirement_id':'invented','status':'implemented','node_ids':['o'],'note':'fabricated'}])]:
            with self.assertRaises(ValueError):s.patch(bad)
            self.assertEqual(s.read(),before)

    async def test_changes_invalidate_trial_and_old_revision_cannot_submit(self):
        s=session();ready(s);await s.trial({'revision':1})
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':'错误'}}]})
        self.assertIsNone(s.execution)
        with self.assertRaises(ValueError):s.submit({'revision':1})
        with self.assertRaises(ValueError):s.submit({'revision':2})
        s.inspect({'revision':2})
        with self.assertRaisesRegex(ValueError,'SUBMIT_TRIAL_REQUIRED'):s.submit({'revision':2})
        s.incomplete_result()
        self.assertFalse(s.result['build_report']['can_apply'])
        self.assertFalse(s.result['build_report']['runtime_verified'])
        self.assertTrue(all(n['data']['designOnly'] for n in s.result['project']['nodes']))

    async def test_engine_feedback_drives_local_repair_preserving_test(self):
        s=session();s.record_brief(BRIEF);bad=copy.deepcopy(PATCH);bad['upsert_nodes'][1]['set_data']['responseText']='错误'
        s.patch(bad);s.set_plan({'revision':1,'plan':PLAN})
        report=await s.trial({'revision':1});self.assertEqual(report['status'],'failed')
        self.assertIn('错误',' '.join(report['failures']))
        altered=copy.deepcopy(PLAN);altered['cases'][0]['steps'][0]['assertions'][0]['value']='错误'
        with self.assertRaises(ValueError):s.set_plan({'revision':1,'plan':altered})
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':'完成'}}]})
        self.assertEqual(s.project.nodes[1]['position'],{'x':200.0,'y':0.0})
        self.assertEqual((await s.trial({'revision':2}))['status'],'passed')
        s.submit({'revision':2});self.assertTrue(s.result['build_report']['can_apply'])

    async def test_unrelated_existing_configuration_and_model_binding_are_preserved(self):
        project=ProjectSchema(id='saved',name='old',nodes=[{'id':'m','type':'llm','position':{'x':87,'y':19},'measured':{'width':300},'data':{'model':'gpt-specific','providerId':'openai','systemPrompt':'保留','custom':{'a':1}}}],meta={'custom':'metadata'})
        s=AuthoringSession(WorkflowGenerateRequestSchema(prompt='显示完成',current_project=project));s.record_brief(BRIEF)
        s.patch({'base_revision':0,'upsert_nodes':[{'id':'m','set_data':{'label':'新标题'}}]})
        n=s.project.nodes[0];self.assertEqual(n['data']['providerId'],'openai');self.assertEqual(n['data']['model'],'gpt-specific')
        self.assertEqual(n['data']['systemPrompt'],'保留');self.assertEqual(n['data']['custom'],{'a':1});self.assertEqual(n['measured'],{'width':300})
        self.assertEqual(s.project.meta['custom'],'metadata');self.assertNotIn('label',project.nodes[0]['data'])

    async def test_brief_cannot_delete_requirements_after_registration(self):
        s=session();s.record_brief(BRIEF);changed=copy.deepcopy(BRIEF);changed['requirements'][0]['acceptance']='降低标准'
        with self.assertRaises(ValueError):s.record_brief(changed)
        self.assertEqual(s.brief.requirements[0].acceptance,'展示指定文本')

    async def test_sessions_and_unknown_tools_are_isolated(self):
        a,b=session(),session();ready(a)
        self.assertEqual(b.project.nodes,[]);self.assertIsNone(b.plan)
        r=await a.invoke('terminal',{'command':'anything'});self.assertIn('error',r)
        self.assertEqual(a.revision,1)

    async def test_impossible_output_object_assertion_does_not_lock_test_plan(self):
        s=session();s.record_brief(BRIEF);s.patch(PATCH)
        bad=copy.deepcopy(PLAN);bad['cases'][0]['steps'][0]['assertions']=[{'path':['outputs','o','text'],'op':'exists'}]
        with self.assertRaises(ValueError):s.set_plan({'revision':1,'plan':bad})
        self.assertIsNone(s.plan)
        s.set_plan({'revision':1,'plan':PLAN});self.assertIsNotNone(s.plan)

    async def test_agent_budget_stop_keeps_latest_draft_but_cannot_apply(self):
        s=session();ready(s);await s.trial({'revision':1})
        r=s.incomplete_result()
        self.assertFalse(r['build_report']['can_apply'])
        self.assertTrue(r['build_report']['can_inspect'])
        self.assertTrue(r['build_report']['incomplete_agent_run'])
        self.assertTrue(r['build_report']['runtime_verified'])
        self.assertFalse(r['validation']['passed'])
        self.assertTrue(all(n['data']['designOnly'] for n in r['project']['nodes']))

    async def test_caller_plan_is_locked_before_first_tool_and_drives_real_repair(self):
        request=WorkflowGenerateRequestSchema(prompt='显示完成',acceptance_tests=PLAN)
        s=AuthoringSession(request,reviewer=reviewed);s.record_brief(BRIEF)
        bad=copy.deepcopy(PATCH);bad['upsert_nodes'][1]['set_data']['responseText']='错误'
        s.patch(bad)
        changed=copy.deepcopy(PLAN);changed['cases'][0]['steps'][0]['assertions'][0]['value']='错误'
        with self.assertRaises(ValueError):s.set_plan({'revision':1,'plan':changed})
        self.assertEqual(s.read()['test_plan_source'],'caller')
        self.assertEqual((await s.trial({'revision':1}))['status'],'failed')
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'responseText':'完成'}}]})
        self.assertEqual((await s.trial({'revision':2}))['status'],'passed')
        s.submit({'revision':2})
        self.assertEqual(s.result['build_report']['execution_plan'],request.acceptance_tests.model_dump())
        self.assertEqual(s.result['build_report']['test_plan_source'],'caller')

    async def test_invalid_quote_feedback_includes_exact_quote_and_source_for_repair(self):
        s=session();bad=copy.deepcopy(BRIEF);bad['requirements'][0]['source_quote']='显示已完成'
        result=await s.invoke('oakegde_brief',bad)
        self.assertIn('显示已完成',result['error'])
        self.assertIn('最新用户原文：显示完成',result['error'])
        self.assertIsNone(s.brief)


class ContractFeedbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_unambiguous_flow_version_is_normalized_and_reported(self):
        for spelled in ['2',' 2 ',2.0]:
            s=session();s.record_brief(BRIEF);patch=copy.deepcopy(PATCH)
            patch['upsert_nodes'][0]['set_data']={'flowVersion':spelled}
            result=await s.invoke('oakegde_patch_graph',patch)
            self.assertEqual(result['revision'],1,result)
            self.assertIs(type(s.project.nodes[0]['data']['flowVersion']),int)
            self.assertEqual(result['normalized_arguments'][0]['field'],'upsert_nodes.0.set_data.flowVersion')
        s=session();s.record_brief(BRIEF);result=await s.invoke('oakegde_patch_graph',copy.deepcopy(PATCH))
        self.assertNotIn('normalized_arguments',result)

    async def test_extra_fields_get_name_only_fix_without_echoing_values(self):
        s=session();s.record_brief(BRIEF)
        secret='synthetic-private-prompt'
        wrapped={'item':copy.deepcopy(PATCH),'base_revision':0}
        misplaced={'base_revision':0,'set_data':{'systemPrompt':secret},'remove_data_keys':['x'],
                   'upsert_nodes':[{'id':'i','systemPrompt':secret,'position':{'x':0,'y':0,'id':'i'}}]}
        for bad in (wrapped,misplaced):
            result=await s.invoke('oakegde_patch_graph',bad)
            self.assertEqual(s.revision,0);self.assertNotIn(secret,str(result))
            fixes={d['field']:d.get('fix','') for d in result['details']}
            if bad is wrapped:
                self.assertIn('包装层',fixes['item'])
            else:
                self.assertIn('upsert_nodes.*',fixes['set_data'])
                self.assertIn('upsert_nodes.*',fixes['remove_data_keys'])
                self.assertIn('set_data.systemPrompt',fixes['upsert_nodes.0.systemPrompt'])
                self.assertIn('upsert_nodes.*',fixes['upsert_nodes.0.position.id'])
        # Unknown wrapper keys do not become a claim about their contents.
        result=await s.invoke('oakegde_patch_graph',{'base_revision':0,'item':{'unknown':secret}})
        self.assertNotIn('包装层',str(result));self.assertNotIn(secret,str(result))
        fixed=await s.invoke('oakegde_patch_graph',copy.deepcopy(PATCH))
        self.assertEqual(fixed['revision'],1)
