import copy
import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.scenario_builder import ScenarioBuilder, BRIEF_INSTRUCTIONS, REVIEW_INSTRUCTIONS, GENERAL_BUILD_INSTRUCTIONS
from tests.test_scenario_execution import project, plan


BRIEF = {'title':'恢复测试','goal':'显示完成','requirements':[{
    'id':'R1','description':'显示完成','acceptance':'展示完成','source_quote':'显示完成'}],
    'experience_outline':['展示完成'],'questions':[]}
REVIEW = {'issues':[],'strengths':[]}
REPAIR_REVIEW = {'issues':[{'requirement_id':'R1','problem':'遗漏体验说明','correction':'补齐体验说明'}],'strengths':[]}


def draft():
    graph = project()
    return {'project_name':'恢复测试','summary':'展示完成',
        'workflow':{k:graph[k] for k in ('nodes','edges','meta')},
        'requirement_coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['o'],'note':'展示文本'}],
        'execution_plan':plan()}


class BuilderRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def build(self, outputs, *, request=None, max_attempts=2):
        values = copy.deepcopy(outputs)
        brief = values.pop(0)
        briefs = brief if isinstance(brief,list) else [brief]
        builds = [v for v in values if not isinstance(v,dict) or 'issues' not in v]
        reviews = [v for v in values if isinstance(v,dict) and 'issues' in v]
        calls = []
        async def complete(messages):
            calls.append(copy.deepcopy(messages))
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                item=briefs.pop(0)
            elif messages[0]['content']==REVIEW_INSTRUCTIONS:
                item=reviews.pop(0) if reviews else REVIEW
            else:
                item=builds.pop(0)
            if isinstance(item, Exception):
                raise item
            return json.dumps(item, ensure_ascii=False)
        request = request or WorkflowGenerateRequestSchema(prompt='显示完成')
        try:
            result = next(data for event,data in [item async for item in
                ScenarioBuilder(request, complete, max_attempts=max_attempts).events()] if event=='result')
        except HTTPException as exc:
            self.fail(f'已形成有效需求的恢复结果不应被HTTP {exc.status_code}掩盖')
        return result,calls

    async def test_bad_repair_preserves_latest_gap_candidate_and_original_requirement_id(self):
        first = draft()
        first['requirement_coverage'][0].update(status='missing',note='真实执行接口尚未接入')
        for repair in [{'workflow':'broken'}, {**draft(),'requirement_coverage':[
                {'requirement_id':'invented','status':'missing','node_ids':[],'note':'新编号缺口'}]}]:
            with self.subTest(repair=repair), patch('app.services.scenario_builder.ProjectService.save_project') as save:
                result,_ = await self.build([BRIEF,first,repair],
                    request=WorkflowGenerateRequestSchema(prompt='显示完成',save_on_success=True))
            report = result['build_report']
            self.assertEqual(report['status'],'capability_gap')
            self.assertEqual(report['coverage'],first['requirement_coverage'])
            self.assertEqual([n['id'] for n in result['project']['nodes']],['i','o'])
            self.assertTrue(report['can_inspect'])
            self.assertFalse(report['can_apply'])
            self.assertFalse(report['runtime_verified'])
            self.assertEqual(report['execution']['status'],'not_run')
            self.assertEqual(report.get('candidate_attempt'),1)
            self.assertEqual(report['attempts'][-1]['attempt'],2)
            self.assertTrue(report['attempts'][-1]['issues'])
            self.assertTrue(all(n['data']['designOnly'] for n in result['project']['nodes']))
            save.assert_not_called()

    async def test_later_valid_coverage_replaces_prior_gap(self):
        first = draft()
        first['requirement_coverage'][0].update(status='missing',note='尚未完成配置')
        result,_ = await self.build([BRIEF,first,draft(),REVIEW])
        self.assertEqual(result['build_report']['coverage'][0]['status'],'implemented')
        self.assertTrue(result['build_report']['can_apply'])
        self.assertEqual(result['build_report'].get('candidate_attempt'),2)

    async def test_bad_repair_implementation_reference_cannot_erase_identified_gap(self):
        first=draft()
        first['requirement_coverage'][0].update(status='missing',note='真实执行接口尚未接入')
        for status in ('implemented','simulated'):
            for references in ([],['ghost']):
                second=draft()
                second['workflow']['nodes'][-1]['data']['responseText']='非法修复新候选'
                second['requirement_coverage'][0].update(status=status,node_ids=references)
                with self.subTest(status=status,references=references):
                    result,_=await self.build([BRIEF,first,second])
                    report=result['build_report']
                    self.assertEqual(report['status'],'capability_gap')
                    self.assertEqual(report['coverage'],first['requirement_coverage'])
                    self.assertEqual(report['candidate_attempt'],1)
                    self.assertEqual(result['project']['nodes'][-1]['data']['responseText'],'完成')
                    self.assertFalse(report['can_apply'])
                    self.assertFalse(report['runtime_verified'])
                    self.assertEqual(report['execution']['status'],'not_run')
                    self.assertTrue(all(n['data']['designOnly'] for n in result['project']['nodes']))
                    self.assertTrue(any('node_ids' in error for error in report['attempts'][-1]['issues']))

    async def test_valid_coverage_snapshot_can_keep_draft_with_other_graph_errors(self):
        first=draft();first['requirement_coverage'][0].update(status='missing',note='尚未完成配置')
        second=draft();second['workflow']['edges']=[]
        second['workflow']['nodes'][-1]['data']['responseText']='保留有效引用的新草稿'
        result,_=await self.build([BRIEF,first,second])
        report=result['build_report']
        self.assertEqual(report['candidate_attempt'],2)
        self.assertEqual(report['coverage'][0]['status'],'implemented')
        self.assertEqual(result['project']['nodes'][-1]['data']['responseText'],'保留有效引用的新草稿')
        self.assertTrue(report['can_inspect'])
        self.assertFalse(report['can_apply'])
        self.assertFalse(report['runtime_verified'])
        self.assertTrue(report['attempts'][-1]['issues'])

    async def test_invalid_repair_cannot_inherit_prior_execution_pass(self):
        result,_ = await self.build([BRIEF,draft(),REPAIR_REVIEW,{}])
        report = result['build_report']
        self.assertTrue(report['can_inspect'])
        self.assertFalse(report['can_apply'])
        self.assertFalse(report['runtime_verified'])
        self.assertEqual(report['execution']['status'],'not_run')
        self.assertTrue(all(n['data']['designOnly'] for n in result['project']['nodes']))

    async def test_questions_survive_build_provider_failure_without_fabricated_nodes(self):
        brief = {**BRIEF,'questions':['希望控制哪个对象？']}
        with patch('app.services.scenario_builder.execute_candidate') as execute:
            result,_ = await self.build([brief,HTTPException(503,'synthetic provider body')])
        self.assertEqual(result['build_report']['status'],'needs_input')
        self.assertEqual(result['build_report']['brief']['questions'],['希望控制哪个对象？'])
        self.assertEqual(result['project']['nodes'],[])
        self.assertFalse(result['build_report']['can_apply'])
        self.assertFalse(result['build_report']['runtime_verified'])
        self.assertNotIn('synthetic provider body',json.dumps(result))
        execute.assert_not_called()

    async def test_provider_failure_after_gap_retains_identified_candidate(self):
        first=draft();first['requirement_coverage'][0].update(status='missing',note='真实执行接口未接入')
        result,_=await self.build([BRIEF,first,HTTPException(503,'synthetic provider body')])
        self.assertEqual(result['build_report']['status'],'capability_gap')
        self.assertEqual(result['build_report']['coverage'],first['requirement_coverage'])
        self.assertEqual(result['build_report']['candidate_attempt'],1)
        self.assertFalse(result['build_report']['runtime_verified'])
        self.assertTrue(all(n['data']['designOnly'] for n in result['project']['nodes']))
        self.assertNotIn('synthetic provider body',json.dumps(result))

    async def test_initial_build_content_protocol_failure_uses_existing_repair_attempts(self):
        for code in ('invalid_json','tool_protocol','invalid_response','empty_response'):
            error=HTTPException(503,'synthetic provider body');error.provider_failure_code=code
            with self.subTest(code=code):
                result,calls=await self.build([BRIEF,error,draft(),{'issues':[],'strengths':[]}],max_attempts=3)
                self.assertTrue(result['build_report']['can_apply'],result['validation'])
                self.assertEqual(len(result['build_report']['attempts']),2)
                self.assertEqual(result['build_report']['candidate_attempt'],2)
                self.assertEqual(result['build_report']['trial_count'],1)
                self.assertEqual(len(calls),4)
                self.assertNotIn('synthetic provider body',json.dumps(calls))

    async def test_build_content_protocol_retry_stops_at_three_candidate_attempts(self):
        from app.services import model_providers
        calls=[]
        async def complete(messages):
            calls.append(messages)
            if messages[0]['content']==BRIEF_INSTRUCTIONS:return json.dumps(BRIEF,ensure_ascii=False)
            model_providers._observe_completion({'choices':[{'finish_reason':'tool_calls'}],
                'usage':{'completion_tokens':100}},32768,'invalid_json')
            error=HTTPException(503,'synthetic provider body');error.provider_failure_code='invalid_json'
            raise error
        try:
            result=next(data for event,data in [item async for item in ScenarioBuilder(
                WorkflowGenerateRequestSchema(prompt='显示完成'),complete,max_attempts=3).events()] if event=='result')
        except HTTPException as error:
            self.fail(f'内容协议错误应先使用既有三轮恢复，当前被HTTP {error.status_code}提前终止')
        self.assertEqual(len(calls),4)
        self.assertEqual(len(result['build_report']['attempts']),3)
        self.assertFalse(result['build_report']['can_apply'])
        self.assertEqual(result['project']['nodes'],[])
        completions=[c for call in result['build_report']['calls'] for c in call['completions']]
        self.assertEqual(len(completions),3)
        self.assertTrue(all(c['failure_code']=='invalid_json' and c['output_tokens']==100 for c in completions))
        self.assertNotIn('synthetic provider body',json.dumps(result))

    async def test_initial_build_transport_auth_and_timeout_remain_fatal(self):
        for code in ('transport_error','upstream_http','timeout'):
            calls=[]
            async def complete(messages):
                calls.append(messages)
                if messages[0]['content']==BRIEF_INSTRUCTIONS:return json.dumps(BRIEF,ensure_ascii=False)
                error=HTTPException(503,'safe provider failure');error.provider_failure_code=code
                raise error
            with self.subTest(code=code),self.assertRaises(HTTPException):
                _=[item async for item in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),complete,max_attempts=3).events()]
            self.assertEqual(len(calls),2)

    async def test_known_invalid_provider_json_uses_original_brief_retry(self):
        for code in ('invalid_json','tool_protocol','invalid_response'):
            error=HTTPException(503,'synthetic provider body');error.provider_failure_code=code
            with self.subTest(code=code):
                result,calls=await self.build([[error,BRIEF],draft(),REVIEW])
                self.assertTrue(result['build_report']['can_apply'])
                self.assertEqual(sum(m[0]['content']==BRIEF_INSTRUCTIONS for m in calls),2)
                self.assertNotIn('synthetic provider body',json.dumps(calls))

    async def test_transport_errors_are_not_retried_as_invalid_briefs(self):
        for code in ('transport_error','timeout','upstream_http'):
            error=HTTPException(503,'safe error');error.provider_failure_code=code
            calls=[]
            async def complete(messages):calls.append(messages);raise error
            with self.subTest(code=code), self.assertRaises(HTTPException):
                _=[item async for item in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),complete).events()]
            self.assertEqual(len(calls),1)

    async def test_invalid_provider_json_retry_is_still_bounded_to_two_attempts(self):
        calls=[]
        async def complete(messages):
            calls.append(copy.deepcopy(messages))
            error=HTTPException(503,'synthetic provider body');error.provider_failure_code='invalid_json'
            raise error
        with self.assertRaisesRegex(ValueError,'需求规格未形成有效结构'):
            _=[item async for item in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),complete).events()]
        self.assertEqual(len(calls),2)
        self.assertNotIn('synthetic provider body',json.dumps(calls))

    async def test_invalid_initial_ai_plan_is_not_locked_before_preflight(self):
        for invalid in ('path','input','controls','no_assertion'):
            first = draft()
            step = first['execution_plan']['cases'][0]['steps'][0]
            repaired = draft()
            if invalid=='path':
                step['assertions']=[{'path':['nodes','o','status'],'op':'equals','value':'success'}]
                repaired['execution_plan']['cases'][0]['steps'][0]['assertions']=[{'path':['nodes','o'],'op':'equals','value':'success'}]
            elif invalid=='input':
                for value in (first,repaired):
                    value['workflow']['nodes'][0]['data'].update(inputFormat='json',outputFields={'v':'number'})
                step['input']={'v':'3'}
                repaired['execution_plan']['cases'][0]['steps'][0]['input']={'v':3}
            elif invalid=='controls':
                first['execution_plan']['cases'][0]['controls']=[{'control':'unknown.control','value':True}]
            else:
                step['assertions']=[]
            with self.subTest(invalid=invalid):
                result,_ = await self.build([BRIEF,first,repaired,REVIEW])
                self.assertTrue(result['build_report']['can_apply'],result['validation'])
                self.assertFalse(result['build_report']['attempts'][0]['passed'])
                self.assertEqual(result['build_report'].get('plan_revisions',[{}])[-1].get('revision_kind'),'initial')

    async def test_locked_ai_plan_accepts_evidence_based_equal_type_repair(self):
        first = draft()
        first['workflow']['nodes'].insert(1,{'id':'s','type':'state','position':{'x':150,'y':0},'data':{'values':{'count':3}}})
        first['workflow']['edges']=[{'id':'is','source':'i','target':'s'},{'id':'so','source':'s','target':'o'}]
        first['execution_plan']['cases'][0]['steps'][0]['assertions']=[{'path':['state','count'],'op':'equals','value':'3'}]
        second=copy.deepcopy(first)
        second['execution_plan']['cases'][0]['steps'][0]['assertions'][0]['value']=3
        result,_ = await self.build([BRIEF,first,REVIEW,second,REVIEW])
        self.assertTrue(result['build_report']['can_apply'],result['validation'])
        self.assertEqual(result['build_report'].get('plan_revisions',[{}])[-1].get('revision_kind'),'assertion_type')
        self.assertEqual(result['build_report'].get('trial_count'),2)

    async def test_graph_change_allows_only_preflight_suggested_path_correction(self):
        first=draft()
        first['workflow']['nodes'][0]['data'].update(inputFormat='json',outputFields={'old':'number'})
        step=first['execution_plan']['cases'][0]['steps'][0]
        step['input']={'old':3,'new':3}
        step['assertions']=[{'path':['outputs','i','data','old'],'op':'equals','value':3}]
        second=copy.deepcopy(first)
        second['workflow']['nodes'][0]['data']['outputFields']={'new':'number'}
        second['execution_plan']['cases'][0]['steps'][0]['assertions'][0]['path']=['outputs','i','data','new']
        result,_=await self.build([BRIEF,first,REPAIR_REVIEW,second,REVIEW])
        self.assertTrue(result['build_report']['can_apply'],result['validation'])
        self.assertEqual(result['build_report']['plan_revisions'][-1]['revision_kind'],'assertion_path')
        self.assertEqual(result['build_report']['trial_count'],2)

    async def test_graph_change_invalidates_old_type_evidence(self):
        first=draft()
        first['workflow']['nodes'].insert(1,{'id':'s','type':'state','position':{'x':150,'y':0},'data':{'values':{'count':3}}})
        first['workflow']['edges']=[{'id':'is','source':'i','target':'s'},{'id':'so','source':'s','target':'o'}]
        first['execution_plan']['cases'][0]['steps'][0]['assertions']=[{'path':['state','count'],'op':'equals','value':'3'}]
        second=copy.deepcopy(first)
        second['workflow']['nodes'][-1]['data']['responseText']='新图'
        second['execution_plan']['cases'][0]['steps'][0]['assertions'][0]['value']=3
        result,_=await self.build([BRIEF,first,REVIEW,second])
        self.assertFalse(result['build_report']['can_apply'])
        self.assertEqual(result['build_report']['execution']['status'],'not_run')
        self.assertTrue(any('锁定' in error for error in result['validation']['errors']))
        self.assertEqual(result['build_report']['trial_count'],1)

    async def test_status_only_revision_reuses_plan_rules_without_resetting_trials(self):
        first=draft();second=draft()
        second['execution_plan']['cases'][0]['steps'][0].pop('status')
        result,_=await self.build([BRIEF,first,REPAIR_REVIEW,second,REVIEW])
        self.assertTrue(result['build_report']['can_apply'])
        self.assertEqual(result['build_report']['plan_revisions'][-1]['revision_kind'],'status_only')
        self.assertEqual(result['build_report']['trial_count'],2)

    async def test_waiting_response_revision_requires_evidence_from_same_graph(self):
        first=draft()
        first['workflow']['nodes'][0]['data']['eventName']='start'
        first['workflow']['nodes'].insert(1,{'id':'w','type':'wait','position':{'x':150,'y':0},
            'data':{'prompt':'确认？','eventName':'answer','inputType':'text'}})
        first['workflow']['edges']=[{'id':'iw','source':'i','target':'w'},{'id':'wo','source':'w','target':'o'}]
        first['execution_plan']['cases'][0]['steps'][0].update(input={'$event':{'name':'start'}},
            assertions=[{'path':['nodes','w'],'op':'equals','value':'waiting'}])
        for changed in (False,True):
            second=copy.deepcopy(first)
            steps=second['execution_plan']['cases'][0]['steps']
            steps[0]['status']='waiting'
            steps.append({'input':{'$event':{'name':'answer','value':'继续'}},'status':'completed',
                'assertions':[{'path':['hmi','message'],'op':'contains','value':'完成'}]})
            if changed:second['workflow']['nodes'][-1]['data']['responseText']='新图完成'
            with self.subTest(changed=changed):
                result,_=await self.build([BRIEF,first,REVIEW,second,REVIEW])
                if changed:
                    self.assertFalse(result['build_report']['can_apply'])
                    self.assertEqual(result['build_report']['trial_count'],1)
                    self.assertTrue(any('锁定' in error for error in result['validation']['errors']))
                else:
                    self.assertTrue(result['build_report']['can_apply'],result['validation'])
                    self.assertEqual(result['build_report']['plan_revisions'][-1]['revision_kind'],'waiting_response')
                    self.assertEqual(result['build_report']['trial_count'],2)

    async def test_boolean_to_number_cannot_bypass_locked_ai_plan(self):
        first = draft()
        first['execution_plan']['cases'][0]['steps'][0]['assertions']=[{'path':['hmi','flag'],'op':'equals','value':True}]
        second=copy.deepcopy(first)
        second['execution_plan']['cases'][0]['steps'][0]['assertions'][0]['value']=1
        result,_ = await self.build([BRIEF,first,REVIEW,second])
        report=result['build_report']
        self.assertFalse(report['can_apply'])
        self.assertIs(report['execution_plan']['cases'][0]['steps'][0]['assertions'][0]['value'],True)
        self.assertTrue(any('锁定' in error for error in result['validation']['errors']))
        self.assertEqual(report.get('trial_count'),1)

    async def test_locked_plan_rejects_input_expected_value_and_case_control_changes(self):
        for kind in ('input','expected','controls','operator'):
            first=draft();second=draft()
            step=second['execution_plan']['cases'][0]['steps'][0]
            if kind=='input':step['input']='different'
            elif kind=='expected':step['assertions'][0]['value']='different'
            elif kind=='operator':step['assertions'][0]['op']='contains'
            else:second['execution_plan']['cases'][0]['controls']=[{'control':'ac.temp','value':22}]
            with self.subTest(kind=kind):
                result,_=await self.build([BRIEF,first,REPAIR_REVIEW,second])
                self.assertFalse(result['build_report']['can_apply'])
                self.assertTrue(any('锁定' in error for error in result['validation']['errors']))
                self.assertEqual(result['build_report'].get('trial_count'),1)

    async def test_caller_invalid_plan_remains_locked_when_model_proposes_legal_repair(self):
        caller=plan()
        caller['cases'][0]['steps'][0]['assertions']=[{'path':['nodes','o','status'],'op':'equals','value':'success'}]
        request=WorkflowGenerateRequestSchema(prompt='显示完成',acceptance_tests=caller)
        result,_=await self.build([BRIEF,draft(),draft()],request=request)
        self.assertFalse(result['build_report']['can_apply'])
        self.assertEqual(result['build_report']['execution_plan'],request.acceptance_tests.model_dump())
        self.assertEqual(result['build_report'].get('trial_count'),0)

    async def test_original_goal_is_preserved_when_model_proposes_simulation(self):
        request=WorkflowGenerateRequestSchema(prompt='真实控制空调并显示完成')
        brief=copy.deepcopy(BRIEF);brief['goal']='仅在HMI演示空调并显示完成'
        first=draft();first['requirement_coverage'][0].update(status='missing',note='真实空调接口未接入')
        result,_=await self.build([brief,first,{}],request=request)
        self.assertEqual(result['build_report']['brief']['goal'],request.prompt)
        self.assertIn('仅在HMI演示空调并显示完成',result['build_report']['brief']['assumptions'])
        self.assertEqual(result['build_report']['coverage'][0]['requirement_id'],'R1')
        self.assertEqual(result['build_report']['status'],'capability_gap')


class BuilderCompletionMetadataTests(unittest.IsolatedAsyncioTestCase):
    async def test_exhausted_brief_retry_preserves_safe_provider_code_and_both_completions(self):
        import httpx
        from app.services import model_providers
        original_client=httpx.AsyncClient
        provider=model_providers.Provider('deepseek','fixture','https://example.invalid','deepseek-flash','PRIVATE-KEY')
        request=WorkflowGenerateRequestSchema(prompt='PRIVATE-PROMPT',provider_id='deepseek',model='deepseek-flash')
        for code in ('invalid_json','tool_protocol','invalid_response','invalid_spec'):
            calls=[]
            async def respond(message):
                calls.append(message)
                if code=='invalid_response':
                    body={'choices':[]}
                else:
                    body={'choices':[{'finish_reason':'tool_calls','message':{'reasoning_content':'PRIVATE-REASONING',
                        'tool_calls':[{'function':{'name':'wrong-tool' if code=='tool_protocol' else 'submit_scenario',
                        'arguments':'{"PRIVATE-ARGUMENT":' if code=='invalid_json' else '{}'}}]}}]}
                body['usage']={'prompt_tokens':10,'completion_tokens':100 if len(calls)==1 else 200,
                    'completion_tokens_details':{'reasoning_tokens':90 if len(calls)==1 else 180},'content':'PRIVATE-USAGE'}
                return httpx.Response(200,json=body)
            def client(**kwargs):return original_client(transport=httpx.MockTransport(respond),**kwargs)
            with self.subTest(code=code), patch('app.services.model_providers.resolve',return_value=provider), \
                    patch('app.services.model_providers.httpx.AsyncClient',side_effect=client):
                with self.assertRaisesRegex(ValueError,'需求规格未形成有效结构') as failed:
                    _=[item async for item in ScenarioBuilder(request).events()]
                error=failed.exception
                self.assertEqual(len(calls),2)
                self.assertEqual(getattr(error,'provider_failure_code',None),None if code=='invalid_spec' else code)
                completions=getattr(error,'provider_completions',[])
                self.assertEqual(len(completions),2)
                self.assertEqual([c['output_tokens'] for c in completions],[100,200])
                self.assertEqual([c['reasoning_tokens'] for c in completions],[90,180])
                self.assertEqual(getattr(error,'provider_completion_metadata',None),completions[-1])
                self.assertNotIn('PRIVATE',json.dumps(error.__dict__))

    async def test_bounded_known_deepseek_uses_longer_deadline_with_three_attempts(self):
        import asyncio
        import time
        from types import SimpleNamespace
        from app.services import model_providers
        from app.services.scenario_builder import _build_events
        from app.services.hermes_authoring import EngineConfig
        original_timeout=asyncio.timeout
        for provider_id,model,minimum,maximum in [('deepseek','deepseek-flash',719,721),
                ('deepseek','unknown-model',239,241),('minimax','MiniMax-M3',239,241)]:
            budgets=[];attempts=[]
            def timeout(seconds):
                scope=original_timeout(seconds);budgets.append(scope)
                return scope
            class Builder:
                def __init__(self, request, **kwargs):attempts.append(kwargs['max_attempts'])
                async def events(self):yield 'result',{}
            request=WorkflowGenerateRequestSchema(prompt='显示完成',provider_id=provider_id,model=model)
            provider=model_providers.Provider(provider_id,'fixture','https://example.invalid',model,'')
            run=SimpleNamespace(configure=lambda *args:None,bounded=lambda *args:None)
            with self.subTest(model=model), patch('app.services.hermes_authoring.configured_engine',return_value=EngineConfig(engine='bounded')), \
                    patch('app.services.scenario_builder.ScenarioBuilder',Builder), \
                    patch('app.services.scenario_builder.asyncio.timeout',side_effect=timeout), \
                    patch('app.services.model_providers.resolve',return_value=provider):
                _=[item async for item in _build_events(request,run)]
                remaining=budgets[0].when()-time.monotonic()
                self.assertGreater(remaining,minimum)
                self.assertLess(remaining,maximum)
                self.assertEqual(attempts,[3])

    async def test_staged_provider_requests_preserve_explicit_reasoning(self):
        import httpx
        from app.services import model_providers
        requests=[]
        async def respond(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200,json={'choices':[{'finish_reason':'tool_calls','message':{
                'tool_calls':[{'type':'function','function':{'name':'submit_scenario','arguments':'{}'}}]}}]})
        original_client=httpx.AsyncClient
        def client(**kwargs):return original_client(transport=httpx.MockTransport(respond),**kwargs)
        provider=model_providers.Provider('deepseek','fixture','https://example.invalid','deepseek-flash','fixture-key')
        request=WorkflowGenerateRequestSchema(prompt='显示完成',provider_id='deepseek',model='deepseek-flash',reasoning={'enabled':True,'effort':'low'})
        with patch('app.services.model_providers.resolve',return_value=provider), patch('app.services.model_providers.httpx.AsyncClient',side_effect=client):
            builder=ScenarioBuilder(request)
            for instructions in (BRIEF_INSTRUCTIONS,GENERAL_BUILD_INSTRUCTIONS,REVIEW_INSTRUCTIONS):
                await builder._complete([{'role':'system','content':instructions}])
        self.assertEqual([r['max_tokens'] for r in requests],[16384,32768,8192])
        self.assertTrue(all(r['thinking']=={'type':'enabled'} and r['reasoning_effort']=='low' for r in requests))
        self.assertTrue(all(r['tool_choice']=='auto' for r in requests))

    async def test_completion_metadata_is_local_and_restored_after_success_or_failure(self):
        from app.services import model_providers
        outer=[]
        token=model_providers.COMPLETION_METADATA_OBSERVER.set(outer.append)
        async def completion(messages):
            model_providers._observe_completion({'choices':[{'finish_reason':'length'}],
                'usage':{'completion_tokens':32768,'completion_tokens_details':{'reasoning_tokens':29000}}},32768,'output_truncated')
            if messages[-1].get('failure'):raise HTTPException(503,'safe error')
            return '{}'
        try:
            builder=ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),completion)
            await builder.call('build',[{'role':'system','content':GENERAL_BUILD_INSTRUCTIONS}])
            with self.assertRaises(HTTPException):
                await builder.call('repair',[{'role':'system','content':GENERAL_BUILD_INSTRUCTIONS},{'role':'user','content':'fixture','failure':True}])
            self.assertEqual(outer,[])
            self.assertIs(model_providers.COMPLETION_METADATA_OBSERVER.get().__self__,outer)
            for call in builder.calls:
                metadata=call.get('completions',[{}])[0]
                self.assertEqual(metadata.get('finish_reason'),'length')
                self.assertEqual(metadata.get('reasoning_tokens'),29000)
                self.assertEqual(metadata.get('failure_code'),'output_truncated')
        finally:
            model_providers.COMPLETION_METADATA_OBSERVER.reset(token)

    async def test_completion_metadata_observer_is_restored_on_cancellation(self):
        import asyncio
        from app.services import model_providers
        outer=[]
        token=model_providers.COMPLETION_METADATA_OBSERVER.set(outer.append)
        async def completion(messages):
            model_providers._observe_completion({},32768,None)
            raise asyncio.CancelledError()
        try:
            builder=ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),completion)
            with self.assertRaises(asyncio.CancelledError):
                await builder.call('build',[{'role':'system','content':GENERAL_BUILD_INSTRUCTIONS}])
            self.assertEqual(outer,[])
            self.assertIs(model_providers.COMPLETION_METADATA_OBSERVER.get().__self__,outer)
        finally:
            model_providers.COMPLETION_METADATA_OBSERVER.reset(token)

    async def test_parallel_completions_do_not_mix_metadata(self):
        import asyncio
        from app.services import model_providers
        def builder(count):
            async def completion(messages):
                await asyncio.sleep(0)
                model_providers._observe_completion({'choices':[{'finish_reason':'stop'}],
                    'usage':{'completion_tokens':count}},32768,None)
                return '{}'
            return ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),completion)
        first,second=builder(10),builder(20)
        await asyncio.gather(*(b.call('build',[{'role':'system','content':GENERAL_BUILD_INSTRUCTIONS}]) for b in (first,second)))
        self.assertEqual(first.calls[0]['completions'][0]['output_tokens'],10)
        self.assertEqual(second.calls[0]['completions'][0]['output_tokens'],20)


if __name__=='__main__':
    unittest.main()
