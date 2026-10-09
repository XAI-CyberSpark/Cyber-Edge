import {test} from 'node:test';
import assert from 'node:assert/strict';
import child from './fixtures/child-care-contract.json';
import {buildRainComfortScenario} from '../src/data/rainComfortScenario';
import {executeCase} from '../scripts/scenario-benchmark-runtime';
const trip={nodes:[{id:'i',type:'input',position:{x:0,y:0},data:{}},{id:'s',type:'interaction',position:{x:300,y:0},data:{plan:{mode:'authored',premise:'航海',ending:'结束',steps:[
 {id:'q',title:'谜题',waitFor:'answer',content:{message:'朵朵，准备前往滴水湖。',question:'2加3等于几？',answers:['5','五'],hint:'比四大一',reward:'海星'}},
 {id:'a',title:'等待到达',waitFor:'arrival',content:{message:'等待到达'}},
 {id:'end',title:'生日惊喜',waitFor:'continue',content:{message:'祝朵朵生日快乐！赠你想象中的船长贺卡。'}}]}}}],edges:[{id:'e',source:'i',target:'s'}]};

test('reference child graph executes risk/normal/unknown/stream failure/model failure',async()=>{
 const before=JSON.stringify(child);const result=await executeCase(child,'child');assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(result.checks.length,5);assert.equal(JSON.stringify(child),before);
});
test('counterfactual: reversed danger branch is caught',async()=>{
 const graph=structuredClone(child);graph.nodes.find(n=>n.id==='logic_risk_check')!.data.condition="input.confidence >= 0.8 && input.recognition.status === 'normal'";
 const result=await executeCase(graph,'child');assert.equal(result.status,'failed');
});
test('counterfactual: missing video capability is caught',async()=>{
 const graph=structuredClone(child);graph.nodes=graph.nodes.filter(n=>n.type!=='video_display');graph.edges=graph.edges.filter(e=>e.source!=='rear_video_display'&&e.target!=='rear_video_display');
 const result=await executeCase(graph,'child');assert.equal(result.status,'failed');
});
test('reference interaction exercises wrong answer/pause/repeat/arrival/exit/restart',async()=>{
 const result=await executeCase(trip,'interaction');assert.equal(result.status,'passed',JSON.stringify(result));assert.ok(result.checks.includes('退出后不自动重启'));
});
test('counterfactual: incompatible configured answer fails actual engine',async()=>{
 const graph=structuredClone(trip);Object.assign(graph.nodes[1].data.plan!.steps[0],{acceptedAnswers:['99']});assert.equal((await executeCase(graph,'interaction')).status,'failed');
});
test('untrusted scripts and unsupported conditions are never executed or marked passed',async()=>{
 for(const data of [{script:'globalThis.BAD=true;return true',condition:'true'},{condition:'process.exit(0)'},{condition:'input.foo===true'}]){
  const graph=structuredClone(child);Object.assign(graph.nodes.find(n=>n.type==='logic')!.data,data);
  assert.equal((await executeCase(graph,'child')).status,'not_supported');assert.equal((globalThis as any).BAD,undefined);
 }
});
test('reference rain and specific window actions stay within simulation',async()=>{
 const rain=await executeCase(buildRainComfortScenario(),'rain');assert.equal(rain.status,'passed',JSON.stringify(rain));
 const graph={nodes:[{id:'i',type:'input',data:{},position:{x:0,y:0}},{id:'c',type:'car_control',data:{module:'vehicleControl',function:'set',signalKey:'WINDOW_POSITION',area:4,targetStatus:0},position:{x:1,y:0}}],edges:[{id:'e',source:'i',target:'c'}]};
 assert.equal((await executeCase(graph,'window')).status,'passed');graph.nodes[1].data.area=6;assert.equal((await executeCase(graph,'window')).status,'failed');
});
test('reference passes do not verify model-generated content or actual image inference',async()=>{
 const result=await executeCase(child,'child');assert.match((result as any).scope,/注入/);assert.match((result as any).scope,/未测视觉/);
 assert.equal((await executeCase({},'none')).status,'not_required');
});
