import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {HmiWidgetLibrary} from '../src/components/hmi-widgets/HmiWidgetLibrary';
import type {HmiWidgetAction,HmiWidgetAdapter} from '../src/components/hmi-widgets/catalog';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const root=createRoot(document.getElementById('root')!);
async function click(selector:string){const b=document.querySelector(selector) as HTMLButtonElement;assert.ok(b,selector);await act(async()=>b.click());}
async function render(props:Parameters<typeof HmiWidgetLibrary>[0]={}){await act(async()=>root.render(<HmiWidgetLibrary key={Math.random()} {...props}/>));}
test('13 design variants load; category filtering and local playback/destination update host state',async()=>{
 const destinations:string[]=[];const media:Array<[string,boolean]>=[];
 await render({onSimulateDestination:d=>destinations.push(d),onSimulateMedia:(t,p)=>media.push([t,p])});
 assert.equal(document.querySelectorAll('article').length,13);
 await click('[aria-label="地图导航：回家"]');assert.deepEqual(destinations,['Home']);
 await click('[aria-label="播放媒体预览"]');assert.equal(media[0][1],true);
 await click('[aria-label="暂停媒体预览"]');assert.equal(media[1][1],false);
 await click('[aria-label="收藏曲目"]');assert.ok(document.querySelector('[aria-label="取消曲目收藏"]'));
 await click('[aria-label="地图导航：加油"]');assert.match(document.querySelector('[role=status]')!.textContent!,/加油站.*待接入/);
 const tab=[...document.querySelectorAll('.hmi-widget-tabs button')].find(b=>b.textContent==='图库') as HTMLButtonElement;
 await act(async()=>tab.click());assert.equal(document.querySelectorAll('article').length,2);
 await click('[aria-label="打开图库大卡"]');assert.equal(document.activeElement?.getAttribute('aria-label'),'组件详情');
});
test('adapter success never mutates simulation and unavailable/errors remain visible',async()=>{
 const actions:HmiWidgetAction[]=[];let simulated=false;
 await render({adapter:{execute:async a=>{actions.push(a);return {status:'applied',message:'已由主机执行'};}},onSimulateDestination:()=>{simulated=true;}});
 await click('[aria-label="地图导航：回家"]');assert.equal(actions[0].type,'navigation.destination');assert.equal(simulated,false);assert.match(document.querySelector('[role=status]')!.textContent!,/主机执行/);
 await render({adapter:{execute:async()=>({status:'unavailable',message:'地点服务离线'})}});
 await click('[aria-label="地图导航：回家"]');assert.match(document.querySelector('[role=alert]')!.textContent!,/离线/);
 await render({adapter:{execute:async()=>{throw Error('网络不可用');}}});
 await click('[aria-label="地图导航：回家"]');assert.match(document.querySelector('[role=alert]')!.textContent!,/网络不可用/);
});
test('cancellation aborts in-flight work and ignores stale completion; unmount also aborts',async()=>{
 let signal:AbortSignal;let finish:(r:{status:'applied';message:string})=>void;
 const adapter:HmiWidgetAdapter={execute:(_a,c)=>{signal=c.signal;return new Promise(resolve=>{finish=resolve;});}};
 await render({adapter});await click('[aria-label="地图导航：回家"]');assert.equal((document.querySelector('[aria-label="地图导航：回家"]') as HTMLButtonElement).disabled,true);
 await click('.hmi-widget-feedback button');assert.equal(signal!.aborted,true);
 await act(async()=>finish!({status:'applied',message:'迟到结果'}));assert.match(document.querySelector('[role=status]')!.textContent!,/已取消/);
 await click('[aria-label="地图导航：回家"]');await act(async()=>root.render(null));assert.equal(signal!.aborted,true);
});
