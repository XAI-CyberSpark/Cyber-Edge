import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ScenarioSessions, parseSessionEvent, validateInteractionPlan, type InteractionPlan} from '../src/domain/scenarioSession';
import {GraphEngine,type GraphCallbacks} from '../src/utils/GraphEngine';
import {validateGraph} from '../src/domain/nodeCapabilities';
import {parseModelObject,validateModelFields} from '../src/domain/modelOutput';
const plan:InteractionPlan={mode:'authored',premise:'乘客生日航海',ending:'生日快乐，旅程完成！',steps:[
 {id:'a',title:'启航谜题',waitFor:'answer',content:{message:'欢迎登船',question:'指示方向的工具叫什么？',answers:['指南针','罗盘'],hint:'有指针',reward:'星星线索'}},
 {id:'b',title:'观察小游戏',waitFor:'continue',content:{message:'坐好说出三种海洋动物。'}},
 {id:'c',title:'等待抵达',waitFor:'arrival',content:{message:'整理航海日志。'}}
]};
const ev=(text:string,id=text)=>parseSessionEvent(text,id);
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+target,source,target,sourceHandle});
const fixture=()=>{const messages:string[]=[];const callbacks:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){return {};},updateSimulatorState(category,key,value){if(category==='hmi' && key==='message') messages.push(value);}};return {messages,callbacks};};
test('birthday journey: wait, wrong answer, hint, reward once, pause/resume, next and arrival',async()=>{
 const sessions=new ScenarioSessions();
 let r=await sessions.handle('x',plan,ev('开始'));assert.equal(r.session.index,0);assert.equal(r.session.status,'waiting');assert.ok(!r.reply.includes('指南针'));assert.ok(!JSON.stringify(r).includes('answers'));
 r=await sessions.handle('x',plan,ev('不对'));assert.equal(r.session.index,0);assert.equal(r.session.rewards.length,0);
 r=await sessions.handle('x',plan,ev('提示'));assert.equal(r.reply,'有指针');
 r=await sessions.handle('x',plan,ev('罗盘'));assert.deepEqual(r.session.rewards,['星星线索']);
 r=await sessions.handle('x',plan,ev('罗盘','repeat-answer'));assert.equal(r.session.rewards.length,1);
 await sessions.handle('x',plan,ev('暂停'));
 r=await sessions.handle('x',plan,ev('下一站','while-paused'));assert.equal(r.session.status,'paused');assert.equal(r.session.index,0);
 r=await sessions.handle('x',plan,ev('继续'));assert.equal(r.session.status,'waiting');assert.equal(r.session.solved,true);
 r=await sessions.handle('x',plan,ev('下一站','stage2'));assert.equal(r.session.index,1);assert.equal(r.simulated,true);
 r=await sessions.handle('x',plan,ev('下一站','stage3'));assert.equal(r.session.index,2);
 r=await sessions.handle('x',plan,ev('下一站','no-arrival'));assert.equal(r.session.status,'waiting');
 r=await sessions.handle('x',plan,ev('到达了'));assert.equal(r.session.status,'completed');assert.equal(r.finished,true);assert.match(r.reply,/生日快乐/);
 r=await sessions.handle('x',plan,ev('下一站','after-end'));assert.equal(r.finished,false);assert.equal(r.session.index,2);
});
test('exact event replay does not advance, generate, or reward again',async()=>{
 const s=new ScenarioSessions();await s.handle('x',plan,ev('开始'));await s.handle('x',plan,ev('指南针'));const first=await s.handle('x',plan,ev('下一站','same'));
 const again=await s.handle('x',plan,ev('下一站','same'));assert.equal(again.duplicate,true);assert.equal(again.session.revision,first.session.revision);assert.equal(again.session.index,1);
});
test('answer normalization is bounded: no keyword substring success',async()=>{
 const s=new ScenarioSessions();await s.handle('x',plan,ev('开始'));let r=await s.handle('x',plan,ev('不是指南针'));assert.equal(r.session.solved,false);
 r=await s.handle('x',plan,ev(' 指南针！ '));assert.equal(r.session.solved,true);
});
test('skip and early arrival are explicit; exit cannot accidentally restart',async()=>{
 const s=new ScenarioSessions();await s.handle('x',plan,ev('开始'));let r=await s.handle('x',plan,ev('跳过'));assert.equal(r.session.index,1);assert.equal(r.session.rewards.length,0);
 r=await s.handle('x',plan,ev('到达了'));assert.equal(r.session.status,'completed');
 await s.handle('x',plan,ev('重新开始'));r=await s.handle('x',plan,ev('退出'));assert.equal(r.session.status,'stopped');r=await s.handle('x',plan,ev('继续'));assert.equal(r.session.status,'stopped');
});
test('session isolation and changed definitions require explicit restart',async()=>{
 const s=new ScenarioSessions();await s.handle('a',plan,ev('开始'));await s.handle('a',plan,ev('指南针'));await s.handle('b',plan,ev('开始'));assert.equal(s.snapshot('b')!.solved,false);
 await assert.rejects(()=>s.handle('a',{...plan,ending:'new'},ev('下一站')),/重新开始/);assert.equal(s.snapshot('a')!.solved,true);
 const r=await s.handle('a',{...plan,ending:'new'},ev('重新开始'));assert.equal(r.session.solved,false);
});
test('live chapter failure and invalid model content never consume event or progress; same event retries',async()=>{
 const live={...plan,mode:'live',model:'test',steps:plan.steps.map(s=>({...s,brief:s.title}))} as InteractionPlan;
 const s=new ScenarioSessions();const generate=async(_p:any,step:any)=>plan.steps.find(x=>x.id===step.id)!.content!;
 await s.handle('x',live,ev('开始'),generate);await s.handle('x',live,ev('指南针'),generate);
 const before=s.snapshot('x');await assert.rejects(()=>s.handle('x',live,ev('下一站','next'),async()=>{throw Error('offline');}),/offline/);assert.deepEqual(s.snapshot('x'),before);
 await assert.rejects(()=>s.handle('x',live,ev('下一站','next'),async()=>({message:'ok',actions:[]} as any)),/格式无效/);assert.deepEqual(s.snapshot('x'),before);
 const r=await s.handle('x',live,ev('下一站','next'),generate);assert.equal(r.session.index,1);assert.equal(r.session.source,'live-model');
});
test('cancellation after model response and concurrent events cannot corrupt state',async()=>{
 const live={...plan,mode:'live',model:'test',steps:[{...plan.steps[0],brief:'test'}]} as InteractionPlan;
 const s=new ScenarioSessions(), controller=new AbortController();let resolve!:(value:any)=>void;
 const pending=s.handle('x',live,ev('开始'),()=>new Promise(r=>{resolve=r;}),controller.signal);
 await assert.rejects(()=>s.handle('x',live,ev('开始','other')),/正在处理/);
 controller.abort();resolve(plan.steps[0].content);await assert.rejects(()=>pending);assert.equal(s.snapshot('x'),undefined);
});
test('non-birthday experience reuses same state machine without a scene-specific node',async()=>{
 const quiz={...plan,premise:'停车后乘客科普问答',steps:[{id:'q',title:'科普',waitFor:'answer',content:{message:'海洋课堂',question:'海豚用什么呼吸？',answers:['肺'],hint:'不是鳃'}}]} as InteractionPlan;
 const s=new ScenarioSessions();await s.handle('q',quiz,ev('开始'));let r=await s.handle('q',quiz,ev('肺'));assert.equal(r.session.solved,true);r=await s.handle('q',quiz,ev('下一站'));assert.equal(r.session.status,'completed');
});
test('invalid plan contracts reject empty/duplicate stages, missing answers, unsupported events',()=>{
 for(const broken of [{...plan,steps:[]},{...plan,steps:[plan.steps[0],plan.steps[0]]},{...plan,steps:[{...plan.steps[0],content:{message:'x',question:'q'}}]},{...plan,steps:[{...plan.steps[0],waitFor:'gps'}]},{...plan,mode:'live',model:''}]) assert.ok(validateInteractionPlan(broken).length);
 assert.deepEqual(validateInteractionPlan(plan),[]);
});
test('JSON field contract preserves declared values under data and blocks wrong types',()=>{
 assert.deepEqual(validateModelFields(parseModelObject('{"nav_needed":true,"actions":["unsafe"]}'),{nav_needed:'boolean'}),{nav_needed:true});
 assert.throws(()=>validateModelFields({nav_needed:'true'},{nav_needed:'boolean'}),/boolean/);
});
test('engine preserves sessions across instances, reports wait/pause, hides solutions, finishes once',async()=>{
 const f=fixture(),sessions=new ScenarioSessions();const nodes=[n('i','input'),n('s','interaction',{plan}),n('o','event_log')],edges=[e('i','s'),e('s','o')];
 const run=(text:string,id?:string)=>new GraphEngine(nodes,edges,f.callbacks,sessions).run(text,{eventId:id});
 let r=await run('开始');assert.equal(r.status,'waiting');assert.ok(!r.events.some(x=>x.nodeId==='o'));assert.ok(!JSON.stringify(r.events).includes('指南针'));
 r=await run('暂停');assert.equal(r.status,'paused');await run('继续');
 r=await run('到达了','arrive');assert.equal(r.status,'completed');assert.equal(r.events.filter(x=>x.nodeId==='o'&&x.type==='node_started').length,1);
 r=await run('到达了','arrive');assert.ok(!r.events.some(x=>x.nodeId==='o'));r=await run('你好');assert.ok(!r.events.some(x=>x.nodeId==='o'));
});
test('failure handle runs only on failure; original failure remains visible',async t=>{
 const nodes=[n('i','input'),n('m','llm',{model:'test',outputFormat:'text'}),n('f','fallback',{responseText:'暂时不可用，请重试'})];const edges=[e('i','m'),e('m','f','error')];
 t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{message:{content:'hello'},finish_reason:'stop'}]}));let f=fixture();let r=await new GraphEngine(nodes,edges,f.callbacks).run('hi');assert.equal(r.status,'completed');assert.ok(!r.events.some(x=>x.nodeId==='f'));t.mock.restoreAll();
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:503}));f=fixture();r=await new GraphEngine(nodes,edges,f.callbacks).run('hi');assert.equal(r.status,'failed');assert.ok(r.events.some(x=>x.nodeId==='f'&&x.type==='node_completed'));assert.match((r.finalOutput as any).reply,/重试/);
});
test('JSON model runs against explicit fields and branches on input.data, wrong types stop branch',async t=>{
 const nodes=[n('i','input'),n('m','llm',{model:'test',outputFormat:'json',outputFields:{nav_needed:'boolean'}}),n('g','logic',{condition:'input.data.nav_needed === true'}),n('f','fallback',{responseText:'数据匹配'})];const edges=[e('i','m'),e('m','g'),e('g','f','true')];
 for(const value of [true,'true']) {
 t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify({nav_needed:value})},finish_reason:'stop'}]}));const f=fixture(),r=await new GraphEngine(nodes,edges,f.callbacks).run('test');assert.equal(r.status,value===true?'completed':'failed');assert.equal(r.events.some(x=>x.nodeId==='f'&&x.type==='node_started'),value===true);t.mock.restoreAll();
 }
});
test('contracts block ambiguous failure routing and data-to-action shortcuts',()=>{
 const nodes=[n('i','input'),n('m','llm',{model:'test',outputFormat:'json',outputFields:{needed:'boolean'}}),n('f','fallback',{responseText:'failed'}),n('t','tool',{tool:'nav'})];const issues=validateGraph(nodes,[e('i','m'),e('m','f'),e('m','t')]);assert.ok(issues.some(x=>x.message.includes('error')));assert.ok(issues.some(x=>x.message.includes('动作输出契约')));
});
test('arrival unlocks the authored birthday chapter, including an early arrival; does not skip surprise',async()=>{
 const extended={...plan,steps:[...plan.steps,{id:'birthday',title:'生日惊喜',waitFor:'continue',content:{message:'漂流瓶里装着生日贺卡'}}]} as InteractionPlan;
 const s=new ScenarioSessions();await s.handle('x',extended,ev('开始'));let r=await s.handle('x',extended,ev('到达啦'));assert.equal(r.session.index,3);assert.equal(r.session.status,'waiting');assert.match(r.reply,/生日贺卡/);
 r=await s.handle('x',extended,ev('再见'));assert.equal(r.session.status,'completed');assert.match(r.reply,/生日快乐/);
});
test('runtime requests one bounded format repair, then either commits a valid chapter or preserves state',async t=>{
 const live={...plan,mode:'live',model:'test',steps:[{...plan.steps[0],brief:'test'}]} as InteractionPlan;
 for(const validSecond of [true,false]) {
   let calls=0;const f=fixture(),sessions=new ScenarioSessions();
   t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({model:'test',choices:[{finish_reason:'stop',message:{content:validSecond&&calls===2?JSON.stringify(plan.steps[0].content):'{invalid'}}]});});
   const result=await new GraphEngine([n('i','input'),n('s','interaction',{plan:live})],[e('i','s')],f.callbacks,sessions).run('开始');
   assert.equal(calls,2);assert.equal(result.status,validSecond?'waiting':'failed');assert.equal(!!sessions.snapshot('s'),validSecond);t.mock.restoreAll();
 }
});
test('a model cannot replace the configured correct answer; accepted aliases come from the plan',async()=>{
 const fixed={...plan,mode:'live',model:'test',steps:[{...plan.steps[0],brief:'方向题',acceptedAnswers:['东','东边']}]} as InteractionPlan;
 const s=new ScenarioSessions();await assert.rejects(()=>s.handle('x',fixed,ev('开始'),async()=>({message:'海图',question:'星星指向哪边',answers:['西'],hint:'看图例'})),/改变了已配置/);assert.equal(s.snapshot('x'),undefined);
 await s.handle('x',fixed,ev('开始'),async()=>({message:'海图',question:'星星指向哪边',answers:['东'],hint:'看图例'}));const r=await s.handle('x',fixed,ev('东边'));assert.equal(r.session.solved,true);
});
test('later chapters receive actual prior narration; public output never exposes history or answers',async()=>{
 const live={...plan,mode:'live',model:'test',steps:plan.steps.map(s=>({...s,brief:s.title}))} as InteractionPlan;
 const s=new ScenarioSessions();let past:string[]|undefined;
 const generate=async(_p:any,step:any,_rewards:any,_signal:any,history?:string[])=>{past=history;return structuredClone(plan.steps.find(x=>x.id===step.id)!.content!);};
 await s.handle('x',live,ev('开始'),generate);await s.handle('x',live,ev('指南针'),generate);const result=await s.handle('x',live,ev('下一站'),generate);
 assert.match(past![0],/欢迎登船/);assert.ok(!('history' in result.session));assert.ok(!('answers' in result.session));
});
test('configured hidden answer cannot leak in opening, including a ship name',async()=>{
 const p={...plan,steps:[{...plan.steps[0],acceptedAnswers:['指南针','罗盘'],hideAnswerInOpening:true,content:{...plan.steps[0].content!,message:'欢迎登上指南针号'}}]};
 const s=new ScenarioSessions();await assert.rejects(()=>s.handle('x',p,ev('开始')),/开场提前/);assert.equal(s.snapshot('x'),undefined);
 const r=await s.handle('x',{...p,steps:[{...p.steps[0],content:{...p.steps[0].content,message:'欢迎登上星光号'}}]},ev('开始'));assert.ok(!r.reply.includes('指南针'));
});
test('narrative chapters use a plain-text contract: punctuation cannot break JSON, no actions execute',async t=>{
 const p={...plan,mode:'live',model:'test',steps:[{id:'birthday',title:'生日',brief:'生日贺卡',waitFor:'continue'}]} as InteractionPlan;let request:any;
 t.mock.method(globalThis,'fetch',async(_url,init)=>{request=JSON.parse(String(init?.body));return Response.json({model:'test',choices:[{finish_reason:'stop',message:{content:'瓶中写着：“朵朵，生日快乐！”'}}]});});
 const f=fixture();const result=await new GraphEngine([n('i','input'),n('s','interaction',{plan:p})],[e('i','s')],f.callbacks).run('开始');
 assert.equal(result.status,'waiting');assert.equal(request.json_mode,false);assert.match((result.finalOutput as any).reply,/生日快乐/);
});
test('configured question and answers remain authoritative when the model invents a different question',async()=>{
 const p={...plan,mode:'live',model:'test',steps:[{...plan.steps[0],brief:'海图',acceptedAnswers:['东'],fixedQuestion:'图例：星星代表东边。宝藏标记为星星，宝藏在哪里？'}]} as InteractionPlan;
 const s=new ScenarioSessions();const r=await s.handle('x',p,ev('开始'),async()=>({message:'一起打开海图。',question:'月亮在哪边？',answers:['东'],hint:'看图例',reward:'贝壳'}));assert.match(r.reply,/宝藏标记为星星/);assert.ok(!r.reply.includes('月亮'));assert.equal((await s.handle('x',p,ev('东'))).session.solved,true);
});
