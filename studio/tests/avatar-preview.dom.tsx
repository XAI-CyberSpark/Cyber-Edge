import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React, {act, StrictMode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {BotEngine} from '../src/vendor/bloub/engine';
import {SEQUENCE, POSES} from '../src/vendor/bloub/states';
import {RAYON} from '../src/vendor/bloub/repere';
import {defaultCycle} from '../src/vendor/bloub/cycles';
import {BloubAvatar} from '../src/components/avatar/BloubAvatar';
import {AvatarPlayback} from '../src/components/avatar/avatarPlayback';
import AvatarPreviewPage from '../src/components/pages/AvatarPreviewPage';

const vendor=process.cwd()+'/src/vendor/bloub/';
const hashes=JSON.parse(readFileSync(vendor+'sha256.json','utf8'));
for(const [name,hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(vendor+name)).digest('hex'),hash,name);
assert.equal(Object.keys(hashes).length,12);
console.log('PASS 1: All 12 upstream core files match the acquired source SHA-256.');

let samples=0;
for(const state of [...SEQUENCE,'swirl'] as const) for(const time of [0,.08,.2,.5,POSES[state],1.6,3,10]) {
 const frame=new BotEngine(RAYON,state).sample(time);
 const html=renderToStaticMarkup(<><BloubAvatar frame={frame}/><BloubAvatar frame={frame} ink="#f1efe9" paper="#050505"/></>);
 assert.doesNotMatch(html,/NaN|Infinity/);
 const doc=new JSDOM(html).window.document;
 const svgs=Array.from(doc.querySelectorAll('svg'));
 const masks=svgs.map(s=>s.querySelector('mask')!);
 assert.notEqual(masks[0].id,masks[1].id);
 for(const svg of svgs){
  assert.equal(svg.getAttribute('viewBox'),'-158 -158 316 316');
  assert.equal(svg.querySelector('mask>path')!.getAttribute('d'),frame.bodyPath);
  assert.equal(svg.querySelectorAll('mask>path').length,frame.eyes.length+1);
  frame.eyes.forEach((eye,i)=>assert.equal(svg.querySelectorAll('mask>path')[i+1].getAttribute('transform'),eye.matrix));
  const layers=Array.from(svg.children);
  const body=layers.find(e=>e.hasAttribute('opacity'))!;
  assert.equal(body.firstElementChild!.getAttribute('d'),frame.bodyPath);
  assert.equal(body.querySelector('g')!.getAttribute('mask'),`url(#${svg.querySelector('mask')!.id})`);
  assert.equal(layers[1].children.length,frame.arcs.length);
  assert.equal(layers.at(-1)!.children.length,frame.arcs.length);
  frame.arcs.forEach((arc,i)=>{
   assert.equal(layers[1].children[i].getAttribute('d'),arc.back);
   assert.equal(layers.at(-1)!.children[i].getAttribute('d'),arc.front);
   assert.equal(svg.querySelectorAll('linearGradient')[i].children.length,arc.grad.stops.length);
  });
  const dots=frame.dotsBehind?layers[2]:layers[3];
  assert.equal(dots.children.length,frame.dots.length);
  if(frame.notif)assert.equal(layers.at(-2)!.getAttribute('r'),String(frame.notif.r));
 }
 samples++;
}
console.log(`PASS 2: ${samples} frames cover every state, unique SVG masks, eyes, particle order and ring layers without invalid geometry.`);

const playback=new AvatarPlayback('idle');
const reference=new BotEngine(RAYON,'idle');
for(let i=0;i<10;i++){playback.advance(.05);reference.sample((i+1)*.05);}
reference.setState('orbit',.49999999999999994);playback.select('orbit');
for(let i=1;i<=20;i++){
 playback.advance(.05);
 // Use the same accumulated floating point clock, as the original wrapper does.
 let t=.49999999999999994;for(let j=0;j<i;j++)t+=.05;
 assert.deepEqual(playback.frame,reference.sample(t));
}
const interrupted=new AvatarPlayback('idle');const interruptedRef=new BotEngine(RAYON,'idle');
interrupted.select('wide');interruptedRef.setState('wide',0);
interrupted.advance(.05);interrupted.advance(.05);interruptedRef.sample(.1);
interrupted.select('alert');interruptedRef.setState('alert',.1);
interrupted.advance(.05);assert.deepEqual(interrupted.frame,interruptedRef.sample(.1+.05));
playback.seek(.7);assert.deepEqual(playback.frame,new BotEngine(RAYON,'orbit').sample(.7));
playback.restart();assert.deepEqual(playback.frame,new BotEngine(RAYON,'orbit').sample(0));
playback.advance(60);assert.equal(playback.elapsed,.064);
playback.advance(NaN);playback.advance(-1);assert.equal(playback.elapsed,.064);
console.log('PASS 3: Interrupted transitions, seek, replay and bounded frame delta preserve engine results.');
playback.startCycle();const seen=[playback.state];
for(let i=0;i<2000 && seen.length<=SEQUENCE.length;i++) {playback.advance(.05);if(seen.at(-1)!==playback.state)seen.push(playback.state);}
assert.deepEqual(seen,[...defaultCycle().blocks.map(b=>b.state),'idle']);
console.log('PASS 4: Continuous playback visits all 14 original states in order and loops.');

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/?preview=avatar'});
for(const key of ['window','document','navigator','HTMLElement']) Object.defineProperty(globalThis,key,{value:(dom.window as any)[key],configurable:true});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let reduced=false,hidden=false;const mediaListeners=new Set<()=>void>();
window.matchMedia=(()=>({get matches(){return reduced},addEventListener:(_:string,fn:()=>void)=>mediaListeners.add(fn),removeEventListener:(_:string,fn:()=>void)=>mediaListeners.delete(fn)})) as any;
Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
let nextId=0;const frames=new Map<number,FrameRequestCallback>();
(globalThis as any).requestAnimationFrame=(callback:FrameRequestCallback)=>{frames.set(++nextId,callback);return nextId;};
(globalThis as any).cancelAnimationFrame=(id:number)=>frames.delete(id);
const step=async(time:number)=>{const callbacks=[...frames.values()];frames.clear();await act(async()=>callbacks.forEach(fn=>fn(time)));};
const root=createRoot(document.getElementById('root')!);
await act(async()=>root.render(<StrictMode><AvatarPreviewPage/></StrictMode>));
const findButton=(text:string)=>Array.from(document.querySelectorAll('button')).find(e=>e.textContent===text||e.getAttribute('aria-label')===text)!;
const click=async(text:string)=>{const b=findButton(text);assert.ok(b,text);await act(async()=>b.click());};
const geometry=()=>Array.from(document.querySelectorAll('.avatar-preview-stage mask>path:first-child')).map(e=>e.getAttribute('d'));
assert.equal(document.querySelectorAll('.avatar-preview-tile').length,14);
assert.equal(frames.size,1);await step(0);await step(32);assert.equal(geometry()[0],geometry()[1]);
const tile=Array.from(document.querySelectorAll<HTMLButtonElement>('.avatar-preview-tile')).find(e=>e.textContent!.endsWith('orbit'))!;
await act(async()=>tile.click());await step(64);await step(96);assert.equal(geometry()[0],geometry()[1]);
await click('暂停动画');assert.equal(frames.size,0);const frozen=geometry();await step(1000);assert.deepEqual(geometry(),frozen);
await click('播放动画');await step(2000);assert.deepEqual(geometry(),frozen);await step(2032);
console.log('PASS 5: Both palettes share geometry; StrictMode has one loop; pause freezes and resume does not jump.');

const select=async(label:string,value:string)=>{const el=document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;await act(async()=>{el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));});};
const before=geometry();await select('HMI 形象配色','original');assert.ok(document.querySelector('.avatar-preview-matte'));assert.deepEqual(geometry(),before);
await select('显示尺寸','48');assert.deepEqual(Array.from(document.querySelectorAll('.avatar-preview-stage svg')).map(e=>e.getAttribute('width')),['48','48']);
assert.equal(frames.size,1);
console.log('PASS 6: Palette and size controls update both previews without resetting geometry or creating another loop.');

hidden=true;await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));assert.equal(frames.size,0);
const offscreen=geometry();hidden=false;await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await step(50000);assert.deepEqual(geometry(),offscreen);
reduced=true;await act(async()=>mediaListeners.forEach(fn=>fn()));assert.equal(frames.size,0);assert.ok(findButton('播放动画'));
await click('连续播放全部');assert.equal(frames.size,1);assert.match(document.querySelector('[role="status"]')!.textContent!,/轮播/);
await act(async()=>root.unmount());assert.equal(frames.size,0);assert.equal(mediaListeners.size,0);
console.log('PASS 7: Hidden tabs suspend, reduced motion pauses, explicit play works, and unmount cleans listeners and RAF.');
dom.window.close();
