import unittest
from unittest.mock import patch
import json
from pathlib import Path
from app.services.inference_service import InferenceService
from app.schemas.inference_schema import ChatRequestSchema
from fastapi import HTTPException
from app.services.node_capability_service import validate_capabilities, CATALOG
from app.services.orchestration_service import OrchestrationService
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema

def node(id, kind, **data): return {'id':id,'type':kind,'data':data}
def edge(source,target,handle=None): return {'id':source+'-'+target,'source':source,'target':target,**({'sourceHandle':handle} if handle else {})}
class CapabilityTests(unittest.TestCase):
    def test_json_repair_configuration_is_strict_and_opt_in(self):
        def errors(value, mode='json'):
            return validate_capabilities(
                [node('i','input'),node('m','llm',model='MiniMax-M3',providerId='minimax',
                    outputFormat=mode,outputFields={'title':'string'},jsonRepairAttempts=value)],
                [edge('i','m')])[0]
        for value in (True, None, '1', -1, 3, 0.5):
            with self.subTest(value=value): self.assertTrue(errors(value))
        for mode in ('text','auto','actions'):
            with self.subTest(mode=mode): self.assertTrue(errors(1, mode))
        for value in (0,1,2):
            with self.subTest(value=value): self.assertEqual(errors(value), [])

    def test_generation_prompt_uses_actual_capabilities(self):
        prompt=OrchestrationService._build_messages(WorkflowGenerateRequestSchema(prompt='雨天关窗'))[0]['content']
        self.assertIn('未实际运行',prompt)
        self.assertIn('missing_capabilities',prompt)
        self.assertIn('sourceHandle="true"',prompt)
        self.assertNotIn('recognition 必须输出 defaultResult',prompt)
    def test_model_instruction_cannot_be_silently_ignored(self):
        for field in ('prompt','promptTemplate'):
            errors,_=validate_capabilities([node('i','input'),node('m','llm',model='test',**{field:'请改写'})],[edge('i','m')])
            self.assertTrue(any('systemPrompt' in error for error in errors))

    def test_duplicate_generated_id_is_rejected(self):
        with self.assertRaises(HTTPException):
            OrchestrationService._normalize_project_payload({'workflow':{'nodes':[node('x','input'),node('x','output')]}},WorkflowGenerateRequestSchema(prompt='test'))
    def test_generated_missing_action_is_not_silently_defaulted_to_close(self):
        p=OrchestrationService._normalize_project_payload({'workflow':{'nodes':[node('i','input'),node('c','car_control')],'edges':[edge('i','c')]}},WorkflowGenerateRequestSchema(prompt='test'))
        self.assertNotIn('action',p.nodes[1]['data'])
        self.assertFalse(OrchestrationService._validate_project(p,'test').passed)
    def test_unknown_tool_and_unsupported_input_block(self):
        for n in [node('x','tool',tool='api_call'),node('x','systemInput',inputType='can'),node('x','memory',type='vector')]:
            errors,_=validate_capabilities([node('i','input'),n],[edge('i','x')]);self.assertTrue(errors)
    def test_valid_window_config_and_branch(self):
        nodes=[node('i','systemInput',inputType='weather'),node('g','logic',condition="input.weather === 'rain'"),node('c','car_control',action='windows',parameter='close_all'),node('o','fallback',responseText='无需操作')]
        edges=[edge('i','g'),edge('g','c','true'),edge('g','o','false')]
        self.assertEqual(validate_capabilities(nodes,edges)[0],[])
        edges[1].pop('sourceHandle');self.assertTrue(validate_capabilities(nodes,edges)[0])
    def test_cycle_and_orphan_are_rejected(self):
        self.assertTrue(validate_capabilities([node('i','input'),node('o','output')],[edge('i','o'),edge('o','i')])[0])
        self.assertTrue(validate_capabilities([node('i','input'),node('o','output')],[])[0])
    def test_inference_offline_never_returns_mock(self):
        request=ChatRequestSchema(model='test-model',messages=[{'role':'user','content':'open windows'}])
        with patch('app.services.inference_service.requests.post',side_effect=ConnectionError('offline')):
            with self.assertRaises(HTTPException) as result: InferenceService.chat_completions(request)
        self.assertEqual(result.exception.status_code,503)
    def test_inference_empty_response_is_failure(self):
        request=ChatRequestSchema(model='test-model',messages=[{'role':'user','content':'hello'}])
        with patch('app.services.inference_service.requests.post') as post:
            post.return_value.json.return_value={'choices':[]}
            with self.assertRaises(HTTPException): InferenceService.chat_completions(request)
    def test_offline_child_template_has_three_real_result_branches(self):
        result=OrchestrationService._generate_local_template(WorkflowGenerateRequestSchema(prompt='创建儿童关怀场景', save_on_success=False))
        self.assertTrue(result.validation.passed, result.validation.errors)
        self.assertFalse(result.used_live_model)
        nodes=result.project.nodes
        self.assertEqual(len(nodes),10)
        self.assertFalse(any(n['type'] in ['risk_monitor','output','car_control'] for n in nodes))
        recognition=next(n['data'] for n in nodes if n['type']=='recognition')
        self.assertEqual(recognition['resultSource'],'vision')
        self.assertNotIn('defaultResult',recognition)
        self.assertEqual(sum(e['target']=='event_log_safety' for e in result.project.edges),3)
        self.assertIn('单张', result.project.meta.get('summary',''))
    def test_child_template_and_saved_contract_agree(self):
        fixture=Path(__file__).resolve().parents[2] / 'studio/tests/fixtures/child-care-contract.json'
        template=Path(__file__).resolve().parents[1] / 'app/services/child_care_template.json'
        if fixture.exists():
            expected=json.loads(fixture.read_text());actual=json.loads(template.read_text())
            for key in ['nodes','edges']: self.assertEqual(actual[key],expected[key])
    def test_saved_child_project_opens_through_typed_api(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.api.projects import router
        from app.schemas.project_schema import ProjectSchema
        project_dir=Path(__file__).resolve().parents[1] / 'projects'
        payload=json.loads((project_dir / '儿童关怀.json').read_text())
        ProjectSchema.model_validate(payload)
        app=FastAPI()
        app.include_router(router, prefix='/v1/projects')
        with patch('app.services.project_service.PROJECTS_DIR', str(project_dir)):
            response=TestClient(app).get('/v1/projects/儿童关怀')
        self.assertEqual(response.status_code,200)
        actual=response.json()
        self.assertIsInstance(actual['updated_at'], (int,float))
        self.assertEqual(actual['nodes'],payload['nodes'])
        self.assertEqual(actual['edges'],payload['edges'])

    def test_shared_catalog_has_image_input(self):
        self.assertIn('image',CATALOG['nodes']['systemInput']['fields']['inputType']['enum'])

    def test_studio_catalog_is_generated_copy_of_backend_source(self):
        # Single source is backend/app/services/node_capabilities.json; the Studio copy is
        # generated by scripts/sync_node_capabilities.py. A missing copy is drift, not a skip.
        root=Path(__file__).resolve().parents[2]
        if not (root/'studio').is_dir():
            self.skipTest('standalone backend checkout without studio/')
        source=root/'backend/app/services/node_capabilities.json'
        frontend=root/'studio/src/data/nodeCapabilities.json'
        self.assertTrue(frontend.exists(),'studio copy missing; run scripts/sync_node_capabilities.py')
        self.assertEqual(frontend.read_bytes(),source.read_bytes(),
                         'studio copy drifted; edit the backend source and run scripts/sync_node_capabilities.py')
if __name__=='__main__':unittest.main()
