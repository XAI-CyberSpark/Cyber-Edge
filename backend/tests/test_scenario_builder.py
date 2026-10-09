import copy
import json
import unittest
from unittest.mock import patch

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.scenario_builder import ScenarioBrief, ScenarioBuilder, inspect_candidate, compile_experience, EXPERIENCE_INSTRUCTIONS, ExperienceDraft, normalize_provider_arrays, inline_schema
from app.services.orchestration_service import OrchestrationService as Legacy

BRIEF = {'title':'探险','goal':'乘客文字探险','requirements':[{'id':'R1','description':'两题冒险','acceptance':'能够答题并结束','source_quote':'乘客文字探险'}],
         'experience_outline':['启程','探险','收尾'],'assumptions':['文字仿真'],'questions':[]}

def candidate():
    return {'execution_plan':{'cases':[{'name':'启动','steps':[{'input':'开始','status':'waiting','assertions':[{'path':['outputs','story','reply'],'op':'exists'}]}]}]},'project_name':'探险', 'summary':'两题冒险', 'workflow':{'nodes':[
        {'id':'input','type':'input','position':{'x':0,'y':0},'data':{}},
        {'id':'story','type':'interaction','position':{'x':300,'y':0},'data':{'plan':{
            'mode':'authored','premise':'文字探险','ending':'旅程完成', 'steps':[
                {'id':'a','title':'第一题','waitFor':'answer','content':{'message':'开始想象中的冒险','question':'2加3等于几？','answers':['5','五'],'hint':'比四多一','reward':'星星徽章'}},
                {'id':'b','title':'第二题','waitFor':'answer','content':{'message':'来到下一站','question':'3加3等于几？','answers':['6','六'],'hint':'比五多一','reward':'月亮徽章'}}]}}}],
        'edges':[{'id':'e','source':'input','target':'story'}],'meta':{}},
        'requirement_coverage':[{'requirement_id':'R1','status':'simulated','node_ids':['story'],'note':'手动文字输入'}]}


class BuilderChecks(unittest.TestCase):
    def inspect(self, value):
        p=Legacy._normalize_project_payload(value, WorkflowGenerateRequestSchema(prompt='测试'))
        return inspect_candidate(p, ScenarioBrief.model_validate(BRIEF), value.get('requirement_coverage'))[0]

    def test_valid_complete_candidate(self):
        self.assertEqual([], self.inspect(candidate()))

    def test_missing_and_fabricated_coverage_are_blocked(self):
        for change in ('omit','unknown','missing','duplicate'):
            c=candidate();x=c['requirement_coverage'][0]
            if change=='omit':c['requirement_coverage']=[]
            if change=='unknown':x['node_ids']=['invented']
            if change=='missing':x['status']='missing'
            if change=='duplicate':c['requirement_coverage'].append(copy.deepcopy(x))
            self.assertTrue(self.inspect(c), change)

    def test_platform_derives_simulation_provenance_without_rewriting_graph(self):
        c=candidate();c['workflow']['nodes'][1]={'id':'control','type':'car_control','position':{'x':300,'y':0},'data':{'executionMode':'hmi','controlId':'ac.temp','controlValue':24}}
        c['workflow']['edges'][0]['target']='control';c['requirement_coverage'][0].update(status='implemented',node_ids=['control'])
        p=Legacy._normalize_project_payload(c,WorkflowGenerateRequestSchema(prompt='测试'))
        before=copy.deepcopy(p.nodes)
        errors,warnings,coverage=inspect_candidate(p,ScenarioBrief.model_validate(BRIEF),c['requirement_coverage'])
        self.assertEqual(errors,[]);self.assertEqual(coverage[0].status,'simulated')
        self.assertEqual(p.nodes,before);self.assertTrue(any('simulated' in x for x in warnings))

    def test_duplicate_rewards_and_questions(self):
        c=candidate();steps=c['workflow']['nodes'][1]['data']['plan']['steps']
        steps[1]['content']=copy.deepcopy(steps[0]['content'])
        self.assertTrue(any('奖励重复' in x for x in self.inspect(c)))
        self.assertTrue(any('题目' in x for x in self.inspect(c)))

    def test_answer_leak_and_fixed_answer_mismatch(self):
        c=candidate();s=c['workflow']['nodes'][1]['data']['plan']['steps'][0]
        s['content']['answers']=['指南针'];s['content']['message']='带上指南针开始'
        self.assertTrue(any('答案' in x for x in self.inspect(c)))
        s['acceptedAnswers']=['望远镜']
        self.assertTrue(any('不一致' in x for x in self.inspect(c)))

    def test_live_content_is_allowed_but_not_runtime_verified(self):
        c=candidate();c['workflow']['nodes'][1]['data']['plan']['mode']='live'
        self.assertFalse(any('authored' in x for x in self.inspect(c)))

    def test_request_cannot_redirect_configured_key(self):
        with self.assertRaises(Exception):
            ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='a',provider_base_url='https://untrusted.invalid/v1'))

    def test_experience_compiler_owns_wiring_and_rejects_extra_content_fields(self):
        payload={'project_name':'体验','experience':{'premise':'背景','ending':'结束','steps':[
            {'id':'q','title':'一题','waitFor':'answer','message':'开始','question':'2加2？','answers':['4'],'hint':'比三多一'}]},
            'requirement_coverage':[], 'workflow':{'nodes':[{'type':'car_control'}]}}
        compiled=compile_experience(payload)
        self.assertEqual([n['type'] for n in compiled['workflow']['nodes']],['input','interaction'])
        self.assertEqual(compiled['workflow']['edges'][0]['target'],'experience')
        payload['experience']['steps'][0]['unimplemented_script']='alert(1)'
        with self.assertRaises(ValueError):compile_experience(payload)

    def test_provider_envelopes_are_lossless_and_schema_scoped(self):
        payload={'project_name':'a','summary':'b','experience':json.dumps({'premise':'c','ending':'d','steps':{'item':[{'id':'one','title':'a','waitFor':'answer','message':'b','question':'q','answers':{'item':['1','一']},'hint':'h'}]}}),'requirement_coverage':[]}
        value,changes=normalize_provider_arrays(payload,ExperienceDraft.model_json_schema())
        self.assertEqual(value['experience']['steps'][0]['answers'],['1','一'])
        self.assertEqual(len(changes),3)
        self.assertNotIn('$ref',json.dumps(inline_schema(ExperienceDraft.model_json_schema())))
        odd={'experience':{'item':[1]}}
        value,_=normalize_provider_arrays(odd,ExperienceDraft.model_json_schema())
        self.assertEqual(value,odd) # object properties are never treated as arrays

    def test_reserved_command_cannot_be_a_puzzle_answer(self):
        c=candidate();c['workflow']['nodes'][1]['data']['plan']['steps'][0]['content']['answers']=['继续']
        self.assertTrue(any('操作指令' in x for x in self.inspect(c)))


class BuilderFlow(unittest.IsolatedAsyncioTestCase):
    async def test_selected_provider_receives_structured_contract(self):
        from unittest.mock import AsyncMock
        with patch('app.services.model_providers.complete', new=AsyncMock(return_value='{"experience":{}}')) as complete:
            result=await ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='体验',provider_id='anthropic',model='claude-sonnet-5'))._complete([{'role':'system','content':EXPERIENCE_INSTRUCTIONS}])
        self.assertEqual(result,'{"experience":{}}')
        self.assertEqual(complete.call_args.args[0].id,'anthropic')
        self.assertIn('experience',complete.call_args.args[2]['properties'])

    async def test_workflow_schema_has_one_required_test_plan(self):
        from unittest.mock import AsyncMock
        from app.services.scenario_builder import GENERAL_BUILD_INSTRUCTIONS
        with patch('app.services.model_providers.complete', new=AsyncMock(return_value='{}')) as complete:
            await ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='体验'))._complete([{'role':'system','content':GENERAL_BUILD_INSTRUCTIONS}])
        schema=complete.call_args.args[2]
        self.assertIn('execution_plan',schema['required'])
        self.assertNotIn('test_cases',schema['properties'])
        self.assertEqual(schema['properties']['execution_plan']['required'],['cases'])

    async def build(self, outputs):
        seen=[]
        async def complete(messages):
            seen.append(copy.deepcopy(messages));return json.dumps(outputs.pop(0),ensure_ascii=False)
        events=[e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='乘客文字探险'), complete).events()]
        return next(d for e,d in events if e=='result'), seen

    async def test_full_success_runs_explicit_plan_without_claiming_independent_review(self):
        result,calls=await self.build([BRIEF,candidate(),{'issues':[],'strengths':['连贯']}])
        self.assertEqual(len(calls),3)
        self.assertTrue(result['build_report']['can_apply'])
        self.assertTrue(result['build_report']['runtime_verified'])
        self.assertEqual(result['build_report']['execution']['model_calls'],0)
        self.assertFalse(result['build_report']['content_review']['independent_verification'])
        self.assertIsNone(result['saved_project'])

    async def test_review_failure_repairs_then_rechecks(self):
        review={'issues':[{'requirement_id':'R1','problem':'题面不充分','correction':'补齐线索'}],'strengths':[]}
        result,calls=await self.build([BRIEF,candidate(),review,candidate(),{'issues':[],'strengths':[]}])
        self.assertEqual(len(calls),5)
        self.assertTrue(result['build_report']['can_apply'])
        self.assertFalse(result['build_report']['attempts'][0]['passed'])
        self.assertIn('补齐线索',calls[3][-1]['content'])

    async def test_failed_repair_cannot_apply_or_save(self):
        c=candidate();c['requirement_coverage'][0]['status']='missing'
        with patch('app.services.scenario_builder.ProjectService.save_project') as save:
            result,calls=await self.build([BRIEF,c,c])
        self.assertFalse(result['build_report']['can_apply'])
        self.assertEqual(result['build_report']['status'],'capability_gap')
        self.assertEqual(len(calls),3)
        save.assert_not_called()

    async def test_blocking_questions_generate_inspectable_but_non_executable_draft(self):
        brief={**BRIEF,'questions':['你希望到达哪里？']}
        result,calls=await self.build([brief,candidate(),{'issues':[],'strengths':[]}])
        self.assertEqual(len(calls),3)
        self.assertTrue(result['build_report']['can_inspect'])
        self.assertTrue(all(n['data']['designOnly'] for n in result['project']['nodes']))
        self.assertEqual(result['build_report']['status'],'needs_input')
        self.assertFalse(result['validation']['passed'])

    async def test_invalid_spec_retries_once(self):
        result,calls=await self.build([{},BRIEF,candidate(),{'issues':[],'strengths':[]}])
        self.assertEqual(len(calls),4)
        self.assertTrue(result['validation']['passed'])

    async def test_invalid_review_is_not_silently_accepted(self):
        result,calls=await self.build([BRIEF,candidate(),{},candidate(),{}])
        self.assertFalse(result['validation']['passed'])
        self.assertFalse(result['build_report']['can_apply'])

    async def test_both_api_routes_use_same_result(self):
        from app.api.orchestration import generate_workflow, _stream_orchestration
        expected,_=await self.build([BRIEF,candidate(),{'issues':[],'strengths':[]}])
        async def events(_request):
            yield 'result',expected
            yield 'done',{'elapsed_ms':1}
        with patch('app.api.orchestration.build_events',events):
            direct=await generate_workflow(WorkflowGenerateRequestSchema(prompt='测试'))
            chunks=[e async for e in _stream_orchestration(WorkflowGenerateRequestSchema(prompt='测试'))]
        self.assertEqual(direct.model_dump(),expected)
        self.assertIn('"can_apply": true',''.join(chunks))

    async def test_stream_failure_does_not_expose_provider_body(self):
        from app.api.orchestration import _stream_orchestration
        async def events(_request):
            raise RuntimeError('SECRET_PROVIDER_BODY')
            yield
        with patch('app.api.orchestration.build_events',events):
            chunks=[e async for e in _stream_orchestration(WorkflowGenerateRequestSchema(prompt='测试'))]
        self.assertNotIn('SECRET_PROVIDER_BODY',''.join(chunks))
        self.assertIn('event: error',''.join(chunks))


if __name__=='__main__':unittest.main()


class DraftRegression(unittest.IsolatedAsyncioTestCase):
    async def test_claude_workflow_receives_contract_and_decodes_only_declared_envelopes(self):
        from unittest.mock import AsyncMock
        from app.services.scenario_builder import BUILD_INSTRUCTIONS
        value=candidate(); value['workflow']=json.dumps(value['workflow'],ensure_ascii=False)
        with patch('app.services.model_providers.complete',new=AsyncMock(return_value=json.dumps(value))) as call:
            b=ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='乘客文字探险',provider_id='anthropic'))
            parsed=await b.call('build',[{'role':'system','content':BUILD_INSTRUCTIONS}])
        self.assertIn('workflow',call.call_args.args[2]['properties'])
        self.assertIsInstance(parsed['workflow'],dict)
        self.assertTrue(b.calls[0]['provider_envelopes_normalized'])

    async def test_gap_draft_visible_but_not_runnable_or_saved(self):
        from app.services.node_capability_service import validate_capabilities
        c=candidate();c['requirement_coverage'][0].update(status='missing',note='灯光执行器尚未接入')
        outputs=[BRIEF,c,c]
        async def complete(_):return json.dumps(outputs.pop(0))
        with patch('app.services.scenario_builder.ProjectService.save_project') as save:
            result=next(d for e,d in [e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='乘客文字探险',save_on_success=True),complete).events()] if e=='result')
        self.assertTrue(result['build_report']['can_inspect'])
        self.assertFalse(result['build_report']['can_apply'])
        self.assertTrue(all(n['data']['designOnly'] for n in result['project']['nodes']))
        errors,_=validate_capabilities(result['project']['nodes'],result['project']['edges'])
        self.assertTrue(any('草稿' in e for e in errors));save.assert_not_called()

    async def test_failed_repair_cannot_expose_stale_prior_candidate(self):
        c=candidate();c['requirement_coverage'][0]['status']='missing'
        outputs=[BRIEF,c,{'workflow':'broken'}]
        async def complete(_):return json.dumps(outputs.pop(0))
        result=next(d for e,d in [e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='乘客文字探险'),complete).events()] if e=='result')
        self.assertFalse(result['build_report']['can_inspect'])
        self.assertEqual(result['project']['nodes'],[])
        self.assertTrue(any('字段' in e for e in result['validation']['errors']))

    def test_dangling_and_duplicate_ids_are_not_inspectable(self):
        from app.services.scenario_builder import inspectable_graph
        p=Legacy._normalize_project_payload(candidate(),WorkflowGenerateRequestSchema(prompt='test'))
        self.assertTrue(inspectable_graph(p));p.edges[0]['target']='missing';self.assertFalse(inspectable_graph(p))


class CallerAcceptanceTests(unittest.IsolatedAsyncioTestCase):
    async def test_caller_plan_overrides_model_attempt_to_weaken_assertions(self):
        plan=copy.deepcopy(candidate()['execution_plan'])
        plan['cases'][0]['steps'][0]['assertions']=[{'path':['state','absent'],'op':'equals','value':None}]
        request=WorkflowGenerateRequestSchema(prompt='乘客文字探险',acceptance_tests=plan)
        outputs=[BRIEF,candidate(),{'issues':[],'strengths':[]}]
        seen=[]
        async def complete(messages):return json.dumps(outputs.pop(0))
        async def execute(project,actual_plan):
            seen.append(copy.deepcopy(actual_plan))
            return {'status':'passed','runtime_verified':True,'cases':[]}
        result=next(d for e,d in [e async for e in ScenarioBuilder(request,complete,executor=execute).events()] if e=='result')
        self.assertEqual(seen,[request.acceptance_tests.model_dump()])
        self.assertIsNone(seen[0]['cases'][0]['steps'][0]['assertions'][0]['value'])
        self.assertIn('value',seen[0]['cases'][0]['steps'][0]['assertions'][0])
        self.assertEqual(result['build_report']['test_plan_source'],'caller')
        self.assertEqual(result['build_report']['execution_plan'],request.acceptance_tests.model_dump())
