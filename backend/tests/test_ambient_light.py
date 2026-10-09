import unittest
from app.services.node_capability_service import validate_capabilities
class AmbientContractTest(unittest.TestCase):
    def graph(self, data):
        return ([{'id':'i','type':'input','data':{}},{'id':'m','type':'llm','data':{'model':'test','outputFormat':'json','outputFields':{'light_color':'string','light_brightness':'number'}}},{'id':'a','type':'car_control','data':data}], [{'source':'i','target':'m'},{'source':'m','target':'a'}])
    def test_explicit_mock_accepts_json(self):
        self.assertEqual(validate_capabilities(*self.graph({'action':'ambient_light.set','executionMode':'hmi_mock'}))[0],[])
    def test_unscoped_and_window_actions_stay_restricted(self):
        for data in [{'action':'ambient_light.set'},{'action':'windows','parameter':'close_all','executionMode':'hmi_mock'},{'action':'ambient_light.set','executionMode':'hmi_mock','module':'unknown'}]:
            self.assertTrue(validate_capabilities(*self.graph(data))[0])
if __name__=='__main__': unittest.main()
