import {errorDetails} from './contractErrors';
import {repeatedWaitGraph} from './flowLoops';
/** General graph checkpoints. Business events, answers and transitions live in graph data. */
export type FlowNode = {id:string; type?:string; parentId?:string; data:Record<string,any>};
export type FlowEdge = {id?:string;source:string;target:string;sourceHandle?:string|null;targetHandle?:string|null};
type Event = {id:string;name:string;value:unknown;text:string;target?:string;control?:string};
type Status = 'pending'|'waiting'|'success'|'skipped'|'failed'|'dormant';
export type Checkpoint = {signature:string;status:'running'|'waiting'|'paused'|'completed'|'stopped'|'failed';nodes:Record<string,Status>;outputs:Record<string,any>;edges:Record<string,'taken'|'skipped'>;state:Record<string,any>;initial:unknown;seen:string[];reply:string;waiting:string[];repeatPending:string[];repeatCounts:Record<string,number>};
export type FlowResult = {status:'completed'|'waiting'|'paused'|'failed';reply:string;state:Record<string,any>;waiting:string[];duplicate?:boolean;nodeStatuses:Record<string,Status>};
export interface FlowHost {process:(node:FlowNode,input:any)=>Promise<{output:any;trace?:any[]}>;started:(node:FlowNode,input:any)=>void;completed:(node:FlowNode,output:any,trace?:any[])=>void;failed:(node:FlowNode,error:string,details?:ReturnType<typeof errorDetails>)=>void;message:(text:string)=>void;}
const safeKey=(k:string)=>/^[A-Za-z][A-Za-z0-9_]*$/.test(k)&&!['constructor','prototype','__proto__'].includes(k);
export const normalizeFlowAnswer=(v:unknown)=>String(v??'').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}]/gu,'');
export const isGeneralFlow=(nodes:FlowNode[])=>nodes.some(n=>['wait','state','stage'].includes(n.type||'')||n.data.flowVersion===2);
export function eventOf(input:unknown,id:string):Event {
 let v:any=input;
 if(typeof input==='string'&&input.trim().startsWith('{')){try{const p=JSON.parse(input);if(p?.$event)v=p;}catch{/* ordinary text */}}
 if(v?.$event){const e=v.$event;return {id,name:String(e.name||'message'),value:e.value??e.text??'',text:String(e.text??(e.value&&typeof e.value==='object'?e.value.text:e.value)??''),target:e.target,control:e.control};}
 const text=typeof input==='string'?input:String((input as any)?.text??'');return {id,name:'message',value:input,text};
}
function readPath(root:any,path:string):any {return path.split('.').reduce((v,k)=>safeKey(k)?v?.[k]:undefined,root);}
export function bindFlowValue(value:any,context:any):any {
 if(Array.isArray(value))return value.map(v=>bindFlowValue(v,context));
 if(value&&typeof value==='object'){
  if(Object.keys(value).length===1&&typeof value.$ref==='string')return structuredClone(readPath(context,value.$ref));
  return Object.fromEntries(Object.entries(value).filter(([k])=>!['__proto__','constructor','prototype'].includes(k)).map(([k,v])=>[k,bindFlowValue(v,context)]));
 }
 if(typeof value==='string')return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g,(_,path)=>{const v=readPath(context,path);return v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);});
 return value;
}
export function flowSignature(nodes:FlowNode[],edges:FlowEdge[]){return JSON.stringify({nodes:nodes.filter(n=>n.type!=='stage').map(n=>({id:n.id,type:n.type,data:Object.fromEntries(Object.entries(n.data).filter(([k])=>!['status','output','trace','activationIndex','effectivePrompt','basePrompt','structuredPrompt','promptMode','allowedActions','collapsed'].includes(k)&&typeof n.data[k]!=='function'))})),edges:edges.map(({id,source,target,sourceHandle,targetHandle})=>({id,source,target,sourceHandle,targetHandle}))});}
export class FlowSessions {
 restore(value:unknown,nodes:FlowNode[],edges:FlowEdge[]){
  if(this.locked)throw Error('当前流程正在执行。');
  if(value===null||value===undefined){this.checkpoint=undefined;return;}
  const c=structuredClone(value) as Checkpoint;
  const fail=()=>{throw Error('已保存的流程进度无效或与当前流程不一致，请重新开始。');};
  const record=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
  const ids=nodes.filter(n=>n.type!=='stage').map(n=>n.id);
  const list=(v:any,allowed:string[])=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&allowed.includes(x))&&new Set(v).size===v.length;
  const edgeIds=edges.map(e=>e.id||`${e.source}:${e.sourceHandle||''}>${e.target}:${e.targetHandle||''}`);
  const repeats=nodes.filter(n=>n.type==='wait'&&n.data.repeat===true).map(n=>n.id);
  if(!record(c)||c.signature!==flowSignature(nodes,edges)||!['waiting','paused','completed','stopped','failed'].includes(c.status)
   ||!record(c.nodes)||Object.keys(c.nodes).length!==ids.length||!Object.entries(c.nodes).every(([id,s])=>ids.includes(id)&&['pending','waiting','success','skipped','failed','dormant'].includes(s))
   ||!record(c.outputs)||!Object.keys(c.outputs).every(id=>ids.includes(id)||id.startsWith('$resume:')&&ids.includes(id.slice(8)))
   ||!record(c.edges)||!Object.entries(c.edges).every(([id,s])=>edgeIds.includes(id)&&['taken','skipped'].includes(s))
   ||!record(c.state)||!Object.keys(c.state).every(safeKey)||typeof c.reply!=='string'
   ||!Array.isArray(c.seen)||c.seen.some(x=>typeof x!=='string')||new Set(c.seen).size!==c.seen.length
   ||!list(c.waiting,ids)||!list(c.repeatPending,repeats)||!record(c.repeatCounts)
   ||!Object.entries(c.repeatCounts).every(([id,count])=>repeats.includes(id)&&Number.isSafeInteger(count)&&count>=0)
   ||c.waiting.some(id=>!['waiting','dormant'].includes(c.nodes[id])))fail();
  this.checkpoint=c;
 }
 private checkpoint?:Checkpoint;private locked=false;
 clear(){if(this.locked)throw Error('请等待执行结束后重置。');this.checkpoint=undefined;}
 snapshot(){return this.checkpoint?structuredClone(this.checkpoint):undefined;}
 rememberPresentedReply(reply:string){if(this.locked)throw Error('请等待执行结束。');if(this.checkpoint)this.checkpoint.reply=reply;}
 async run(nodes:FlowNode[],edges:FlowEdge[],input:unknown,id:string,host:FlowHost,signal?:AbortSignal):Promise<FlowResult>{
  if(this.locked)throw Error('当前流程正在执行。');this.locked=true;
  try{return await this.advance(nodes,edges,input,id,host,signal);}finally{this.locked=false;}
 }
 private async advance(all:FlowNode[],edges:FlowEdge[],input:unknown,id:string,host:FlowHost,signal?:AbortSignal):Promise<FlowResult>{
  const nodes=all.filter(n=>n.type!=='stage'),event=eventOf(input,id),sig=flowSignature(nodes,edges);
  const persistent=nodes.some(n=>n.type==='wait'||n.type==='interaction'||n.data.eventName);
  if(this.checkpoint?.seen.includes(id))return this.result(this.checkpoint,true);
  if(event.control==='restart'){this.checkpoint=undefined;}
  if(this.checkpoint&&this.checkpoint.signature!==sig)throw Error('流程已修改，请重新开始应用新配置。');
  if(this.checkpoint?.seen.includes(id))return this.result(this.checkpoint,true);
  if(this.checkpoint&&!persistent&&this.checkpoint.status==='completed')this.checkpoint=undefined;
  if(!this.checkpoint){this.checkpoint={signature:sig,status:'running',nodes:Object.fromEntries(nodes.map(n=>[n.id,['input','systemInput'].includes(n.type||'')&&n.data.eventName?'dormant':'pending'])),outputs:{},edges:{},state:{},initial:input,seen:[],reply:'',waiting:[],repeatPending:[],repeatCounts:{}};}
  const loops=repeatedWaitGraph(nodes,edges);
  const c=this.checkpoint,edgeKey=(e:FlowEdge)=>e.id||`${e.source}:${e.sourceHandle||''}>${e.target}:${e.targetHandle||''}`;
  const finish=()=>{
   c.waiting=nodes.filter(n=>c.nodes[n.id]==='waiting').map(n=>n.id);
   if(c.status==='running'){
    const pending=nodes.filter(n=>c.nodes[n.id]==='pending');
    if(!c.waiting.length&&pending.length){
     const ancestors=new Set<string>();const visit=(id:string)=>{if(ancestors.has(id))return;ancestors.add(id);edges.filter(e=>e.target===id).forEach(e=>visit(e.source));};pending.forEach(n=>visit(n.id));
     c.waiting=nodes.filter(n=>c.nodes[n.id]==='dormant'&&ancestors.has(n.id)).map(n=>n.id);
     if(!c.waiting.length){c.status='failed';c.reply='存在无法推进的路径，请检查连线与汇合方式。';}
    }
    if(c.status==='running')c.status=Object.values(c.nodes).includes('failed')?'failed':c.waiting.length?'waiting':'completed';
   }
   return this.result(c);
  };
  const say=(s:string)=>{if(s){c.reply=s;host.message(s);}};
  const budget=Number(nodes.find(n=>['input','systemInput'].includes(n.type||''))?.data.eventBudget||2000);
  if(c.seen.length>=budget)throw Error(`本次会话已达到${budget}个事件预算，请重新开始。`);
  const propagate=(n:FlowNode,output:any,failed=false)=>{
   const mode=n.data.logic_type||n.data.type||'if';
   for(const e of edges.filter(e=>e.source===n.id)){
    const take=failed?e.sourceHandle==='error':e.sourceHandle!=='error'&&(n.type!=='logic'||mode==='filter'||!e.sourceHandle||e.sourceHandle===(Boolean(typeof output==='boolean'?output:output?.condition_result)?'true':'false'));
    c.edges[edgeKey(e)]=take?'taken':'skipped';
   }
  };
  const context=(v:any)=>({input:v,event:{name:event.name,text:event.text,value:event.value},state:c.state,outputs:c.outputs});
  if(event.control==='stop'){for(const n of nodes)if(['pending','waiting','dormant'].includes(c.nodes[n.id]))c.nodes[n.id]='skipped';c.status='stopped';say('本次流程已结束。');c.seen.push(id);return finish();}
  if(event.control==='pause'){c.status='paused';say('已暂停，进度已保留。');c.seen.push(id);return finish();}
  if(['completed','stopped'].includes(c.status)){say('本次流程已结束，请使用重新开始。');c.seen.push(id);return finish();}
  if(c.status==='paused'&&event.control!=='resume'){say('当前已暂停，请使用继续。');c.seen.push(id);return finish();}
  if(event.control==='resume')c.status='running';
  if(c.status==='failed'&&event.control!=='retry'){say('流程包含失败节点，请检查后使用重试或重新开始。');c.seen.push(id);return finish();}
  if(event.control==='retry'){
   const reset=(nodeId:string,seen=new Set<string>())=>{if(seen.has(nodeId))return;seen.add(nodeId);
    c.nodes[nodeId]='pending';delete c.outputs[nodeId];
    for(const e of edges.filter(e=>e.source===nodeId)){delete c.edges[edgeKey(e)];if(c.nodes[e.target]==='skipped')reset(e.target,seen);}
   };
   for(const n of nodes.filter(n=>c.nodes[n.id]==='failed'))if(!event.target||event.target===n.id)reset(n.id);
   c.status='running';
  }
  const eventMatches=(n:FlowNode)=>(!event.target||n.id===event.target)&&(event.name===(n.data.eventName||'message')||(event.name==='message'&&(n.data.aliases||[]).some((s:string)=>normalizeFlowAnswer(s)===normalizeFlowAnswer(event.text))));
  const interrupts=event.control?[]:nodes.filter(n=>['input','systemInput'].includes(n.type||'')&&n.data.eventName&&eventMatches(n));
  if(interrupts.length){
   for(const n of interrupts){
    if(n.data.interrupt){
     const keep=new Set<string>();const visit=(id:string)=>{if(keep.has(id))return;keep.add(id);edges.filter(e=>e.source===id).forEach(e=>visit(e.target));};visit(n.id);
     for(const x of nodes)if(!keep.has(x.id)&&['waiting','pending'].includes(c.nodes[x.id])){c.nodes[x.id]='skipped';edges.filter(e=>e.source===x.id).forEach(e=>{c.edges[edgeKey(e)]='skipped';});}
    }
    c.nodes[n.id]='pending';c.status='running';
   }
  }
  const waiting=event.control?[]:nodes.filter(n=>c.nodes[n.id]==='waiting'&&n.type==='wait'&&eventMatches(n));
  if(waiting.length>1&&!event.target){say('多个节点等待该事件，请选择具体等待节点。');c.seen.push(id);return finish();}
  for(const n of waiting){
   const d=bindFlowValue(n.data,context(c.outputs[n.id])),answer=event.text;
   if((d.hintInputs||[]).some((h:string)=>normalizeFlowAnswer(h)===normalizeFlowAnswer(answer))){say(d.hint||d.prompt||'请继续输入。');continue;}
   if(d.match==='exact'&&!(d.answers||[]).some((a:any)=>normalizeFlowAnswer(a)===normalizeFlowAnswer(answer))){say(d.retryMessage||d.prompt||'输入不符合本阶段条件，请重试。');continue;}
   const image=event.value && typeof event.value==='object' && (event.value as any).type==='image' && typeof (event.value as any).content==='string' && (event.value as any).content.trim() ? event.value as any : undefined;
   if(d.inputType==='image'&&!image || d.inputType==='text'&&image){say(d.retryMessage||d.prompt||'输入类型不符合本阶段要求。');continue;}
   if(d.repeat===true&&(c.repeatCounts[n.id]||0)>=Number(d.maxIterations??1000)){
    const message='重复等待已达到maxIterations输入次数预算，请重新开始或调整配置。';
    c.nodes[n.id]='failed';c.status='failed';c.reply=message;host.failed(n,message);c.outputs[n.id]={error:{nodeId:n.id,message}};propagate(n,c.outputs[n.id],true);continue;
   }
   const reentry=c.repeatPending.includes(n.id);
   if(reentry){
    const region=loops.descendants.get(n.id)!;
    for(const id of region){const target=nodes.find(x=>x.id===id)!;c.nodes[id]=['input','systemInput'].includes(target.type||'')&&target.data.eventName?'dormant':'pending';delete c.outputs[id];delete c.outputs[`$resume:${id}`];}
    for(const edge of edges)if(edge.source===n.id||region.has(edge.source))delete c.edges[edgeKey(edge)];
    c.repeatPending=c.repeatPending.filter(id=>id!==n.id&&!region.has(id));
   }
   if(d.repeat===true)c.repeatCounts[n.id]=(c.repeatCounts[n.id]||0)+1;
   const previous={...(!reentry&&c.outputs[n.id]&&typeof c.outputs[n.id]==='object'?c.outputs[n.id]:{})};
   // A new response never inherits image bytes from the previous turn.
   if(previous.type==='image'||typeof previous.content==='string'&&previous.content.startsWith('data:image')){delete previous.content;previous.type='text';}
   delete previous.source_image;delete previous.has_image;delete previous.replay;
   const output={...previous,...(image?{type:'image',content:image.content}:{}),text:answer,value:event.value,event:{name:d.eventName||event.name,text:answer,value:event.value},reply:d.successMessage||''};
   if(d.storeAs)c.state[d.storeAs]=event.value;
   c.nodes[n.id]='success';c.outputs[n.id]=output;host.started(n,output.event);host.completed(n,output);if(d.successMessage)say(d.successMessage);propagate(n,output);c.status='running';
  }
  // Legacy interaction may be resumed inside a general graph without replaying predecessors.
  for(const n of nodes.filter(n=>n.type==='interaction'&&c.nodes[n.id]==='waiting')){
   if(event.target&&event.target!==n.id)continue;
   if(event.control)continue;
   c.nodes[n.id]='pending';c.outputs[`$resume:${n.id}`]=input;c.status='running';break;
  }
  let executions=0,changed=true;const max=Number(nodes.find(n=>['input','systemInput'].includes(n.type||''))?.data.executionBudget||Math.max(100,nodes.length*2));
  while(changed){
   changed=false;
   for(const n of nodes){
    signal?.throwIfAborted();if(c.nodes[n.id]!=='pending')continue;
    const incoming=edges.filter(e=>e.target===n.id&&!loops.backEdges.has(e)),taken=incoming.filter(e=>c.edges[edgeKey(e)]==='taken');
    if(incoming.length){
     if(!taken.length&&incoming.every(e=>c.edges[edgeKey(e)]==='skipped')){c.nodes[n.id]='skipped';edges.filter(e=>e.source===n.id).forEach(e=>{c.edges[edgeKey(e)]='skipped';});changed=true;continue;}
     if(!taken.length||n.data.joinMode!=='any'&&incoming.some(e=>!c.edges[edgeKey(e)]))continue;
    }else if(!['input','systemInput'].includes(n.type||''))continue;
    if(++executions>max)throw Error(`本次执行达到${max}个节点预算。`);
    const inputs=Object.fromEntries(taken.map(e=>[e.targetHandle||e.source,c.outputs[e.source]]));
    let value:any=incoming.length===1?c.outputs[incoming[0].source]:incoming.length?{inputs}:n.data.eventName?{...(event.value&&typeof event.value==='object'?(event.value as Record<string,unknown>):{}),event:{name:event.name,value:event.value,text:event.text},text:event.text}:c.initial;
    if(c.outputs[`$resume:${n.id}`]!==undefined){value=c.outputs[`$resume:${n.id}`];delete c.outputs[`$resume:${n.id}`];}
    const resolved={...n,data:bindFlowValue(n.data,context(value))};
    try{
     host.started(n,value);
     if(n.type==='wait'){
      c.nodes[n.id]='waiting';c.outputs[n.id]=value;const prompt=String(resolved.data.prompt||'等待输入。');say(prompt);host.completed(n,{waiting:true,eventName:n.data.eventName||'message',reply:prompt});changed=true;continue;
     }
     let result:{output:any;trace?:any[]};
     if(n.type==='state'){
      const nextState=structuredClone(c.state);const values=resolved.data.values||{};for(const [k,v]of Object.entries(values)){if(!safeKey(k))throw Error('状态字段名无效。');nextState[k]=structuredClone(v);}
      for(const [k,v]of Object.entries(resolved.data.increments||{})){if(!safeKey(k)||!Number.isFinite(Number(v)))throw Error('状态增量无效。');const current=nextState[k]??0;if(typeof current!=='number'||!Number.isFinite(current+Number(v)))throw Error('状态增量需要有限数值。');nextState[k]=current+Number(v);}
      c.state=nextState;result={output:{...(value&&typeof value==='object'?value:{value}),state:structuredClone(c.state)}};
     }else {
      // Root event entries carry routing metadata, but the input adapter must
      // receive the actual payload rather than wrap that envelope as text.
      const eventEntry=!incoming.length&&['input','systemInput'].includes(n.type||'')&&!!n.data.eventName;
      let payload=value;
      if(eventEntry){
       const media=event.value&&typeof event.value==='object'&&((event.value as any).type==='image'||typeof (event.value as any).content==='string'&&(event.value as any).content.startsWith('data:image'));
       payload=resolved.data.inputFormat==='json'?event.value:media?{...(event.value as Record<string,unknown>),text:event.text}:event.text;
      }
      result=await host.process(resolved,payload);
      if(eventEntry&&result.output&&typeof result.output==='object'&&!Array.isArray(result.output)){
       result={...result,output:{...result.output,event:{name:event.name,text:event.text,value:structuredClone(event.value)}}};
      }
     }
     // Commit each completed operation before moving on; a later failure must not replay it.
     c.outputs[n.id]=result.output;
     if(n.type==='interaction'&&!result.output?.finished){c.nodes[n.id]='waiting';c.reply=result.output?.reply||c.reply;}
     else{c.nodes[n.id]='success';propagate(n,result.output);}
     host.completed(n,result.output,result.trace);changed=true;
     if(result.output?.reply)c.reply=result.output.reply;else if(n.type==='output'&&typeof result.output==='string')c.reply=result.output;
     if(n.type==='car_control'&&result.output?.action_result?.success===false)throw Error('动作反馈未成功，请检查实际状态。');
    }catch(error){
     const message=error instanceof Error?error.message:String(error);c.nodes[n.id]='failed';c.status='failed';c.reply=message;host.failed(n,message,errorDetails(error));
     c.outputs[n.id]={error:{nodeId:n.id,message,...errorDetails(error)},input:value};propagate(n,c.outputs[n.id],true);changed=true;
     if(signal?.aborted){c.waiting=nodes.filter(x=>c.nodes[x.id]==='waiting').map(x=>x.id);throw error;}
    }
   }
   // Re-arm only after this iteration has settled. A new event is consumed
   // by the next run(), never again within the current scheduler turn.
   if(c.status!=='failed')for(const n of nodes.filter(n=>n.type==='wait'&&n.data.repeat===true&&c.nodes[n.id]==='success')){
    const returns=edges.filter(e=>e.target===n.id&&loops.backEdges.has(e));
    if(!returns.length||!returns.some(e=>c.edges[edgeKey(e)]==='taken')||returns.some(e=>!c.edges[edgeKey(e)]))continue;
    const region=loops.descendants.get(n.id)!;
    if([...region].some(id=>['pending','waiting','dormant'].includes(c.nodes[id])))continue;
    const taken=returns.filter(e=>c.edges[edgeKey(e)]==='taken');
    const value=taken.length===1?c.outputs[taken[0].source]:{inputs:Object.fromEntries(taken.map(e=>[e.targetHandle||e.source,c.outputs[e.source]]))};
    const resolved=bindFlowValue(n.data,context(value));
    c.nodes[n.id]='waiting';c.outputs[n.id]=value;c.repeatPending.push(n.id);
    const prompt=String(resolved.prompt||'等待输入。');say(prompt);host.started(n,value);host.completed(n,{waiting:true,eventName:n.data.eventName||'message',reply:prompt});changed=true;
   }
  }
  c.seen.push(id);
  if(c.status!=='failed'&&c.status!=='paused')c.status='running';
  return finish();
 }
 private result(c:Checkpoint,duplicate=false):FlowResult{return {status:c.status==='failed'?'failed':c.status==='paused'?'paused':['completed','stopped'].includes(c.status)?'completed':c.waiting.length?'waiting':'completed',reply:c.reply,state:structuredClone(c.state),waiting:[...c.waiting],nodeStatuses:{...c.nodes},...(duplicate?{duplicate:true}:{})};}
}
