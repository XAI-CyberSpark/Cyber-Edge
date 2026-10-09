/** Natural back edges into explicitly repeatable waits. Other cycles are invalid. */
import type {FlowNode,FlowEdge} from './flowSession';
export function repeatedWaitGraph(nodes:FlowNode[],edges:FlowEdge[]) {
 const ids=new Set(nodes.filter(n=>n.type!=='stage').map(n=>n.id));
 const starts=new Set(nodes.filter(n=>['input','systemInput'].includes(n.type||'')).map(n=>n.id));
 const dom=new Map([...ids].map(id=>[id,starts.has(id)?new Set([id]):new Set(ids)]));
 let changed=true;
 while(changed){
  changed=false;
  for(const id of ids){
   if(starts.has(id))continue;
   const parents=edges.filter(e=>e.target===id&&ids.has(e.source)).map(e=>dom.get(e.source)!);
   const next=new Set(parents.length?[...parents[0]].filter(x=>parents.every(p=>p.has(x))):[]);next.add(id);
   const old=dom.get(id)!;
   if(old.size!==next.size||[...old].some(x=>!next.has(x))){dom.set(id,next);changed=true;}
  }
 }
 const gates=nodes.filter(n=>n.type==='wait'&&n.data.repeat===true);
 const backEdges=new Set(edges.filter(e=>gates.some(n=>n.id===e.target)&&dom.get(e.source)?.has(e.target)));
 const forward=edges.filter(e=>!backEdges.has(e));
 const descendants=new Map<string,Set<string>>();
 for(const gate of gates){
  const seen=new Set<string>();const visit=(id:string)=>{for(const e of forward.filter(e=>e.source===id)){if(e.target===gate.id||seen.has(e.target))continue;seen.add(e.target);visit(e.target);}};
  visit(gate.id);descendants.set(gate.id,seen);
 }
 return {backEdges,forward,descendants};
}
