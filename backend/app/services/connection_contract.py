"""Catalog-derived output lineage diagnostics, shared by patch and inspect."""
import json
from pathlib import Path

CATALOG=json.loads(Path(__file__).with_name('node_capabilities.json').read_text())
RULES=CATALOG['connection_contract']
CONTROLS=json.loads(Path(__file__).with_name('hmi_controls.json').read_text())

def connection_diagnostics(nodes,edges):
    by_id={n['id']:n for n in nodes};result=[]
    def refs(value):
        if isinstance(value,dict):
            if isinstance(value.get('$ref'),str):yield value['$ref']
            for v in value.values():yield from refs(v)
        elif isinstance(value,list):
            for v in value:yield from refs(v)
    for source in nodes:
        producer=RULES['producers'].get(source.get('type'))
        if not producer:continue
        data=source.get('data') or {};fmt=data.get(producer['format_field'],producer['default'])
        if fmt not in producer['formats']:continue
        actual={**producer['formats'][fmt]['shape']}
        if fmt=='json':actual['data']=data.get('outputFields',{})
        pending=[(source['id'],[])];seen=set()
        while pending:
            current,path=pending.pop(0)
            if current in seen:continue
            seen.add(current)
            for index,edge in enumerate(edges):
                if edge.get('source')!=current or edge.get('sourceHandle')=='error':continue
                target=by_id.get(edge.get('target'))
                if not target:continue
                td=target.get('data') or {};kind=target.get('type')
                route=path+[{'source':current,'edge_id':edge.get('id') or f'edges[{index}]','target':target['id'],'source_handle':edge.get('sourceHandle'),'target_handle':edge.get('targetHandle')}]
                consumer=None
                if kind=='tool':consumer='mcp' if (td.get('tool_id') or td.get('tool'))=='mcp' else 'ordinary'
                if kind=='car_control':consumer='hmi' if td.get('executionMode')=='hmi' else 'ambient' if td.get('executionMode')=='hmi_mock' and td.get('action') in ('ambient_light.set','ambient_light.restore') else 'ordinary'
                problems=[]
                if consumer:
                    spec=RULES['consumers'][consumer]
                    if fmt not in spec['accepts']:problems.append(f'输出 {fmt} 不提供所需动作协议')
                    bindings=list(refs(td.get('arguments') if consumer=='mcp' else td.get('controlValue')))
                    if consumer=='hmi' and td.get('valueField'):bindings.append('input.data.'+str(td['valueField']))
                    for ref in bindings:
                        prefix=next((p for p in ('input.',f"outputs.{source['id']}.") if ref.startswith(p)),None)
                        if not prefix:continue
                        parts=ref[len(prefix):].split('.');root=parts[0]
                        # input refers to the immediate predecessor. A merging node
                        # may add fields; only prove missing fields on direct edges.
                        direct=len(route)==1 or prefix.startswith('outputs.')
                        if root=='data' and (fmt!='json' and direct or fmt=='json' and len(parts)>1 and parts[1] not in actual['data']):
                            problems.append(f'绑定 {ref} 不存在于 {source["id"]} 的 {fmt} 输出')
                        elif root not in actual and direct and fmt!='actions':problems.append(f'绑定 {ref} 不存在于 {source["id"]} 的 {fmt} 输出')
                        elif consumer=='hmi' and root=='data' and fmt=='json' and len(parts)==2:
                            wanted=CONTROLS.get(td.get('controlId'),{}).get('type');got=actual['data'].get(parts[1])
                            if wanted and got and wanted!=got:problems.append(f'绑定 {ref} 类型 {got}，controlId={td.get("controlId")} 需要 {wanted}')
                    if problems:
                        route_text=source['id']+''.join(f" → 连线 {e['edge_id']} → {e['target']}" for e in route)
                        message=f"[GRAPH_CONNECTION_CONTRACT] {route_text}；实际 {fmt}: {json.dumps(actual,ensure_ascii=False)}；下游期望 {spec['expected']}；{'；'.join(problems)}；合法修法："+'；'.join(spec['repairs'][:3])
                        result.append({'category':'graph_logic','code':'GRAPH_CONNECTION_CONTRACT','node_id':source['id'],'target_node_id':target['id'],'path':route,'actual_contract':{'format':fmt,'shape':actual},'expected_contract':spec,'repairs':spec['repairs'][:3],'message':message})
                if kind not in RULES['output_boundaries']:pending.append((target['id'],route))
    return result
