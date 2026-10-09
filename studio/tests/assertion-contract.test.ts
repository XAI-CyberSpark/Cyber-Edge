import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectTestPlan} from '../src/domain/testPlanPreflight';
import {assertionPass,executeScenario,type Assertion} from '../src/domain/scenarioExecution';
const node=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const graph={nodes:[node('i','input',{flowVersion:2,inputFormat:'json',outputFields:{n:'number',ok:'boolean'}}),node('o','output')],edges:[{id:'e',source:'i',target:'o'}]};
const plan=(path:string[],value:any,op:Assertion['op']='equals')=>({cases:[{name:'test',steps:[{input:{n:3,ok:true},assertions:[{path,value,op}]}]}]});
test('catalog derives flat control IDs, graph IDs, output fields and closest legal paths',()=>{
 for(const [path,suggestion] of [[['car','seat','vent','1'],['car','hmiSettings','seat.vent.1']],[['nodes','oo'],['nodes','o']],[['outputs','i','data','nn'],['outputs','i','data','n']]]){
  const errors=inspectTestPlan(graph,plan(path,3)).errors;assert.equal(errors[0].code,'PLAN_ASSERTION_PATH');assert.equal(errors[0].path,'plan.cases[0].steps[0].assertions[0]');assert.deepEqual(errors[0].suggestions![0],suggestion);
 }
 assert.equal(inspectTestPlan(graph,plan(['car','hmiSettings','seat.vent.1'],2)).errors.length,0);
 assert.equal(inspectTestPlan(graph,plan(['outputs','o','text'],'x')).errors[0].code,'PLAN_ASSERTION_PATH');
});
test('known types and node statuses reject wrong values without coercing strict assertions',()=>{
 for(const [path,value,type] of [[['car','ac','fan'],'3','number'],[['car','hmiSettings','locks.child'],'true','boolean'],[['outputs','i','data','n'],'3','number'],[['nodes','i'],'complete','string']] as const){
  const d=inspectTestPlan(graph,plan([...path],value)).errors[0];assert.equal(d.code,'PLAN_ASSERTION_TYPE');assert.equal(d.expected_type,type);assert.match(d.message,/收到/);
 }
 assert.equal(assertionPass({path:['x'],op:'equals',value:'3'},3),false);
 assert.equal(inspectTestPlan(graph,plan(['car','ac','fan'],undefined,'exists')).errors.length,0);
 assert.equal(inspectTestPlan(graph,plan(['outputs','i','data','n'],'input > 0','satisfies')).errors.length,0);
});
test('invalid assertions in a later case block all execution',async()=>{
 const p=plan(['car','ac','fan'],3);p.cases.push(plan(['nodes','missing'],'success').cases[0]);
 const r=await executeScenario(graph,p);assert.equal(r.status,'failed');assert.equal(r.model_calls,0);assert.equal(r.cases.length,0);assert.equal(r.contract_diagnostics![0].code,'PLAN_ASSERTION_PATH');
});
test('state references warn across cases by writer fields and read bindings, no scene names',()=>{
 const g={nodes:[node('w','input',{eventName:'setup'}),node('s','state',{values:{arbitraryFlag:true}}),node('r','input',{eventName:'check'}),node('l','logic',{condition:'input.arbitraryFlag === true'})],edges:[{id:'ws',source:'w',target:'s'},{id:'rl',source:'r',target:'l'}]};
 const write={input:{$event:{name:'setup'}}},read={input:{$event:{name:'check'}}};
 const p={cases:[{name:'one',steps:[write]},{name:'two',steps:[read]}]};
 assert.ok(inspectTestPlan(g,p).warnings.some(d=>d.code==='PLAN_CASE_MEMORY_ISOLATION'&&d.node_id==='l'));
 p.cases[1].steps.unshift(write);assert.equal(inspectTestPlan(g,p).warnings.filter(d=>d.code==='PLAN_CASE_MEMORY_ISOLATION').length,0);
});
test('assertion paths cannot resolve inherited prototype properties',()=>{
 for(const path of [['nodes','constructor'],['outputs','__proto__'],['car','hmiSettings','constructor']]){
  const errors=inspectTestPlan(graph,plan(path,null,'not_exists')).errors;
  assert.equal(errors.length,1,JSON.stringify(path));assert.equal(errors[0].code,'PLAN_ASSERTION_PATH');
 }
});
test('memory output shape follows the graph-derived buffer role',()=>{
 const w={...graph,nodes:[...graph.nodes,node('buffer','memory',{type:'buffer'})],edges:[...graph.edges,{id:'iw',source:'i',target:'buffer'}]};
 assert.equal(inspectTestPlan(w,plan(['outputs','buffer','short_term_memory_count'],0)).errors[0].code,'PLAN_ASSERTION_PATH');
 assert.equal(inspectTestPlan(w,plan(['outputs','buffer','short_term_memory_written'],true)).errors.length,0);
 const r={nodes:[...w.nodes,node('m','llm')],edges:[...w.edges,{id:'wm',source:'buffer',target:'m'}]};
 assert.equal(inspectTestPlan(r,plan(['outputs','buffer','short_term_memory_count'],0)).errors.length,0);
 assert.equal(inspectTestPlan(r,plan(['outputs','buffer','short_term_memory_written'],true)).errors[0].code,'PLAN_ASSERTION_PATH');
});
