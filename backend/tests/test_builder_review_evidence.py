"""Bounded content review receives physical receipts, without full model traces."""
import copy
import json
import unittest

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.scenario_builder import ScenarioBuilder, BRIEF_INSTRUCTIONS, REVIEW_INSTRUCTIONS
from tests.test_scenario_builder_recovery import BRIEF, draft


class BuilderReviewEvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def review_input(self, evidence):
        reviews=[]
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:return json.dumps(BRIEF,ensure_ascii=False)
            if messages[0]['content']==REVIEW_INSTRUCTIONS:
                reviews.append(json.loads(messages[-1]['content'])['actual_execution'])
                return json.dumps({'issues':[],'strengths':[]})
            return json.dumps(draft(),ensure_ascii=False)
        async def execute(project,plan):
            return {'status':'passed','runtime_verified':True,'model_calls':0,'cases':[{
                'name':'实际回执','passed':True,'steps':[{'index':0,'status':'completed','passed':True,
                'assertions':[],'evidence':copy.deepcopy(evidence)}]}]}
        _=[item async for item in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
            complete,executor=execute,max_attempts=1).events()]
        self.assertEqual(len(reviews),1)
        return reviews[0]['cases'][0]['steps'][0]

    async def test_review_receives_initial_and_actual_windows_and_registered_receipts(self):
        initial={'windows':{'fl':17,'fr':29,'rl':43,'rr':68},'blocked_window':'rr'}
        windows={'fl':17,'fr':29,'rl':43,'rr':68}
        receipt={'success':False,'requested':{'rr':0},'actual':windows,'source':'workflow',
            'failedWindows':['rr'],'reason':'blocked','commandId':1}
        evidence={'initial_vehicle':initial,'car':{'windows':windows},'hmi':{'message':'右后窗被阻挡'},
            'actions':[receipt]}
        summary=await self.review_input(evidence)
        self.assertEqual(summary.get('initial_vehicle'),initial)
        self.assertEqual(summary.get('car',{}).get('windows'),windows)
        self.assertEqual(summary.get('actions'),[receipt])
        self.assertEqual(summary['displayed'],'右后窗被阻挡')

    async def test_review_summary_omits_raw_model_trace_and_unknown_receipt_fields(self):
        windows={'fl':17,'fr':29,'rl':43,'rr':0}
        receipt={'success':True,'requested':{'rr':0},'actual':windows,'source':'workflow','commandId':1,
            'raw_model_output':'PRIVATE-ACTION','api_key':'PRIVATE-KEY'}
        evidence={'initial_vehicle':{'windows':{'fl':17,'fr':29,'rl':43,'rr':68},'blocked_window':None,
                    'private':'PRIVATE-INITIAL'},
            'car':{'windows':windows,'private':'PRIVATE-CAR'},'hmi':{'message':'完成'},'actions':[receipt],
            'outputs':{'llm':{'raw_model_output':'PRIVATE-MODEL','trace':'PRIVATE-TRACE'}},
            'run':{'events':[{'payload':{'trace':'PRIVATE-EVENT'}}]}}
        summary=await self.review_input(evidence)
        self.assertEqual(summary.get('car'),{'windows':windows})
        self.assertEqual(summary.get('actions'),[{'success':True,'requested':{'rr':0},'actual':windows,'source':'workflow','commandId':1}])
        self.assertNotIn('PRIVATE',json.dumps(summary))
        self.assertNotIn('outputs',summary)
        self.assertNotIn('run',summary)

    async def test_missing_physical_evidence_is_not_fabricated(self):
        summary=await self.review_input({'hmi':{'message':'完成'}})
        self.assertNotIn('initial_vehicle',summary)
        self.assertNotIn('car',summary)
        self.assertEqual(summary['displayed'],'完成')


if __name__=='__main__':unittest.main()
