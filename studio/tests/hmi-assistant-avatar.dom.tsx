import assert from 'node:assert/strict';
import React, {act, StrictMode, useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {CockpitAssistant} from '../src/components/core/CockpitAssistant';
import {VehicleWorld} from '../src/domain/vehicleWorld';
import {OPENSPARX_MODEL} from '../src/domain/opensparx';
import type {HMIState} from '../src/components/core/VehicleSimulator';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let reduced=false,hidden=false;const listeners=new Set<()=>void>();
window.matchMedia=(()=>({get matches(){return reduced},addEventListener:(_:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_:string,fn:()=>void)=>listeners.delete(fn)})) as any;
Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
let id=0;const rafs=new Map<number,FrameRequestCallback>();
(globalThis as any).requestAnimationFrame=(fn:FrameRequestCallback)=>{rafs.set(++id,fn);return id;};
(globalThis as any).cancelAnimationFrame=(key:number)=>rafs.delete(key);
let now=0;
async function step(delta=32){now+=delta;const callbacks=[...rafs.values()];rafs.clear();await act(async()=>callbacks.forEach(fn=>fn(now)));}
let respond:(value:unknown)=>void=()=>{};
let reject:(value:unknown)=>void=()=>{};
let requests=0;
globalThis.fetch=(()=>{requests++;return new Promise((yes,no)=>{respond=yes;reject=no;});}) as any;
let permissionCalls=0,trackStops=0;
let allowMicrophone!:(stream:unknown)=>void;
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{permissionCalls++;return new Promise(resolve=>{allowMicrophone=resolve;});}}});
const audioTrack={stop:()=>{trackStops++;},addEventListener:()=>{}};
const audioStream={getTracks:()=>[audioTrack],getAudioTracks:()=>[audioTrack]};
class MockAudioNode {
  port={onmessage:null as null|((event:{data:unknown})=>void),close:()=>{},postMessage:()=>{queueMicrotask(()=>{this.port.onmessage?.({data:{samples:new Float32Array(16000).fill(.1)}});this.port.onmessage?.({data:{done:true}});});}};
  connect(){} disconnect(){}
}
class MockAudioContext {
  sampleRate=16000;state='running';audioWorklet={addModule:async()=>{}};destination={};
  resume(){return Promise.resolve();} close(){this.state='closed';return Promise.resolve();}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
}
(window as any).AudioContext=(globalThis as any).AudioContext=MockAudioContext;
(window as any).AudioWorkletNode=(globalThis as any).AudioWorkletNode=MockAudioNode;
const world=new VehicleWorld();
let hmi:HMIState={message:'System Ready',navDestination:'',musicTrack:'',alert:'none',agentStatus:'idle',rearCamera:{visible:false,riskAction:'',durationSeconds:0}};
function Harness(){const snapshot=useSyncExternalStore(world.subscribe,world.getSnapshot);return <div className="cockpit-hmi cockpit-minimal"><CockpitAssistant world={world} snapshot={snapshot} hmi={hmi}/></div>;}
const root=createRoot(document.getElementById('root')!);
const render=async()=>act(async()=>root.render(<StrictMode><Harness/></StrictMode>));
const state=()=>document.querySelector('.ca-orb')!.getAttribute('data-avatar-state');
const path=()=>document.querySelector('.ca-orb mask>path')!.getAttribute('d');
const click=async(text:string)=>{const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text||b.getAttribute('aria-label')===text);assert.ok(button,text);await act(async()=>button.click());};
const speak=async(text:string)=>{
  await click('开始语音输入');
  await act(async()=>allowMicrophone(audioStream));
  await click('说完了，立即处理');
  await act(async()=>respond({ok:true,json:async()=>({text})}));
};
const toggle=async()=>act(async()=>document.querySelector<HTMLButtonElement>('.ca-toggle')!.click());
const reply=async(plan:unknown)=>act(async()=>respond({ok:true,json:async()=>({model:OPENSPARX_MODEL,choices:[{message:{content:JSON.stringify(plan)}}]})}));
await render();
assert.equal(state(),'idle');assert.equal(rafs.size,1);assert.ok(document.querySelector('.ca-orb svg'));assert.equal(document.querySelector('.lucide-sparkles'),null);
assert.equal(document.querySelector('.ca-orb svg')!.getAttribute('viewBox'),'-158 -158 316 316');
await step();const first=path();for(let i=0;i<8;i++)await step();assert.notEqual(path(),first);
assert.equal(state(),'idle');assert.equal(requests,0);
assert.equal(permissionCalls,0);assert.equal(document.querySelector('.ca-body'),null);
assert.equal(document.querySelector('.ca-toggle small'),null);
assert.equal(document.querySelector('.ca-toggle > svg'),null);
assert.ok(document.querySelector('.ca-topline .ca-microphone'));
await toggle();assert.equal(document.querySelector('.ca-body'),null);assert.equal(document.querySelector('.ca-toggle')!.getAttribute('aria-expanded'),'false');
await click('开始语音输入');assert.equal(permissionCalls,1);assert.equal(state(),'idle');assert.equal(document.querySelector('.ca-body'),null);
await click('取消语音输入');await act(async()=>allowMicrophone(audioStream));assert.equal(trackStops,1);assert.equal(state(),'idle');assert.equal(requests,0);
await click('开始语音输入');await act(async()=>allowMicrophone(audioStream));assert.equal(state(),'wide');assert.equal(document.querySelector('.ca-body'),null);
await act(async()=>document.querySelector('.ca-microphone')!.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
assert.equal(state(),'idle');assert.equal(trackStops,2);assert.equal(requests,0);
await click('开始语音输入');await act(async()=>allowMicrophone(audioStream));assert.equal(state(),'wide');
await click('说完了，立即处理');assert.equal(state(),'thinking');assert.equal(trackStops,3);assert.equal(requests,1);
await act(async()=>respond({ok:true,json:async()=>({text:'空调调到23度'})}));assert.equal(state(),'thinking');assert.equal(requests,2);
assert.equal(document.querySelector('.ca-live-text')!.textContent,'空调调到23度');
assert.equal(document.querySelector('.ca-body'),null); // Stay compact until there is a response.
const temperature=world.getSnapshot().car.ac.temp;
await reply({kind:'climate',temperature:23,on:true});
assert.equal(state(),'idle');assert.equal(world.getSnapshot().car.ac.temp,temperature);
assert.match(document.querySelector('[role="log"]')!.textContent!,/空调调到23度/);
assert.equal(document.querySelector('textarea'),null);assert.equal(document.querySelector('.ca-composer'),null);
assert.equal(document.querySelector('.ca-welcome'),null);assert.equal(document.querySelector('.ca-suggestions'),null);assert.equal(document.querySelector('.ca-footnote'),null);
assert.ok(document.querySelector('[aria-label="你的语音"]'));
assert.ok(document.querySelector('[aria-label="助手回复"]'));
assert.equal(document.querySelector('[aria-label="点赞（暂未接入）"]')?.hasAttribute('disabled'),true);
assert.match(document.querySelector('.ca-toggle')!.textContent!,/点击麦克风继续/);
assert.doesNotMatch(document.querySelector('[role="log"]')!.textContent!,/上海中心|门票多少钱|特色餐厅/);
await click('关闭语音对话');assert.equal(document.querySelector('.ca-body'),null);
assert.equal(document.activeElement,document.querySelector('.ca-toggle'));
await toggle();assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='确认执行'));
await click('暂不执行');
await toggle();assert.equal(document.querySelector('.ca-body'),null);
console.log('PASS compact voice: Actual recording selects listening without expanding; final text appears in the bar and automatically sends once; reply expands and vehicle action still needs confirmation.');
await toggle();assert.equal(document.querySelector('textarea'),null);assert.equal(document.querySelector('.ca-toggle')!.getAttribute('aria-expanded'),'true');
console.log('PASS 1: Existing HMI toggle contains the live Bloub avatar, idles without cycling or requests, and reopens read-only voice history without a text input.');
await speak('你好');assert.equal(state(),'thinking');await step();
await reply({kind:'reply',text:'你好，有什么可以帮你？'});assert.equal(state(),'idle');assert.match(document.querySelector('[role="log"]')!.textContent!,/你好，有什么可以帮你/);
await speak('你好');assert.equal(state(),'thinking');await act(async()=>reject(new Error('测试服务不可用')));assert.equal(state(),'idle');assert.match(document.querySelector('[role="log"]')!.textContent!,/测试服务不可用/);
await click('重新说一次');assert.equal(document.querySelector('.ca-body'),null);
await act(async()=>allowMicrophone(audioStream));assert.equal(state(),'wide');
await act(async()=>document.querySelector('.ca-microphone')!.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
await toggle();assert.equal(document.querySelector('textarea'),null);
console.log('PASS 2: Actual send lifecycle selects thinking, returns to idle for success and failure, and preserves conversation output.');
const pointer = async (target: Element, pointerType = 'mouse') => act(async () => {
  const event = new window.MouseEvent('pointerdown', { bubbles: true, composed: true, button: 0 });
  Object.defineProperty(event, 'pointerType', { value: pointerType }); target.dispatchEvent(event);
});
await pointer(document.querySelector('[role="log"]')!);assert.ok(document.querySelector('.ca-body'));
await pointer(document.querySelector('.cockpit-hmi')!, 'touch');assert.equal(document.querySelector('.ca-body'),null);
await toggle();assert.equal(document.querySelector('textarea'),null);assert.match(document.querySelector('[role="log"]')!.textContent!,/测试服务不可用/);
await speak('稍后返回');await toggle();await click('关闭语音对话');
await reply({kind:'reply',text:'保留的迟到回复'});assert.equal(document.querySelector('.ca-body'),null);
await toggle();assert.match(document.querySelector('[role="log"]')!.textContent!,/保留的迟到回复/);
console.log('PASS outside dismiss: inside clicks stay open, touch closes, voice history persists, late reply does not reopen.');

await speak('你好');assert.equal(state(),'thinking');
hmi={...hmi,alert:'warning',message:'请留意后排儿童'};await render();assert.equal(state(),'alert');
await reply({kind:'reply',text:'收到'});assert.equal(state(),'alert');
await click('收起场景提醒');assert.equal(state(),'idle');assert.ok(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='场景提醒'));
await click('场景提醒');assert.equal(state(),'alert');
await pointer(document.querySelector('.cockpit-hmi')!);assert.equal(document.querySelector('.ca-scene'),null);
await click('场景提醒');assert.ok(document.querySelector('.ca-scene'));assert.equal(state(),'alert');
hmi={...hmi,alert:'info',message:'座舱温度已调整'};await render();assert.equal(state(),'notify');
hmi={...hmi,agentStatus:'processing'};await render();assert.equal(state(),'thinking');
hmi={...hmi,agentStatus:'idle',alert:'none',message:'System Ready'};await render();assert.equal(state(),'idle');
console.log('PASS 3: Warning overrides pending work; collapse/reopen, informational reminders, scene processing and cleared events update the avatar.');
await act(async()=>world.setCar(car=>({...car,windows:{...car.windows,rr:100}})));
await toggle();
await speak('关闭右后车窗');await reply({kind:'windows',targets:{rr:0}});
assert.equal(state(),'idle');assert.equal(world.getSnapshot().car.windows.rr,100);
await pointer(document.querySelector('.cockpit-hmi')!);assert.equal(document.querySelector('.ca-body'),null);
assert.equal(world.getSnapshot().car.windows.rr,100);await toggle();
assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='确认执行'));

const original=world.moveWindows.bind(world);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
world.moveWindows=async(target,source)=>{await gate;return original(target,source,1);};
await click('确认执行');assert.equal(state(),'thinking');
await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,60));});
assert.equal(state(),'idle');assert.equal(world.getSnapshot().car.windows.rr,0);assert.match(document.querySelector('[role="log"]')!.textContent!,/已完成/);
console.log('PASS 4: Vehicle suggestions still require confirmation; execution thinks and returns to idle with actual simulated result.');
await step();const before=path();hidden=true;await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));assert.equal(rafs.size,0);
hidden=false;await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await step(60000);assert.equal(path(),before);assert.equal(rafs.size,1);
reduced=true;await act(async()=>listeners.forEach(fn=>fn()));assert.equal(rafs.size,0);
hmi={...hmi,alert:'warning',message:'减少动态效果下的提醒'};await render();assert.equal(state(),'alert');assert.doesNotMatch(document.querySelector('.ca-orb')!.innerHTML,/NaN|Infinity/);assert.equal(rafs.size,0);
await act(async()=>root.unmount());assert.equal(rafs.size,0);assert.equal(listeners.size,0);
console.log('PASS 5: Hidden tab freezes, resume avoids time jumps, reduced motion preserves alert pose, and unmount removes the loop.');
