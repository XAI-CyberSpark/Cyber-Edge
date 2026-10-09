import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { chatTimestampIds, formatChatTimestamp } from '../src/domain/chatTimestamps';
import { ChatPanel } from '../src/components/layout/ChatPanel';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
globalThis.fetch=async()=>Response.json({providers:[{id:'minimax',label:'MiniMax',model:'test-model',configured:true}]});
const sent:string[]=[];
const root=createRoot(document.getElementById('root')!);
await act(async()=>root.render(<ChatPanel messages={[]} providerId="minimax" model="test-model" onModelChange={()=>{}} onSendMessage={text=>sent.push(text)}/>));
const field=()=>document.querySelector<HTMLTextAreaElement>('[aria-label="场景需求"]')!;
const fill=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field(),value);field().dispatchEvent(new window.Event('input',{bubbles:true}));});
const upload=async(file:any)=>act(async()=>{const input=document.querySelector<HTMLInputElement>('[aria-label="选择需求文件"]')!;Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));});
assert.ok(document.querySelector('[aria-label="场景共创欢迎"] img[src="/logo.png"]'));
await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('.co-chat-suggestions button')].find(e=>e.textContent==='儿童乘车关怀')!.click());
assert.match(field().value,/儿童乘车关怀/);assert.deepEqual(sent,[]);
await fill('原有需求');
await upload({name:'场景.md',size:20,text:async()=> '后排有人时提醒'});
assert.equal(field().value,'原有需求\n\n后排有人时提醒');assert.deepEqual(sent,[]);
assert.match(document.querySelector('[role=status]')!.textContent!,/确认内容后发送/);
assert.equal(document.querySelector<HTMLInputElement>('[type=file]')!.value,'');
console.log('PASS text file appends to existing draft without sending, file input resets');
const valid=field().value;
for(const file of [{name:'a.png',size:1},{name:'a.txt',size:65537},{name:'a.txt',size:0,text:async()=>''},{name:'a.txt',size:1,text:async()=>{throw Error('读取失败')}}]) {await upload(file);assert.equal(field().value,valid);assert.ok(document.querySelector('[role=alert]'));}
assert.deepEqual(sent,[]);console.log('PASS unsupported, oversized, empty and unreadable files preserve draft and show error');
await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="发送场景需求"]')!.click());
assert.deepEqual(sent,[valid]);assert.equal(field().value,'');
assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="发送场景需求"]')!.disabled,true);
assert.ok(document.querySelector('.co-chat-composer-tools [aria-label="添加需求文件"]'));
assert.ok(document.querySelector('.co-chat-composer-tools [aria-label="场景创作模型"]'));
await act(async()=>root.render(<ChatPanel messages={[{id:'1',role:'user',content:valid}]} providerId="minimax" model="test-model" onModelChange={()=>{}} onSendMessage={text=>sent.push(text)}/>));
assert.equal(document.querySelector('[aria-label="场景共创欢迎"]'),null);
console.log('PASS explicit send uses complete draft and clears composer; plus and model picker remain available');
const savedMessages = [
  {id:'saved-user',role:'user' as const,content:'原始需求',timestamp:1728000000000},
  {id:'saved-assistant',role:'assistant' as const,content:'旧的验证结论\n\n原始运行记录 run_example',timestamp:1728000001000},
];
const currentMessage = {id:'current',role:'assistant' as const,content:'本次回复',timestamp:1728000002000};
const originalMessages = JSON.stringify(savedMessages);
await act(async()=>root.render(<ChatPanel messages={[...savedMessages,currentMessage]} providerId="minimax" onModelChange={()=>{}} onSendMessage={()=>{}}/>));
assert.equal(document.querySelector('.co-chat-saved'),null);
assert.equal(document.querySelector('.co-chat-history details'),null);
assert.deepEqual([...document.querySelectorAll('.co-chat-bubble')].map(el=>el.textContent?.trim()),['原始需求','旧的验证结论\n原始运行记录 run_example','本次回复']);
assert.ok(document.querySelector('.co-chat-header h3 > svg.lucide-sparkles.text-primary[aria-hidden="true"]'));
assert.equal(document.querySelectorAll('time').length,1);
assert.ok(document.querySelector('.co-chat-turn-time'));
assert.equal(document.querySelector('.co-chat-bubble time'),null);
assert.equal(document.querySelector('time')!.dateTime,new Date(savedMessages[0].timestamp).toISOString());
assert.equal(JSON.stringify(savedMessages),originalMessages);
await act(async()=>root.render(<ChatPanel messages={[{id:'legacy',role:'assistant',content:'无时间的旧记录',timestamp:NaN}]} providerId="minimax" onModelChange={()=>{}} onSendMessage={()=>{}}/>));
assert.equal(document.querySelector('time'),null, 'unknown timestamps must not be invented');
console.log('PASS saved history renders directly in original order, title has purple Sparkles, known timestamps remain');
const baseTime = 1728000000000;
const execution = {startedAt:baseTime,finishedAt:baseTime+106000,durationMs:106000,status:'completed' as const,operations:[{timestamp:baseTime,content:'读取场景配置'},{timestamp:baseTime+1000,content:'检查工作流'}]};
const turns = [
  {id:'u1',role:'user' as const,content:'第一轮',timestamp:baseTime},
  {id:'a1',role:'assistant' as const,content:'第一轮最终回复',timestamp:baseTime,execution},
  {id:'u2',role:'user' as const,content:'第二轮',timestamp:baseTime+200000},
  {id:'a2',role:'assistant' as const,content:'',timestamp:Date.now(),isStreaming:true,execution:{startedAt:Date.now(),status:'running' as const,operations:[{timestamp:Date.now(),content:'正在检查当前场景'}]}},
];
await act(async()=>root.render(<ChatPanel messages={turns} providerId="minimax" onModelChange={()=>{}} onSendMessage={()=>{}}/>));
assert.equal(document.querySelectorAll('.co-chat-turn-time').length,1, 'consecutive turns should share a timestamp separator');
assert.equal(document.querySelectorAll('.co-chat-bubble time').length,0);
const activity = document.querySelector<HTMLDetailsElement>('.co-chat-activity-details')!;
assert.equal(activity.open,false);
assert.match(activity.querySelector('summary')!.textContent!,/用时 1分46秒/);
await act(async()=>activity.querySelector('summary')!.click());
assert.equal(activity.open,true);
assert.match(activity.textContent!,/读取场景配置/);
assert.match(activity.textContent!,/检查工作流/);
assert.match(document.querySelector('.co-chat-activity-current')!.textContent!,/正在检查当前场景/);
assert.equal(document.querySelectorAll('.co-chat-markdown').length,1);
assert.equal(turns[1].execution!.durationMs,106000);
console.log('PASS consecutive user turns share a centered timestamp; reply duration expands actual operations, active reply keeps live progress');
await act(async()=>root.render(<ChatPanel messages={[{...turns[3],isStreaming:false,content:'请求失败',execution:{...execution,status:'failed'}}]} providerId="minimax" onModelChange={()=>{}} onSendMessage={()=>{}}/>));
assert.match(document.querySelector('summary')!.textContent!,/失败/);
assert.equal(document.querySelector('.co-chat-activity-current'),null);
assert.match(document.querySelector('.co-chat-markdown')!.textContent!,/请求失败/);
await act(async()=>root.render(<ChatPanel messages={[{...turns[3],isStreaming:false,content:'',execution:{...execution,status:'interrupted',durationMs:undefined,finishedAt:undefined}}]} providerId="minimax" onModelChange={()=>{}} onSendMessage={()=>{}}/>));
assert.match(document.querySelector('summary')!.textContent!,/用时未记录.*已中断/);
console.log('PASS failed replies keep final errors, interrupted restored replies do not invent duration');
const local = (year:number,month:number,day:number,hour=12,minute=0) => new Date(year,month-1,day,hour,minute).getTime();
const now = local(2026,10,5,14);
assert.equal(formatChatTimestamp(local(2026,10,5,2,51),now,'zh-CN'),'02:51');
assert.equal(formatChatTimestamp(local(2026,10,4,23,50),now,'zh-CN'),'星期日 23:50');
assert.equal(formatChatTimestamp(local(2026,9,28,8),now,'zh-CN'),'星期一 08:00');
assert.match(formatChatTimestamp(local(2026,9,27,8),now,'zh-CN'),/9月27日.*08:00/);
assert.match(formatChatTimestamp(local(2025,10,5,8),now,'zh-CN'),/2025/);
assert.equal(formatChatTimestamp(local(2026,10,4,23,50),local(2026,10,5,0,1),'en-US'),'Sunday 23:50');
assert.equal(formatChatTimestamp(NaN,now,'zh-CN'),'');
const user = (id:string,timestamp:number) => ({id,role:'user' as const,content:id,timestamp});
const assistant = (id:string,timestamp:number,finishedAt?:number) => ({id,role:'assistant' as const,timestamp,execution:{finishedAt}});
const base=local(2026,10,5,10);
assert.deepEqual([...chatTimestampIds([user('first',base),assistant('a',base,base+120000),user('quick',base+180000),assistant('b',base+180000,base+240000),user('exact-hour',base+3840000),assistant('c',base+3840000,base+3840000),user('after-hour',base+7440001)])],['first','after-hour']);
assert.deepEqual([...chatTimestampIds([user('before-midnight',local(2026,10,4,23,58)),assistant('a',local(2026,10,4,23,59)),user('after-midnight',local(2026,10,5,0,1))])],['before-midnight','after-midnight']);
assert.deepEqual([...chatTimestampIds([user('long-task',base),assistant('a',base,base+7200000),user('followup',base+7260000)])],['long-task']);
assert.deepEqual([...chatTimestampIds([user('overnight',local(2026,10,4,23,58)),assistant('a',local(2026,10,4,23,58),local(2026,10,5,0,1)),user('new-day',local(2026,10,5,0,2))])],['overnight','new-day']);
assert.deepEqual([...chatTimestampIds([user('invalid',NaN),user('valid',base)])],['valid']);
// Day differences stay calendar based over DST, and full dates remain available on hover.
assert.match(formatChatTimestamp(local(2026,3,7,23,59),local(2026,3,8,12),'en-US'),/^Saturday /);
await act(async()=>root.render(<ChatPanel messages={[user('first',base),{id:'a',role:'assistant',content:'回复',timestamp:base,execution:{...execution,finishedAt:base+1000}},user('continued',base+2000)]} providerId="minimax" onModelChange={()=>{}} onSendMessage={()=>{}}/>));
assert.equal(document.querySelectorAll('time').length,1);
assert.ok(document.querySelector('time')!.title);
console.log('PASS today/week/older/year labels, exact one-hour threshold, midnight, long replies, invalid dates and continuous-turn DOM');
await act(async()=>root.unmount());
