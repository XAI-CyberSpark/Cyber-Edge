import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VehicleWorld} from '../src/domain/vehicleWorld';
import {HMI_CONTROLS,readHmiControl} from '../src/domain/hmiControls';
import {GraphEngine,type GraphCallbacks} from '../src/utils/GraphEngine';
import {validateNode,validateGraph} from '../src/domain/nodeCapabilities';
import {readFileSync} from 'node:fs';

function fixture(data:Record<string,unknown>) {
  const world=new VehicleWorld();
  const outputs:Record<string,any>={};
  const nodes:any[]=[{id:'input',type:'input',position:{x:0,y:0},data:{}},{id:'control',type:'car_control',position:{x:0,y:100},data}];
  const edges=[{id:'edge',source:'input',target:'control'}];
  const callbacks:GraphCallbacks={updateNodeStatus:(id,_status,output)=>{outputs[id]=output;},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({car:world.getSnapshot().car}),updateSimulatorState(){},executeHmiControl:world.executeHmiControl,executeWindowTargets:targets=>world.moveWindows(targets,'workflow',0)};
  return {world,outputs,nodes,edges,callbacks,engine:new GraphEngine(nodes,edges,callbacks)};
}
test('Every registered control executes through a graph and returns the committed value',async()=>{
  for(const [id,spec] of Object.entries(HMI_CONTROLS)) {
    const value=spec.type==='boolean'?!spec.default:spec.type==='number'?spec.max:spec.format==='color'?'#ff1234':Object.keys(spec.options||{})[0];
    const f=fixture({executionMode:'hmi',controlId:id,controlValue:value});
    const result=await f.engine.run('apply settings');
    assert.equal(result.status,'completed',id);
    assert.equal(readHmiControl(f.world.getSnapshot().car,id),value,id);
    assert.equal(f.outputs.control.action_result.actual,value,id);
    assert.equal(f.outputs.control.action_result.source,'hmi');
    assert.equal(f.outputs.control.action_result.revision,1);
  }
});
test('Manual writes and get nodes read the same store; reset restores defaults',async()=>{
  const f=fixture({executionMode:'hmi',controlId:'ac.temp',controlOperation:'get'});
  f.world.executeHmiControl({control:'ac.temp',value:27});
  await f.engine.run('read');assert.equal(f.outputs.control.action_result.actual,27);
  assert.equal(f.outputs.control.action_result.revision,1);
  f.world.reset();assert.equal(readHmiControl(f.world.getSnapshot().car,'ac.temp'),22);
});
test('Invalid or unavailable controls fail validation without mutating state',async()=>{
  for(const [id,value] of [['ac.temp',31],['ac.temp','25'],['ac.fan',1.5],['doors.locked','false'],['lights.color','red'],['display.mode','pink'],['__proto__',true],[['ac.temp'],24],[null,24]]) {
    const f=fixture({executionMode:'hmi',controlId:id,controlValue:value});const before=f.world.getSnapshot();
    assert.ok(validateNode(f.nodes[1]).some(i=>i.severity==='error'));
    const result=await f.engine.run('invalid');assert.equal(result.status,'failed');assert.equal(f.world.getSnapshot(),before);
  }
  const f=fixture({executionMode:'hmi',controlId:'ac.temp',controlValue:25});delete f.callbacks.executeHmiControl;
  assert.equal((await new GraphEngine(f.nodes,f.edges,f.callbacks).run('disconnected')).status,'failed');
});
test('Legacy seat and sunshade nodes use actual HMI state; subscriptions remain unavailable',async()=>{
  const f=fixture({module:'seat',signalKey:'SEAT_HEAT_STATUS',function:'set',level:3});
  assert.equal((await f.engine.run('heat')).status,'completed');
  for(let i=0;i<4;i++)assert.equal(readHmiControl(f.world.getSnapshot().car,`seat.heat.${i}`),3);
  assert.deepEqual(f.outputs.control.action_result.actual,{'seat.heat.0':3,'seat.heat.1':3,'seat.heat.2':3,'seat.heat.3':3});
  const s=fixture({module:'vehicleControl',signalKey:'SUNSHADE_SLIDING_OPEN',function:'set',area:3,targetStatus:1});
  assert.equal((await s.engine.run('shade')).status,'completed');assert.equal(readHmiControl(s.world.getSnapshot().car,'sunshade.3'),true);
  assert.ok(validateNode({...f.nodes[1],data:{...f.nodes[1].data,function:'subscribe'}}).some(i=>i.severity==='error'));
});
test('Only explicitly mapped JSON can drive HMI; text cannot bypass action validation',()=>{
  const f=fixture({executionMode:'hmi',controlId:'ac.temp',valueField:'temperature'});
  const llm:any={id:'llm',type:'llm',data:{model:'test',outputFormat:'json',outputFields:{temperature:'number'}}};
  const nodes=[f.nodes[0],llm,f.nodes[1]];const edges=[{source:'input',target:'llm'},{source:'llm',target:'control'}];
  assert.equal(validateGraph(nodes,edges).filter(i=>i.severity==='error').length,0);
  llm.data.outputFormat='text';assert.ok(validateGraph(nodes,edges).some(i=>i.message.includes('不能直接')));
  assert.ok(validateNode({...f.nodes[1],data:{...f.nodes[1].data,controlOperation:'subscribe'}}).some(i=>i.severity==='error'));
});
test('Frontend and backend HMI catalogs are identical',()=>{
  const backend=JSON.parse(readFileSync(new URL('../backend/app/services/hmi_controls.json',`file://${process.cwd()}/`),'utf8'));
  assert.deepEqual(backend,HMI_CONTROLS);
});
