import {test} from 'node:test';
import assert from 'node:assert/strict';
import cases from './fixtures/binding-preflight.json';
import {validateBindings} from '../src/domain/flowContract';
import {bindFlowValue} from '../src/domain/flowSession';
import {executeScenario} from '../src/domain/scenarioExecution';
const node=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const edge=(source:string,target:string)=>({id:source+target,source,target});
test('binding preflight agrees with shared contract cases',()=>{
 const nodes=[node('m','llm'),node('stage','stage')];
 for(const c of cases)assert.equal(validateBindings(node('o','output',c.data),nodes).length===0,c.valid,c.name);
 assert.deepEqual(validateBindings(node('stage','stage',{description:'{{unknown}}'}),nodes),[]);
});
test('invalid output reference blocks production graph before API calls',async()=>{
 let calls=0;
 const graph={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{model:'MiniMax-M3',providerId:'minimax',outputFormat:'text'}),node('o','output',{responseText:'{{m.text}}'})],edges:[edge('i','m'),edge('m','o')]};
 const report=await executeScenario(graph,{cases:[{name:'bad reference',steps:[{input:'海风',status:'completed',assertions:[{path:['hmi','message'],op:'contains',value:'海风'}]}]}]},
  {inference:async()=>{calls++;return {choices:[{message:{content:'海风轻拂'},finish_reason:'stop'}]};}});
 assert.equal(report.status,'failed');assert.equal(calls,0);assert.match(JSON.stringify(report),/绑定根/);
});
test('valid references preserve values and optional missing state keeps existing behavior',()=>{
 const context={input:{data:{score:4}},state:{},event:{text:'hello'},outputs:{m:{data:{title:'海风'}}}};
 assert.deepEqual(bindFlowValue({$ref:'input.data'},context),{score:4});
 assert.equal(bindFlowValue('{{outputs.m.data.title}}/{{state.optional}}/{{event.text}}',context),'海风//hello');
});
