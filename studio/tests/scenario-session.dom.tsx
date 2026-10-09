import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SimulationInputPanel, SimulationInputSurface} from '../src/components/core/SimulationInputPanel';
import {NodeCapabilityInspector} from '../src/components/layout/NodeCapabilityInspector';
import {GraphEngine,type GraphCallbacks} from '../src/utils/GraphEngine';
import {ScenarioSessions,type InteractionPlan} from '../src/domain/scenarioSession';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;HTMLElement.prototype.scrollIntoView=()=>{};
const root=createRoot(document.getElementById('root')!);
const plan:InteractionPlan={mode:'authored',premise:'乘客谜题',ending:'生日快乐',steps:[{id:'q',title:'启航',waitFor:'answer',content:{message:'欢迎登船',question:'带针指方向，是什么？',answers:['指南针'],hint:'指向北方',reward:'星星'}},{id:'finish',title:'抵达',waitFor:'arrival',content:{message:'等待抵达'}}]};
const nodes=[{id:'i',type:'input',data:{},position:{x:0,y:0}},{id:'s',type:'interaction',data:{plan},position:{x:300,y:0}}],edges=[{id:'e',source:'i',target:'s'}],sessions=new ScenarioSessions();
const callbacks:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){return{};},updateSimulatorState(){}};
const onRun=(input:any,signal?:AbortSignal)=>new GraphEngine(nodes,edges,callbacks,sessions).run(input,{signal});
await act(async()=>root.render(<SimulationInputPanel running={false} workflowName="生日航海" onRun={onRun}/>));
const fill=async(value:string)=>act(async()=>{const el=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
const send=async(text:string)=>{await fill(text);await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.click());};
await send('开始');assert.match(document.body.textContent!,/欢迎登船/);assert.doesNotMatch(document.body.textContent!,/指南针/);assert.match(document.body.textContent!,/等待下一次输入/);
assert.equal(document.querySelectorAll('input[type=file]').length,1);assert.equal(document.querySelectorAll('button').length,3);assert.ok(!document.querySelector('details[open]'));
await send('指南针');assert.match(document.body.textContent!,/获得：星星/);await send('暂停');assert.match(document.body.textContent!,/已暂停，进度已保留/);await send('继续');assert.match(document.body.textContent!,/这一题已完成/);await send('下一站');await send('到达了');assert.equal(sessions.snapshot('s')!.status,'completed');
console.log('PASS existing three-button chat completes a real authored scenario and hides unsolved answers');
let changed:any;
function Editor(){const [data,setData]=useState({plan});return <NodeCapabilityInspector node={{id:'s',type:'interaction',data}} onChange={patch=>{changed={...data,...patch};setData(changed);}}/>;}
await act(async()=>root.render(<Editor/>));assert.match(document.body.textContent!,/启航/);assert.match(document.body.textContent!,/刷新/);
await act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='添加阶段')!.click());assert.equal(changed.plan.steps.length,3);assert.ok(document.querySelector('[role=alert]'));assert.match(document.querySelector('[role=alert]')!.textContent!,/无效|必须/);
console.log('PASS chapter editor exposes configuration errors rather than accepting empty games');
let signal:AbortSignal|undefined;let resolve!:(r:any)=>void;
await act(async()=>root.render(<SimulationInputPanel running={false} onRun={async(_input,s)=>{signal=s;return new Promise(r=>{resolve=r;});}}/>));
await send('开始');assert.ok(signal);await act(async()=>root.unmount());assert.equal(signal!.aborted,true);
resolve({status:'failed',events:[],input:'',runId:'r',startedAt:0,finishedAt:1});
console.log('PASS leaving chat cancels pending inference and prevents late state updates');

const { SimulationChatProvider, useSimulationChat } = await import('../src/components/core/SimulationChatSession');
const switchRoot = createRoot(document.getElementById('root')!);
const completed = async (input: any) => ({ status: 'completed', events: [], finalOutput: { reply: `回复：${input}` }, runId: 'chat-test', startedAt: 0, finishedAt: 1 } as any);
function SeedImage() {
  const chat = useSimulationChat('a');
  return <button onClick={() => chat.setAttachment({url:'data:image/png;base64,cGljdHVyZQ==',name:'测试照片.png'})}>准备图片</button>;
}
const tabs = async (active: string, visible = true, ids = ['a','b'], run: (input:any,signal?:AbortSignal)=>Promise<any> = completed) => act(async () => switchRoot.render(
  <SimulationChatProvider workflowIds={ids}>
    <SeedImage />
    <SimulationInputSurface visible={visible} key={active} sessionKey={active} workflowName="同名项目" running={false} onRun={run}/>
  </SimulationChatProvider>
));
await tabs('a'); await send('项目A的消息'); await fill('A未发送草稿');
await act(async () => Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='准备图片')!.click());
await tabs('b'); assert.doesNotMatch(document.body.textContent!,/项目A的消息/); assert.equal(document.querySelector('textarea')!.value,'');
await send('项目B的消息'); await tabs('a');
assert.match(document.body.textContent!,/项目A的消息/); assert.doesNotMatch(document.body.textContent!,/项目B的消息/);
assert.equal(document.querySelector('textarea')!.value,'A未发送草稿'); assert.ok(document.querySelector('img[alt="待发送图片"]'));
await tabs('a',false); await tabs('a'); assert.match(document.body.textContent!,/项目A的消息/); assert.equal(document.querySelector('textarea')!.value,'A未发送草稿');
await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="清空仿真对话"]')!.click());
await tabs('b'); assert.match(document.body.textContent!,/项目B的消息/); await tabs('a'); assert.equal(document.querySelectorAll('.simulation-entry').length,0);
await tabs('b',true,['b']); await tabs('a'); assert.equal(document.querySelector('textarea')!.value,''); assert.equal(document.querySelector('img[alt="待发送图片"]'),null);
console.log('PASS project-isolated messages, drafts, images, mode switches, clear and close');
// Use the same retained surface as FlowCanvas, with a deliberately delayed run.
for (const finishHidden of [true, false]) {
  let currentSignal: AbortSignal | undefined, settle!: (value:any)=>void, reject!: (error:Error)=>void, calls=0;
  const slowRun=async (_input:any,s?:AbortSignal) => {calls++;currentSignal=s;return new Promise((resolve,fail)=>{settle=resolve;reject=fail;});};
  await tabs('a',true,['a','b'],slowRun);
  await send(finishHidden ? '隐藏时完成' : '返回后失败');
  const originalPanel=document.querySelector('.simulation-input');
  await tabs('a',false,['a','b'],slowRun);
  assert.equal(currentSignal?.aborted,false);
  assert.equal(document.querySelector('.simulation-input'),originalPanel);
  assert.equal((originalPanel!.parentElement as HTMLElement).style.display,'none');
  await tabs('a',true,['a','b'],slowRun);
  assert.match(document.body.textContent!,/正在运行链路…/);
  assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="取消本次运行"]')!.disabled,false);
  await act(async()=>document.querySelector('form')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(calls,1);
  if(finishHidden) {
    await tabs('a',false,['a','b'],slowRun);
    await act(async()=>settle({status:'completed',events:[],finalOutput:{reply:'后台处理结果'},runId:'background',startedAt:0,finishedAt:1}));
    await tabs('a',true,['a','b'],slowRun);
    assert.equal(Array.from(document.querySelectorAll('.simulation-entry.assistant')).filter(e=>e.querySelector('.simulation-report-id')?.textContent === 'background').length,1);
  } else {
    await act(async()=>reject(new Error('测试服务超时')));
    assert.match(document.body.textContent!,/测试服务超时/);
  }
  assert.equal(currentSignal?.aborted,false);
  assert.doesNotMatch(document.body.textContent!,/请求已中止|正在运行链路…/);
  await fill('新的输入');
  assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.disabled,false);
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="清空仿真对话"]')!.click());
}
console.log('PASS mode changes retain pending requests, prevent duplicate sends, and preserve hidden success or returned failure');

let pendingSignal: AbortSignal | undefined; let finishPending!: (value:any)=>void;
await tabs('a',true,['a','b'], async (_input:any,s?:AbortSignal) => { pendingSignal=s; return new Promise(resolve=>{finishPending=resolve;}); });
await send('未完成请求'); await tabs('b'); assert.equal(pendingSignal?.aborted,true);
await act(async()=>finishPending({status:'completed',events:[],finalOutput:{reply:'迟到的回复'},runId:'late',startedAt:0,finishedAt:1}));
assert.doesNotMatch(document.body.textContent!,/未完成请求|迟到的回复/);
await tabs('a'); assert.match(document.body.textContent!,/未完成请求/); assert.match(document.body.textContent!,/请求已中止/); assert.doesNotMatch(document.body.textContent!,/迟到的回复|正在运行链路…/);
await fill('继续'); assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.disabled,false);
let cancelSignal: AbortSignal | undefined;
await tabs('a',true,['a','b'], async (_input:any,s?:AbortSignal) => { cancelSignal=s; return new Promise((_resolve,reject)=>s!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})); });
await send('测试主动取消');
await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="取消本次运行"]')!.click());
assert.equal(cancelSignal?.aborted,true);assert.match(document.body.textContent!,/本次执行已取消/);
assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.disabled,true);
console.log('PASS explicit cancel aborts the request, shows cancellation, and restores the composer');
await act(async()=>switchRoot.unmount());
console.log('PASS interrupted requests stay in their own project and late completion is ignored');
