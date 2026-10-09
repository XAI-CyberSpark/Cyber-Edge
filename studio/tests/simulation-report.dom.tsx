import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { simulationReport, formatDuration } from '../src/domain/simulationReport';
import { SimulationInputPanel } from '../src/components/core/SimulationInputPanel';
import { useHmiSpeech } from '../src/hooks/useHmiSpeech';
import type { RuntimeRunResult } from '../src/domain/runtime';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollIntoView = () => {};
const root = createRoot(document.getElementById('root')!);
const event = (type: any, timestamp: number, payload: any, nodeId = 'model') => ({ id:String(timestamp)+type, runId:'r', sequence:timestamp, timestamp, type, payload, nodeId });
const run: RuntimeRunResult = { runId:'r', status:'completed', input:'x', startedAt:0, finishedAt:20, events:[
 event('node_started',0,{label:'儿童识别'}), event('node_completed',10,{trace:[{step:'Inference',model:'real-model',durationMs:0,tokens:0}],output:{recognition:{status:'risk',confidence:0}}}),
 event('node_started',10,{label:'视频显示'},'video'), event('node_completed',20,{output:{video_display:'opened',video_source:'local_replay'}},'video'),
 event('simulator_command',20,{category:'hmi',key:'message',value:'请留意后排儿童，已显示画面。'})
] };
const report = simulationReport(run);
assert.equal(report.durationMs,20); assert.equal(report.completed,2); assert.equal(report.models[0].tokens,0); assert.equal(formatDuration(report.models[0].durationMs),'0 ms');
assert.match(report.observations.join(),/0.0%/); assert.equal(report.hmi.length,1);
const missing = simulationReport({...run,startedAt:NaN,events:[event('node_failed',5,{error:'视频打开失败'},'video')]});
assert.equal(missing.failed,1);assert.equal(missing.durationMs,null);assert.equal(missing.nodes[0].durationMs,null);assert.equal(missing.models.length,0);
console.log('PASS measured durations/tokens preserve zero, missing metrics stay unknown, failed nodes retained');
await act(async()=>root.render(<SimulationInputPanel requiresImage running={false} onRun={async()=>run}/>));
// A text-only visual test remains blocked instead of claiming inference.
const fill = async(text:string)=>act(async()=>{const el=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
await fill('测试');await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.click());assert.match(document.body.textContent!,/缺少测试图片/);
await act(async()=>root.render(<SimulationInputPanel generalFlow requiresImage running={false} onRun={async()=>run}/>));
await fill('测试链路');await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.click());
assert.equal(document.querySelectorAll('.simulation-entry > small').length,0);
assert.match(document.querySelector('[aria-label="链路验证结果"]')!.textContent!,/链路执行完成/);
assert.match(document.body.textContent!,/real-model/);assert.match(document.body.textContent!,/Token 0/);
assert.ok(Array.from(document.querySelectorAll('summary')).some(e=>e.textContent==='节点执行详情'));
assert.equal(document.querySelector('[aria-label="链路验证结果"] > p')!.textContent?.includes('请留意'),false);
console.log('PASS image-oriented panel exposes diagnostics without role labels or passenger reply as main result');
let latest:ReturnType<typeof useHmiSpeech>;
function Voice({id=1,active=true}:{id?:number;active?:boolean}) { latest=useHmiSpeech({id,text:'请留意后排儿童。'},active);return <div>{latest.status}</div>; }
let played:any[]=[];let cancelled=0;let voices=[{lang:'zh-CN',localService:true}];const listeners=new Set<()=>void>();
const synth={getVoices:()=>voices,speak:(u:any)=>{played.push(u);u.onstart?.();},cancel:()=>{cancelled++;},addEventListener:(_:string,f:()=>void)=>listeners.add(f),removeEventListener:(_:string,f:()=>void)=>listeners.delete(f)};
Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class {text:string;constructor(text:string){this.text=text;}},configurable:true});
await act(async()=>root.render(<Voice/>));assert.equal(played.length,1);assert.equal(latest!.status,'正在播报');
await act(async()=>played[0].onend());assert.equal(latest!.status,'播报完成');
await act(async()=>root.render(<Voice/>));assert.equal(played.length,1);
await act(async()=>root.render(<Voice id={2}/>));assert.equal(played.length,2);
await act(async()=>root.render(<Voice id={2} active={false}/>));const before=played.length;
await act(async()=>latest!.speak('迟到的回复'));assert.equal(played.length,before);
await act(async()=>root.render(<Voice id={2}/>));assert.equal(played.length,before);
await act(async()=>latest!.replay());assert.equal(played.length,before+1);
await act(async()=>played.at(-1).onerror());assert.match(latest!.status,/未能播放/);assert.ok(cancelled>=1);
console.log('PASS local Chinese speech, repeat requests, no rerender replay, hidden-surface cancellation and playback error');
await act(async()=>root.unmount());
assert.equal(listeners.size,0);
