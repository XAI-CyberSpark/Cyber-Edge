import test from 'node:test';
import assert from 'node:assert/strict';
import {executeScenario} from '../src/domain/scenarioExecution';
import {GraphEngine,type GraphCallbacks} from '../src/utils/GraphEngine';
import {ScenarioSessions} from '../src/domain/scenarioSession';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+'-'+target,source,target,sourceHandle});
const eq=(path:string[],value:any)=>({path,op:'equals' as const,value});
function route(data:any={}){return {nodes:[n('i','input',{flowVersion:2,eventName:'message',...data}),n('check','logic',{condition:'input.text === "开始"'}),n('yes','output',{responseText:'已识别'}),n('no','output',{responseText:'不匹配'})],edges:[e('i','check'),e('check','yes','true'),e('check','no','false')]};}
test('message event input is a string for the production logic adapter',async()=>{
 const report=await executeScenario(route(),{cases:[{name:'ordinary message',steps:[{input:'开始',status:'completed',assertions:[eq(['outputs','i','text'],'开始'),eq(['outputs','i','event'],{name:'message',text:'开始',value:'开始'}),eq(['hmi','message'],'已识别')]}]}]});
 assert.equal(report.status,'passed',JSON.stringify(report));
});
test('named object events expose explicit text while preserving original structured value',async()=>{
 const value={text:'value text',count:7,event:{name:'business'},privateNested:{x:1}};
 const p=route({eventName:'custom'});p.nodes[1].data.condition='input.text === "开始"';
 const report=await executeScenario(p,{cases:[{name:'structured',steps:[{input:{$event:{name:'custom',text:'开始',value}},status:'completed',assertions:[eq(['outputs','i','text'],'开始'),eq(['outputs','i','event','value'],value),eq(['outputs','i','event','name'],'custom')]}]}]});
 assert.equal(report.status,'passed',JSON.stringify(report));
});
test('JSON event strings and objects retain declared types without metadata injection',async()=>{
 for(const value of [{count:7,text:'业务原文',event:{business:true},actions:['injected']},JSON.stringify({count:7,text:'业务原文',event:{business:true},actions:['injected']})]){
  const p={nodes:[n('i','input',{flowVersion:2,eventName:'sample',inputFormat:'json',outputFields:{count:'number',text:'string',event:'object'}}),n('o','output',{responseText:'{{input.data.text}}/{{input.data.count}}'})],edges:[e('i','o')]};
  const report=await executeScenario(p,{cases:[{name:'json payload',steps:[{input:{$event:{name:'sample',text:'路由文字',value}},status:'completed',assertions:[eq(['outputs','i','data'],{count:7,text:'业务原文',event:{business:true}}),eq(['outputs','i','event','value'],value),eq(['hmi','message'],'业务原文/7'),eq(['actions','length'],0)]}]}]});
  assert.equal(report.status,'passed',JSON.stringify(report));
 }
});
test('invalid JSON event fields fail before downstream HMI writes',async()=>{
 for(const value of [{target:'20'},'{bad json']){
  const p={nodes:[n('i','input',{flowVersion:2,eventName:'set',inputFormat:'json',outputFields:{target:'number'}}),n('a','car_control',{executionMode:'hmi',controlId:'ac.temp',valueField:'target'})],edges:[e('i','a')]};
  const report=await executeScenario(p,{cases:[{name:'invalid JSON',steps:[{input:{$event:{name:'set',value}},status:'failed',assertions:[eq(['actions','length'],0),eq(['car','ac','temp'],22),eq(['nodes','a'],'skipped')]}]}]});
  assert.equal(report.status,'passed',JSON.stringify(report));
 }
});
test('event image bytes survive the entry and reach the inference fixture unchanged',async()=>{
 const content='data:image/png;base64,c3ludGhldGlj';const value={type:'image',content,text:'图片文字'};let requests:any[]=[];
 const p={nodes:[n('i','input',{flowVersion:2,eventName:'photo'}),n('m','llm',{model:'fixture',outputFormat:'text'}),n('o','output')],edges:[e('i','m'),e('m','o')]};
 const report=await executeScenario(p,{cases:[{name:'image',steps:[{input:{$event:{name:'photo',value,text:'本次明确问题'}},status:'completed',assertions:[eq(['outputs','i','content'],content),eq(['outputs','i','text'],'本次明确问题'),eq(['outputs','i','event','value'],value)]}]}]},{inference:async body=>{requests.push(body);return {choices:[{message:{content:'本地图片夹具'}}]};}});
 assert.equal(report.status,'passed',JSON.stringify(report));assert.equal(requests.length,1);assert.ok(JSON.stringify(requests[0]).includes(content));assert.ok(JSON.stringify(requests[0]).includes('本次明确问题'));
});
test('empty image events fail before the model fixture or downstream actions',async()=>{
 const p={nodes:[n('i','input',{flowVersion:2,eventName:'photo'}),n('m','llm',{model:'fixture',outputFormat:'text'})],edges:[e('i','m')]};let calls=0;
 const report=await executeScenario(p,{cases:[{name:'empty image',steps:[{input:{$event:{name:'photo',value:{type:'image',content:'',text:'empty'}}},status:'failed',assertions:[eq(['nodes','m'],'skipped')]}]}]},{inference:async()=>{calls++;throw Error('must not run');}});
 assert.equal(report.status,'passed',JSON.stringify(report));assert.equal(calls,0);
});
test('named-event aliases and system weather input retain their routes and actual source',async()=>{
 const p=route({eventName:'custom',aliases:['开始']});let report=await executeScenario(p,{cases:[{name:'alias',steps:[{input:'开始',status:'completed',assertions:[eq(['outputs','i','text'],'开始'),eq(['outputs','i','event','name'],'message')]}]}]});assert.equal(report.status,'passed',JSON.stringify(report));
 const weather={nodes:[n('i','systemInput',{flowVersion:2,eventName:'weather',inputType:'weather'}),n('o','output',{responseText:'{{input.weather}}'})],edges:[e('i','o')]};
 report=await executeScenario(weather,{cases:[{name:'weather',weather:'rainy',steps:[{input:{$event:{name:'weather',value:{weather:'not actual'}}},status:'completed',assertions:[eq(['outputs','i','weather'],'rainy'),eq(['outputs','i','source'],'simulated-weather'),eq(['outputs','i','event','value'],{weather:'not actual'})]}]}]});assert.equal(report.status,'passed',JSON.stringify(report));
});
test('deduplicated entry and repeat waits do not replay initialization or stale event payload',async()=>{
 const p={nodes:[n('i','input',{flowVersion:2,eventName:'begin'}),n('s','state',{increments:{visits:1}}),n('w','wait',{eventName:'message',repeat:true,prompt:'继续'}),n('capture','state',{values:{receivedText:{$ref:'input.text'},receivedValue:{$ref:'input.event.value'}}}),n('o','output',{responseText:'{{input.text}}'})],edges:[e('i','s'),e('s','w'),e('w','capture'),e('capture','o'),e('o','w')]};
 const report=await executeScenario(p,{cases:[{name:'repeated',steps:[{input:{$event:{name:'begin',value:'启动'}},event_id:'first',status:'waiting',assertions:[eq(['state','visits'],1)]},{input:{$event:{name:'begin',value:'不应再处理'}},event_id:'first',status:'waiting',assertions:[eq(['state','visits'],1),eq(['outputs','i','text'],'启动')]},{input:'第二轮',status:'waiting',assertions:[eq(['state','visits'],1),eq(['state','receivedText'],'第二轮'),eq(['state','receivedValue'],'第二轮')]},{input:'第三轮',status:'waiting',assertions:[eq(['state','visits'],1),eq(['state','receivedText'],'第三轮'),eq(['state','receivedValue'],'第三轮')]}]}]});
 assert.equal(report.status,'passed',JSON.stringify(report));
});
test('ordinary input behavior and existing string screening are preserved',async()=>{
 const p=route();delete p.nodes[0].data.eventName;
 let report=await executeScenario(p,{cases:[{name:'ordinary',steps:[{input:'开始',status:'completed',assertions:[eq(['outputs','i','text'],'开始'),{path:['outputs','i','event'],op:'not_exists'}]}]}]});assert.equal(report.status,'passed',JSON.stringify(report));
 for(const eventName of [undefined,'message']){
  const p={nodes:[n('i','input',{flowVersion:2,...(eventName?{eventName}:{})}),n('o','output')],edges:[e('i','o')]};
  report=await executeScenario(p,{cases:[{name:'screen',steps:[{input:'hack',status:'failed',assertions:[eq(['nodes','o'],'skipped')]}]}]});assert.equal(report.status,'passed',JSON.stringify(report));
 }
});
test('a stable event-entry checkpoint restores typed output and duplicate event identity',async()=>{
 const nodes=[n('i','input',{flowVersion:2,eventName:'begin',inputFormat:'json',outputFields:{count:'number'}}),n('s','state',{values:{count:{$ref:'input.data.count'}}}),n('w','wait',{eventName:'message',prompt:'继续'}),n('o','output',{responseText:'{{state.count}}/{{input.text}}'})];
 const edges=[e('i','s'),e('s','w'),e('w','o')];const sessions=new ScenarioSessions();const messages:string[]=[];
 const callbacks:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({}),updateSimulatorState(category,key,value){if(category==='hmi'&&key==='message')messages.push(String(value));}};
 const first=await new GraphEngine(nodes,edges,callbacks,sessions).run({$event:{name:'begin',value:{count:9}}},{eventId:'event-one'});assert.equal(first.status,'waiting');
 const snapshot=JSON.parse(JSON.stringify(sessions.flow.snapshot()));const restored=new ScenarioSessions();restored.flow.restore(snapshot,nodes,edges);
 assert.equal(restored.flow.snapshot()?.outputs.i.data.count,9);assert.deepEqual(restored.flow.snapshot()?.outputs.i.event.value,{count:9});
 const duplicate=await new GraphEngine(nodes,edges,callbacks,restored).run({$event:{name:'begin',value:{count:99}}},{eventId:'event-one'});assert.equal(duplicate.status,'waiting');assert.equal(restored.flow.snapshot()?.state.count,9);
 const next=await new GraphEngine(nodes,edges,callbacks,restored).run('已确认',{eventId:'event-two'});assert.equal(next.status,'completed');assert.ok(messages.includes('9/已确认'));
});
