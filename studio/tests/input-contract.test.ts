import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeScenario} from '../src/domain/scenarioExecution';
const node=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const edge=(source:string,target:string)=>({id:source+target,source,target});
const project={nodes:[node('entry','input',{flowVersion:2,inputFormat:'json',outputFields:{temp:'number'}}),node('out','output',{responseText:'{{input.data.temp}}'})],edges:[edge('entry','out')]};
const plan=(input:any)=>({cases:[{name:'contract',steps:[{input,assertions:[{path:['outputs','entry','data','temp'],op:'equals' as const,value:22}]}]}]});
test('JSON entry accepts object, JSON string and text wrapper without a model',async()=>{
 for(const input of [{temp:22},'{"temp":22}',{text:'{"temp":22}'}]) {
  const r=await executeScenario(project,plan(input));assert.equal(r.status,'passed',JSON.stringify(r));assert.equal(r.model_calls,0);
 }
});
test('missing input field is attributed to input with field and case location',async()=>{
 const r:any=await executeScenario(project,plan({}));assert.equal(r.status,'failed');
 assert.match(JSON.stringify(r),/input_contract/);assert.match(JSON.stringify(r),/缺少 temp（number）/);assert.doesNotMatch(JSON.stringify(r),/模型未按约定/);
});

import {inspectTestPlan} from '../src/domain/testPlanPreflight';
import {parseInputObject} from '../src/domain/inputContract';
import {parseModelObject,validateModelFields} from '../src/domain/modelOutput';
import {ContractError} from '../src/domain/contractErrors';
import {GraphEngine} from '../src/utils/GraphEngine';
import {ScenarioSessions} from '../src/domain/scenarioSession';

test('static JSON errors locate case, step, entry and field with separate codes',()=>{
 for(const [input,code] of [[{},'INPUT_FIELD_MISSING'],[{temp:'22'},'INPUT_FIELD_TYPE'],['invalid','INPUT_JSON_PARSE'],[[], 'INPUT_OBJECT_REQUIRED'],[{text:22},'INPUT_OBJECT_REQUIRED']] as const){
  const r=inspectTestPlan(project,plan(input));assert.equal(r.errors[0].code,code);assert.equal(r.errors[0].path,'plan.cases[0].steps[0].input');assert.equal(r.errors[0].node_id,'entry');
 }
 assert.throws(()=>parseModelObject('invalid'),(e:any)=>e.category==='model_output'&&e.code==='MODEL_JSON_PARSE');
 assert.throws(()=>validateModelFields({}, {temp:'number'}),(e:any)=>e.category==='model_output'&&e.code==='MODEL_FIELD_TYPE');
 assert.throws(()=>parseInputObject({temp:Infinity},{temp:'number'},'entry'),(e:any)=>e.code==='INPUT_FIELD_TYPE');
 assert.deepEqual(parseInputObject({temp:22,extra:'discard'},{temp:'number'},'entry'),{temp:22});
});
test('all declared JSON field types are checked without coercion',()=>{
 const fields={textValue:'string',n:'number',b:'boolean',a:'array',o:'object'} as const;
 const good={textValue:'x',n:0,b:false,a:[],o:{}};assert.deepEqual(parseInputObject(good,fields,'i'),good);
 for(const key of Object.keys(good))assert.throws(()=>parseInputObject({...good,[key]:null},fields,'i'),ContractError);
});
test('named event payloads share object/string/text wrapper contract and skip dormant entries',async()=>{
 const named={...project,nodes:project.nodes.map(n=>n.id==='entry'?{...n,data:{...n.data,eventName:'sensor'}}:n)};
 for(const value of [{temp:22},'{"temp":22}',{text:'{"temp":22}'}]) {
  const r=await executeScenario(named,plan({$event:{name:'sensor',value}}));assert.equal(r.status,'passed',JSON.stringify(r));
 }
 assert.equal(inspectTestPlan(named,plan({$event:{name:'other',value:{}}})).errors.length,0);
 assert.equal(inspectTestPlan(named,plan({$event:{name:'sensor',data:{temp:22}}})).errors[0].code,'INPUT_JSON_PARSE');
});
test('runtime input failures preserve category in both graph engines',async()=>{
 for(const flowVersion of [undefined,2]){
  const nodes=structuredClone(project.nodes);nodes[0].data.flowVersion=flowVersion;
  const callbacks:any={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({}),updateSimulatorState(){}};
  const r=await new GraphEngine(nodes,project.edges,callbacks,new ScenarioSessions()).run({});
  const failure:any=r.events.find(e=>e.type==='node_failed');assert.equal(failure.payload.category,'input_contract');assert.equal(failure.payload.code,'INPUT_FIELD_MISSING');
 }
});
test('actual model output failure retains model category through trial',async()=>{
 const p={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{providerId:'minimax',model:'test',outputFormat:'json',outputFields:{temp:'number'}})],edges:[edge('i','m')]};
 const r:any=await executeScenario(p,{cases:[{name:'model error',steps:[{input:'start',assertions:[{path:['nodes','m'],op:'equals',value:'success'}]}]}]},{inference:async()=>({choices:[{message:{content:'invalid'}}]})});
 assert.equal(r.model_calls,1);assert.equal(r.cases[0].steps[0].failed_nodes[0].category,'model_output');assert.equal(r.cases[0].steps[0].failed_nodes[0].code,'MODEL_JSON_PARSE');
});
test('waiting warnings follow paths, exclude unreachable waits, and do not validate replies as JSON entry',()=>{
 const p={nodes:[...project.nodes,node('w','wait',{prompt:'reply'}),node('unused','wait',{})],edges:[...project.edges,edge('out','w')]};
 const one=plan({temp:22});one.cases[0].steps[0]={...one.cases[0].steps[0],status:'completed'} as any;
 const r=inspectTestPlan(p,one);assert.equal(r.errors.length,0);assert.equal(r.warnings.length,1);assert.equal(r.warnings[0].node_id,'w');assert.match(r.warnings[0].message,/completed.*waiting/);assert.match(r.warnings[0].message,/后续 step/);
 const two:any=plan({temp:22});two.cases[0].steps.push({input:'answer'});assert.equal(inspectTestPlan(p,two).errors.length,0);assert.equal(inspectTestPlan(p,two).warnings.length,0);
 const branch={nodes:[node('i','input'),node('l','logic',{condition:'input.x'}),node('w','wait')],edges:[edge('i','l'),{...edge('l','w'),sourceHandle:'true'}]};
 assert.match(inspectTestPlan(branch,plan('start')).warnings[0].message,/可能/);
});
test('cross case memory warning uses graph roles, same-case setup removes warning',()=>{
 const p={nodes:[node('i','input',{eventName:'write'}),node('write','memory',{type:'buffer'}),node('r','input',{eventName:'read'}),node('read','memory',{type:'buffer'}),node('m','llm')],edges:[edge('i','write'),edge('r','read'),edge('read','m')]};
 const write={input:{$event:{name:'write',text:'value'}}},read={input:{$event:{name:'read'}}};
 const r=inspectTestPlan(p,{cases:[{name:'first',steps:[write]},{name:'second',steps:[read]}]});
 assert.equal(r.warnings[0].code,'PLAN_CASE_MEMORY_ISOLATION');assert.match(r.warnings[0].message,/plan.cases\[1\].steps\[0\]/);
 assert.equal(inspectTestPlan(p,{cases:[{name:'first',steps:[write]},{name:'second',steps:[write,read]}]}).warnings.length,0);
});
test('JSON business fields named type/content do not invoke media validation or get an injected text wrapper',async()=>{
 for(const eventName of [undefined,'sensor']){
  const p={nodes:[node('entry','input',{flowVersion:2,inputFormat:'json',outputFields:{type:'string',content:'string'},...(eventName?{eventName}:{})})],edges:[]};
  for(const content of ['', 'data:image/example']){
   const value={type:'image',content};
   const r=await executeScenario(p,{cases:[{name:'JSON business data',steps:[{input:eventName?{$event:{name:eventName,value}}:value,assertions:[{path:['outputs','entry','data'],op:'equals',value}]}]}]});
   assert.equal(r.status,'passed',JSON.stringify(r));assert.equal(r.model_calls,0);
  }
 }
});
