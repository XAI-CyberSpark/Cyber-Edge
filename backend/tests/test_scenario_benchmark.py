import copy
import json
from pathlib import Path
import unittest
from app.services.scenario_benchmark import validate_suite,check_candidate,digest,manual_review,verdict
from tests.test_scenario_builder import candidate,BRIEF
from app.services.orchestration_service import OrchestrationService
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema

ROOT=Path(__file__).resolve().parents[2]
SUITE=json.loads((ROOT/'benchmarks/scenarios/cases.json').read_text())
BY_ID={x['id']:x for x in SUITE['cases']}

class Benchmark(unittest.TestCase):
    def test_twenty_unique_complete_cases_and_invalid_suite(self):
        self.assertEqual(validate_suite(SUITE),20)
        for mutate in ('duplicate','manual','runtime'):
            value=copy.deepcopy(SUITE)
            if mutate=='duplicate':value['cases'][1]['id']=value['cases'][0]['id']
            elif mutate=='manual':value['cases'][0]['manual']=[]
            else:value['cases'][0]['runtime_profile']='none'
            with self.assertRaises(ValueError):validate_suite(value)

    def result(self):
        p=OrchestrationService._normalize_project_payload(candidate(),WorkflowGenerateRequestSchema(prompt='a')).model_dump()
        return {'project':p,'validation':{'passed':True},'build_report':{'status':'preview','can_apply':True}}

    def test_self_declared_pass_cannot_hide_missing_user_requirements(self):
        result=self.result();checks=check_candidate(BY_ID['BT-01'],result)
        failed={c['id'] for c in checks if c['status']=='fail'}
        self.assertIn('entity_朵朵',failed);self.assertIn('entity_滴水湖',failed);self.assertIn('arrival_ending',failed)

    def test_known_question_answer_is_independent_of_model_own_answer(self):
        result=self.result();p=result['project']['nodes'][1]['data']['plan']
        p['steps'][0]['content']['answers']=['6','六']
        checks=check_candidate(BY_ID['BT-02'],result)
        self.assertTrue(any(c['id']=='fixed_puzzle' and c['status']=='fail' for c in checks))

    def test_empty_graph_and_mock_recognition_cannot_pass(self):
        result=self.result();result['project']['nodes']=[];result['project']['edges']=[]
        self.assertTrue(any(c['status']=='fail' for c in check_candidate(BY_ID['CC-01'],result)))
        result['project']['nodes']=[{'id':'r','type':'recognition','data':{'resultSource':'preset'}}]
        self.assertTrue(any(c['id']=='observed_recognition' and c['status']=='fail' for c in check_candidate(BY_ID['CC-01'],result)))

    def test_capability_gap_requires_missing_evidence_and_not_applicable(self):
        result={'project':{'nodes':[]},'validation':{'passed':False},'build_report':{'status':'capability_gap','can_apply':False,'coverage':[{'status':'missing','note':'未连接真实空调执行接口'}]}}
        self.assertTrue(all(c['status']=='pass' for c in check_candidate(BY_ID['CT-03'],result)))
        result['build_report']['coverage']=[]
        self.assertTrue(any(c['status']=='fail' for c in check_candidate(BY_ID['CT-03'],result)))

    def test_unnecessary_question_is_not_treated_as_success(self):
        result={'project':{'nodes':[]},'validation':{'passed':False},'build_report':{'status':'needs_input','can_apply':False,'brief':{'questions':['起点在哪里？']}}}
        self.assertTrue(any(c['id']=='disposition' and c['status']=='fail' for c in check_candidate(BY_ID['BT-01'],result)))
        self.assertTrue(all(c['status']=='pass' for c in check_candidate(BY_ID['IN-01'],result)))

    def review(self,case):
        return {'case_sha256':digest(case),'artifact_sha256':'artifact-A','reviewer':'测试评审人','reviewed_at':'2026-09-25','criteria':[{'id':x['id'],'status':'pass','evidence':'测试证据：第三章'} for x in case['manual']]}

    def test_review_must_match_exact_candidate_case_and_complete_criteria(self):
        case=BY_ID['BT-01'];review=self.review(case)
        self.assertTrue(all(x['status']=='pass' for x in manual_review(case,'artifact-A',review)))
        for mutation in ('hash','case','missing','duplicate','evidence','reviewer'):
            value=copy.deepcopy(review)
            if mutation=='hash':value['artifact_sha256']='old'
            elif mutation=='case':value['case_sha256']='old'
            elif mutation=='missing':value['criteria'].pop()
            elif mutation=='duplicate':value['criteria'][1]['id']=value['criteria'][0]['id']
            elif mutation=='evidence':value['criteria'][0]['evidence']=''
            else:value['reviewer']=''
            with self.assertRaises(ValueError):manual_review(case,'artifact-A',value)

    def test_no_manual_review_or_unsupported_runtime_never_becomes_accepted(self):
        case=BY_ID['BT-01'];checks=[{'status':'pass'}];passed=[{'status':'pass'}]
        self.assertEqual(verdict(case,checks,{'status':'passed'},manual_review(case,'a',None)),'needs_review')
        self.assertEqual(verdict(case,checks,{'status':'not_supported'},passed),'needs_review')
        self.assertEqual(verdict(case,checks,{'status':'passed'},passed,mode='reference'),'reference_only')
        self.assertEqual(verdict(case,checks,{'status':'passed'},passed),'accepted')
        self.assertEqual(verdict(case,checks,{'status':'passed'},passed,error='not_configured'),'blocked')
        self.assertEqual(verdict(case,checks,{'status':'passed'},passed,error='timeout'),'failed')
        self.assertEqual(verdict(case,[{'status':'fail'}],{'status':'passed'},passed),'failed')
        self.assertEqual(verdict(case,checks,{'status':'passed'},[{'status':'fail'}]),'failed')
