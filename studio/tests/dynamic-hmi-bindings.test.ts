import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGraph} from '../src/domain/nodeCapabilities';
import {executeScenario} from '../src/domain/scenarioExecution';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string)=>({id:source+'-'+target,source,target});
const eq=(path:string[],value:any)=>({path,op:'equals' as const,value});
function graph(){return {nodes:[n('i','input',{flowVersion:2}),n('read','car_control',{executionMode:'hmi',controlId:'ac.temp',controlOperation:'get'}),n('save','state',{values:{baseline:{$ref:'outputs.read.action_result.actual'}}}),n('m','llm',{model:'MiniMax-M3',providerId:'minimax',outputFormat:'json',outputFields:{target:'number'},systemPrompt:'Return target.'}),n('set','car_control',{executionMode:'hmi',controlId:'ac.temp',controlValue:{$ref:'outputs.m.data.target'}}),n('wait','wait',{eventName:'message',prompt:'等待恢复'}),n('restore','car_control',{executionMode:'hmi',controlId:'ac.temp',controlValue:{$ref:'state.baseline'}})],edges:[e('i','read'),e('read','save'),e('save','m'),e('m','set'),e('set','wait'),e('wait','restore')]};}
const answer=(target:number)=>({choices:[{message:{content:JSON.stringify({target})}}],model:'MiniMax-M3'});
test('typed model output and captured initial HMI value execute through a wait without replay',async()=>{
 const p=graph();assert.deepEqual(validateGraph(p.nodes,p.edges).filter(i=>i.severity==='error'),[]);let calls=0;
 const report=await executeScenario(p,{cases:[{name:'nondefault',controls:[{control:'ac.temp',value:27}],steps:[{input:'set',status:'waiting',assertions:[eq(['car','ac','temp'],18),eq(['state','baseline'],27),eq(['actions','length'],2)]},{input:'restore',status:'completed',assertions:[eq(['car','ac','temp'],27),eq(['actions','length'],3)]}]}]},{inference:async()=>{calls++;return answer(18);}});
 assert.equal(report.status,'passed',JSON.stringify(report));assert.equal(calls,1);
});
test('out-of-range and fractional model values fail before any set operation',async()=>{
 for(const value of [35,20.5]){
  const report=await executeScenario(graph(),{cases:[{name:'invalid',steps:[{input:'set',status:'failed',assertions:[eq(['car','ac','temp'],22),eq(['actions','length'],1),eq(['nodes','restore'],'skipped')]}]}]},{inference:async()=>answer(value)});
  assert.equal(report.status,'passed',JSON.stringify(report));
 }
});
test('missing and wrongly typed state values fail before writes',async()=>{
 for(const value of [null,'20',false,35]){
  const p=graph();p.nodes[2].data.values.bad=value;p.nodes[4].data.controlValue={$ref:'state.bad'};
  const report=await executeScenario(p,{cases:[{name:'invalid state',steps:[{input:'set',status:'failed',assertions:[eq(['actions','length'],1),eq(['car','ac','temp'],22)]}]}]},{inference:async()=>answer(18)});
  assert.equal(report.status,'passed',JSON.stringify(report));
 }
 const p=graph();p.nodes[4].data.controlValue={$ref:'state.missing'};
 const report=await executeScenario(p,{cases:[{name:'missing',steps:[{input:'set',status:'failed',assertions:[eq(['actions','length'],1)]}]}]},{inference:async()=>answer(18)});
 assert.equal(report.status,'passed',JSON.stringify(report));
});
test('invalid paths, unknown control, extra ref keys, text interpolation and legacy mode remain rejected',()=>{
 for(const value of [{$ref:'outputs.absent.data.target'},{$ref:'state.__proto__'},{$ref:'state.x',extra:1},'{{state.x}}']){
  const p=graph();p.nodes[4].data.controlValue=value;assert.ok(validateGraph(p.nodes,p.edges).some(i=>i.severity==='error'));
 }
 for(const patch of [{controlId:'unregistered'},{controlOperation:'subscribe'},{module:'vehicleControl'}]){
  const p=graph();Object.assign(p.nodes[4].data,patch);assert.ok(validateGraph(p.nodes,p.edges).some(i=>i.severity==='error'));
 }
 const p=graph();p.nodes=p.nodes.filter(x=>['i','m','set'].includes(x.id));p.nodes[0].data={};p.edges=[e('i','m'),e('m','set')];assert.ok(validateGraph(p.nodes,p.edges).some(i=>i.severity==='error'));
});
test('text model output still cannot drive vehicle controls',()=>{
 const p=graph();p.nodes[3].data.outputFormat='text';assert.ok(validateGraph(p.nodes,p.edges).some(i=>i.severity==='error'&&i.nodeId==='m'));
});
