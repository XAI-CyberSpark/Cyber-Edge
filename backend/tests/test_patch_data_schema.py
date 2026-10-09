"""Model-facing patch fields come from the catalog, never scenario-specific literals."""
import copy
import unittest
from jsonschema import Draft202012Validator, ValidationError as SchemaError
from app.services.authoring_session import GraphPatch
from app.services.node_capability_service import CATALOG
from app.services.scenario_builder import inline_schema


def data_schema():
    return inline_schema(GraphPatch.model_json_schema())['properties']['upsert_nodes']['items']['properties']['set_data']


class PatchDataSchemaTests(unittest.TestCase):
    def test_arrays_have_items_and_reject_item_envelopes(self):
        schema=data_schema();props=schema.get('properties',{})
        self.assertIn('aliases',props)
        self.assertEqual(props['aliases']['type'],'array')
        self.assertEqual(props['aliases']['items'],{'type':'string'})
        validator=Draft202012Validator(schema)
        validator.validate({'aliases':['example'],'answers':['yes'],'hintInputs':['help']})
        for bad in ({'item':['example']},[1],'<item>example</item>'):
            with self.subTest(bad=bad),self.assertRaises(SchemaError):validator.validate({'aliases':bad})

    def test_binding_branch_is_exact_and_expands_literal_ref_property(self):
        schema=data_schema();control=schema.get('properties',{}).get('controlValue',{})
        self.assertIn('anyOf',control)
        reference=next(x for x in control['anyOf'] if x.get('properties',{}).get('$ref'))
        self.assertEqual(reference,{'type':'object','properties':{'$ref':{'type':'string'}},'required':['$ref'],'additionalProperties':False})
        validator=Draft202012Validator(reference)
        validator.validate({'$ref':'state.temperature'})
        for invalid in ({'$ref':22},{'_ref':'state.x'},{'$ref':'state.x','item':1},'<$ref>state.x</$ref>'):
            with self.assertRaises(SchemaError):validator.validate(invalid)
        Draft202012Validator(schema).validate({'controlValue':{'$ref':'state.temperature'},'brightness':30})
        Draft202012Validator.check_schema(inline_schema(GraphPatch.model_json_schema()))

    def test_conflicting_fields_only_describe_node_specific_contracts(self):
        props=data_schema().get('properties',{})
        for key in ('prompt','inputType','type'):
            self.assertIn(key,props)
            self.assertEqual(set(props[key]),{'description'})
            self.assertIn('冲突',props[key]['description'])
        self.assertIn('wait',props['inputType']['description']);self.assertIn('systemInput',props['inputType']['description'])

    def test_generated_properties_follow_catalog_changes_without_handwritten_map(self):
        from app.services.node_data_schema import patch_data_schema, field_conflicts
        changed=copy.deepcopy(CATALOG)
        changed['nodes']['output']['fields']['custom_array']={'type':'array','items':{'type':'integer'},'enum':None,'required':False,'example':[1],'bindable':False}
        generated=patch_data_schema(changed)
        self.assertEqual(generated['properties']['custom_array']['items'],{'type':'integer'})
        self.assertEqual(set(field_conflicts()),{'prompt','inputType','type'})
        self.assertNotIn('required',generated)  # A patch can update only one field.

    def test_catalog_types_enums_items_and_binding_flags_match_all_properties(self):
        from app.services.node_data_schema import patch_data_schema,field_conflicts
        schema=patch_data_schema();conflicts=field_conflicts();expected=set()
        for spec in [*CATALOG['common_fields'].values(),*[f for n in CATALOG['nodes'].values() for f in n['fields'].values()]]:
            self.assertIsInstance(spec['bindable'],bool)
            if 'array' in (spec['type'] if isinstance(spec['type'],list) else [spec['type']]):self.assertIn('items',spec)
        groups={'common':{'fields':CATALOG['common_fields']},**CATALOG['nodes']}
        for kind,node in groups.items():
            for key,field in node['fields'].items():
                if field.get('forbidden') and key not in conflicts:continue
                expected.add(key)
                if key in conflicts:continue
                prop=schema['properties'][key]
                literal=prop['anyOf'][0] if field['bindable'] else prop
                self.assertEqual(literal['type'],field['type'],(kind,key))
                self.assertEqual(literal.get('enum'),field.get('enum'),(kind,key))
                if 'items' in field:self.assertEqual(literal['items'],field['items'],(kind,key))
        self.assertEqual(set(schema['properties']),expected)

    def test_schema_projection_does_not_unwrap_or_rewrite_arguments(self):
        from tests.test_authoring_session import session,BRIEF,PATCH
        s=session();s.record_brief(BRIEF);s.patch(PATCH)
        payload={'aliases':{'item':['example']}}
        s.patch({'base_revision':1,'upsert_nodes':[{'id':'i','set_data':payload}]})
        self.assertEqual(s.project.nodes[0]['data']['aliases'],payload['aliases'])
