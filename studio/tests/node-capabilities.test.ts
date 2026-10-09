import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph, validateNode, getNodeCapability } from '../src/domain/nodeCapabilities';
import { GraphEngine, type GraphCallbacks } from '../src/utils/GraphEngine';
import { VehicleWorld } from '../src/domain/vehicleWorld';
import { buildRainComfortScenario } from '../src/data/rainComfortScenario';
import { buildChildSafetyTemplate, createChildSafetyScenarioSpec } from '../src/data/childSafetyScenario';
const node = (id: string, type: string, data: Record<string, any> = {}) => ({ id,type,data,position:{x:0,y:0} });
const chain = (nodes: any[]) => nodes.slice(1).map((n,i) => ({id:`e${i}`,source:nodes[i].id,target:n.id}));
function fixture() {
  const world = new VehicleWorld(); const actions: unknown[] = []; const messages: string[] = [];
  const callbacks: GraphCallbacks = { updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({car:world.getSnapshot().car,scenario:{weather:'rain'}}),updateSimulatorState(c,k,v){if(c==='hmi'&&k==='message')messages.push(v);},executeWindowAction:a=>{actions.push(a); const n=a==='open_all'?100:0;return world.moveWindows({fl:n,fr:n,rl:n,rr:n},'workflow',0);},executeWindowTargets:t=>{actions.push(t);return world.moveWindows(t,'workflow',0);} };
  return {world,actions,messages,callbacks};
}
test('Existing rain and child templates pass structural checks; simulated recognition is explicit',()=>{
  for(const g of [buildRainComfortScenario(),buildChildSafetyTemplate(createChildSafetyScenarioSpec())]) assert.deepEqual(validateGraph(g.nodes as any,g.edges as any).filter(i=>i.severity==='error'),[]);
  assert.match(getNodeCapability(node('r','recognition'))!.source,/仅模拟/);
  assert.equal(validateNode(node('x','car_control',{action:'auto_park'})).length,1);
  assert.ok(validateNode(node('x','car_control',{module:'seat',function:'set',signalKey:'SEAT_HEAT_STATUS_0'})).length);
  assert.ok(validateNode(node('x','car_control',{module:'vehicleControl',function:'set',signalKey:'WINDOW_POSITION',area:4,status:0})).length);
});
test('Ambiguous branches, cycles, disconnected nodes and unknown tools block before any action',async()=>{
  const cases = [
    {nodes:[node('i','input'),node('x','tool',{tool:'api_call'})],edges:[{id:'e',source:'i',target:'x'}]},
    {nodes:[node('i','input'),node('g','logic',{condition:'true'}),node('a','fallback',{responseText:'a'}),node('b','fallback',{responseText:'b'})],edges:[{id:'1',source:'i',target:'g'},{id:'2',source:'g',target:'a'},{id:'3',source:'g',target:'b'}]},
    {nodes:[node('i','input'),node('x','output')],edges:[{id:'1',source:'i',target:'x'},{id:'2',source:'x',target:'i'}]},
    {nodes:[node('i','input'),node('x','output')],edges:[]}
  ];
  for(const g of cases){const f=fixture();const result=await new GraphEngine(g.nodes,g.edges,f.callbacks).run('test');assert.equal(result.status,'failed');assert.equal(result.events.some(e=>e.type==='node_started'),false);assert.equal(f.actions.length,0);}
});
test('Condition runtime errors fail instead of taking the false branch',async()=>{
  const nodes=[node('i','input'),node('g','logic',{condition:'input.missing.value === 1'}),node('o','fallback',{responseText:'must not show'})];
  const edges=chain(nodes);(edges[1] as any).sourceHandle='false';
  const f=fixture();const r=await new GraphEngine(nodes,edges,f.callbacks).run('test');assert.equal(r.status,'failed');assert.equal(f.messages.includes('must not show'),false);assert.ok(r.events.some(e=>e.type==='node_failed'&&e.nodeId==='g'));
});
test('General model failures and invalid plans never fall back to keyword vehicle control',async t=>{
  const nodes=[node('i','input'),node('m','llm',{model:'test-model'}),node('c','car_control',{action:'windows.open_all'})];
  for(const response of [()=>new Response('{}',{status:503}),()=>Response.json({choices:[]}),()=>Response.json({id:'chatcmpl-mock',choices:[{message:{content:'[Mock] hello'}}]}),()=>Response.json({choices:[{message:{content:'open all windows'}}]}),()=>Response.json({choices:[{message:{content:'{"reply":"ok","action":"fly"}'}}]})]){
    t.mock.method(globalThis,'fetch',async()=>response());const f=fixture();const r=await new GraphEngine(nodes,chain(nodes),f.callbacks).run('open windows');assert.equal(r.status,'failed');assert.equal(f.actions.length,0);assert.equal(r.events.some(e=>JSON.stringify(e.payload).includes('[Fallback Simulation]')),false);t.mock.restoreAll();
  }
});
test('General model explicit none never activates a fixed window or phone node',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{message:{content:'{"reply":"不执行","action":"none","actions":[]}'},finish_reason:'stop'}]}));
  for(const end of [node('c','car_control',{action:'windows.open_all'}),node('c','tool',{tool:'call_phone'})]){
    const nodes=[node('i','input'),node('m','llm',{model:'test-model'}),end];const f=fixture();const r=await new GraphEngine(nodes,chain(nodes),f.callbacks).run('do not open windows or call');assert.equal(r.status,'completed');assert.equal(f.actions.length,0);assert.equal(f.messages.some(m=>/Calling/.test(m)),false);
  }
});
test('Specific window edits execute actual target and preserve source evidence',async()=>{
  const nodes=[node('i','input'),node('c','car_control',{module:'vehicleControl',function:'set',signalKey:'WINDOW_POSITION',area:4,targetStatus:35})];
  const f=fixture();const r=await new GraphEngine(nodes,chain(nodes),f.callbacks).run('test');assert.equal(r.status,'completed');assert.deepEqual(f.world.getSnapshot().car.windows,{fl:0,fr:0,rl:0,rr:35});assert.equal(r.events.find(e=>e.type==='run_started')?.payload.environment,'behavioral-simulation');assert.match((r.events.find(e=>e.nodeId==='c'&&e.type==='node_started')?.payload.capability as any).source,/仿真/);
});
test('Memory service outage fails rather than returning a successful empty memory',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:503}));const nodes=[node('i','input'),node('mem','memory',{type:'buffer',window:10}),node('m','llm',{model:'test'})];const f=fixture();const r=await new GraphEngine(nodes,chain(nodes),f.callbacks).run('hello');assert.equal(r.status,'failed');assert.ok(r.events.some(e=>e.nodeId==='mem'&&e.type==='node_failed'));assert.equal(r.events.some(e=>e.nodeId==='m'&&e.type==='node_started'),false);
});

test('A model cannot expand a right-rear window node into all-window control',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{message:{content:'{"reply":"关闭","action":"windows.close_all"}'},finish_reason:'stop'}]}));
  const nodes=[node('i','input'),node('m','llm',{model:'test-model'}),node('c','car_control',{module:'vehicleControl',function:'set',signalKey:'WINDOW_POSITION',area:4,targetStatus:0})];
  const f=fixture();f.world.setCar(p=>({...p,windows:{fl:100,fr:100,rl:100,rr:100}}));
  const r=await new GraphEngine(nodes,chain(nodes),f.callbacks).run('关闭右后窗');assert.equal(r.status,'completed');assert.deepEqual(f.world.getSnapshot().car.windows,{fl:100,fr:100,rl:100,rr:0});
});

import { catalogModelNode } from '../src/domain/catalogModelNode';
test('Catalog models survive serialization and block all execution before network/actions', async()=>{
 const spec=catalogModelNode({id:'yolov8',name:'YOLOv8',domain:'Computer Vision',use_case:'Object Detection',runtimes:['qnn_dlc'],chipsets:['sa8295p'],tags:[],has_quantized:true,url:'',source:'qualcomm',connection_status:'not_connected'},'0.63.0');
 const saved=JSON.parse(JSON.stringify(spec));assert.equal(saved.data.catalogModel.id,'yolov8');
 for(const patch of [{},{designOnly:false,deploymentStatus:'ready'},{designOnly:false,catalogModel:undefined}]){
  const nodes=[node('i','input'),node('m',saved.type,{...saved.data,...patch}),node('o','output')];const f=fixture();
  assert.match(validateNode(nodes[1])[0].message,/待部署/);
  const r=await new GraphEngine(nodes,chain(nodes),f.callbacks).run('test');assert.equal(r.status,'failed');assert.equal(r.events.some(e=>e.type==='node_started'),false);assert.equal(f.actions.length,0);
 }
});
