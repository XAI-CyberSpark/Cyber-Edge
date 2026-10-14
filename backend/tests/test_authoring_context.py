import copy
import json
import unittest

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.authoring_context import build_stage_context, context_sizes, review_execution_summary
from app.services.node_capability_service import CATALOG


class AuthoringContextTests(unittest.TestCase):
    def test_retrieval_degradation_is_visible_without_internal_vector_documents(self):
        request = WorkflowGenerateRequestSchema(prompt='显示提示')
        recall = {'node_overview': [], 'candidates': [{'id': 'node:output', 'purpose': '显示文字',
                   'semantic_text': 'INTERNAL EMBEDDING DOCUMENT', 'document_hash': 'internal-cache-key'}], 'index_hash': 'index', 'fallback': False,
                  'strategy': 'bm25_embedding_rrf_v1', 'retrieval_status': 'degraded', 'semantic_status': 'unavailable',
                  'diagnostics': [{'code': 'semantic_recall_unavailable', 'status': 'degraded', 'reason': 'embedding_runtime_missing'}]}
        result = build_stage_context('select', request, None, recall, {}, [])
        available = result['available_capabilities']
        self.assertEqual('degraded', available['retrieval_status'])
        self.assertEqual(recall['diagnostics'], available['diagnostics'])
        self.assertNotIn('semantic_text', available['candidates'][0])
        self.assertNotIn('document_hash', available['candidates'][0])
        self.assertIn('semantic_text', recall['candidates'][0])

    def test_review_preserves_registered_hmi_state_paths(self):
        report={'status':'passed','cases':[{'name':'states','passed':True,'steps':[{'index':0,
            'status':'completed','passed':True,'evidence':{'car':{'ac':{'temp':24,'fanSpeed':2},
            'lights':{'brightness':55},'private':'PRIVATE'},'hmi':{'message':'完成'}}}]}]}
        step=review_execution_summary(report)['cases'][0]['steps'][0]
        self.assertEqual(step['car']['ac']['temp'],24)
        self.assertEqual(step['car']['lights']['brightness'],55)
        self.assertNotIn('PRIVATE',json.dumps(step))

    def test_review_preserves_empty_containers_as_observed_values(self):
        report={'status':'passed','cases':[{'name':'empty','passed':True,'steps':[{'index':0,
            'status':'completed','passed':True,'evidence':{'state':{'empty':[],'obj':{},'nil':None},
            'outputs':{'n':{'data':{'items':[]}}},'hmi':{'message':'none'}}}]}]}
        step=review_execution_summary(report)['cases'][0]['steps'][0]
        self.assertEqual(step['state'],{'empty':[],'obj':{},'nil':None})
        self.assertEqual(step['outputs']['n']['data']['items'],[])
        self.assertIn(['state','empty'],[entry['evidence_path'] for entry in step['evidence_index']])

    def test_early_user_constraints_and_later_correction_survive_long_history(self):
        turns = [{'role':'user','content':'禁止开左前窗，仅允许右后窗。'}]
        turns += [{'role':'assistant','content':'待审建议'} for _ in range(12)]
        turns += [{'role':'user','content':'更正：也不要操作右后窗，只显示提示。'}]
        request = WorkflowGenerateRequestSchema(prompt='开始', conversation_history=turns)
        result = build_stage_context('understand', request, None, {}, {}, [])
        encoded = json.dumps(result, ensure_ascii=False)
        self.assertIn(turns[0]['content'], encoded)
        self.assertIn(turns[-1]['content'], encoded)
        self.assertEqual(result['user_context']['user_history'][0]['turn_index'], 0)
        self.assertEqual(result['user_context']['user_history'][-1]['turn_index'], 13)

    def test_planning_uses_short_project_overview_and_keeps_original_project(self):
        project={'id':'p','name':'既有图','nodes':[{'id':'n','type':'output','position':{'x':12,'y':30},
                 'data':{'text':'PRIVATE-LONG-BODY','description':'user config'}}], 'edges':[],
                 'meta':{'goal':'原始目标','scenario_brief':{'goal':'旧解释'}}}
        request=WorkflowGenerateRequestSchema(prompt='改标签',current_project=project)
        before=request.model_dump()
        result=build_stage_context('understand',request,None,{}, {}, [])
        self.assertNotIn('PRIVATE-LONG-BODY',json.dumps(result))
        self.assertIn('原始目标',json.dumps(result,ensure_ascii=False))
        self.assertEqual(result['user_context']['current_project']['nodes'][0],{'id':'n','type':'output'})
        self.assertEqual(before,request.model_dump())

    def test_build_keeps_selected_contract_and_existing_graph_for_full_draft(self):
        request=WorkflowGenerateRequestSchema(prompt='改标签',current_project={
            'id':'p','name':'图','nodes':[{'id':'n','type':'output','position':{'x':8,'y':9},'data':{'text':'保留'}}], 'edges':[]})
        view={'catalog':{'nodes':{'output':copy.deepcopy(CATALOG['nodes']['output'])}},'selected_ids':['node:output']}
        result=build_stage_context('build',request,{'goal':'改标签'},view,{},[])
        self.assertEqual(result['capabilities'],view['catalog'])
        self.assertEqual(result['context']['current_project']['nodes'][0]['data']['text'],'保留')
        self.assertNotIn('hmi_controls',json.dumps(result['capabilities']))

    def test_review_context_omits_construction_catalog_and_tutorial(self):
        request=WorkflowGenerateRequestSchema(prompt='显示提示')
        view={'catalog':CATALOG,'selected_ids':['node:output']}
        result=build_stage_context('review',request,{'goal':'显示提示'},view,
                                   {'execution':{'status':'passed','cases':[]},'coverage':[]},[])
        self.assertNotIn('capabilities',result)
        self.assertNotIn('current_project',result['original'])
        self.assertEqual(result['actual_execution']['status'],'passed')

    def test_component_sizes_are_deterministic_and_not_actual_tokens(self):
        value={'user_context':{'request':'中文'},'available_capabilities':{'nodes':[]}}
        sizes=context_sizes(value)
        self.assertEqual(sizes,context_sizes(value))
        self.assertGreater(sizes['total']['bytes'],sizes['total']['characters'])
        self.assertEqual(sizes['token_measurement'],'not_measured')
        self.assertNotIn('input_tokens',sizes)

    def test_receipts_preserve_real_values_but_drop_private_fields(self):
        evidence={'initial_vehicle':{'windows':{'fl':17,'fr':29,'rl':43,'rr':68},'blocked_window':'rr','private':'PRIVATE'},
                  'car':{'windows':{'fl':17,'fr':29,'rl':43,'rr':68},'private':'PRIVATE'},
                  'hmi':{'message':'被阻挡'},'actions':[{'success':False,'requested':{'rr':0},
                    'actual':{'fl':17,'fr':29,'rl':43,'rr':68},'source':'test','private':'PRIVATE'}]}
        summary=review_execution_summary({'status':'failed','cases':[{'name':'a','passed':False,'steps':[
            {'index':0,'status':'completed','expected_status':'completed','passed':False,'evidence':evidence}]}]})
        step=summary['cases'][0]['steps'][0]
        self.assertEqual(step['initial_vehicle']['windows'],evidence['initial_vehicle']['windows'])
        self.assertEqual(step['actions'][0]['requested'],{'rr':0})
        self.assertNotIn('PRIVATE',json.dumps(summary))
        self.assertTrue(step['evidence_index'])

    def test_unknown_stage_is_rejected(self):
        with self.assertRaises(ValueError):
            build_stage_context('invented',WorkflowGenerateRequestSchema(prompt='x'),None,{}, {},[])


if __name__=='__main__':unittest.main()
