import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionDiagnostics} from '../src/domain/connectionContract';
import {inspectTestPlan} from '../src/domain/testPlanPreflight';
import {eventOf} from '../src/domain/flowSession';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+'-'+target,source,target,sourceHandle});
test('lineage names exact edges, endpoints, shapes and repairs; new model replaces old output',()=>{
 const nodes=[n('a','llm',{outputFormat:'json',outputFields:{v:'number'}}),n('b','logic'),n('t','tool',{tool_id:'nav'})],edges=[e('a','b'),e('b','t')];
 const d=connectionDiagnostics(nodes,edges)[0];assert.equal(d.code,'GRAPH_CONNECTION_CONTRACT');assert.deepEqual(d.path.map((p:any)=>p.edge_id),['a-b','b-t']);assert.equal(d.target_node_id,'t');assert.equal(d.repairs.length,3);assert.equal(d.actual_contract.shape.data.v,'number');
 nodes[1]=n('b','llm',{outputFormat:'actions'});assert.deepEqual(connectionDiagnostics(nodes,edges),[]);
 nodes[1]=n('b','logic');edges[0].sourceHandle='error';assert.deepEqual(connectionDiagnostics(nodes,edges),[]);
});
test('HMI and MCP bindings use declared output fields, actions cannot masquerade as JSON',()=>{
 for(const target of [n('t','car_control',{executionMode:'hmi',controlId:'ac.temp',valueField:'v'}),n('t','tool',{tool_id:'mcp',arguments:{n:{$ref:'input.data.v'}}})]){
  const a=n('a','llm',{outputFormat:'actions',outputFields:{v:'number'}});const edges=[e('a','t')];assert.equal(connectionDiagnostics([a,target],edges).length,1);
  a.data.outputFormat='json';assert.deepEqual(connectionDiagnostics([a,target],edges),[]);
  a.data.outputFields={wrong:'number'};assert.equal(connectionDiagnostics([a,target],edges).length,1);
 }
 const nodes=[n('a','llm',{outputFormat:'json',outputFields:{v:'string'}}),n('t','car_control',{executionMode:'hmi',controlId:'ac.temp',valueField:'v'})];assert.match(connectionDiagnostics(nodes,[e('a','t')])[0].message,/需要 number/);
});
test('fixed HMI and text MCP arguments are compatible and unknown dynamic bindings are deferred',()=>{
 const nodes=[n('a','llm',{outputFormat:'text'}),n('t','car_control',{executionMode:'hmi',controlId:'ac.temp',controlValue:22}),n('m','tool',{tool_id:'mcp',arguments:{message:{$ref:'input.text'}}})];assert.deepEqual(connectionDiagnostics(nodes,[e('a','t'),e('a','m')]),[]);
});
test('nodes exists is weak even for skipped states, success and receipt assertions are unchanged',()=>{
 const graph={nodes:[n('i','input',{flowVersion:2}),n('o','output')],edges:[e('i','o')]};
 const p:any={cases:[{name:'x',steps:[{input:'x',assertions:[{path:['nodes','o'],op:'exists'}]}]}]};
 const r=inspectTestPlan(graph,p);assert.equal(r.errors.length,0);assert.equal(r.warnings[0].code,'PLAN_ASSERTION_WEAK');assert.match(r.warnings[0].message,/skipped/);assert.equal(p.cases[0].steps[0].assertions[0].op,'exists');
 p.cases[0].steps[0].assertions[0]={path:['nodes','o'],op:'equals',value:'success'};assert.equal(inspectTestPlan(graph,p).warnings.length,0);
});
test('event preflight follows eventOf without unwrapping text',()=>{
 const graph={nodes:[n('i','input',{flowVersion:2,eventName:'arrival',aliases:['Go!']})],edges:[]};
 const check=(input:any)=>inspectTestPlan(graph,{cases:[{name:'x',steps:[{input}]}]}).warnings;
 const wrapped={text:JSON.stringify({$event:{name:'arrival'}})};assert.equal(eventOf(wrapped,'x').name,'message');assert.equal(check(wrapped)[0].code,'PLAN_EVENT_UNMATCHED');assert.match(check(wrapped)[0].message,/"message"/);
 for(const input of [{$event:{name:'arrival'}},JSON.stringify({$event:{name:'arrival'}}),' go ',{$event:{name:'any',control:'stop'}}])assert.equal(check(input).length,0);
 assert.equal(check({$event:{name:'arrival',target:'wrong'}})[0].code,'PLAN_EVENT_UNMATCHED');
});
test('waiting replies and generic entries avoid unmatched event false positives',()=>{
 const nodes=[n('i','input',{flowVersion:2,eventName:'begin'}),n('w','wait',{eventName:'answer',prompt:'next'})];
 const plan={cases:[{name:'x',steps:[{input:{$event:{name:'begin'}}},{input:{$event:{name:'answer'}}}]}]};
 assert.equal(inspectTestPlan({nodes,edges:[e('i','w')]},plan).warnings.filter(d=>d.code==='PLAN_EVENT_UNMATCHED').length,0);
 nodes.push(n('generic','input'));assert.equal(inspectTestPlan({nodes,edges:[]},{cases:[{name:'x',steps:[{input:'plain'}]}]}).warnings.filter(d=>d.code==='PLAN_EVENT_UNMATCHED').length,0);
});
