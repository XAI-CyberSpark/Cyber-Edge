import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeScenario} from '../src/domain/scenarioExecution';
import {validateNode} from '../src/domain/nodeCapabilities';
import {GraphEngine,type GraphCallbacks} from '../src/utils/GraphEngine';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+target+(sourceHandle||''),source,target,sourceHandle});
const answer=(content:string,extra:any={})=>({choices:[{finish_reason:'stop',message:{content}}],...extra});
const equal=(path:string[],value:any)=>({path,op:'equals' as const,value});
function graph(fields:any,repairs:any=1,mode='json'){
 const nodes=[n('i','input',{flowVersion:2}),n('s','state',{increments:{visits:1}}),n('m','llm',{providerId:'minimax',model:'MiniMax-M3',outputFormat:mode,outputFields:fields,...(repairs===undefined?{}:{jsonRepairAttempts:repairs})}),n('o','output',{responseText:'{{outputs.m.data.title}}'})];
 return {nodes,edges:[e('i','s'),e('s','m'),e('m','o')]};
}
test('creative fields repair preserves original context and never replays upstream state',async()=>{
 const project=graph({title:'string',body:'string'});project.nodes[3].data.responseText='{{outputs.m.data.title}}：{{outputs.m.data.body}}';
 const requests:any[]=[];
 const run=await executeScenario(project,{cases:[{name:'creative',steps:[{input:'海风',status:'completed',assertions:[equal(['hmi','message'],'海风：船帆轻轻鼓起'),equal(['state','visits'],1),equal(['outputs','m','json_repair_attempts'],1)]}]}]},
 {inference:async body=>{requests.push(body);return answer(requests.length===1?'{"title":7}':'{"title":"海风","body":"船帆轻轻鼓起"}');}});
 assert.equal(run.status,'passed',JSON.stringify(run));assert.equal(requests.length,2);
 assert.deepEqual(requests[1].messages.slice(0,2),requests[0].messages);
 assert.equal(requests[1].messages[2].content,'{"title":7}');assert.match(requests[1].messages[3].content,/title.*string/);
 assert.equal(requests[1].model,requests[0].model);assert.equal(requests[1].provider_id,requests[0].provider_id);
 assert.deepEqual(run.cases[0].steps[0].evidence.outputs.m.data,{title:'海风',body:'船帆轻轻鼓起'});
});
test('numeric data repair gates the actual HMI action and strips undeclared execution fields',async()=>{
 const project=graph({target:'number'});project.nodes[3]=n('a','car_control',{executionMode:'hmi',action:'hmi.control',controlId:'ac.temp',valueField:'target'});project.edges[2]=e('m','a');let calls=0;
 const run=await executeScenario(project,{cases:[{name:'climate',steps:[{input:'调到20度',status:'completed',assertions:[equal(['car','ac','temp'],20),equal(['actions','length'],1),equal(['state','visits'],1)]}]}]},
 {inference:async()=>answer(++calls===1?'not json':'{"target":20,"actions":["unauthorized"],"strict_inference":true}')});
 assert.equal(run.status,'passed',JSON.stringify(run));assert.equal(calls,2);
 assert.deepEqual(run.cases[0].steps[0].evidence.outputs.m.data,{target:20});
});
test('repair exhaustion blocks downstream and latest invalid response does not accumulate',async()=>{
 const project=graph({title:'string'},2);let calls=0;const requests:any[]=[];
 const run=await executeScenario(project,{cases:[{name:'exhaust',steps:[{input:'start',status:'failed',assertions:[equal(['nodes','o'],'skipped'),equal(['state','visits'],1),equal(['actions','length'],0)]}]}]},
 {inference:async body=>{requests.push(body);return answer(++calls===1?'[]':calls===2?'{}':'{"title":false}');}});
 assert.equal(run.status,'passed',JSON.stringify(run));assert.equal(calls,3);
 assert.equal(requests[2].messages.length,4);assert.equal(requests[2].messages[2].content,'{}');
 assert.equal(run.cases[0].steps[0].evidence.run.events.filter((x:any)=>x.type==='node_started'&&x.nodeId==='s').length,1);
});
test('omitted and disabled repair do not add requests',async()=>{
 for(const configured of [false,true]){
  const project=graph({title:'string'},0);if(!configured)delete project.nodes[2].data.jsonRepairAttempts;let calls=0;
  const run=await executeScenario(project,{cases:[{name:'disabled',steps:[{input:'start',status:'failed',assertions:[equal(['nodes','o'],'skipped')]}]}]},
   {inference:async()=>{calls++;return answer('{}');}});
  assert.equal(run.status,'passed');assert.equal(calls,1);
 }
});
test('empty, truncated, mock and oversized replies are not repaired',async()=>{
 for(const response of [answer(''),answer('{}',{choices:[{finish_reason:'length',message:{content:'{}'}}]}),answer('{}',{id:'chatcmpl-mock-fixture'}),answer('x'.repeat(32001))]){
  let calls=0;const run=await executeScenario(graph({title:'string'},2),{cases:[{name:'unusable',steps:[{input:'start',status:'failed',assertions:[equal(['nodes','o'],'skipped')]}]}]},
   {inference:async()=>{calls++;return response;}});
  assert.equal(run.status,'passed');assert.equal(calls,1);
 }
});
test('transport errors are not format errors and never retry',async()=>{
 let calls=0;const run=await executeScenario(graph({title:'string'},2),{cases:[{name:'offline',steps:[{input:'start',status:'failed',assertions:[equal(['nodes','o'],'skipped')]}]}]},
 {inference:async()=>{calls++;throw Error('offline fixture');}});
 assert.equal(run.status,'passed');assert.equal(calls,1);
});
test('repair parameters reject non-integers and non-JSON activation before inference',()=>{
 for(const value of [true,null,'1',-1,3,0.5])assert.ok(validateNode(n('m','llm',{model:'MiniMax-M3',providerId:'minimax',outputFormat:'json',outputFields:{title:'string'},jsonRepairAttempts:value})).some(x=>x.severity==='error'));
 for(const mode of ['text','auto','actions'])assert.ok(validateNode(n('m','llm',{model:'MiniMax-M3',outputFormat:mode,jsonRepairAttempts:1})).some(x=>x.severity==='error'));
 for(const value of [0,1,2])assert.equal(validateNode(graph({title:'string'},value).nodes[2]).filter(x=>x.severity==='error').length,0);
});
test('repair retains multimodal input and uses a single deadline signal',async t=>{
 const project=graph({title:'string'});const bodies:any[]=[],signals:any[]=[];let deadlines=0;
 const original=AbortSignal.timeout;t.mock.method(AbortSignal,'timeout',(ms:number)=>{deadlines++;return original(ms);});
 t.mock.method(globalThis,'fetch',async (_url:any,init:any)=>{bodies.push(JSON.parse(init.body));signals.push(init.signal);return Response.json(answer(bodies.length===1?'{}':'{"title":"图像字段"}'));});
 const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({}),updateSimulatorState(){}};
 const run=await new GraphEngine(project.nodes,project.edges,cb).run({type:'image',content:'data:image/png;base64,c3ludGhldGlj',text:'描述颜色'});
 assert.equal(run.status,'completed');assert.equal(bodies.length,2);assert.equal(deadlines,1);assert.equal(signals[0],signals[1]);
 assert.deepEqual(bodies[1].messages.slice(0,2),bodies[0].messages);
});
test('cancellation after invalid response prevents a repair request',async t=>{
 const controller=new AbortController();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;controller.abort();return Response.json(answer('{}'));});
 const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({}),updateSimulatorState(){}};
 const project=graph({title:'string'},2);
 const run=await new GraphEngine(project.nodes,project.edges,cb).run('start',{signal:controller.signal});
 assert.notEqual(run.status,'completed');assert.equal(calls,1);
});
test('repairs consume the existing execution model-call budget',async()=>{
 let calls=0;const run=await executeScenario(graph({title:'string'},2),{cases:Array.from({length:6},(_,i)=>({name:String(i),steps:[{input:'start',status:'completed'}]}))},
 {inference:async()=>{calls++;return answer('{}');}});
 assert.equal(run.status,'failed');assert.equal(calls,12);
 assert.ok(run.cases.some((c:any)=>c.steps.some((s:any)=>s.failed_nodes.some((n:any)=>n.error.includes('12次')))));
});
