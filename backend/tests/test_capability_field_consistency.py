"""Inventory validator data reads against the canonical authoring catalog.

AST finds literal reads (including loop/membership keys and nested node.data).
The explicit ownership table records semantics rather than guessing from prose.
Delegated validators of nested values are outside this top-level field contract.
"""
import ast
import copy
from pathlib import Path
import unittest
from app.services.node_capability_service import CATALOG, authoring_catalog, validate_capabilities
from app.services.flow_contract import validate_flow
from app.services.scenario_builder import inspect_candidate
from tests.test_authoring_session import session, BRIEF, PATCH

SERVICE = Path(__file__).parents[1] / 'app/services'
COMMON = set('label flowVersion designOnly displayDelayMs joinMode eventBudget executionBudget'.split())
OWNERS = {
 'input': 'inputFormat outputFields aliases', 'systemInput': 'aliases',
 'llm': 'prompt promptTemplate jsonRepairAttempts outputFormat outputFields',
 'interaction': 'plan', 'video_display': 'source streamUrl',
 'logic': 'logic_type type condition script',
 'tool': 'tool_id tool',
 'car_control': 'executionMode action module signalKey function device_type area targetStatus parameter light_color light_brightness light_reason pose_tips valueField controlOperation controlId controlValue level',
 'recognition': 'resultSource',
 'wait': 'repeat maxIterations inputType eventName match answers hintInputs aliases storeAs',
 'state': 'values increments',
}


def data_receiver(expr):
    if isinstance(expr, ast.Name): return expr.id in ('data', 'd')
    if isinstance(expr, ast.BoolOp): return any(data_receiver(v) for v in expr.values)
    return (isinstance(expr, ast.Call) and isinstance(expr.func, ast.Attribute)
            and expr.func.attr == 'get' and expr.args and isinstance(expr.args[0], ast.Constant)
            and expr.args[0].value == 'data')


def validator_reads(source):
    tree = ast.parse(source)
    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    found = set()
    def key(expr, at):
        if isinstance(expr, ast.Constant) and isinstance(expr.value, str): return [expr.value]
        if isinstance(expr, ast.Name):
            # Resolve the enclosing literal for-loop or comprehension, never arbitrary globals.
            ancestor = at
            while ancestor in parents:
                ancestor = parents[ancestor]
                loops = [ancestor] if isinstance(ancestor, ast.For) else getattr(ancestor, 'generators', [])
                for loop in loops:
                    if isinstance(loop.target, ast.Name) and loop.target.id == expr.id and isinstance(loop.iter, (ast.Tuple, ast.List)):
                        return [v.value for v in loop.iter.elts if isinstance(v, ast.Constant)]
                    if isinstance(loop.target, ast.Tuple) and expr.id == 'key' and ast.unparse(loop.iter) == "spec['fields'].items()":
                        return []  # Catalog-driven iteration: metadata is checked separately below.
        raise AssertionError(f'Unmapped dynamic data read line {at.lineno}: {ast.unparse(expr)}')
    for item in ast.walk(tree):
        if isinstance(item, ast.Call) and isinstance(item.func, ast.Attribute) and item.func.attr == 'get' and data_receiver(item.func.value):
            found.update(key(item.args[0], item))
        if isinstance(item, ast.Subscript) and data_receiver(item.value): found.update(key(item.slice, item))
        if isinstance(item, ast.Compare) and any(isinstance(op, (ast.In, ast.NotIn)) for op in item.ops) and any(data_receiver(c) for c in item.comparators):
            found.update(key(item.left, item))
    return found


class FieldConsistencyTests(unittest.TestCase):
    def test_all_validator_reads_are_declared(self):
        reads=set()
        for name in ('node_capability_service.py','flow_contract.py','hmi_control_contract.py'):
            reads |= validator_reads((SERVICE / name).read_text())
        mapped=COMMON | {f for fields in OWNERS.values() for f in fields.split()}
        self.assertFalse(reads-mapped, f'Add ownership for new validator reads: {sorted(reads-mapped)}')
        missing=[]
        common=CATALOG.get('common_fields',{})
        for f in sorted(COMMON & reads):
            if f not in common: missing.append(f'common_fields.{f}')
        for kind,fields in OWNERS.items():
            for f in fields.split():
                if f in reads and f not in CATALOG['nodes'][kind]['fields']:
                    missing.append(f'{kind}.fields.{f}')
        self.assertEqual(missing,[], 'Undeclared validator fields:\n'+'\n'.join(missing))

    def test_scanner_covers_loops_nested_and_membership(self):
        code="""
for f in ('one','two'):
    if f in d: x=d[f]
a=node.get('data',{}).get('three')
b=(node.get('data') or {}).get('four')
if 'five' in data: c=data.get('six')
"""
        self.assertEqual(validator_reads(code),set('one two three four five six'.split()))
        with self.assertRaisesRegex(AssertionError,'Unmapped'):validator_reads('data.get(unknown)')

    def test_metadata_has_types_options_required_and_legal_examples(self):
        problems=[]
        types={'string':lambda v:isinstance(v,str), 'number':lambda v:type(v) in (int,float),
               'integer':lambda v:type(v) is int,'boolean':lambda v:type(v) is bool,
               'object':lambda v:isinstance(v,dict),'array':lambda v:isinstance(v,list),
               'null':lambda v:v is None}
        groups={'common':CATALOG.get('common_fields',{}),**{k:v['fields'] for k,v in CATALOG['nodes'].items()}}
        for group,fields in groups.items():
            for name,spec in fields.items():
                label=f'{group}.{name}'
                absent=set(('type','enum','required','example'))-spec.keys()
                if absent: problems.append(f'{label}: missing {sorted(absent)}');continue
                self.assertIsInstance(spec['required'],bool,label)
                if spec.get('forbidden'):
                    self.assertEqual(spec['enum'],[],label)
                    self.assertTrue(spec.get('replacement_example'),label)
                    continue  # No legal value: show a legal replacement rather than advertise unsupported input.
                kinds=spec['type'] if isinstance(spec['type'],list) else [spec['type']]
                self.assertTrue(any(types[k](spec['example']) for k in kinds),label)
                if spec['enum'] is not None:self.assertIn(spec['example'],spec['enum'],label)
                if 'min' in spec:self.assertGreaterEqual(spec['example'],spec['min'],label)
                if 'max' in spec:self.assertLessEqual(spec['example'],spec['max'],label)
        self.assertEqual(problems,[], '\n'.join(problems))

    def test_authoring_uses_canonical_fields_and_shared_join(self):
        catalog=authoring_catalog()
        for k,spec in CATALOG['nodes'].items():self.assertEqual(catalog['nodes'][k]['fields'],spec['fields'],k)
        self.assertEqual(catalog['common_fields']['joinMode']['enum'],['all','any'])
        for spec in catalog['nodes'].values():self.assertNotIn('joinMode',spec['fields'])
        for kind in ('output','tts'):self.assertEqual(catalog['nodes'][kind]['fields']['responseText']['example'],'已完成')

    def test_registry_and_priority_examples_pass_real_validators(self):
        from app.services.hmi_control_contract import CONTROLS
        self.assertEqual(set(CATALOG['nodes']['car_control']['fields']['controlId']['enum']),set(CONTROLS))
        self.assertEqual(CATALOG['nodes']['car_control']['hmi_controls'],{
            k:{key:value for key,value in spec.items() if key in ('type','min','max','step','options','format')}
            for k,spec in CONTROLS.items()})
        examples={
            'logic':{'logic_type':'if','condition':'input.confidence >= 0.8'},
            'car_control':{'executionMode':'hmi','controlId':'ac.temp','controlOperation':'set','controlValue':22},
            'tool':{'tool_id':'music'},'output':{'responseText':'已完成'},'tts':{'responseText':'已完成'},
            'interaction':{'plan':CATALOG['nodes']['interaction']['fields']['plan']['example']},
            'wait':{'eventName':'message','match':'exact','answers':['确认'],'hintInputs':['提示'],'repeat':False},
            'state':{'values':{'ready':False},'increments':{'count':1}},
        }
        for kind,data in examples.items():
            with self.subTest(kind=kind):
                for key,value in data.items():self.assertIn(key,CATALOG['nodes'][kind]['fields'])
                errors,_=validate_capabilities([
                    {'id':'i','type':'input','data':{'flowVersion':2}}, {'id':'sample','type':kind,'data':data}],
                    [{'id':'edge','source':'i','target':'sample'}])
                self.assertEqual(errors,[])

    def test_errors_identify_value_field_edges_and_legacy_logic(self):
        def graph(data):return [{'id':'i','type':'input','data':{'flowVersion':2}}, {'id':'logic_x','type':'logic','data':data}]
        edges=[{'id':'entry_a','source':'i','target':'logic_x','targetHandle':'a'}, {'id':'entry_b','source':'i','target':'logic_x','targetHandle':'b'}]
        errors,_=validate_capabilities(graph({'logic_type':'switch','condition':'true'}),edges)
        self.assertTrue(any("logic_x 的 logic_type 收到 'switch'，可选 if/filter" in e for e in errors),errors)
        self.assertTrue(any(all(x in e for x in ('entry_a','entry_b','data.joinMode')) for e in errors),errors)
        for data in ({'logic_type':'if','type':'ignored'}, {'type':'if'}, {'logic_type':'filter'}):
            errors,_=validate_capabilities(graph({**data,'condition':'true','joinMode':'any'}),edges)
            self.assertEqual(errors,[],errors)
        errors=validate_flow(graph({'logic_type':'if','condition':'true','joinMode':'bad'}),edges)
        self.assertTrue(any("'bad'" in e and 'data.joinMode' in e for e in errors))

    def test_patch_warns_without_rewriting_coverage_and_inspection_names_missing_ids(self):
        for rename in (False,True):
            s=session();s.record_brief(BRIEF);s.patch(PATCH)
            before=copy.deepcopy(s.coverage)
            edit={'base_revision':1,'remove_node_ids':['o']}
            if rename:edit['upsert_nodes']=[{'id':'new_o','type':'output','position':{'x':200,'y':0},'set_data':{'responseText':'完成'}}]
            result=s.patch(edit)
            self.assertEqual(s.coverage,before)
            warning=result['warnings'][0]
            self.assertEqual(warning['requirement_id'],'R1');self.assertEqual(warning['missing_node_ids'],['o'])
            errors,_,_=inspect_candidate(s.project,s.brief,[c.model_dump() for c in s.coverage.values()])
            self.assertTrue(any('R1' in e and "['o']" in e for e in errors),errors)
        s=session();s.record_brief(BRIEF);s.patch(PATCH)
        result=s.patch({'base_revision':1,'remove_node_ids':['o'],'coverage':[{'requirement_id':'R1','status':'missing','node_ids':[],'note':'能力暂缺'}]})
        self.assertEqual(result['warnings'],[])
