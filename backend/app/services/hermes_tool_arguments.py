"""Restore Hermes' sanitized reference key at our tool boundary, not in the SDK."""


def restore_reference_objects(arguments):
    count = 0
    def walk(value):
        nonlocal count
        if isinstance(value, list):
            return [walk(item) for item in value]
        if isinstance(value, dict):
            if set(value) == {'_ref'} and isinstance(value['_ref'], str):
                count += 1
                return {'$ref': value['_ref']}
            return {key: walk(item) for key, item in value.items()}
        return value
    restored = walk(arguments)
    return restored, count


async def invoke_hermes_tool(session, name, arguments):
    restored, count = restore_reference_objects(arguments)
    from app.services.scenario_builder import inline_schema
    tool=next((t for t in session.tools() if t[0]==name),None)
    schema=inline_schema(tool[2].model_json_schema()) if tool else {}
    normalized,notes=normalize_arguments(restored,schema,patch_root=name=='oakegde_patch_graph')
    return await session.invoke(name, normalized, reference_restorations=count, normalizations=notes)


def _matches(value, schema):
    """Fail-closed check of the generated tool-schema vocabulary (no coercion).

    This guard authorizes unwrapping only; it is not the graph validator.
    Unknown validation keywords decline normalization instead of assuming valid.
    """
    import math
    import re
    if isinstance(schema,bool):return schema
    known={'title','description','default','examples','type','properties','required','additionalProperties','items','anyOf','enum','const','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','pattern'}
    if set(schema)-known:return False
    if 'anyOf' in schema and not any(_matches(value,s) for s in schema['anyOf']):return False
    kinds=schema.get('type');kinds=[kinds] if isinstance(kinds,str) else kinds
    tests={'object':lambda:isinstance(value,dict),'array':lambda:isinstance(value,list),
           'string':lambda:isinstance(value,str),'boolean':lambda:type(value) is bool,
           'integer':lambda:type(value) in (int,float) and math.isfinite(value) and value==int(value),
           'number':lambda:type(value) in (int,float) and math.isfinite(value),'null':lambda:value is None}
    if kinds and not any(tests.get(k,lambda:False)() for k in kinds):return False
    if 'enum' in schema and not any(type(value) is type(v) and value==v for v in schema['enum']):return False
    if 'const' in schema and (type(value) is not type(schema['const']) or value!=schema['const']):return False
    if isinstance(value,dict):
        if any(k not in value for k in schema.get('required',[])):return False
        props=schema.get('properties',{});extra=schema.get('additionalProperties',True)
        if any(not _matches(v,props.get(k,extra)) for k,v in value.items()):return False
    if isinstance(value,list):
        if not schema.get('minItems',0)<=len(value)<=schema.get('maxItems',float('inf')):return False
        if any(not _matches(v,schema.get('items',{})) for v in value):return False
    if isinstance(value,str):
        if not schema.get('minLength',0)<=len(value)<=schema.get('maxLength',float('inf')):return False
        if 'pattern' in schema and not re.search(schema['pattern'],value):return False
    if type(value) in (int,float):
        if not math.isfinite(value):return False
        for key,ok in [('minimum',lambda n:value>=n),('maximum',lambda n:value<=n),('exclusiveMinimum',lambda n:value>n),('exclusiveMaximum',lambda n:value<n)]:
            if key in schema and not ok(schema[key]):return False
    return True


def normalize_arguments(arguments, schema, *, patch_root=False):
    """Unwrap only singleton provider wrappers with a schema-proven literal type."""
    import copy
    from decimal import Decimal, InvalidOperation
    notes=[]
    def branches(spec):
        return [b for child in spec.get('anyOf',[spec]) for b in (branches(child) if 'anyOf' in child else [child])]
    def convert(value, spec):
        types=spec.get('type',[]);types=[types] if isinstance(types,str) else types
        literal=[t for t in types if t in ('array','string','number','integer','boolean')]
        if not literal:return False,value
        if _matches(value,spec):return True,value
        if isinstance(value,str):
            candidates=[]
            for kind in literal:
                try:
                    if kind=='boolean' and value in ('true','false'):candidate=value=='true'
                    elif kind in ('integer','number'):
                        decimal=Decimal(value)
                        if not decimal.is_finite():continue
                        candidate=int(decimal) if decimal==decimal.to_integral_value() else float(decimal)
                        if Decimal(str(candidate))!=decimal:continue
                    else:continue
                    if _matches(candidate,spec):candidates.append(candidate)
                except (ValueError,OverflowError,InvalidOperation):continue
            if candidates and all(type(c) is type(candidates[0]) and c==candidates[0] for c in candidates):return True,candidates[0]
        return False,value
    def walk(value,spec,path):
        if not isinstance(spec,dict):return copy.deepcopy(value)
        options=branches(spec)
        if isinstance(value,dict) and len(value)==1 and next(iter(value)) in ('item','$text'):
            inner=next(iter(value.values()))
            # Top-level object unwrapping is intentionally only a patch operation.
            if path=='$' and patch_root and set(value)=={'item'} and _matches(inner,spec):
                notes.append({'path':path,'original':copy.deepcopy(value),'normalized':copy.deepcopy(inner)})
                value=inner
            else:
                candidates=[v for option in options for ok,v in [convert(inner,option)] if ok]
                if candidates and all(type(v) is type(candidates[0]) and v==candidates[0] for v in candidates) and _matches(candidates[0],spec):
                    notes.append({'path':path,'original':copy.deepcopy(value),'normalized':copy.deepcopy(candidates[0])})
                    value=candidates[0]
        if isinstance(value,dict):
            result={}
            for key,item in value.items():
                child_specs=[o['properties'][key] for o in options if key in o.get('properties',{})]
                # Conflicting union paths never choose one alternative by guesswork.
                child=child_specs[0] if child_specs and all(s==child_specs[0] for s in child_specs) else {}
                result[key]=walk(item,child,path+'.'+key)
            return result
        if isinstance(value,list):
            child_specs=[o['items'] for o in options if isinstance(o.get('items'),dict)]
            child=child_specs[0] if child_specs and all(s==child_specs[0] for s in child_specs) else {}
            return [walk(v,child,f'{path}.{i}') for i,v in enumerate(value)]
        return copy.deepcopy(value)
    return walk(arguments,schema,'$'),notes
