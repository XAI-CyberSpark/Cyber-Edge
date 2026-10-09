import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeScenario} from '../src/domain/scenarioExecution';
import {validateGraph} from '../src/domain/nodeCapabilities';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+target+(sourceHandle||''),source,target,sourceHandle});
const eq=(path:string[],value:any)=>({path,op:'equals' as const,value});
const event=(name:string,text:string)=>({$event:{name,text}});
function graph(name='message',end='完成'){
 return {nodes:[n('i','input',{flowVersion:2}),n('init','state',{values:{count:0}}),n('w','wait',{eventName:name,repeat:true,prompt:'第{{state.count}}轮后继续',storeAs:'answer'}),n('check','logic',{condition:`input.text === '${end}'`}),n('count','state',{increments:{count:1}}),n('show','output',{responseText:'收到{{state.answer}}；累计{{state.count}}'}),n('end','output',{responseText:'完成{{state.count}}'})],edges:[e('i','init'),e('init','w'),e('w','check'),e('check','end','true'),e('check','count','false'),e('count','show'),e('show','w')]};
}
for(const [name,end] of [['message','完成'],['item_review','关闭列表']])test(name+' repeats same nodes, retains state, initializes once and exits through configured branch',async()=>{
 const g=graph(name,end);assert.deepEqual(validateGraph(g.nodes,g.edges).filter(x=>x.severity==='error'),[]);
 const r=await executeScenario(g,{cases:[{name,steps:[{input:'start',status:'waiting',assertions:[eq(['state','count'],0)]},...[1,2,3].map(i=>({input:event(name,'条目'+i),event_id:'item'+i,status:'waiting',assertions:[eq(['state','count'],i),eq(['state','answer'],'条目'+i),{path:['hmi','message'],op:'contains' as const,value:'累计'+i}]})),{input:event(name,end),status:'completed',assertions:[eq(['state','count'],3),eq(['hmi','message'],'完成3'),{path:['outputs','show'],op:'not_exists'}]}]}]});
 assert.equal(r.status,'passed',JSON.stringify(r));
 assert.equal(r.cases.flatMap(c=>c.steps).flatMap(s=>s.evidence.run.events).filter((x:any)=>x.type==='node_started'&&x.nodeId==='init').length,1);
});
test('repeat wait deduplicates, ignores unmatched events, pauses, and resumes without consuming control as answer',async()=>{
 const r=await executeScenario(graph(),{cases:[{name:'事件边界',steps:[{input:'start',status:'waiting'},{input:'a',event_id:'one',status:'waiting'},{input:'a',event_id:'one',status:'waiting',assertions:[eq(['state','count'],1),eq(['run','finalOutput','duplicate'],true)]},{input:event('other','b'),status:'waiting',assertions:[eq(['state','count'],1)]},{input:{$event:{control:'pause'}},status:'paused'},{input:'b',status:'paused'},{input:{$event:{control:'resume'}},status:'waiting',assertions:[eq(['state','count'],1)]},{input:'b',status:'waiting',assertions:[eq(['state','count'],2)]},{input:'完成',status:'completed'}]}]});
 assert.equal(r.status,'passed',JSON.stringify(r));
});
test('all return paths settle; alternate paths can return on different rounds without stale skipped edges',async()=>{
 const g=graph();g.nodes.splice(5,1,n('which','logic',{condition:"input.text === 'A'"}),n('a','output',{responseText:'选择A'}),n('b','output',{responseText:'选择B'}));g.edges=g.edges.filter(x=>x.source!=='show'&&x.target!=='show');g.edges.push(e('count','which'),e('which','a','true'),e('which','b','false'),e('a','w'),e('b','w'));
 const r=await executeScenario(g,{cases:[{name:'互斥返回',steps:[{input:'start',status:'waiting'},{input:'A',status:'waiting',assertions:[eq(['state','count'],1),{path:['hmi','message'],op:'contains',value:'选择A'}]},{input:'B',status:'waiting',assertions:[eq(['state','count'],2),{path:['outputs','a'],op:'not_exists'},{path:['hmi','message'],op:'contains',value:'选择B'}]},{input:'完成',status:'completed'}]}]});assert.equal(r.status,'passed',JSON.stringify(r));
});
test('cycles without a declared repeat wait and secondary entries into a loop body are rejected',()=>{
 const g=graph();g.nodes.find(x=>x.id==='w')!.data.repeat=false;assert.ok(validateGraph(g.nodes,g.edges).some(x=>x.message.includes('环路')));
 g.nodes.find(x=>x.id==='w')!.data.repeat=true;g.edges.push(e('i','count'));g.nodes.find(x=>x.id==='count')!.data.joinMode='all';assert.ok(validateGraph(g.nodes,g.edges).some(x=>x.message.includes('环路')));
 const auto={nodes:[n('i','input',{flowVersion:2}),n('x','state'),n('y','state')],edges:[e('i','x'),e('x','y'),e('y','x')]};assert.ok(validateGraph(auto.nodes,auto.edges).some(x=>x.message.includes('环路')));
});
test('repeat budget fails explicitly before another iteration and cannot be bypassed by retry',async()=>{
 const g=graph();g.nodes.find(x=>x.id==='w')!.data.maxIterations=1;
 const r=await executeScenario(g,{cases:[{name:'预算',steps:[{input:'start',status:'waiting'},{input:'one',status:'waiting'},{input:'two',status:'failed',assertions:[eq(['state','count'],1),{path:['hmi','message'],op:'contains',value:'maxIterations'}]},{input:{$event:{control:'retry'}},status:'waiting'},{input:'three',status:'failed',assertions:[eq(['state','count'],1)]}]}]});assert.equal(r.status,'passed',JSON.stringify(r));
});
test('two independent repeated waits keep separate event and reset regions',async()=>{
 const a=graph('left','finish'),b=graph('right','finish');
 const g={nodes:[...a.nodes,...b.nodes.map(x=>({...x,id:'b_'+x.id}))],edges:[...a.edges,...b.edges.map(x=>({...x,id:'b_'+x.id,source:'b_'+x.source,target:'b_'+x.target}))]};
 // State is deliberately shared; distinct counters avoid accidental overwrite.
 for(const x of g.nodes.filter(x=>x.id.startsWith('b_'))){x.data=JSON.parse(JSON.stringify(x.data).replaceAll('count','rightCount').replaceAll('answer','rightAnswer'));}
 const r=await executeScenario(g,{cases:[{name:'并行循环',steps:[{input:'start',status:'waiting'},{input:event('left','x'),status:'waiting',assertions:[eq(['state','count'],1),eq(['state','rightCount'],0)]},{input:event('right','y'),status:'waiting',assertions:[eq(['state','count'],1),eq(['state','rightCount'],1)]},{input:event('left','finish'),status:'waiting'},{input:event('right','finish'),status:'completed'}]}]});assert.equal(r.status,'passed',JSON.stringify(r));
});
test('nested repeated waits finish inner loop before rearming outer loop',async()=>{
 const g={nodes:[n('i','input',{flowVersion:2}),n('w','wait',{eventName:'message',repeat:true}),n('outer','logic',{condition:"input.text==='end'"}),n('inner','wait',{eventName:'message',repeat:true}),n('check','logic',{condition:"input.text==='back'"}),n('value','state',{increments:{count:1}}),n('returned','output',{responseText:'返回外层'}),n('end','output',{responseText:'结束{{state.count}}'})],edges:[e('i','w'),e('w','outer'),e('outer','end','true'),e('outer','inner','false'),e('inner','check'),e('check','returned','true'),e('returned','w'),e('check','value','false'),e('value','inner')]};
 const r=await executeScenario(g,{cases:[{name:'嵌套',steps:[{input:'start',status:'waiting'},{input:'enter',status:'waiting'},{input:'a',status:'waiting'},{input:'b',status:'waiting'},{input:'back',status:'waiting'},{input:'again',status:'waiting'},{input:'c',status:'waiting',assertions:[eq(['state','count'],3)]},{input:'back',status:'waiting'},{input:'end',status:'completed',assertions:[eq(['hmi','message'],'结束3')]}]}]});assert.equal(r.status,'passed',JSON.stringify(r));
});
test('real model adapter executes once per accepted round and failures retry without redoing committed state',async()=>{
 const g=graph();g.nodes.splice(5,0,n('model','llm',{providerId:'anthropic',model:'fixture',outputFormat:'text'}));g.nodes.find(x=>x.id==='show')!.data.responseText='{{input.text}}';g.edges=g.edges.filter(x=>x.source!=='count');g.edges.push(e('count','model'),e('model','show'));
 let calls=0;const received:string[]=[];
 const r=await executeScenario(g,{cases:[{name:'失败重试',steps:[{input:'start',status:'waiting'},{input:'A',event_id:'a',status:'waiting'},{input:'B',event_id:'b',status:'failed',assertions:[eq(['state','count'],2)]},{input:'B',event_id:'b',status:'failed',assertions:[eq(['run','finalOutput','duplicate'],true)]},{input:{$event:{control:'retry'}},status:'waiting',assertions:[eq(['state','count'],2),{path:['hmi','message'],op:'contains',value:'reply:B'}]},{input:'完成',status:'completed'}]}]},{inference:async body=>{calls++;received.push(body.messages.at(-1).content);if(calls===2)throw Error('fixture temporary failure');return {choices:[{finish_reason:'stop',message:{content:'reply:'+body.messages.at(-1).content}}]};}});
 assert.equal(r.status,'passed',JSON.stringify(r));assert.deepEqual(received,['A','B','B']);
});


test('automatic UI rehearsal declines inventing loop answers; explicit plans still execute',async()=>{
 const {rehearseScenario}=await import('../src/domain/scenarioRehearsal');
 const r=await rehearseScenario(graph());assert.equal(r.status,'not_supported');assert.equal(r.inputs,0);assert.match(r.issue!,/执行计划/);
});
test('looped HMI actions preserve initial snapshot and restore once on configured exit',async()=>{
 const g=graph();g.nodes.splice(5,1,n('light','car_control',{executionMode:'hmi_mock',action:'ambient_light.set',color:'#abcdef',brightness:40}));g.nodes.push(n('restore','car_control',{executionMode:'hmi_mock',action:'ambient_light.restore'}));g.edges=g.edges.filter(x=>x.source!=='show'&&x.target!=='show'&&x.target!=='end');g.edges.push(e('count','light'),e('light','w'),e('check','restore','true'),e('restore','end'));
 const r=await executeScenario(g,{cases:[{name:'循环动作',controls:[{control:'lights.color',value:'#123456'},{control:'lights.brightness',value:19}],steps:[{input:'start',status:'waiting'},{input:'a',event_id:'a',status:'waiting',assertions:[eq(['actions','length'],1)]},{input:'a',event_id:'a',status:'waiting',assertions:[eq(['actions','length'],1)]},{input:'b',status:'waiting',assertions:[eq(['actions','length'],2)]},{input:'完成',status:'completed',assertions:[eq(['actions','length'],3),eq(['car','lights','ambientColor'],'#123456'),eq(['car','lights','brightness'],19),eq(['hmi','message'],'完成2')]}]}]});assert.equal(r.status,'passed',JSON.stringify(r));
});


test('unbound variables in untaken expressions fail preflight instead of hiding behind short circuit',async()=>{
 const {validateExpression}=await import('../src/domain/expression');
 for(const code of ['false && state.count === 0','input.missing != null && input.missing === state.lastEventId','input.items.some(x=>x.value===unknown)'])assert.throws(()=>validateExpression(code),/未知变量/);
 validateExpression('input.items.some(x=>x.value===input.target)');validateExpression('Object.values(input).every(x=>Number.isFinite(x))');
 const g=graph();g.nodes.find(n=>n.id==='check')!.data.condition='false && state.count===0';
 const r=await executeScenario(g,{cases:[{name:'未知状态根',steps:[{input:'start',status:'failed'}]}]});
 assert.equal(r.status,'passed');assert.equal(r.model_calls,0);assert.deepEqual(r.cases[0].steps[0].evidence.state,{});
});

test('explicit restart clears loop counters and state; cancelled traversal never replays a committed action',async()=>{
 const g=graph();g.nodes.find(n=>n.id==='w')!.data.maxIterations=1;
 const r=await executeScenario(g,{cases:[{name:'重开',steps:[{input:'start',status:'waiting'},{input:'a',status:'waiting'},{input:{$event:{control:'restart'}},event_id:'restart',status:'waiting',assertions:[eq(['state','count'],0)]},{input:'b',status:'waiting',assertions:[eq(['state','count'],1)]}]}]});assert.equal(r.status,'passed',JSON.stringify(r));
 const {FlowSessions}=await import('../src/domain/flowSession');const sessions=new FlowSessions();let actions=0;const controller=new AbortController();
 const nodes=[n('i','input',{flowVersion:2}),n('w','wait',{eventName:'message',repeat:true}),n('a','output'),n('b','output')],edges=[e('i','w'),e('w','a'),e('a','b'),e('b','w')];
 const host={process:async(node:any,value:any)=>{if(node.id==='a'){actions++;controller.abort();}return {output:value};},started(){},completed(){},failed(){},message(){}};
 await sessions.run(nodes,edges,'start','s',host);await assert.rejects(sessions.run(nodes,edges,'value','v',host,controller.signal));
 assert.equal(actions,1);assert.equal((await sessions.run(nodes,edges,{$event:{control:'resume'}},'resume',host)).status,'waiting');assert.equal(actions,1);
});
