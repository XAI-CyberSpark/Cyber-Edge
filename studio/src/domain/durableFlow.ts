import {validateGraph} from './nodeCapabilities';
import {apiUrl} from '../lib/api';
import {FlowSessions, type FlowNode, type FlowEdge} from './flowSession';
import type {ScenarioSessions} from './scenarioSession';
export type ExecutionRecord = {revision:number;phase:'empty'|'running'|'ready';payload?:DurableSnapshot|null;expires_at?:number};
export type DurableSnapshot = {version:1;flow:ReturnType<FlowSessions['snapshot']>|null;simulator:unknown};
export type Lease = {revision:number;token:string};
export interface ExecutionStorage {
 read():Promise<ExecutionRecord>;
 begin(revision:number,restart:boolean):Promise<Lease>;
 renew(lease:Lease):Promise<unknown>;
 finish(lease:Lease,payload:DurableSnapshot):Promise<unknown>;
}
export function executionStorage(key:string):ExecutionStorage {
 const request=async(operation='',value?:unknown)=>{
  const response=await fetch(apiUrl(`/v1/executions/${key}${operation?'/'+operation:''}`),{
   ...(value===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),
   signal:AbortSignal.timeout(15000),
  });
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(typeof body.detail==='string'?body.detail:`执行进度服务不可用（${response.status}）。`);}
  return response.json();
 };
 return {read:()=>request(),begin:(revision,restart)=>request('begin',{revision,restart}),renew:lease=>request('renew',lease),finish:(lease,payload)=>request('finish',{...lease,payload})};
}
/** Stable across reloads, separate for different saved projects and browser profiles. */
export async function executionKey(project:string,storage:Pick<Storage,'getItem'|'setItem'>=localStorage){
 let browser=storage.getItem('oakegde.execution-browser.v1');
 if(!browser){browser=storage.getItem('cyberedge.execution-browser.v1')||crypto.randomUUID();storage.setItem('oakegde.execution-browser.v1',browser);}
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([browser,project])));
 return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
export function isRestart(input:unknown){
 let value:any=input;if(typeof value==='string'){try{value=JSON.parse(value);}catch{return false;}}
 return value?.$event?.control==='restart';
}
export function restoreDurableSnapshot(payload:DurableSnapshot,nodes:FlowNode[],edges:FlowEdge[],sessions:ScenarioSessions,prepareSimulator:(v:unknown)=>()=>void){
 if(payload?.version!==1)throw Error('执行快照版本不兼容，请重新开始。');
 // Validate both halves before either live state is changed.
 const test=new FlowSessions();test.restore(payload.flow,nodes,edges);
 const apply=prepareSimulator(payload.simulator);
 sessions.flow.restore(test.snapshot(),nodes,edges);apply();
}
export async function durableTurn<T>(options:{
 storage:ExecutionStorage;nodes:FlowNode[];edges:FlowEdge[];sessions:ScenarioSessions;input:unknown;
 cursor?:{revision?:number};snapshotSimulator:()=>unknown;prepareSimulator:(value:unknown)=>()=>void;
 run:(signal:AbortSignal)=>Promise<T>;signal?:AbortSignal;heartbeatMs?:number;
}):Promise<T>{
 const {storage,nodes,edges,sessions}=options;
 options.signal?.throwIfAborted();
 const errors=validateGraph(nodes as any,edges as any).filter(issue=>issue.severity==='error');
 if(errors.length)throw Error(errors.map(issue=>issue.message).join(' '));
 const record=await storage.read(),restart=isRestart(options.input);
 if(record.phase==='running'&&!restart)throw Error('上轮执行仍在运行或已中断，不能自动重放。核对动作结果后使用重新开始。');
 if(record.phase==='ready'&&record.payload&&!restart&&options.cursor?.revision!==record.revision)restoreDurableSnapshot(record.payload,nodes,edges,sessions,options.prepareSimulator);
 if(!restart){const checked=new FlowSessions();checked.restore(sessions.flow.snapshot(),nodes,edges);}
 options.signal?.throwIfAborted();
 const lease=await storage.begin(record.revision,restart);
 const controller=new AbortController();
 const abort=()=>controller.abort(options.signal?.reason);options.signal?.addEventListener('abort',abort,{once:true});
 if(options.signal?.aborted)abort();
 let leaseError:unknown;let renewing:Promise<void>|undefined;
 const timer=setInterval(()=>{
  if(renewing)return;
  renewing=storage.renew(lease).then(()=>{},error=>{leaseError=error;controller.abort(error);}).finally(()=>{renewing=undefined;});
 },options.heartbeatMs??20000);
 try{
  controller.signal.throwIfAborted();
  const result=await options.run(controller.signal);
  clearInterval(timer);await renewing;
  if(leaseError)throw leaseError;
  controller.signal.throwIfAborted();
  const flow=sessions.flow.snapshot();
  // Cancellation in the middle of a node is not a committed turn boundary.
  if(flow?.status==='running')throw Error('执行在本轮中途停止，进度保持中断状态；请核对后重新开始。');
  const payload:DurableSnapshot={version:1,flow:flow??null,simulator:options.snapshotSimulator()};
  // Validate our own snapshot before publishing it as a restorable checkpoint.
  const checked=new FlowSessions();checked.restore(payload.flow,nodes,edges);
  options.prepareSimulator(payload.simulator);
  await storage.finish(lease,payload);
  if(options.cursor)options.cursor.revision=lease.revision+1;
  return result;
 }finally{clearInterval(timer);options.signal?.removeEventListener('abort',abort);}
}
