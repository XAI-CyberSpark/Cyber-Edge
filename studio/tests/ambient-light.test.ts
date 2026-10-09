import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VehicleWorld } from '../src/domain/vehicleWorld';
import { GraphEngine, type GraphCallbacks } from '../src/utils/GraphEngine';
import { validateGraph } from '../src/domain/nodeCapabilities';
import { buildSelfieAmbientScenario, selfieSamples } from '../src/data/selfieAmbientScenario';
const white={light_color:'#ffe4bc',light_brightness:55,light_reason:'柔和暖色衬托白色衣物',pose_tips:'坐稳并保持安全带，手机略高于视线，轻轻侧脸。'};
function fixture() {
 const world=new VehicleWorld(); const messages:string[]=[];
 const callbacks:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({car:world.getSnapshot().car}),updateSimulatorState:(c,k,v)=>{if(c==='hmi' && k==='message') messages.push(v);},executeAmbientLight:world.setAmbientLight,restoreAmbientLight:world.restoreAmbientLight};
 const graph=buildSelfieAmbientScenario();return {world,messages,graph,callbacks,engine:()=>new GraphEngine(graph.nodes,graph.edges,callbacks)};
}
test('JSON event → real execution graph → shared HMI state, repeat and end restore original light',async t=>{
 const f=fixture(), before=structuredClone(f.world.getSnapshot().car);let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,init)=>{calls++;const req=JSON.parse(String(init?.body));assert.match(JSON.stringify(req.messages),/白色/);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(white)}}]});});
 assert.deepEqual(validateGraph(f.graph.nodes,f.graph.edges).filter(x=>x.severity==='error'),[]);
 for(let i=0;i<2;i++){const result=await f.engine().run(selfieSamples[0].input);assert.equal(result.status,'completed');}
 assert.equal(calls,2);assert.deepEqual(f.world.getSnapshot().car.lights,{ambientColor:'#ffe4bc',brightness:55});
 assert.deepEqual(f.world.getSnapshot().car.windows,before.windows);assert.equal(f.world.getSnapshot().ambientFeedback?.poseTips,white.pose_tips);assert.ok(f.messages.some(x=>x.includes(white.pose_tips)));
 await f.engine().run(selfieSamples[3].input);assert.equal(calls,2);assert.deepEqual(f.world.getSnapshot().car.lights,before.lights);
});
test('Uncertain event skips model, malformed event and invalid colors never mutate lights',async t=>{
 const f=fixture();let calls=0;const before=structuredClone(f.world.getSnapshot().car.lights);
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...white,light_color:'blue'})}}]});});
 assert.equal((await f.engine().run(selfieSamples[2].input)).status,'completed');assert.equal(calls,0);
 assert.equal((await f.engine().run('{"is_selfie":"true"}')).status,'failed');assert.equal(calls,0);
 assert.equal((await f.engine().run(selfieSamples[0].input)).status,'failed');assert.equal(calls,1);assert.deepEqual(f.world.getSnapshot().car.lights,before);
});
test('Model failure and cancellation do not apply ambient commands',async t=>{
 const f=fixture();const before=structuredClone(f.world.getSnapshot().car.lights);
 t.mock.method(globalThis,'fetch',async()=>new Response('offline',{status:503}));
 assert.equal((await f.engine().run(selfieSamples[0].input)).status,'failed');assert.deepEqual(f.world.getSnapshot().car.lights,before);
 const controller=new AbortController();controller.abort();await assert.rejects(f.engine().run(selfieSamples[0].input,{signal:controller.signal}));assert.deepEqual(f.world.getSnapshot().car.lights,before);
});
test('Only explicit HMI ambient commands accept data; window and unscoped actions remain blocked',()=>{
 const f=fixture();const light=f.graph.nodes.find(n=>n.id==='selfie_light')!;
 for(const data of [{action:'ambient_light.set'},{action:'windows',parameter:'close_all',executionMode:'hmi_mock'},{action:'ambient_light.set',executionMode:'hmi_mock',module:'unknown'}]) {
  light.data=data;assert.ok(validateGraph(f.graph.nodes,f.graph.edges).some(x=>x.severity==='error'));
 }
});
test('Actuator validates range, resets session and restores custom starting state',()=>{
 const world=new VehicleWorld();world.setCar(p=>({...p,lights:{ambientColor:'#123456',brightness:20}}));
 for(const brightness of [NaN,Infinity,-1,101]) assert.throws(()=>world.setAmbientLight({color:'#abcdef',brightness}));
 world.setAmbientLight({color:'#abcdef',brightness:0});world.setAmbientLight({color:'#aabbcc',brightness:100});assert.deepEqual(world.restoreAmbientLight().actual,{ambientColor:'#123456',brightness:20});
 world.reset();assert.equal(world.getSnapshot().ambientFeedback,undefined);
});
