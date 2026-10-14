"""Project catalog fields into the model-facing, partial node-data patch schema."""
import copy
import json

from app.services.node_capability_service import CATALOG
from app.services.hmi_control_contract import CONTROLS


VALUE_REFERENCE_SCHEMA = {
    'type': 'object', 'properties': {'$ref': {'type': 'string'}},
    'required': ['$ref'], 'additionalProperties': False,
}


def _field_groups(catalog):
    groups = {}
    sources = {'common': {'fields': catalog['common_fields']}, **catalog['nodes']}
    for kind, node in sources.items():
        for name, field in node['fields'].items():
            groups.setdefault(name, []).append((kind, field))
    return groups


def field_conflicts(catalog=None):
    """Do not choose one node's type/enum/binding policy for another node."""
    result = {}
    for name, fields in _field_groups(CATALOG if catalog is None else catalog).items():
        signatures = {
            json.dumps({k: field.get(k) for k in ('type', 'items', 'enum', 'bindable', 'forbidden')}, sort_keys=True)
            for _, field in fields
        }
        if len(signatures) > 1:
            result[name] = fields
    return result


def patch_data_schema(catalog=None):
    full_registry = catalog is None
    catalog = CATALOG if catalog is None else catalog
    conflicts = field_conflicts(catalog)
    properties = {}
    for name, fields in _field_groups(catalog).items():
        descriptions = [f"{kind}: {field.get('description', field.get('label', name))}" for kind, field in fields]
        if name in conflicts:
            contracts = [f"{kind}: " + json.dumps({k: field.get(k) for k in ('type', 'enum', 'bindable', 'forbidden')}, ensure_ascii=False)
                         for kind, field in fields]
            properties[name] = {'description': '跨节点字段契约冲突，按节点类型查能力目录；此处不限定类型。' + '; '.join(contracts + descriptions)}
            continue
        field = fields[0][1]
        if field.get('forbidden'):
            continue
        literal = {key: copy.deepcopy(field[key]) for key in ('type', 'items', 'enum') if field.get(key) is not None}
        if field.get('enum_source') == 'hmi_controls':
            controls = CONTROLS if full_registry else catalog.get('nodes', {}).get('car_control', {}).get('hmi_controls', {})
            literal['enum'] = list(controls)
        prop = {'anyOf': [literal, copy.deepcopy(VALUE_REFERENCE_SCHEMA)]} if field['bindable'] else literal
        prop['description'] = '; '.join(descriptions)
        properties[name] = prop
    # Partial patches neither require every node field nor discard extension data.
    return {'type': 'object', 'properties': properties, 'additionalProperties': True}


def add_patch_data_schema(schema):
    """Pydantic JSON Schema callback; does not validate or transform arguments."""
    schema.update(patch_data_schema())
