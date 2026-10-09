import copy
import unittest
from app.services.node_capability_service import validate_capabilities
from app.services.hmi_control_contract import validate_request

def graph(value=None, general=True):
    nodes=[{'id':'i','type':'input','data':{'flowVersion':2} if general else {}},
           {'id':'m','type':'llm','data':{'model':'MiniMax-M3','outputFormat':'json','outputFields':{'target':'number'}}},
           {'id':'a','type':'car_control','data':{'executionMode':'hmi','controlId':'ac.temp','controlValue':value if value is not None else {'$ref':'outputs.m.data.target'}}}]
    return nodes,[{'source':'i','target':'m'},{'source':'m','target':'a'}]

class DynamicHmiTests(unittest.TestCase):
    def test_general_json_can_bind_or_read_registered_controls(self):
        for value in ({'$ref':'outputs.m.data.target'},{'$ref':'state.original'},20):
            nodes,edges=graph(value)
            self.assertEqual(validate_capabilities(nodes,edges)[0],[])
        nodes,edges=graph();nodes[-1]['data']['controlOperation']='get'
        self.assertEqual(validate_capabilities(nodes,edges)[0],[])

    def test_invalid_references_controls_modes_and_legacy_still_rejected(self):
        for value in ({'$ref':'state.__proto__'},{'$ref':'outputs.missing.data.target'},{'$ref':'state.x','extra':1},'{{state.x}}',35):
            self.assertTrue(validate_capabilities(*graph(value))[0],str(value))
        self.assertTrue(validate_capabilities(*graph(general=False))[0])
        for patch in ({'controlId':'missing'},{'controlOperation':'subscribe'},{'module':'vehicleControl'}):
            nodes,edges=graph();nodes[-1]['data'].update(patch)
            self.assertTrue(validate_capabilities(nodes,edges)[0],str(patch))
        nodes,edges=graph();nodes[1]['data']['outputFormat']='text'
        self.assertTrue(validate_capabilities(nodes,edges)[0])

    def test_runtime_request_validator_never_accepts_unresolved_or_invalid_values(self):
        for value in ({'$ref':'state.target'},None,'20',False,15,31,20.5,float('inf')):
            with self.subTest(value=value),self.assertRaises(ValueError):validate_request('ac.temp','set',value)
        validate_request('ac.temp','set',20)

