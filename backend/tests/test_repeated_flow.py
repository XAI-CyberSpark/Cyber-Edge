import unittest
from app.services.node_capability_service import validate_capabilities
from app.services.flow_loops import repeated_wait_back_edges

def n(id,kind,**data):return {'id':id,'type':kind,'data':data}
def e(a,b,port=None):return {'id':a+b+(port or ''),'source':a,'target':b,**({'sourceHandle':port} if port else {})}
def graph():
    return [n('i','input',flowVersion=2),n('w','wait',eventName='message',repeat=True),n('q','logic',condition="input.text==='end'"),n('a','state',increments={'count':1}),n('o','output')],[e('i','w'),e('w','q'),e('q','a','false'),e('a','w'),e('q','o','true')]

class RepeatedFlow(unittest.TestCase):
    def test_return_edge_not_required_for_first_entry_and_default_dag_unchanged(self):
        nodes,edges=graph();self.assertEqual(repeated_wait_back_edges(nodes,edges),{3})
        self.assertEqual(validate_capabilities(nodes,edges)[0],[])
        nodes[1]['data']['repeat']=False
        self.assertTrue(any('环路' in s for s in validate_capabilities(nodes,edges)[0]))
        self.assertEqual(validate_capabilities(nodes,[e for i,e in enumerate(edges) if i!=3])[0],[])
    def test_cycle_bypassing_wait_and_secondary_entry_rejected(self):
        nodes,edges=graph();edges.append(e('i','a'));nodes[3]['data']['joinMode']='all'
        self.assertEqual(repeated_wait_back_edges(nodes,edges),set())
        self.assertTrue(any('环路' in s for s in validate_capabilities(nodes,edges)[0]))
    def test_nested_natural_waits_have_separate_back_edges(self):
        nodes=[n('i','input',flowVersion=2),n('outer','wait',eventName='message',repeat=True),n('inner','wait',eventName='message',repeat=True),n('a','state'),n('b','state')]
        edges=[e('i','outer'),e('outer','inner'),e('inner','a'),e('a','inner'),e('a','b'),e('b','outer')]
        self.assertEqual(repeated_wait_back_edges(nodes,edges),{3,5})
        self.assertEqual(validate_capabilities(nodes,edges)[0],[])
    def test_repeat_fields_are_typed_and_budgets_are_finite(self):
        nodes,edges=graph()
        for bad in ['true',1,None]:
            nodes[1]['data']['repeat']=bad
            self.assertTrue(any('repeat需要' in s for s in validate_capabilities(nodes,edges)[0]))
        nodes[1]['data']['repeat']=True
        for bad in [0,-1,1.5,True,100001,'10']:
            nodes[1]['data']['maxIterations']=bad
            self.assertTrue(any('maxIterations' in s for s in validate_capabilities(nodes,edges)[0]))
