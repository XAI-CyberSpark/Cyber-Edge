import unittest
import copy
import json
from app.services.flow_contract import validate_flow, FLOW_INSTRUCTIONS
from app.services.scenario_builder import ScenarioBuilder, WorkflowDraft, GENERAL_BUILD_INSTRUCTIONS
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.orchestration_service import OrchestrationService as Legacy


def draft():
    return {'project_name':'配置测试','summary':'能力组合','workflow':{'nodes':[
        {'id':'i','type':'input','position':{'x':0,'y':0},'data':{'flowVersion':2}},
        {'id':'g','type':'stage','position':{'x':300,'y':0},'style':{'width':700,'height':500},'data':{'label':'阶段'}},
        {'id':'w','type':'wait','parentId':'g','extent':'parent','position':{'x':40,'y':80},'data':{'eventName':'custom','match':'any'}},
        {'id':'m','type':'llm','position':{'x':1000,'y':0},'data':{'model':'independent-model','providerId':'minimax','outputFormat':'text'}},
        {'id':'o','type':'output','position':{'x':1400,'y':0},'data':{}}],
        'edges':[{'id':'iw','source':'i','target':'w'},{'id':'wm','source':'w','target':'m','targetHandle':'question'},{'id':'mo','source':'m','target':'o'}],'meta':{}},
        'requirement_coverage':[{'requirement_id':'R1','status':'implemented','node_ids':['w','o'],'note':'可恢复事件'}]}

class ContractTests(unittest.TestCase):
    def test_schema_and_normalizer_preserve_group_ports_models(self):
        d=WorkflowDraft.model_validate(draft()).model_dump(exclude_none=True)
        p=Legacy._normalize_project_payload(d,WorkflowGenerateRequestSchema(prompt='test'))
        self.assertEqual(p.nodes[2]['parentId'],'g')
        self.assertEqual(p.edges[1]['targetHandle'],'question')
        self.assertEqual(p.nodes[3]['data']['model'],'independent-model')
        self.assertEqual(validate_flow(p.nodes,p.edges),[])

    def test_hmi_control_does_not_require_legacy_action(self):
        from app.schemas.project_schema import ProjectSchema
        p=ProjectSchema(id='hmi',name='hmi',nodes=[
            {'id':'i','type':'input','data':{'flowVersion':2}},
            {'id':'a','type':'car_control','data':{'executionMode':'hmi','controlId':'ac.temp','controlValue':24}}],
            edges=[{'id':'e','source':'i','target':'a'}])
        self.assertTrue(Legacy._validate_project(p,'设置温度').passed)

    def test_join_requires_policy_and_stage_cannot_execute(self):
        d=draft()['workflow'];d['edges'].append({'source':'i','target':'m'})
        self.assertTrue(any('汇合' in e for e in validate_flow(d['nodes'],d['edges'])))
        d['nodes'][3]['data']['joinMode']='any'
        self.assertEqual(validate_flow(d['nodes'],d['edges']),[])
        d['edges'].append({'source':'g','target':'o'})
        self.assertTrue(any('容器' in e for e in validate_flow(d['nodes'],d['edges'])))

class BuilderTests(unittest.IsolatedAsyncioTestCase):
    async def test_main_builder_uses_graph_contract_and_preserves_execution_model(self):
        brief={'title':'测试','goal':'测试','requirements':[{'id':'R1','description':'等待输入','acceptance':'继续','source_quote':'测试'}],'experience_outline':['等待','回答'],'assumptions':[],'questions':[]}
        outputs=[brief,draft(),{'issues':[],'strengths':[]}];messages=[]
        async def complete(m):messages.append(copy.deepcopy(m));return json.dumps(outputs.pop(0),ensure_ascii=False)
        async def execute(_project,_plan):return {'status':'passed','runtime_verified':True,'scope':'injected-test-adapter'}
        outputs[1]['execution_plan']={'cases':[{'name':'结构测试','steps':[{'input':'start','assertions':[{'path':['run','status'],'op':'exists'}]}]}]}
        events=[e async for e in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='测试'),complete,executor=execute).events()]
        result=next(v for k,v in events if k=='result')
        self.assertIn(GENERAL_BUILD_INSTRUCTIONS,messages[1][0]['content'])
        self.assertIn(FLOW_INSTRUCTIONS,messages[1][0]['content'])
        project=result['project']
        self.assertEqual(len(project['nodes']),5)
        self.assertEqual(next(n for n in project['nodes'] if n['id']=='m')['data']['model'],'independent-model')
        self.assertTrue(result['build_report']['can_apply'],result['build_report'])
        self.assertTrue(result['build_report']['runtime_verified'])
        self.assertEqual(result['build_report']['execution']['scope'],'injected-test-adapter')

class WaitConflictTests(unittest.TestCase):
    def test_answer_and_hint_command_overlap_is_rejected(self):
        from app.services.flow_contract import validate_flow
        errors=validate_flow([{'id':'w','type':'wait','data':{'eventName':'message','match':'exact','answers':['结束'],'hintInputs':['结束！']}}],[])
        self.assertTrue(any('hintInputs' in error for error in errors))

class InputModalityTests(unittest.TestCase):
    def test_wait_modality_contract_has_no_scenario_specific_values(self):
        n={'id':'w','type':'wait','data':{'eventName':'message','inputType':'image'}}
        self.assertEqual(validate_flow([n],[]),[])
        for value in ['text','any']:
            n['data']['inputType']=value;self.assertEqual(validate_flow([n],[]),[])
        n['data']['inputType']='selfie'
        self.assertTrue(any('any/text/image' in e for e in validate_flow([n],[])))

    def test_json_field_error_explains_mapping_instead_of_repeating_generic_failure(self):
        from app.services.node_capability_service import validate_capabilities
        nodes=[{'id':'i','type':'input','data':{'flowVersion':2}},{'id':'m','type':'llm','data':{'model':'test','outputFormat':'json','outputFields':['summary']}}]
        errors,_=validate_capabilities(nodes,[{'id':'im','source':'i','target':'m'}])
        self.assertTrue(any('不是字段名数组' in e and 'string' in e for e in errors))

    def test_ambient_parameters_do_not_accept_upstream_field_names_as_node_config(self):
        from app.services.node_capability_service import validate_capabilities
        nodes=[{'id':'i','type':'input','data':{'flowVersion':2}},{'id':'a','type':'car_control','data':{'executionMode':'hmi_mock','action':'ambient_light.set','light_color':'#123456','light_brightness':40}}]
        errors,_=validate_capabilities(nodes,[{'id':'ia','source':'i','target':'a'}])
        self.assertTrue(any('仅用于上游input.data' in e for e in errors))
        nodes[1]['data']={'executionMode':'hmi_mock','action':'ambient_light.set','color':{'$ref':'input.data.color'},'brightness':40}
        self.assertEqual(validate_capabilities(nodes,[{'id':'ia','source':'i','target':'a'}])[0],[])
