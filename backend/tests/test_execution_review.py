import copy,json,unittest
from unittest.mock import AsyncMock,patch
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.scenario_builder import ScenarioBrief
from app.services.execution_review import evidence_bundle,validate_review,review_execution,review_retry_feedback
from app.services.model_providers import Provider

REQUEST=WorkflowGenerateRequestSchema(prompt='把输入比作旅行用品，用两句实际讲解并声明测试。')
BRIEF=ScenarioBrief(title='test',goal=REQUEST.prompt,requirements=[{'id':'R1','description':'两句讲解','acceptance':'两句有实质内容','source_quote':'用两句实际讲解'}],experience_outline=['输入','讲解'])
PROVIDER=Provider('anthropic','test','https://synthetic.invalid/v1','synthetic-model','synthetic-key')
def execution(text='远山像折叠伞，这是测试。句号。'):
    return {'status':'passed','artifact_sha256':'synthetic-artifact','cases':[{'name':'one','steps':[{'status':'completed','evidence':{'run':{'input':'远山'},'hmi':{'message':text},'outputs':{},'state':{},'actions':[]}}]}]}
def review(fail=True):
    return {'checks':[{'case_index':0,'step_index':0,'verdict':'fail' if fail else 'pass','findings':[{'request_quote':'用两句实际讲解','evidence_path':['hmi','message'],'observed_quote':'句号。','problem':'第二句只有标点名称，没有实际讲解。','correction':'第二句应补充旅行用品与输入意象的具体关联。'}] if fail else []}]}

class EvidenceReviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_retry_uses_schema_feedback_but_can_still_reject_semantic_content(self):
        bad={'checks':[{'case_index':'one','step_index':0,'verdict':'fail','findings':['not an object']}]}
        first_completion=AsyncMock(return_value=json.dumps(bad))
        first=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=first_completion)
        self.assertEqual(first['error_code'],'response_schema');self.assertEqual(first['status'],'error')
        second_completion=AsyncMock(return_value=json.dumps(review()))
        second=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=second_completion,previous_error=first)
        self.assertEqual(second['status'],'needs_changes')
        feedback=second['retry_feedback'];self.assertIn('checks.0.case_index',feedback['invalid_fields'])
        self.assertEqual(feedback['required_addresses'],[{'case_index':0,'step_index':0}])
        self.assertEqual(first_completion.call_args.args[0][1],second_completion.call_args.args[0][1])
        self.assertIn('不得为了消除格式错误改成pass',second_completion.call_args.args[0][0]['content'])
        self.assertEqual(first['evidence_sha256'],second['evidence_sha256'])

    async def test_bad_quote_reports_bounded_difference_and_retry_keeps_semantic_rejection(self):
        bad=review();bad['checks'][0]['findings'][0]['observed_quote']='PRIVATE_FALSE_QUOTE'
        first=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(bad)))
        self.assertEqual(first['status'],'error')
        self.assertEqual(first['details'][0]['field'],'checks.0.findings.0.observed_quote')
        self.assertEqual(first['details'][0]['quote_difference']['observed_excerpt'],'PRIVATE_FALSE_QUOTE')
        complete=AsyncMock(return_value=json.dumps(review()))
        second=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=complete,previous_error=first)
        self.assertEqual(second['status'],'needs_changes')
        self.assertEqual(second['retry_feedback']['invalid_fields'],['checks.0.findings.0.observed_quote'])
        self.assertEqual(first['evidence_sha256'],second['evidence_sha256'])

    async def test_nested_scalar_quote_is_exact_and_extra_check_fields_still_fail(self):
        run=execution();run['cases'][0]['steps'][0]['evidence']['state']={'nested':{'value':24}}
        good=review();good['checks'][0]['findings'][0].update(evidence_path=['state','nested','value'],observed_quote='24')
        result=await review_execution(REQUEST,BRIEF,run,provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(good)))
        self.assertEqual(result['status'],'needs_changes')
        good['checks'][0]['case_index1']=0
        result=await review_execution(REQUEST,BRIEF,run,provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(good)))
        self.assertEqual(result['status'],'error');self.assertEqual(result['error_code'],'response_schema')

    async def test_coverage_and_quote_protocol_errors_have_stable_codes(self):
        cases=[]
        value=review(False);value['checks']*=2;cases.append((value,'coverage_invalid'))
        value=review();value['checks'][0]['findings'][0]['request_quote']='invented';cases.append((value,'invalid_request_quote'))
        value=review();value['checks'][0]['findings'][0]['observed_quote']='invented';cases.append((value,'invalid_evidence_quote'))
        value=review();value['checks'][0]['findings'][0]['evidence_path']=['missing'];cases.append((value,'missing_evidence'))
        for value,code in cases:
            with self.subTest(code=code):
                report=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(value)))
                self.assertEqual(report['status'],'error');self.assertEqual(report['error_code'],code)

    async def test_feedback_cannot_cross_artifact_evidence_or_valid_verdict(self):
        first=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=AsyncMock(return_value='not JSON'))
        for modified in [{**first,'artifact_sha256':'another'},{**first,'evidence_sha256':'another'},
                         {**first,'status':'needs_changes'},{**first,'status':'passed'},{**first,'failure_stage':'model_call'}]:
            complete=AsyncMock(return_value=json.dumps(review(False)))
            result=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=complete,previous_error=modified)
            self.assertNotIn('retry_feedback',result);self.assertNotIn('主机校验反馈',complete.call_args.args[0][0]['content'])

    def test_feedback_whitelist_excludes_provider_body_messages_and_unknown_paths(self):
        hashes={'artifact_sha256':'a','evidence_sha256':'e'}
        previous={**hashes,'status':'error','failure_stage':'validate_response','error_code':'response_schema',
                  'message':'PRIVATE','details':[{'field':'checks.0.case_index','issue':'PRIVATE'},
                    {'field':'checks.0.PRIVATE','issue':'PRIVATE'},{'field':['PRIVATE']},'PRIVATE']}
        feedback=review_retry_feedback(previous,hashes,evidence_bundle(REQUEST,BRIEF,execution()))
        self.assertNotIn('PRIVATE',json.dumps(feedback));self.assertEqual(feedback['invalid_fields'],['checks.0.case_index'])
        self.assertIsNone(review_retry_feedback({**previous,'error_code':'PRIVATE'},hashes,evidence_bundle(REQUEST,BRIEF,execution())))

    async def test_real_evidence_rejects_vacuous_content_even_when_runtime_passed(self):
        complete=AsyncMock(return_value=json.dumps(review(),ensure_ascii=False))
        result=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=complete)
        self.assertEqual(result['status'],'needs_changes')
        self.assertFalse(result['independent_verification'])
        sent=json.loads(complete.call_args.args[0][1]['content'])
        self.assertEqual(sent['cases'][0]['steps'][0]['evidence']['hmi']['message'],'远山像折叠伞，这是测试。句号。')
        self.assertNotIn('passed',sent['cases'][0])
        self.assertEqual(result['artifact_sha256'],'synthetic-artifact')

    async def test_invented_request_or_evidence_and_missing_step_are_not_passes(self):
        bad=[]
        x=review();x['checks'][0]['findings'][0]['request_quote']='用户没有要求的电影级效果';bad.append(x)
        x=review();x['checks'][0]['findings'][0]['observed_quote']='实际未出现的内容';bad.append(x)
        x=review();x['checks'][0]['findings'][0]['evidence_path']=['hmi','missing'];bad.append(x)
        x=review(False);x['checks']*=2;bad.append(x)
        bad.append({'checks':[]})
        for value in bad:
            result=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(value)))
            self.assertEqual(result['status'],'error',value)
        run=execution();run['cases'].append(copy.deepcopy(run['cases'][0]))
        result=await review_execution(REQUEST,BRIEF,run,provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(review(False))))
        self.assertEqual(result['status'],'error')

    async def test_literal_requested_short_output_is_allowed_without_banned_words(self):
        request=WorkflowGenerateRequestSchema(prompt='只显示“句号”两个字。')
        result=await review_execution(request,BRIEF,execution('句号'),provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(review(False))))
        self.assertEqual(result['status'],'passed')

    async def test_service_failure_and_invalid_json_are_closed_without_exposing_body(self):
        for complete in [AsyncMock(side_effect=RuntimeError('PRIVATE_PROVIDER_BODY')),AsyncMock(side_effect=TimeoutError()),AsyncMock(return_value='not JSON')]:
            result=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=complete)
            self.assertEqual(result['status'],'error');self.assertNotIn('PRIVATE_PROVIDER_BODY',json.dumps(result))

    async def test_failed_execution_does_not_spend_a_review_call(self):
        run=execution();run['status']='failed';complete=AsyncMock()
        result=await review_execution(REQUEST,BRIEF,run,provider=PROVIDER,completion=complete)
        self.assertEqual(result['status'],'not_run');complete.assert_not_called()

    async def test_all_steps_and_media_scope_are_preserved_without_silent_truncation(self):
        run=execution();run['cases'][0]['steps'][0]['evidence']['run']['input']={'type':'image','content':'data:image/png;base64,synthetic'}
        bundle=evidence_bundle(REQUEST,BRIEF,run)
        self.assertTrue(bundle['cases'][0]['steps'][0]['evidence']['input']['content']['media_not_reviewed'])
        self.assertNotIn('base64',json.dumps(bundle))
        complete=AsyncMock()
        result=await review_execution(REQUEST,BRIEF,execution('x'*250001),provider=PROVIDER,completion=complete)
        self.assertEqual(result['status'],'error');complete.assert_not_called()

    async def test_provider_binding_and_structured_contract(self):
        with patch('app.services.model_providers.complete',new=AsyncMock(return_value=json.dumps(review(False)))) as complete:
            result=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER)
        self.assertEqual(result['status'],'passed')
        self.assertIs(complete.call_args.args[0],PROVIDER)
        self.assertEqual(complete.call_args.args[2]['required'],['checks'])
        self.assertNotIn('synthetic-key',json.dumps(result))

    async def test_observed_named_array_wrapper_is_lossless_not_permission_to_drop_data(self):
        raw=json.dumps({'checks':json.dumps(review(),ensure_ascii=False)},ensure_ascii=False)
        result=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=AsyncMock(return_value=raw))
        self.assertEqual(result['status'],'needs_changes')
        self.assertTrue(any('named array envelope' in c for c in result['provider_envelopes_normalized']))
        malformed={'checks':json.dumps({**review(),'unexpected':'must not discard'})}
        result=await review_execution(REQUEST,BRIEF,execution(),provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(malformed)))
        self.assertEqual(result['status'],'error')

    def test_verdict_consistency_and_evidence_array_paths(self):
        bundle=evidence_bundle(REQUEST,BRIEF,execution());x=review();x['checks'][0]['verdict']='pass'
        with self.assertRaises(ValueError):validate_review(x,bundle)
        bundle['cases'][0]['steps'][0]['evidence']['actions']=[{'value':24}]
        x=review();x['checks'][0]['findings'][0].update(evidence_path=['actions','0','value'],observed_quote='24')
        validate_review(x,bundle)
