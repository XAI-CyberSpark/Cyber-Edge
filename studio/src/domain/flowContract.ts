import {repeatedWaitGraph} from './flowLoops';
import type {FlowNode,FlowEdge} from './flowSession';
const key=(s:unknown)=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(s)&&!['constructor','prototype','__proto__'].includes(s);
export function validateBindings(node:FlowNode,nodes:FlowNode[]):string[]{
 if(node.type==='stage')return [];
 const byId=new Map(nodes.map(n=>[n.id,n])),errors:string[]=[];
 const metadata=new Set(['name','label','description','status','output','trace','activationIndex','effectivePrompt','collapsed','designOnly','designIssue']);
 const check=(path:string,location:string)=>{
  const parts=path.split('.');let reason:string;
  if(!parts.every(key))reason='绑定路径只支持点分隔的标识符，不能使用数组下标、空段或原型字段。';
  else if(!['input','event','state','outputs'].includes(parts[0]))reason='绑定根仅支持input/event/state/outputs；读取节点结果请用outputs.'+path+'。';
  else if(parts[0]==='outputs'&&parts.length>1&&(!byId.has(parts[1])||byId.get(parts[1])?.type==='stage'))reason='outputs引用的执行节点不存在，阶段容器不产生执行输出。';
  else return;
  errors.push(`${location}：${reason}`);
 };
 const walk=(value:any,location:string)=>{
  if(Array.isArray(value))value.forEach((v,i)=>walk(v,`${location}[${i}]`));
  else if(value&&typeof value==='object'){
   if(Object.keys(value).length===1&&typeof value.$ref==='string')check(value.$ref,location+'.$ref');
   else Object.entries(value).forEach(([k,v])=>walk(v,location+'.'+k));
  }else if(typeof value==='string')for(const match of value.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g))check(match[1],location);
 };
 Object.entries(node.data).forEach(([k,v])=>{if(!metadata.has(k))walk(v,'data.'+k);});
 return [...new Set(errors)];
}
export function validateFlowNode(n:FlowNode):string[]{
 const d=n.data,errors:string[]=[];
 if(n.type==='wait'){
  if(d.repeat!==undefined&&typeof d.repeat!=='boolean')errors.push('repeat需要布尔值。');
  if(d.maxIterations!==undefined&&(!Number.isInteger(d.maxIterations)||d.maxIterations<1||d.maxIterations>100000))errors.push('maxIterations需要1–100000的整数。');
  if(!['any','text','image'].includes(d.inputType??'any'))errors.push('等待输入类型仅支持any/text/image。');
  if(typeof d.eventName!=='string'||!d.eventName.trim())errors.push('请指定等待的事件名称。');
  if(d.match&&!['any','exact'].includes(d.match))errors.push('等待匹配方式仅支持 any/exact；语义判断请使用模型与分支节点。');
  if(d.match==='exact'&&(!Array.isArray(d.answers)||!d.answers.length||d.answers.some((a:unknown)=>typeof a!=='string'||!a.trim())))errors.push('精确匹配需要有效答案列表。');
  if(d.match==='exact'&&Array.isArray(d.answers)&&Array.isArray(d.hintInputs)){const norm=(v:unknown)=>String(v).normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}]/gu,'');if(d.answers.some((a:unknown)=>d.hintInputs.some((h:unknown)=>norm(a)===norm(h))))errors.push('正确答案不能同时是hintInputs提示口令，否则无法推进。');}
  for(const field of ['aliases','hintInputs'])if(d[field]!==undefined&&(!Array.isArray(d[field])||d[field].some((x:unknown)=>typeof x!=='string')))errors.push(`${field}需要文字列表。`);
  if(d.storeAs&&!key(d.storeAs))errors.push('保存输入的状态字段名无效。');
 }
 if(n.type==='state')for(const field of ['values','increments'])if(d[field]!==undefined&&(!d[field]||Array.isArray(d[field])||typeof d[field]!=='object'||Object.keys(d[field]).some(k=>!key(k))))errors.push(`${field}需要有效状态字段对象。`);
 if(d.increments&&typeof d.increments==='object'&&Object.values(d.increments).some(v=>typeof v!=='number'||!Number.isFinite(v)))errors.push('状态增量必须为有限数值。');
 if(['input','systemInput'].includes(n.type||'')&&d.aliases!==undefined&&(!Array.isArray(d.aliases)||d.aliases.some((v:unknown)=>typeof v!=='string')))errors.push('事件别名需要文字列表。');
 if(d.displayDelayMs!==undefined&&(typeof d.displayDelayMs!=='number'||!Number.isFinite(d.displayDelayMs)||d.displayDelayMs<0||d.displayDelayMs>60000))errors.push('展示延迟需要0–60000毫秒。');
 if(d.joinMode&&!['all','any'].includes(d.joinMode))errors.push('汇合方式需要 all 或 any。');
 for(const f of ['eventBudget','executionBudget'])if(d[f]!==undefined&&(!Number.isInteger(d[f])||d[f]<1||d[f]>100000))errors.push(`${f}需要1–100000的整数。`);
 return errors;
}
export function validateFlowGraph(nodes:FlowNode[],edges:FlowEdge[]):{nodeId?:string;message:string;severity:'error'}[]{
 const loops=repeatedWaitGraph(nodes,edges);
 const out:{nodeId?:string;message:string;severity:'error'}[]=[],add=(message:string,nodeId?:string)=>out.push({message,nodeId,severity:'error'}),byId=new Map(nodes.map(n=>[n.id,n]));
 for(const n of nodes){
  validateFlowNode(n).forEach(m=>add(m,n.id));
  validateBindings(n,nodes).forEach(m=>add(m,n.id));
  if(n.parentId){if(byId.get(n.parentId)?.type!=='stage')add('所属阶段不存在。',n.id);const seen=new Set([n.id]);let p:FlowNode|undefined=n;while(p?.parentId){if(seen.has(p.parentId)){add('阶段不能循环嵌套。',n.id);break;}seen.add(p.parentId);p=byId.get(p.parentId);}}
  if(n.type==='stage'){if(edges.some(e=>e.source===n.id||e.target===n.id))add('请连接阶段内的能力节点；阶段容器不执行动作。',n.id);continue;}
  const incoming=edges.filter(e=>e.target===n.id&&!loops.backEdges.has(e));
  if(incoming.length>1&&!['any','all'].includes(n.data.joinMode))add('多个输入需要明确汇合方式：等待全部 all，或任一分支 any。',n.id);
  const ports=incoming.map(e=>e.targetHandle||e.source);if(new Set(ports).size!==ports.length)add('输入端口重名，请为连线指定不同 targetHandle。',n.id);
 }
 return out;
}
