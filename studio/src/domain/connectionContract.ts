import catalog from '../data/nodeCapabilities.json';
import type {FlowNode,FlowEdge} from './flowSession';
const rules=catalog.connection_contract;
export function connectionDiagnostics(nodes:FlowNode[],edges:FlowEdge[]) {
  const byId=new Map(nodes.map(n=>[n.id,n]));const result:any[]=[];
  const refs=(v:any):string[]=>v&&typeof v==='object'?[...(typeof v.$ref==='string'?[v.$ref]:[]),...Object.values(v).flatMap(refs)]:[];
  for(const source of nodes){
    const producer=(rules.producers as any)[source.type||''];if(!producer)continue;
    const fmt=source.data[producer.format_field]??producer.default;if(!producer.formats[fmt])continue;
    const actual={...producer.formats[fmt].shape};if(fmt==='json')actual.data=source.data.outputFields||{};
    const pending:{id:string;path:any[]}[]=[{id:source.id,path:[]}];const seen=new Set<string>();
    while(pending.length){const {id,path}=pending.shift()!;if(seen.has(id))continue;seen.add(id);
      edges.forEach((edge,index)=>{if(edge.source!==id||edge.sourceHandle==='error')return;const target=byId.get(edge.target);if(!target)return;
        const d=target.data,kind=target.type;const route=[...path,{source:id,edge_id:edge.id||`edges[${index}]`,target:target.id,source_handle:edge.sourceHandle??null,target_handle:edge.targetHandle??null}];
        const consumer=kind==='tool'?((d.tool_id||d.tool)==='mcp'?'mcp':'ordinary'):kind==='car_control'?(d.executionMode==='hmi'?'hmi':d.executionMode==='hmi_mock'&&['ambient_light.set','ambient_light.restore'].includes(d.action)?'ambient':'ordinary'):undefined;
        if(consumer){const spec=rules.consumers[consumer];const problems:string[]=[];
          if(!(spec.accepts as string[]).includes(fmt))problems.push(`输出 ${fmt} 不提供所需动作协议`);
          const bindings=refs(consumer==='mcp'?d.arguments:d.controlValue);if(consumer==='hmi'&&d.valueField)bindings.push(`input.data.${d.valueField}`);
          for(const ref of bindings){const prefix=['input.',`outputs.${source.id}.`].find(p=>ref.startsWith(p));if(!prefix)continue;const parts=ref.slice(prefix.length).split('.'),root=parts[0],direct=route.length===1||prefix.startsWith('outputs.');
            if(root==='data'&&(fmt!=='json'&&direct||fmt==='json'&&parts.length>1&&!Object.prototype.hasOwnProperty.call(actual.data,parts[1])))problems.push(`绑定 ${ref} 不存在于 ${source.id} 的 ${fmt} 输出`);
            else if(!Object.prototype.hasOwnProperty.call(actual,root)&&direct&&fmt!=='actions')problems.push(`绑定 ${ref} 不存在于 ${source.id} 的 ${fmt} 输出`);
            else if(consumer==='hmi'&&root==='data'&&fmt==='json'&&parts.length===2){const wanted=(catalog.nodes.car_control.hmi_controls as any)[d.controlId]?.type,got=actual.data[parts[1]];if(wanted&&got&&wanted!==got)problems.push(`绑定 ${ref} 类型 ${got}，controlId=${d.controlId} 需要 ${wanted}`);}
          }
          if(problems.length){const message=`[GRAPH_CONNECTION_CONTRACT] ${source.id}${route.map(e=>` → 连线 ${e.edge_id} → ${e.target}`).join('')}；实际 ${fmt}: ${JSON.stringify(actual)}；下游期望 ${spec.expected}；${problems.join('；')}；合法修法：${spec.repairs.slice(0,3).join('；')}`;
            result.push({category:'graph_logic',code:'GRAPH_CONNECTION_CONTRACT',node_id:source.id,target_node_id:target.id,path:route,actual_contract:{format:fmt,shape:actual},expected_contract:spec,repairs:spec.repairs.slice(0,3),message});}
        }
        if(!rules.output_boundaries.includes(kind||''))pending.push({id:target.id,path:route});
      });
    }
  }
  return result;
}
