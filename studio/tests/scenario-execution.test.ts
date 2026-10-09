import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateExpression,validateExpression} from '../src/domain/expression';
import {executeScenario,assertionPass} from '../src/domain/scenarioExecution';
const node=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const edge=(source:string,target:string,sourceHandle?:string)=>({id:source+target+(sourceHandle||''),source,target,sourceHandle});
const equal=(path:string[],value:any)=>({path,op:'equals' as const,value});

test('bounded string splitting supports format checks without regular expressions or truncating success',()=>{
 assert.equal(evaluateExpression('input.split("。").filter(s => s.trim().length > 0).length === 2','测试资料第一句。第二句。'),true);
 assert.equal(evaluateExpression('input.split("。").filter(s => s.trim().length > 0).length === 2','只有一句。'),false);
 assert.equal(evaluateExpression('input.split("").length === 3','abc'),true);
 for(const code of ['input.split(/。/).length === 2','input.split("。", 2).length === 2']) assert.throws(()=>evaluateExpression(code,'a。b。'));
 assert.throws(()=>evaluateExpression('input.split("").length > 0','a'.repeat(1001)),/预算/);
 assert.throws(()=>evaluateExpression('input.split("。").length > 0','a'.repeat(100001)),/100000/);
});

test('result predicates catch keyword-only false positives and compare actual outputs',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{providerId:'openai',model:'gpt-test',outputFormat:'text'}),node('o','output')],edges:[edge('i','m'),edge('m','o')]};
 const plan={cases:[{name:'两句而非只出现关键词',steps:[{input:'讲解测试资料',status:'completed',assertions:[
  {path:['hmi','message'],op:'contains' as const,value:'bronze'},
  {path:['hmi','message'],op:'satisfies' as const,value:'input.split("。").filter(s => s.trim().length > 0).length === 2'},
  {path:['outputs'],op:'satisfies' as const,value:'input.o === input.m.text'},
 ]}]}]};
 for(const [message,status] of [['测试资料 bronze。','failed'],['测试资料 bronze。第二句讲解。','passed']]){
  const report=await executeScenario(project,plan,{inference:async()=>({choices:[{finish_reason:'stop',message:{content:message}}]})});
  assert.equal(report.status,status,JSON.stringify(report));assert.equal(report.model_calls,1);
 }
});

test('all predicate syntax is checked before any case executes a model or tool',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{providerId:'openai',model:'gpt-test',outputFormat:'text'})],edges:[edge('i','m')]};
 let calls=0;
 for(const value of ['process.exit()','input.constructor.constructor("return process")()','input.text = "changed"','true || fetch("https://invalid")']){
  const report=await executeScenario(project,{cases:[{name:'first',steps:[{input:'start',assertions:[equal(['nodes','m'],'success')]}]},{name:'bad later case',steps:[{input:'next',assertions:[{path:['hmi'],op:'satisfies',value}]}]}]},{inference:async()=>{calls++;return {};}});
  assert.equal(report.status,'failed');assert.equal(report.model_calls,0);assert.equal(report.tool_calls,0);
 }
 assert.equal(calls,0);
});

test('predicate missing data and nonboolean results retain evidence as failed assertions',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('o','output',{responseText:'实际显示'})],edges:[edge('i','o')]};
 const report=await executeScenario(project,{cases:[{name:'invalid values',steps:[{input:'start',assertions:[{path:['state','missing'],op:'satisfies',value:'input.text === "x"'},{path:['hmi','message'],op:'satisfies',value:'input.length'}]}]}]});
 assert.equal(report.status,'failed');const step=report.cases[0].steps[0];assert.equal(step.evidence.hmi.message,'实际显示');
 assert.equal(step.assertions[0].actual_missing,true);assert.match(step.assertions[0].error!,/缺失/);assert.match(step.assertions[1].error!,/true或false/);
});

test('data expressions preserve real branch operations and short circuit',()=>{
 assert.equal(evaluateExpression("input.weather === 'rain' && Object.values(input.windows).some(value => Number(value) > 0)",{weather:'rain',windows:{fl:0,fr:10}}),true);
 assert.equal(evaluateExpression('return input.data.confidence >= 0.8 && input.data.selfie;', {data:{confidence:.9,selfie:true}}),true);
 assert.equal(evaluateExpression('input.missing == null || input.missing.value > 3',{}),true);
 assert.equal(evaluateExpression("['warm','cold'].includes(input.preference.trim().toLowerCase())",{preference:' WARM '}),true);
 assert.equal(evaluateExpression('input.items.filter(x => x > 0).length === 2',{items:[-1,2,3]}),true);
 assert.equal(evaluateExpression("input.missing?.includes('a') === undefined",{}),true);
 assert.throws(()=>evaluateExpression('42',{}),/true/);
});
test('code, global access, mutation and constructor escapes cannot execute',()=>{
 for(const code of ['process.exit()','fetch("https://example.invalid")','input.constructor.constructor("return process")()','input.x = 3','(()=> { while(true){} })()','new Date()','input.__proto__','input["prototype"]','input.x; process.exit()']) assert.throws(()=>validateExpression(code),code);
 assert.throws(()=>evaluateExpression('globalThis === input',{}),/未知变量/);
 assert.throws(()=>evaluateExpression('input[input.key] === 1',{key:'constructor'}),/原型/);
 assert.throws(()=>evaluateExpression('input.items.every(x => true)',{items:Array(1001).fill(1)}),/有限/);
});
test('assertions compare objects independent of key order and missing differs from null',()=>{
 assert.ok(assertionPass(equal(['x'],{a:1,b:2}),{b:2,a:1}));
 assert.equal(assertionPass({path:['x'],op:'not_exists'},undefined),true);
 assert.equal(assertionPass({path:['x'],op:'not_exists'},null),false);
 assert.equal(assertionPass(equal(['x'],null),undefined),false);
 assert.equal(assertionPass({path:['x'],op:'contains',value:'b'},['a','b']),true);
});
test('one executor handles different event/state configurations and repeat events without repeated actions',async()=>{
 for(const [name,eventName,color] of [['离车提醒','departure','#abcdef'],['展览导览','next_room','#112233']]){
  const project={nodes:[node('i','input',{flowVersion:2}),node('w','wait',{eventName,storeAs:'answer'}),node('s','state',{increments:{count:1}}),node('a','car_control',{executionMode:'hmi_mock',action:'ambient_light.set',color,brightness:60}),node('o','output',{responseText:'已收到{{state.answer}}'})],edges:[edge('i','w'),edge('w','s'),edge('s','a'),edge('a','o')]};
  const event={$event:{name:eventName,text:'确认'}};
  const report=await executeScenario(project,{cases:[{name,steps:[{input:'start',status:'waiting'},{input:event,event_id:'answer',status:'completed',assertions:[equal(['state','count'],1),equal(['car','lights','ambientColor'],color)]},{input:event,event_id:'answer',status:'completed',assertions:[equal(['actions','length'],1)]}]}]});
  assert.equal(report.status,'passed',JSON.stringify(report));
 }
});
test('real branch execution has independent cases and records actual HMI feedback',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2,inputFormat:'json',outputFields:{hot:'boolean'}}),node('b','logic',{condition:'input.data.hot === true'}),node('a','car_control',{executionMode:'hmi',action:'hmi.control',controlId:'ac.temp',controlValue:20}),node('o','output',{responseText:'无需调整'})],edges:[edge('i','b'),edge('b','a','true'),edge('b','o','false')]};
 const report=await executeScenario(project,{cases:[{name:'高温',steps:[{input:'{"hot":true}',status:'completed',assertions:[equal(['car','ac','temp'],20),equal(['actions','length'],1)]}]},{name:'正常',steps:[{input:'{"hot":false}',status:'completed',assertions:[equal(['car','ac','temp'],22),equal(['actions','length'],0)]}]}]});
 assert.equal(report.status,'passed',JSON.stringify(report));
});
test('model transport is explicit, actual JSON feeds action, invalid JSON cannot act',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{providerId:'openai',model:'gpt-test',outputFormat:'json',outputFields:{temperature:'number'}}),node('a','car_control',{executionMode:'hmi',action:'hmi.control',controlId:'ac.temp',valueField:'temperature'})],edges:[edge('i','m'),edge('m','a')]};
 const plan={cases:[{name:'模型温度',steps:[{input:'凉快一点',status:'completed',assertions:[equal(['car','ac','temp'],21)]}]}]};
 let calls=0;
 const good=await executeScenario(project,plan,{inference:async body=>{calls++;assert.equal(body.provider_id,'openai');return {choices:[{finish_reason:'stop',message:{content:'{"temperature":21}'}}]};}});
 assert.equal(good.status,'passed',JSON.stringify(good));assert.equal(calls,1);
 const bad=await executeScenario(project,plan,{inference:async()=>({choices:[{finish_reason:'stop',message:{content:'not JSON'}}]})});
 assert.equal(bad.status,'failed');assert.equal(bad.cases[0].steps[0].evidence.actions.length,0);
 const missing=await executeScenario(project,plan);assert.equal(missing.status,'failed');
});
test('failed assertions cannot be reported as success',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('o','output',{responseText:'hello'})],edges:[edge('i','o')]};
 const result=await executeScenario(project,{cases:[{name:'错误期望',steps:[{input:'start',status:'completed',assertions:[equal(['hmi','message'],'incorrect')]}]}]});
 assert.equal(result.status,'failed');assert.equal(result.cases[0].steps[0].assertions[0].actual,'hello');
});
test('a model after wait receives the latest user answer and its text reaches HMI',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('w','wait',{eventName:'message'}),node('m','llm',{providerId:'openai',model:'gpt-test',outputFormat:'text',systemPrompt:'把心情改写为旅行比喻'}),node('o','output')],edges:[edge('i','w'),edge('w','m'),edge('m','o')]};
 const report=await executeScenario(project,{cases:[{name:'动态回应',steps:[{input:'启动',status:'waiting',assertions:[equal(['nodes','w'],'waiting')]},{input:'今天有些紧张',status:'completed',assertions:[equal(['hmi','message'],'慢慢放松，如驶入平静港湾。')]}]}]},{inference:async body=>{
  assert.equal(body.messages.at(-1).content,'今天有些紧张');
  assert.ok(body.messages[0].content.includes('把心情改写为旅行比喻'));
  return {choices:[{finish_reason:'stop',message:{content:'慢慢放松，如驶入平静港湾。'}}]};
 }});
 assert.equal(report.status,'passed',JSON.stringify(report));
});

test('unsupported model prompt fields are blocked before a cloud call',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{model:'gpt-test',providerId:'openai',prompt:'this would be ignored',outputFormat:'text'})],edges:[edge('i','m')]};
 let calls=0;
 const report=await executeScenario(project,{cases:[{name:'错误模型字段',steps:[{input:'test',status:'failed'}]}]},{inference:async()=>{calls++;return {};}});
 assert.equal(calls,0);assert.equal(report.cases[0].steps[0].status,'failed');
});

test('answer and hint command conflicts fail before waiting forever',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('w','wait',{eventName:'message',match:'exact',answers:['完成'],hintInputs:['完成！']})],edges:[edge('i','w')]};
 const r=await executeScenario(project,{cases:[{name:'提示冲突',steps:[{input:'start',status:'failed'}]}]});
 assert.equal(r.cases[0].steps[0].status,'failed');
});

test('one turn retains visible result before its next prompt, without replay on duplicate events',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('a','output',{responseText:'第一项已完成'}),node('w','wait',{eventName:'message',prompt:'请输入确认'}),node('b','output',{responseText:'第二项已完成'}),node('w2','wait',{eventName:'message',prompt:'现在等待结束'})],edges:[edge('i','a'),edge('a','w'),edge('w','b'),edge('b','w2')]};
 const r=await executeScenario(project,{cases:[{name:'逐轮可见消息',steps:[
  {input:'启动',event_id:'start',status:'waiting',assertions:[equal(['hmi','message'],'第一项已完成\n\n请输入确认'),equal(['run','finalOutput','reply'],'第一项已完成\n\n请输入确认')]},
  {input:'确认',event_id:'answer',status:'waiting',assertions:[equal(['hmi','message'],'第二项已完成\n\n现在等待结束')]},
  {input:'确认',event_id:'answer',status:'waiting',assertions:[equal(['run','finalOutput','reply'],'第二项已完成\n\n现在等待结束'),equal(['run','finalOutput','duplicate'],true),equal(['run','finalOutput','messages','length'],0)]},
 ]}]});
 assert.equal(r.status,'passed',JSON.stringify(r));
});

test('image waits ignore text and pass this turn image unchanged to the real model transport',async()=>{
 const url='data:image/png;base64,iVBORw0KGgo=',image={type:'image',content:url,text:'读取这一张'};
 const project={nodes:[node('i','input',{flowVersion:2}),node('w','wait',{eventName:'message',inputType:'image',prompt:'请上传图片'}),node('m','llm',{providerId:'anthropic',model:'test',outputFormat:'text'}),node('o','output')],edges:[edge('i','w'),edge('w','m'),edge('m','o')]};
 let calls=0;
 const report=await executeScenario(project,{cases:[{name:'本次图片',steps:[{input:'start',status:'waiting'},{input:'还未上传',status:'waiting',assertions:[equal(['nodes','w'],'waiting')]},{input:{type:'image',content:''},status:'waiting'},{input:image,status:'completed',assertions:[equal(['hmi','message'],'读取成功')]}]}]},{inference:async body=>{
  calls++;const content=body.messages.at(-1).content;assert.deepEqual(content,[{type:'text',text:image.text},{type:'image_url',image_url:{url}}]);
  return {choices:[{finish_reason:'stop',message:{content:'读取成功'}}]};
 }});
 assert.equal(report.status,'passed',JSON.stringify(report));assert.equal(calls,1);
});
test('a later text response clears stale image while structured image events retain current bytes',async()=>{
 const first={type:'image',content:'data:image/png;base64,OLD',text:'old'};
 const second={type:'image',content:'data:image/png;base64,NEW',text:'new'};
 const project={nodes:[node('i','input',{flowVersion:2}),node('w','wait',{eventName:'message'}),node('w2','wait',{eventName:'message',inputType:'text'}),node('m','llm',{providerId:'openai',model:'test',outputFormat:'text'}),node('o','output')],edges:[edge('i','w'),edge('w','w2'),edge('w2','m'),edge('m','o')]};
 const report=await executeScenario(project,{cases:[{name:'换图再答文字',steps:[{input:first,status:'waiting'},{input:{$event:{name:'message',value:second}},status:'waiting',assertions:[equal(['outputs','w','content'],second.content),equal(['outputs','w','text'],'new')]},{input:second,status:'waiting'},{input:'只讨论这句话',status:'completed',assertions:[{path:['outputs','w2','content'],op:'not_exists'},equal(['hmi','message'],'文字回复')]}]}]},{inference:async body=>{
  assert.equal(body.messages.at(-1).content,'只讨论这句话');return {choices:[{finish_reason:'stop',message:{content:'文字回复'}}]};
 }});
 assert.equal(report.status,'passed',JSON.stringify(report));
});


test('direct empty images cannot silently become text-only inference; HTTPS image references stay images',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{providerId:'anthropic',model:'test',outputFormat:'text'}),node('o','output')],edges:[edge('i','m'),edge('m','o')]};
 let calls=0;
 const bad=await executeScenario(project,{cases:[{name:'缺失图片',steps:[{input:{type:'image',content:''},status:'failed'}]}]},{inference:async()=>{calls++;return {};}});
 assert.equal(bad.cases[0].steps[0].status,'failed');assert.equal(calls,0);
 const url='https://images.example.test/sample.png';
 const good=await executeScenario(project,{cases:[{name:'HTTPS图片',steps:[{input:{type:'image',content:url},status:'completed',assertions:[equal(['hmi','message'],'图片回复')]}]}]},{inference:async body=>{
  assert.equal(body.messages.at(-1).content[1].image_url.url,url);
  return {choices:[{finish_reason:'stop',message:{content:'图片回复'}}]};
 }});
 assert.equal(good.status,'passed',JSON.stringify(good));
});


test('typed references reach ambient actions across a presentation node; upstream field names are not configuration',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('m','llm',{providerId:'anthropic',model:'test',outputFormat:'json',outputFields:{color_hex:'string',intensity:'number'}}),node('o','output',{responseText:'观察完成'}),node('a','car_control',{executionMode:'hmi_mock',action:'ambient_light.set',color:{$ref:'outputs.m.data.color_hex'},brightness:{$ref:'outputs.m.data.intensity'}})],edges:[edge('i','m'),edge('m','o'),edge('o','a')]};
 let calls=0;
 const inference=async()=>{calls++;return {choices:[{finish_reason:'stop',message:{content:'{"color_hex":"#123456","intensity":37}'}}]};};
 const plan={cases:[{name:'跨展示保留引用',steps:[{input:'start',status:'completed' as const,assertions:[equal(['car','lights','ambientColor'],'#123456'),equal(['car','lights','brightness'],37)]}]}]};
 const result=await executeScenario(project,plan,{inference});assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(calls,1);
 project.nodes[3].data={executionMode:'hmi_mock',action:'ambient_light.set',light_color:'#123456',light_brightness:37};
 const bad=await executeScenario(project,plan,{inference});assert.equal(bad.status,'failed');assert.equal(calls,1);assert.equal(bad.cases[0].steps[0].evidence.actions.length,0);
});


test('action-only resumed turns display their actual receipt and duplicates do not replay it',async()=>{
 const project={nodes:[node('i','input',{flowVersion:2}),node('a','car_control',{executionMode:'hmi_mock',action:'ambient_light.set',color:'#abcdef',brightness:40}),node('w','wait',{eventName:'message',prompt:'输入结束'}),node('r','car_control',{executionMode:'hmi_mock',action:'ambient_light.restore'})],edges:[edge('i','a'),edge('a','w'),edge('w','r')]};
 const result=await executeScenario(project,{cases:[{name:'实际回执',controls:[{control:'lights.color',value:'#654321'},{control:'lights.brightness',value:17}],steps:[
  {input:'start',status:'waiting'},
  {input:'结束',event_id:'end',status:'completed',assertions:[equal(['car','lights','ambientColor'],'#654321'),equal(['car','lights','brightness'],17),equal(['hmi','message'],'已恢复原来的氛围灯。'),equal(['run','finalOutput','reply'],'已恢复原来的氛围灯。'),equal(['actions','length'],2)]},
  {input:'结束',event_id:'end',status:'completed',assertions:[equal(['actions','length'],2),equal(['run','finalOutput','messages','length'],0),equal(['messages','length'],2)]}
 ]}]});
 assert.equal(result.status,'passed',JSON.stringify(result));
});
