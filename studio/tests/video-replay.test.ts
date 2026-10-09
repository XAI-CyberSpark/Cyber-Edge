import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {VideoReplay, type ReplayInput} from '../src/domain/videoReplay';
import {GraphEngine,type GraphCallbacks} from '../src/utils/GraphEngine';
import type {RuntimeRunResult} from '../src/domain/runtime';
import graph from './fixtures/child-care-contract.json';
const tick=()=>new Promise(r=>setTimeout(r,25));
function fixture(t:any) {
 const dom=new JSDOM('<div id="preview"></div><div id="screen"></div>');
 Object.defineProperty(globalThis,'document',{value:dom.window.document,configurable:true});
 const media=dom.window.HTMLMediaElement.prototype;
 Object.defineProperty(media,'duration',{get:()=>60,configurable:true});
 Object.defineProperty(media,'readyState',{get:()=>2,configurable:true});
 Object.defineProperty(media,'paused',{get(){return (this as any)._paused ?? true},configurable:true});
 Object.defineProperty(dom.window.HTMLVideoElement.prototype,'videoWidth',{get:()=>1280,configurable:true});
 Object.defineProperty(dom.window.HTMLVideoElement.prototype,'videoHeight',{get:()=>720,configurable:true});
 media.load=function(){};
 media.play=async function(){(this as any)._paused=false;this.dispatchEvent(new dom.window.Event('playing'));};
 media.pause=function(){if(!this.paused){(this as any)._paused=true;this.dispatchEvent(new dom.window.Event('pause'));}};
 dom.window.HTMLCanvasElement.prototype.getContext=(()=>({drawImage(){}})) as any;
 dom.window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,actual-sampled-frame';
 let revoked=0;t.mock.method(URL,'createObjectURL',()=> 'blob:local-test');t.mock.method(URL,'revokeObjectURL',()=>{revoked++});
 const replay=new VideoReplay();const preview=dom.window.document.getElementById('preview')!,screen=dom.window.document.getElementById('screen')!;
 replay.attachPreview(preview);replay.attachScreen(screen);
 const load=()=>{replay.load(new File(['test'],'rear.mp4',{type:'video/mp4'}));const video=preview.querySelector('video')!;video.dispatchEvent(new dom.window.Event('loadedmetadata'));return video;};
 const video=load();t.after(()=>{replay.dispose();dom.window.close();t.mock.restoreAll();});
 return {replay,preview,screen,video,load,dom,revoked:()=>revoked};
}
function engine(show?:GraphCallbacks['showVideoReplay']) {
 const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){},updateSimulatorState(){},showVideoReplay:show};
 return new GraphEngine(structuredClone(graph.nodes) as any,graph.edges,cb);
}
const response=(status='risk',confidence=.95)=>Response.json({model:'opensparx-cabin-intent:3b',choices:[{finish_reason:'stop',message:{content:JSON.stringify({status,confidence,risk_action:'站起',summary:'儿童在后排站起'})}}]});
const complete:RuntimeRunResult={runId:'test',status:'completed',startedAt:0,finishedAt:1,input:'',events:[],finalOutput:{decision_status:'normal'}};
for(const status of ['risk','normal','unknown']) test(`sampled ${status} follows real graph and display policy`,async t=>{
 const f=fixture(t);let input:ReplayInput|undefined;
 t.mock.method(globalThis,'fetch',async(_url:any,o:any)=>{const body=JSON.parse(o.body);assert.equal(body.messages[1].content[1].image_url.url,'data:image/jpeg;base64,actual-sampled-frame');return response(status)});
 f.replay.setRunner(async(i,s)=>{input=i;return engine(frame=>f.replay.show(frame)).run(i,{signal:s,useCameraFrame:false})});
 f.video.currentTime=7;await f.replay.play();await tick();
 assert.ok(input);assert.equal(input.replay.mediaTime,7);
 assert.equal(f.replay.getSnapshot().popup,status==='risk');
 assert.equal(f.dom.window.document.querySelectorAll('video').length,1);
 assert.equal((status==='risk'?f.screen:f.preview).querySelector('video'),f.video);
 if(status==='risk'){f.replay.dismiss();assert.equal(f.replay.show(input.replay),'already-notified');assert.equal(f.replay.getSnapshot().popup,false);}
});
test('single-image risk fails when independent video source is unavailable',async t=>{
 t.mock.method(globalThis,'fetch',async()=>response());
 const r=await engine().run({type:'image',content:'data:image/jpeg;base64,single'});
 assert.equal(r.status,'failed');assert.ok(r.events.some(e=>e.type==='node_failed'&&e.nodeId==='rear_video_display'));
 assert.ok(r.events.some(e=>e.type==='simulator_command'&&e.payload.key==='message'&&String(e.payload.value).startsWith('后排画面未显示')));
});
test('slow inference is serial; pause cancels and late risk cannot open HMI',async t=>{
 const f=fixture(t);let count=0,signal:AbortSignal|undefined,resolve:any;
 t.mock.method(globalThis,'fetch',async()=>{count++;return new Promise(r=>{resolve=r})});
 f.replay.setRunner((i,s)=>{signal=s;return engine(frame=>f.replay.show(frame)).run(i,{signal:s})});
 await f.replay.play();await tick();await f.replay.play();await tick();assert.equal(count,1);
 f.replay.pause();assert.equal(signal!.aborted,true);resolve(response());await tick();
 assert.equal(f.replay.getSnapshot().popup,false);assert.equal(f.replay.getSnapshot().phase,'paused');
});
test('replacement invalidates source, revokes URL, and waits for old runner',async t=>{
 const f=fixture(t);let resolve:any,old:ReplayInput|undefined,calls=0;
 f.replay.setRunner((i)=>{calls++;old=i;return new Promise(r=>{resolve=r})});
 await f.replay.play();await tick();const oldFrame=old!.replay;
 f.load();assert.equal(f.revoked(),1);await f.replay.play();await tick();assert.equal(calls,1);
 assert.throws(()=>f.replay.show(oldFrame));resolve(complete);await tick();assert.equal(f.replay.getSnapshot().popup,false);
});
test('seek rearms once-per-playback alert and ending stops display',async t=>{
 const f=fixture(t);let input:ReplayInput|undefined;f.replay.setRunner(async i=>{input=i;return complete});
 await f.replay.play();await tick();assert.equal(f.replay.show(input!.replay),'opened');
 f.replay.seek(20);assert.equal(f.replay.getSnapshot().popup,false);assert.equal(f.replay.show({...input!.replay,mediaTime:20}),'opened');
 f.video.dispatchEvent(new f.dom.window.Event('ended'));assert.equal(f.replay.getSnapshot().phase,'ended');assert.equal(f.replay.getSnapshot().popup,false);
});
test('model failure pauses with error and decoding / invalid files fail explicitly',async t=>{
 const f=fixture(t);f.replay.setRunner(async()=>{throw new Error('模型服务不可用')});await f.replay.play();await tick();
 assert.equal(f.replay.getSnapshot().phase,'error');assert.match(f.replay.getSnapshot().error,/模型服务不可用/);assert.equal(f.video.paused,true);
 f.load().dispatchEvent(new f.dom.window.Event('error'));assert.match(f.replay.getSnapshot().error,/解码/);
 f.replay.load(new File(['x'],'bad.txt',{type:'text/plain'}));assert.equal(f.replay.getSnapshot().duration,0);assert.equal(f.preview.querySelector('video'),null);
});
test('risk replay requires connected display callback',async t=>{
 t.mock.method(globalThis,'fetch',async()=>response());
 const r=await engine().run({type:'image',content:'data:image/jpeg;base64,x',replay:{sourceId:'x',mediaTime:1}});
 assert.equal(r.status,'failed');assert.ok(r.events.some(e=>e.type==='node_failed'&&e.nodeId==='rear_video_display'));
});

test('automatic loop does not cancel pending inference or rearm an alert',async t=>{
 const f=fixture(t);let signal:AbortSignal|undefined;let resolve:any;f.replay.setRunner((_i,s)=>{signal=s;return new Promise(r=>{resolve=r})});
 f.replay.setLoop(true);assert.equal(f.video.loop,true);await f.replay.play();await tick();
 f.video.dispatchEvent(new f.dom.window.Event('seeking'));f.video.dispatchEvent(new f.dom.window.Event('seeked'));assert.equal(signal!.aborted,false);resolve(complete);await tick();
});

for (const status of ['normal','unknown','risk']) test(`video ${status} only announces a confirmed risk display`, async t=>{
 t.mock.method(globalThis,'fetch',async()=>response(status));
 const r=await engine(()=> 'opened').run({type:'image',content:'data:image/jpeg;base64,x',replay:{sourceId:'x',mediaTime:1}});
 assert.equal(r.status,'completed');
 assert.equal(r.events.some(e=>e.type==='simulator_command'&&['care_frame','care_summary'].includes(String(e.payload.key))&&e.payload.value),false);
 assert.equal(r.events.some(e=>e.type==='simulator_command'&&e.payload.key==='message'&&e.payload.value),status==='risk');
 assert.equal((r.finalOutput as any).decision_status,status);
});
test('new risk after a normal observation opens again after dismissal',async t=>{
 const f=fixture(t);let status='risk';
 t.mock.method(globalThis,'fetch',async()=>response(status));
 f.replay.setRunner((input,signal)=>engine(frame=>f.replay.show(frame)).run(input,{signal}));
 await f.replay.play();await tick();assert.equal(f.replay.getSnapshot().popup,true);f.replay.dismiss();
 status='normal';f.video.dispatchEvent(new f.dom.window.Event('playing'));await tick();assert.equal(f.replay.getSnapshot().popup,false);
 status='risk';f.video.dispatchEvent(new f.dom.window.Event('playing'));await tick();assert.equal(f.replay.getSnapshot().popup,true);
});

// Photo inference and HMI video are separate sources.
import {RearVideo} from '../src/domain/rearVideo';
for (const status of ['risk','normal','unknown']) test(`photo ${status} uses independent configured video only on risk`,async t=>{
 t.mock.method(globalThis,'fetch',async()=>response(status));
 let shown:any[]=[];
 const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){},updateSimulatorState(){},showRearVideo:async(source)=>{shown.push(source);return 'opened'}};
 const r=await new GraphEngine(structuredClone(graph.nodes) as any,graph.edges,cb).run({type:'image',content:'data:image/jpeg;base64,photo-evidence'});
 assert.equal(r.status,'completed');assert.equal(shown.length,status==='risk'?1:0);
 assert.equal(r.events.some(e=>e.type==='simulator_command'&&e.payload.key==='care_frame'&&e.payload.value),false);
 if(status==='risk'){assert.deepEqual(shown,[{source:'local_replay'}]);assert.equal((r.finalOutput as any).video_display,'opened');}
 assert.equal(r.events.some(e=>e.type==='simulator_command'&&e.payload.key==='message'&&e.payload.value==='检测到后排儿童可能存在危险，已显示后排画面。'),status==='risk');
});
test('independent video plays actual media, expands without replacing it, closes and rejects late playback',async t=>{
 const f=fixture(t);const session=new RearVideo('/v1/media/rear-seat');session.attach(f.screen);
 assert.equal(await session.show({source:'local_replay'}),'opened');
 const video=f.screen.querySelector('video')!;assert.equal(video.getAttribute('src'),'/v1/media/rear-seat');
 session.toggleExpanded();assert.equal(session.getSnapshot().expanded,true);assert.equal(f.screen.querySelector('video'),video);
 session.close();assert.equal(video.paused,true);assert.equal(session.getSnapshot().visible,false);
 let resolve!:()=>void;video.play=()=>new Promise<void>(r=>{resolve=r;});
 const pending=session.show({source:'local_replay'});session.close();await assert.rejects(pending,/取消/);resolve();await tick();assert.equal(session.getSnapshot().visible,false);
 await assert.rejects(session.show({source:'browser_stream',streamUrl:'rtsp://camera'}),/HTTP/);
 session.dispose();session.attach(f.screen);video.play=async()=>{};
 assert.equal(await session.show({source:'local_replay'}),'opened');session.dispose();
});
test('video load error is not reported as a successful display',async t=>{
 const f=fixture(t);const session=new RearVideo('/missing-video');session.attach(f.screen);
 f.dom.window.HTMLMediaElement.prototype.play=async function(){this.dispatchEvent(new f.dom.window.Event('error'));};
 await assert.rejects(session.show({source:'local_replay'}),/未连接/);assert.equal(session.getSnapshot().phase,'error');session.dispose();
});
