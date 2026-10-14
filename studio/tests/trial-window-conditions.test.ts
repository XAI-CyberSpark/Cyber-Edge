import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeScenario} from '../src/domain/scenarioExecution';
import {inspectTestPlan} from '../src/domain/testPlanPreflight';

const WINDOWS={fl:17,fr:29,rl:43,rr:68};
const ZERO={fl:0,fr:0,rl:0,rr:0};
const node=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const edge=(source:string,target:string,sourceHandle?:string)=>({id:source+target+(sourceHandle||''),source,target,...(sourceHandle?{sourceHandle}:{})});
const equal=(path:string[],value:any)=>({path,op:'equals' as const,value});
const emptyGraph={nodes:[node('i','input',{flowVersion:2}),node('o','output',{responseText:'完成'})],edges:[edge('i','o')]};
const actionGraph={nodes:[
  node('i','input',{flowVersion:2}),
  node('m','llm',{providerId:'openai',model:'gpt-test',outputFormat:'actions'}),
  node('gate','logic',{logic_type:'if',condition:"input.actions.some(a => a.name === 'windows.close_all')"}),
  node('rr','car_control',{action:'windows',parameter:'close_all',module:'vehicleControl',signalKey:'WINDOW_POSITION',function:'set',area:4,targetStatus:0}),
  node('ok','output',{responseText:'右后窗已关闭。'}),
  node('noop','output',{responseText:'未执行车窗动作。'}),
  node('fail','fallback',{joinMode:'any',responseText:'车窗操作未完成，请检查。'}),
],edges:[edge('i','m'),edge('m','gate'),edge('gate','rr','true'),edge('gate','noop','false'),edge('rr','ok'),edge('m','fail','error'),edge('rr','fail','error')]};
const reply=()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:'windows.close_all',actions:[{name:'windows.close_all',parameters:{}}],reply:'请求关闭右后窗。'})}}]});
const simpleCase=(conditions:any={})=>({name:'初始条件',...conditions,steps:[{input:'开始',status:'completed',assertions:[equal(['hmi','message'],'完成')]}]});

test('actual complete initial windows are recorded before execution and produce no workflow actions',async()=>{
  const positions={fl:0,fr:100,rl:23.5,rr:68};
  const c=simpleCase({initial_windows:positions,blocked_window:'rr'});
  c.steps[0].assertions.push(equal(['car','windows'],positions),equal(['actions','length'],0));
  const report=await executeScenario(emptyGraph,{cases:[c]} as any);
  assert.equal(report.status,'passed',JSON.stringify(report));
  assert.deepEqual(report.cases[0].steps[0].evidence.initial_vehicle,{windows:positions,blocked_window:'rr'});
  assert.equal(report.model_calls,0);assert.equal(report.tool_calls,0);
});

test('omitted or null conditions keep zero windows and preserve existing HMI initialization',async()=>{
  for(const conditions of [{},{initial_windows:null,blocked_window:null}]){
    const c=simpleCase({...conditions,controls:[{control:'ac.temp',value:21}]});
    c.steps[0].assertions.push(equal(['car','windows'],ZERO),equal(['car','ac','temp'],21),equal(['actions','length'],0));
    const report=await executeScenario(emptyGraph,{cases:[c]} as any);
    assert.equal(report.status,'passed',JSON.stringify(report));
    assert.deepEqual(report.cases[0].steps[0].evidence.initial_vehicle,{windows:ZERO,blocked_window:null});
  }
});

test('initial window positions and faults never leak into another case',async()=>{
  const report=await executeScenario(emptyGraph,{cases:[simpleCase({initial_windows:WINDOWS,blocked_window:'rr'}),simpleCase()]} as any);
  assert.equal(report.status,'passed',JSON.stringify(report));
  assert.deepEqual(report.cases[0].steps[0].evidence.car.windows,WINDOWS);
  assert.deepEqual(report.cases[1].steps[0].evidence.car.windows,ZERO);
  assert.deepEqual(report.cases[1].steps[0].evidence.initial_vehicle,{windows:ZERO,blocked_window:null});
});

test('the real rr actuator closes from nonzero position and preserves other windows',async()=>{
  const report=await executeScenario(actionGraph,{cases:[{name:'仅rr关闭',initial_windows:WINDOWS,steps:[{input:'关闭右后窗',status:'completed',assertions:[
    equal(['car','windows'],{fl:17,fr:29,rl:43,rr:0}),equal(['actions','length'],1),
    equal(['outputs','rr','action_result','requested'],{rr:0}),equal(['outputs','rr','action_result','success'],true),
  ]}]}]} as any,{inference:async()=>reply()});
  assert.equal(report.status,'passed',JSON.stringify(report));
  const evidence=report.cases[0].steps[0].evidence;
  assert.deepEqual(evidence.initial_vehicle,{windows:WINDOWS,blocked_window:null});
  assert.equal(report.model_calls,1);assert.equal(evidence.actions[0].id,1);
});

test('real blocked rr retains its opening and routes failure without a false success message',async()=>{
  const report=await executeScenario(actionGraph,{cases:[{name:'rr卡窗',initial_windows:WINDOWS,blocked_window:'rr',steps:[{input:'关闭右后窗',status:'failed',assertions:[
    equal(['car','windows'],WINDOWS),equal(['actions','length'],1),equal(['nodes','rr'],'failed'),
    equal(['nodes','fail'],'success'),equal(['nodes','ok'],'skipped'),
    {path:['hmi','message'],op:'satisfies',value:'!input.includes("已关闭")'},
  ]}]}]} as any,{inference:async()=>reply()});
  assert.equal(report.status,'passed',JSON.stringify(report));
  const evidence=report.cases[0].steps[0].evidence;
  assert.deepEqual(evidence.initial_vehicle,{windows:WINDOWS,blocked_window:'rr'});
  assert.equal(evidence.actions[0].success,false);
  assert.deepEqual(evidence.actions[0].requested,{rr:0});
  assert.deepEqual(evidence.actions[0].actual,WINDOWS);
  assert.deepEqual(evidence.actions[0].failedWindows,['rr']);
  assert.equal(evidence.actions[0].reason,'blocked');
  assert.match(evidence.hmi.message,/未完成/);
});

test('all initial windows are validated before any earlier case calls a model or actuator',async()=>{
  const invalid:any[]=[[],{},'open',true,50,{rr:68},{...WINDOWS,other:5},{...WINDOWS,constructor:5}];
  for(const value of [true,false,'17',null,[],{},-1,101,NaN,Infinity,-Infinity])invalid.push({...WINDOWS,fl:value});
  for(const value of invalid){
    let calls=0;
    const good={name:'earlier valid',steps:[{input:'关闭右后窗',assertions:[equal(['car','windows','rr'],0)]}]};
    const bad={...good,name:'later invalid',initial_windows:value};
    const checked=inspectTestPlan(actionGraph,{cases:[good,bad]} as any);
    assert.ok(checked.errors.some(d=>d.path.startsWith('plan.cases[1].initial_windows')),JSON.stringify(checked));
    const report=await executeScenario(actionGraph,{cases:[good,bad]} as any,{inference:async()=>{calls++;return reply();}});
    assert.equal(report.status,'failed',JSON.stringify(report));
    assert.equal(calls,0);assert.equal(report.model_calls,0);assert.equal(report.tool_calls,0);
    assert.deepEqual(report.cases,[]);
  }
});

test('only a single known blocked window or null is accepted before execution',async()=>{
  for(const value of ['fl','fr','rl','rr',null]){
    const report=await executeScenario(emptyGraph,{cases:[simpleCase({blocked_window:value})]} as any);
    assert.equal(report.status,'passed',JSON.stringify(report));
    assert.deepEqual(report.cases[0].steps[0].evidence.initial_vehicle,{windows:ZERO,blocked_window:value});
  }
  for(const value of ['', 'RR','all','front_left',true,0,1,[],['rr'],{window:'rr'}]){
    let calls=0;
    const bad={name:'bad fault',blocked_window:value,steps:[{input:'关闭右后窗',assertions:[equal(['car','windows','rr'],0)]}]};
    const checked=inspectTestPlan(actionGraph,{cases:[bad]} as any);
    assert.ok(checked.errors.some(d=>d.path==='plan.cases[0].blocked_window'),JSON.stringify(checked));
    const report=await executeScenario(actionGraph,{cases:[bad]} as any,{inference:async()=>{calls++;return reply();}});
    assert.equal(report.status,'failed');assert.equal(calls,0);assert.deepEqual(report.cases,[]);
  }
});
