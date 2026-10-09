import assert from 'node:assert/strict';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {useVoiceInput} from '../src/hooks/useVoiceInput';
import {SpeechEndpoint} from '../src/lib/speechEndpoint';
import {pcmWav} from '../src/lib/voiceCapture';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let hidden=false;
Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
let latest: ReturnType<typeof useVoiceInput>;
const transcripts:string[]=[];
function Harness(){latest=useVoiceInput(text=>transcripts.push(text));return <div>{latest.phase}</div>;}
const root=createRoot(document.getElementById('root')!);
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const change=async(fn:()=>unknown)=>act(async()=>{fn();await tick();});
let permissionCalls=0,stops=0,closed=0,fetchCalls=0;
let allow!:(stream:unknown)=>void,deny!:(error:unknown)=>void;
let respond!:(response:unknown)=>void;
let lastSignal: AbortSignal|undefined;
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>{permissionCalls++;return new Promise((resolve,reject)=>{allow=resolve;deny=reject;});}}});
const track={stop:()=>{stops++;},addEventListener:()=>{}};
const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
let node:MockNode;
class MockNode {
  port={onmessage:null as null|((event:{data:unknown})=>void),close:()=>{},postMessage:(_:string)=>{queueMicrotask(()=>{this.port.onmessage?.({data:{samples:new Float32Array(16000).fill(.1)}});this.port.onmessage?.({data:{done:true}});});}};
  constructor(){node=this;}
  connect(){} disconnect(){}
}
class MockContext {
  sampleRate=16000;state='running';audioWorklet={addModule:async()=>{}};destination={};
  resume(){return Promise.resolve();}
  close(){this.state='closed';closed++;return Promise.resolve();}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
}
(window as any).AudioContext=(globalThis as any).AudioContext=MockContext;
(window as any).AudioWorkletNode=(globalThis as any).AudioWorkletNode=MockNode;
globalThis.fetch=(async(_url:any,options:any)=>{fetchCalls++;lastSignal=options.signal;assert.equal(options.headers['Content-Type'],'audio/wav');const data=new DataView(await options.body.arrayBuffer());assert.equal(data.getUint32(24,true),16000);assert.ok(data.getUint32(40,true)>=8000);return new Promise(resolve=>{respond=resolve;});}) as any;
await act(async()=>root.render(<Harness/>));
assert.equal(permissionCalls,0);
await change(()=>void latest.start());assert.equal(latest!.phase,'requesting');
await change(()=>latest.cancel());await change(()=>allow(stream));
assert.equal(latest!.phase,'idle');assert.equal(stops,1);assert.equal(fetchCalls,0);
console.log('PASS 1: Permission is user-triggered; cancel before late permission releases the returned track.');
await change(()=>void latest.start());await change(()=>allow(stream));assert.equal(latest!.phase,'recording');
await change(()=>{void latest.stop();void latest.stop();});assert.equal(latest!.phase,'transcribing');assert.equal(fetchCalls,1);assert.equal(stops,2);
await change(()=>respond({ok:true,json:async()=>({text:'空调调到23度'})}));assert.equal(latest!.phase,'idle');assert.deepEqual(transcripts,['空调调到23度']);assert.equal(fetchCalls,1);
console.log('PASS 2: Stop releases the microphone before one ASR request; transcript returns without sending any assistant request.');
await change(()=>void latest.start());await change(()=>allow(stream));await change(()=>void latest.stop());
await change(()=>latest.cancel());assert.equal(lastSignal?.aborted,true);
await change(()=>respond({ok:true,json:async()=>({text:'不得回填的迟到结果'})}));assert.equal(transcripts.length,1);
console.log('PASS 3: Cancellation aborts transcription and ignores late responses.');
await change(()=>void latest.start());await change(()=>deny(new DOMException('denied','NotAllowedError')));assert.match(latest!.error,/权限/);assert.equal(latest!.phase,'idle');
await change(()=>void latest.start());await change(()=>allow(stream));await change(()=>void latest.stop());
await change(()=>respond({ok:false,json:async()=>({detail:'模型未安装'})}));assert.match(latest!.error,/模型未安装/);assert.equal(transcripts.length,1);
console.log('PASS 4: Permission denial and backend failures surface errors without invented text.');
await change(()=>void latest.start());await change(()=>allow(stream));const before=stops;
await change(()=>{hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));});assert.equal(stops,before+1);assert.equal(latest!.phase,'idle');hidden=false;
await change(()=>void latest.start());await change(()=>allow(stream));await change(()=>node.port.onmessage?.({data:{limit:true}}));assert.equal(latest!.phase,'transcribing');
await change(()=>respond({ok:true,json:async()=>({text:'达到时长上限'})}));
console.log('PASS 5: Hidden pages stop recording, and the worklet duration limit finishes and transcribes.');
// Use actual chunk callbacks and endpointing, not a manual stop, for the core user path.
const emit=async(seconds:number,level:number)=>change(()=>node.port.onmessage?.({data:{samples:new Float32Array(Math.round(16000*seconds)).fill(level)}}));
await change(()=>void latest.start());await change(()=>allow(stream));
const initialCalls=fetchCalls,initialTranscripts=transcripts.length;
await emit(.8,.08);assert.equal(fetchCalls,initialCalls+1);assert.equal(latest!.phase,'recording');
await change(()=>respond({ok:true,json:async()=>({text:'空调调到'})}));
assert.equal(latest!.transcript,'空调调到');assert.equal(transcripts.length,initialTranscripts);
await emit(.6,0);assert.equal(latest!.phase,'recording'); // In-sentence pause must not commit.
await emit(.4,.08);assert.equal(fetchCalls,initialCalls+2);
await emit(1.2,0);assert.equal(latest!.phase,'transcribing');
assert.equal(fetchCalls,initialCalls+2); // Wait for in-flight partial rather than overlapping final.
await change(()=>respond({ok:true,json:async()=>({text:'空调调到二十'})}));
assert.equal(fetchCalls,initialCalls+3);assert.equal(transcripts.length,initialTranscripts);
await change(()=>respond({ok:true,json:async()=>({text:'空调调到23度'})}));
assert.equal(transcripts.length,initialTranscripts+1);assert.equal(latest!.transcript,'空调调到23度');
await change(()=>void latest.stop());assert.equal(fetchCalls,initialCalls+3);
console.log('PASS 6: Interim text appears during capture; a short pause continues; endpoint stops mic, serializes final ASR, and commits once.');
await change(()=>void latest.start());await change(()=>allow(stream));const silentCalls=fetchCalls;
await emit(8.1,0);assert.equal(latest!.phase,'idle');assert.match(latest!.error,/没有听到/);assert.equal(fetchCalls,silentCalls);
await change(()=>void latest.start());await change(()=>allow(stream));await emit(.8,.08);
await change(()=>latest.cancel());await change(()=>respond({ok:true,json:async()=>({text:'不得显示'})}));
assert.equal(latest!.transcript,'');assert.equal(transcripts.length,initialTranscripts+1);
console.log('PASS 7: Silence exits without ASR or assistant submission; cancelled partial results cannot overwrite the next state.');
await change(()=>void latest.start());await change(()=>allow(stream));await emit(.8,.08);
await change(()=>respond({ok:false,status:422,json:async()=>({detail:'暂未识别到文字'})}));assert.equal(latest!.phase,'recording');
await emit(.8,.08);await change(()=>respond({ok:false,status:503,json:async()=>({detail:'模型未安装'})}));
assert.equal(latest!.phase,'idle');assert.match(latest!.error,/模型未安装/);
const endpoint=new SpeechEndpoint(16000);
endpoint.push(new Float32Array(800).fill(.1)); // 50ms click is not a sentence.
assert.equal(endpoint.push(new Float32Array(16000*8)),'silence');assert.equal(endpoint.hasSpeech,false);
console.log('PASS 8: Empty interim recognition keeps listening; unavailable ASR stops capture; a short click does not form an utterance.');
await change(()=>void latest.start());await change(()=>allow(stream));const beforeUnmount=stops;
await act(async()=>root.unmount());assert.equal(stops,beforeUnmount+1);assert.equal(closed,permissionCalls);
const encoded=new DataView(await pcmWav([new Float32Array([-2,0,2])],16000).arrayBuffer());
assert.equal(encoded.getInt16(44,true),-32768);assert.equal(encoded.getInt16(48,true),32767);
console.log('PASS 9: Unmount releases all contexts/tracks; WAV encoding clips safely to signed 16-bit PCM.');
