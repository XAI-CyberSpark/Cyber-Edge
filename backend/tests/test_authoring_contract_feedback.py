"""Executable repair guidance, without weakening validation or choosing models."""
import copy
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from tests.test_authoring_session import session, BRIEF, PATCH
from app.services.hmi_control_contract import CONTROLS, validate_hmi_node, validate_request
from app.services.node_capability_service import CATALOG, validate_capabilities
from app.services.scenario_execution import api_model_binding_errors

class ContractGuidanceTests(unittest.IsolatedAsyncioTestCase):
    def test_capabilities_expose_typed_fields_and_valid_examples_without_mutating_catalog(self):
        before=copy.deepcopy(CATALOG);catalog=session().capabilities()['nodes']['nodes']
        fields=catalog['car_control']['fields']
        self.assertEqual(fields['controlId']['type'],'string')
        self.assertEqual(set(fields['controlId']['enum']),set(CONTROLS))
        for example in catalog['car_control']['configuration_examples']:
            errors,_=validate_capabilities([
                {'id':'input','type':'input','data':{'flowVersion':2}},
                {'id':'sample','type':'car_control','data':example}],
                [{'id':'edge','source':'input','target':'sample'}])
            self.assertEqual(errors,[])
        self.assertEqual(catalog['tool']['fields']['tool_id']['enum'],['music','nav','call_phone','mcp'])
        self.assertIn('providerId',catalog['llm']['fields'])
        self.assertIn('connections',catalog['llm']['fields']['model']['description'])
        self.assertEqual(CATALOG,before)

    def test_hmi_feedback_names_top_level_fields_and_options(self):
        invalid={'executionMode':'hmi','action':{'controlId':'ac.temp','controlValue':22}}
        with self.assertRaisesRegex(ValueError,'set_data.controlId'):validate_hmi_node(invalid)
        with self.assertRaisesRegex(ValueError,'remove_data_keys'):validate_hmi_node({**invalid,'module':'ac'})
        with self.assertRaisesRegex(ValueError,'day.*night.*auto'):validate_request('display.mode','set','invalid')
        with self.assertRaisesRegex(ValueError,'16.*30'):validate_request('ac.temp','set',100)
        with self.assertRaisesRegex(ValueError,'boolean'):validate_request('ac.on','set','true')
        self.assertTrue(validate_hmi_node({'executionMode':'hmi','controlId':'ac.temp','controlValue':22}))
        validate_request('display.mode','set','auto')

    def test_action_and_tool_feedback_keeps_invalid_graph_rejected(self):
        nodes=[{'id':'a','type':'llm','data':{'model':'MiniMax-M3','outputFormat':'text'}},
               {'id':'b','type':'tool','data':{'toolId':'minimax'}}]
        errors,_=validate_capabilities(nodes,[{'id':'e','source':'a','target':'b'}])
        self.assertTrue(any('outputFormat=actions' in e for e in errors))
        self.assertTrue(any('tool_id' in e and 'toolId' in e for e in errors))
        errors,_=validate_capabilities([{'id':'c','type':'car_control','data':{
            'executionMode':'hmi_mock','action':{'action':'ambient_light.set','color':'#ffffff','brightness':30}}}],[])
        self.assertTrue(any('action必须是字符串' in e and 'set_data' in e for e in errors))

    async def test_patch_conflict_feedback_and_repairs_are_atomic(self):
        cases=[
            ({'upsert_nodes':[{'id':'o','set_data':{'name':'a'}},{'id':'o','set_data':{'name':'b'}}]},['o','合并']),
            ({'remove_node_ids':['o'],'upsert_nodes':[{'id':'o','set_data':{'name':'a'}}]},['o','remove_data_keys']),
            ({'remove_edge_ids':['absent']},['absent','oakegde_read_graph']),
            ({'upsert_nodes':[{'id':'new','set_data':{}}]},['new','position','set_data']),
        ]
        for change,words in cases:
            with self.subTest(change=change):
                s=session();s.record_brief(BRIEF);s.patch(PATCH);before=copy.deepcopy(s.read())
                result=await s.invoke('oakegde_patch_graph',{'base_revision':1,**change})
                for word in words:self.assertIn(word,result['error'])
                self.assertEqual(s.read(),before)
                repaired=await s.invoke('oakegde_patch_graph',{'base_revision':1,'upsert_nodes':[{'id':'o','set_data':{'name':'fixed'}}]})
                self.assertNotIn('error',repaired)

    async def test_missing_revision_returns_instruction_not_automatic_revision(self):
        s=session();s.record_brief(BRIEF)
        result=await s.invoke('oakegde_patch_graph',{'upsert_nodes':[]})
        self.assertIn('session_state.revision',result['details'][0]['fix'])
        self.assertEqual(s.revision,0)

    def test_model_binding_feedback_never_fills_or_replaces_model(self):
        nodes=[{'id':'m','type':'llm','data':{'providerId':'minimax','model':'minimax'}}]
        before=copy.deepcopy(nodes)
        with patch('app.services.scenario_execution.model_providers.resolve',side_effect=HTTPException(400,'请输入有效模型ID')):
            errors=api_model_binding_errors(nodes)
        self.assertIn('connections',errors[0]);self.assertIn('providerId',errors[0])
        self.assertEqual(nodes,before)
        missing=[{'id':'m','type':'llm','data':{'providerId':'minimax'}}]
        self.assertTrue(api_model_binding_errors(missing));self.assertNotIn('model',missing[0]['data'])
