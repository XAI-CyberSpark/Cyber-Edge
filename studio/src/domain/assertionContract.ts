import {HMI_CONTROLS} from './hmiControls';
import {initialVehicle} from './vehicleWorld';
import {isGeneralFlow,type FlowNode,type FlowEdge} from './flowSession';
import type {Assertion} from './scenarioExecution';
import type {PlanDiagnostic} from './testPlanPreflight';
const unsafeKeys=new Set(['__proto__','constructor','prototype']);
type Shape={type:string;fields?:Record<string,Shape>;open?:boolean;values?:unknown[]};
const unknown:Shape={type:'unknown'};
const object=(fields:Record<string,Shape>,open=false):Shape=>({type:'object',fields,open});
const literal=(value:any):Shape=>Array.isArray(value)?{type:'array'}:value!==null&&typeof value==='object'?object(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,literal(v)]))):{type:value===null?'null':typeof value};
const declared=(fields:any)=>object(Object.fromEntries(Object.entries(fields||{}).map(([k,v])=>[k,{type:String(v),open:v==='object'}])));
/** Only closed, published shapes reject unknown fields. Dynamic tool/model results remain unknown. */
export function assertionShape(project:{nodes:FlowNode[];edges:FlowEdge[]}) {
 const byId=new Map(project.nodes.filter(n=>n.type!=='stage').map(n=>[n.id,n]));
 const readsMemory=(id:string,seen=new Set<string>()):boolean=>{
  if(seen.has(id))return false;seen.add(id);
  return project.edges.filter(e=>e.source===id&&e.sourceHandle!=='error').some(e=>byId.get(e.target)?.type==='llm'||readsMemory(e.target,seen));
 };
 const output=(id:string,seen=new Set<string>()):Shape=>{
  if(seen.has(id))return unknown;seen=new Set(seen).add(id);
  const n=byId.get(id);if(!n)return unknown;const d=n.data;
  const upstream=project.edges.filter(e=>e.target===id);
  const inherited=upstream.length===1?output(upstream[0].source,seen):unknown;
  const merge=(fields:Record<string,Shape>)=>object({...inherited.fields,...fields},inherited.type==='unknown'||!!inherited.open);
  if(['output','tts'].includes(n.type||''))return {type:'string'};
  if((['input','systemInput'].includes(n.type||'')&&d.inputFormat==='json')||(n.type==='llm'&&d.outputFormat==='json'))return object({data:declared(d.outputFields),text:{type:'string'},...(n.type==='llm'?{raw_model_output:{type:'string'},json_repair_attempts:{type:'number'}}:{source:{type:'string'}}),...(d.eventName?{event:object({},true)}:{})});
  if(n.type==='llm'&&d.outputFormat==='text')return merge({text:{type:'string'},reply:{type:'string'},raw_model_output:{type:'string'}});
  if(n.type==='logic'&&(d.logic_type||d.type||'if')==='if')return merge({condition_result:{type:'boolean'},logic_condition:{type:'string'}});
  if(n.type==='state')return merge({state:object({},true)});
  if(n.type==='car_control')return merge({action:{type:'string'},reply:{type:'string'},action_result:d.executionMode==='hmi'&&HMI_CONTROLS[d.controlId]?object({success:{type:'boolean'},source:{type:'string'},control:{type:'string'},operation:{type:'string'},requested:{type:HMI_CONTROLS[d.controlId].type},actual:{type:HMI_CONTROLS[d.controlId].type},revision:{type:'number'}}):object({},true)});
  if(n.type==='memory')return d.type!=='buffer'?inherited:readsMemory(id)?merge({short_term_memory:{type:'array'},short_term_memory_count:{type:'number'}}):merge({short_term_memory_written:{type:'boolean'}});
  if(n.type==='wait')return inherited;
  return unknown;
 };
 const car=literal(initialVehicle());car.fields!.hmiSettings=object({});
 for(const [id,spec] of Object.entries(HMI_CONTROLS)) {
  const parts=spec.path||['hmiSettings',id];let current=car;
  for(const key of parts.slice(0,-1))current=(current.fields![key] ||= object({}));
  current.fields![parts.at(-1)!]={type:spec.type};
 }
 return object({car,nodes:object(Object.fromEntries([...byId.keys()].map(id=>[id,{type:'string',values:isGeneralFlow(project.nodes)?['pending','success','failed','skipped','waiting','dormant']:['idle','running','success','error']}]))),outputs:object(Object.fromEntries([...byId.keys()].map(id=>[id,output(id)])))});
}
function resolve(shape:Shape,path:string[]):Shape|undefined {
 let current:Shape|undefined=shape;
 for(const key of path){
  if(!current||unsafeKeys.has(key))return;
  if(current.type==='unknown')return unknown;
  if(current.type==='array')current=key==='length'?{type:'number'}:/^\d+$/.test(key)?unknown:undefined;
  else if(current.type==='string')current=key==='length'?{type:'number'}:/^\d+$/.test(key)?{type:'string'}:undefined;
  else current=current.fields&&Object.hasOwn(current.fields,key)?current.fields[key]:(current.open?unknown:undefined);
 }
 return current;
}
function paths(shape:Shape,prefix:string[]=[]):string[][] {return [prefix,...Object.entries(shape.fields||{}).filter(([key])=>!unsafeKeys.has(key)).flatMap(([key,value])=>paths(value,[...prefix,key]))];}
function distance(a:string,b:string) {let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}return row[b.length];}
export function inspectAssertions(shape:ReturnType<typeof assertionShape>,assertions:Assertion[],path:string):PlanDiagnostic[] {
 const errors:PlanDiagnostic[]=[];
 for(const [i,a] of assertions.entries()) {
  if(!['car','outputs','nodes'].includes(a.path[0]))continue;
  const at=`${path}.assertions[${i}]`,expected=resolve(shape,a.path);
  if(!expected){
   const key=(p:string[])=>p.filter(k=>k!=='hmiSettings').join('.');
   const candidates=paths(shape).filter(p=>p[0]===a.path[0]&&p.length>1).sort((a1,b)=>distance(key(a1),key(a.path))-distance(key(b),key(a.path))).slice(0,3);
   errors.push({category:'assertion',code:'PLAN_ASSERTION_PATH',path:at,suggestions:candidates,message:`${at}：断言路径 ${JSON.stringify(a.path)} 不存在；最接近的合法路径：${candidates.map(p=>JSON.stringify(p)).join('、')}。按目录/图修正测试计划；hmiSettings 使用完整 controlId 作为一个路径段。`});continue;
  }
  const type=a.value===null?'null':Array.isArray(a.value)?'array':typeof a.value;
  const required=['gte','lte'].includes(a.op)?'number':a.op==='equals'||a.op==='contains'&&expected.type==='string'?expected.type:undefined;
  if(required&&required!=='unknown'&&(type!==required||expected.values&&a.op==='equals'&&!expected.values.includes(a.value)))errors.push({category:'assertion',code:'PLAN_ASSERTION_TYPE',path:at,expected_type:required,message:`${at}：${JSON.stringify(a.path)} 的 ${a.op} 期望 ${required}${expected.values?`（${expected.values.join('/')}）`:''}，收到 ${JSON.stringify(a.value)}(${type})；修正测试计划的 expected/value 类型或状态值，不转换实际值。`});
 }
 return errors;
}
