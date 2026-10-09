import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FlowSessions,bindFlowValue,type FlowHost} from '../src/domain/flowSession';
import {GraphEngine,type GraphCallbacks} from '../src/utils/GraphEngine';
import {ScenarioSessions} from '../src/domain/scenarioSession';
import {validateGraph} from '../src/domain/nodeCapabilities';
import {stageView} from '../src/domain/stageView';
import {VehicleWorld} from '../src/domain/vehicleWorld';
import {buildSelfieAmbientScenario,selfieSamples} from '../src/data/selfieAmbientScenario';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+':'+target+':'+(sourceHandle||''),source,target,sourceHandle});
const ctrl=(control:string)=>({$event:{control}});
function harness(nodes:any[],edges:any[],process?:FlowHost['process']){
 const s=new FlowSessions(),calls:string[]=[],messages:string[]=[];
 const host:FlowHost={process:process|| (async(n,v)=>({output:n.type==='output'?n.data.responseText:v})),started:n=>calls.push(n.id),completed(){},failed(){},message:t=>messages.push(t)};
 let sequence=0;return {s,calls,messages,run:(input:any,id?:string)=>s.run(nodes,edges,input,id||String(++sequence),host)};
}
function journey(title:string,eventName:string,answer:string){
 const nodes=[n('i','input',{flowVersion:2}),n('init','state',{values:{earned:0}}),n('q','wait',{label:title,eventName:'message',match:'exact',answers:[answer],prompt:'请回答',hintInputs:['帮帮我'],hint:'线索',retryMessage:'再想想'}),n('reward','state',{increments:{earned:1}}),n('action','output',{responseText:'阶段动作'}),n('dock','wait',{eventName,prompt:'等待配置事件'}),n('early','input',{eventName,aliases:['自定义入口'],interrupt:true}),n('end','output',{joinMode:'any',responseText:title+'：已完成{{state.earned}}项'})];
 const edges=[e('i','init'),e('init','q'),e('q','reward'),e('reward','action'),e('action','dock'),e('dock','end'),e('early','end')];return {nodes,edges};
}
for(const config of [['生日','docked','罗盘'],['博物馆导览','tour_exit','陶器']])test(config[0]+' reuses generic wait/state/event graph and restores without replay',async()=>{
 const g=journey(...config as [string,string,string]);assert.deepEqual(validateGraph(g.nodes,g.edges).filter(i=>i.severity==='error'),[]);
 const h=harness(g.nodes,g.edges);assert.equal((await h.run('开始')).status,'waiting');
 await h.run('错误');assert.equal(h.s.snapshot()?.state.earned,0);await h.run('帮帮我');assert.equal(h.messages.at(-1),'线索');
 await h.run(ctrl('pause'));await h.run(config[2]);assert.equal(h.s.snapshot()?.state.earned,0);
 await h.run(ctrl('resume'));assert.equal(h.s.snapshot()?.nodes.q,'waiting');
 await h.run(config[2],'answer');await h.run(config[2],'answer');assert.equal(h.s.snapshot()?.state.earned,1);assert.equal(h.calls.filter(x=>x==='init').length,1);assert.equal(h.calls.filter(x=>x==='action').length,1);
 const done=await h.run({$event:{name:config[1]}});assert.equal(done.status,'completed');assert.match(done.reply,/1项/);assert.equal(h.calls.filter(x=>x==='end').length,1);
});
test('early event skips unresolved stages and preserves actual earned state',async()=>{
 const g=journey('x','finish','yes'),h=harness(g.nodes,g.edges);await h.run('start');const r=await h.run('自定义入口');assert.equal(r.state.earned,0);assert.equal(r.status,'completed');assert.equal(h.calls.includes('action'),false);assert.match(r.reply,/0项/);
});
test('any wait only consumes user events; stop and duplicate restart cannot replay actions',async()=>{
 const nodes=[n('i','input',{flowVersion:2}),n('w','wait',{eventName:'message'}),n('o','output')],edges=[e('i','w'),e('w','o')],h=harness(nodes,edges);
 await h.run('start');await h.run(ctrl('pause'));await h.run(ctrl('resume'));assert.equal(h.s.snapshot()?.nodes.w,'waiting');assert.equal(h.calls.includes('o'),false);
 assert.equal((await h.run(ctrl('stop'))).status,'completed');await h.run('answer');assert.equal(h.calls.includes('o'),false);
 await h.run(ctrl('restart'),'reset');await h.run(ctrl('restart'),'reset');assert.equal(h.calls.filter(x=>x==='i').length,2);
});
test('diamond all and any joins execute once with declared input ports',async()=>{
 for(const joinMode of ['all','any']){
 const nodes=[n('i','input',{flowVersion:2}),n('a','state',{values:{a:1}}),n('b','state',{values:{b:1}}),n('j','output',{joinMode})],edges=[e('i','a'),e('i','b'),e('a','j'),e('b','j')];
 const h=harness(nodes,edges);await h.run('start');assert.equal(h.calls.filter(x=>x==='j').length,1);
 }
});
test('all join waits for a pending branch across messages; missing policy rejected',async()=>{
 const nodes=[n('i','input',{flowVersion:2}),n('a','wait',{eventName:'message'}),n('b','state'),n('j','output',{joinMode:'all'})],edges=[e('i','a'),e('i','b'),e('a','j'),e('b','j')];
 const h=harness(nodes,edges);await h.run('start');assert.equal(h.calls.includes('j'),false);await h.run('answer');assert.equal(h.calls.filter(x=>x==='j').length,1);
 nodes[3].data={};assert.ok(validateGraph(nodes,edges).some(i=>i.message.includes('汇合方式')));
});
test('retry resumes failed operation without replaying committed upstream; error path does not claim success',async()=>{
 const nodes=[n('i','input',{flowVersion:2}),n('before','output'),n('flaky','output'),n('after','output'),n('error','output')],edges=[e('i','before'),e('before','flaky'),e('flaky','after'),e('flaky','error','error')];let fail=true;
 const h=harness(nodes,edges,async(n,v)=>{if(n.id==='flaky'&&fail)throw Error('unavailable');return {output:v};});
 assert.equal((await h.run('start')).status,'failed');assert.equal(h.calls.includes('after'),false);assert.ok(h.calls.includes('error'));
 fail=false;assert.equal((await h.run(ctrl('retry'))).status,'completed');assert.equal(h.calls.filter(x=>x==='before').length,1);assert.equal(h.calls.filter(x=>x==='after').length,1);assert.equal(h.calls.filter(x=>x==='error').length,1);
});
test('state updates are atomic and invalid counters are not silently coerced',async()=>{
 const nodes=[n('i','input',{flowVersion:2}),n('s','state',{values:{x:1},increments:{bad:'abc'}})],h=harness(nodes,[e('i','s')]);assert.equal((await h.run('start')).status,'failed');assert.deepEqual(h.s.snapshot()?.state,{});
 assert.equal(bindFlowValue({$ref:'state.x'},{state:{x:4}}),4);assert.equal(bindFlowValue('{{state.x}}',{state:{x:4}}),'4');
});
test('collapse is only a projection; canonical children and real edge endpoints survive',()=>{
 const nodes=[n('group','stage',{collapsed:true}),{...n('inside','wait',{eventName:'message'}),parentId:'group'},n('out','output')],edges=[e('inside','out')];
 const r=stageView(nodes,edges,()=>{});assert.deepEqual(r.nodes.map(n=>n.id),['group','out']);assert.equal(r.edges[0].source,'group');assert.equal(edges[0].source,'inside');assert.equal(nodes.length,3);
 nodes[0].data.collapsed=false;assert.equal(stageView(nodes,edges,()=>{}).nodes.length,3);
});
test('real graph engine performs HMI stage action once between waits',async()=>{
 const world=new VehicleWorld(),sessions=new ScenarioSessions();let actions=0;
 const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({car:world.getSnapshot().car}),updateSimulatorState(){},executeAmbientLight:request=>{actions++;return world.setAmbientLight(request);}};
 const nodes=[n('i','input',{flowVersion:2}),n('w','wait',{eventName:'message'}),n('light','car_control',{executionMode:'hmi_mock',action:'ambient_light.set',color:'#ffe4bc',brightness:55}),n('next','wait',{eventName:'message'})],edges=[e('i','w'),e('w','light'),e('light','next')];
 const run=(text:any,id:string)=>new GraphEngine(nodes,edges,cb,sessions).run(text,{eventId:id});
 assert.equal((await run('start','s')).status,'waiting');assert.equal((await run('ok','a')).status,'waiting');assert.equal(actions,1);await run('ok','a');assert.equal(actions,1);assert.equal(world.getSnapshot().car.lights.ambientColor,'#ffe4bc');
});
test('selfie graph uses same scheduler with injected model and actual HMI mock state',async t=>{
 const g=buildSelfieAmbientScenario();g.nodes.find(n=>n.type==='input')!.data.flowVersion=2;const world=new VehicleWorld();let calls=0;
 const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({car:world.getSnapshot().car}),updateSimulatorState(){},executeAmbientLight:world.setAmbientLight,restoreAmbientLight:world.restoreAmbientLight};
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({light_color:'#ffe4bc',light_brightness:55,light_reason:'注入测试',pose_tips:'保持坐姿'})}}]});});
 // Alternative branches join explicitly under the general contract.
 for(const node of g.nodes)if(g.edges.filter(e=>e.target===node.id).length>1)node.data.joinMode='any';
 const result=await new GraphEngine(g.nodes,g.edges,cb).run(selfieSamples[0].input);assert.equal(result.status,'completed',JSON.stringify(result.events.filter(e=>e.type==='node_failed')));assert.equal(calls,1);assert.equal(world.getSnapshot().car.lights.brightness,55);
});

test('generic isolated rehearsal works for two unrelated fixtures without external calls',async t=>{
 const {rehearseScenario}=await import('../src/domain/scenarioRehearsal');t.mock.method(globalThis,'fetch',async()=>{throw Error('unexpected network');});
 for(const cfg of [['生日','arrive','指南针'],['展览','exit','陶器']]){const g=journey(...cfg as [string,string,string]);assert.equal((await rehearseScenario(g)).status,'passed');}
});
test('cancellation checkpoints prior success and blocks later operations',async()=>{
 const s=new FlowSessions(),controller=new AbortController(),calls:string[]=[];
 const nodes=[n('i','input',{flowVersion:2}),n('a','output'),n('b','output')],edges=[e('i','a'),e('a','b')];
 const host:FlowHost={process:async(n,v)=>{if(n.id==='a')controller.abort();return {output:v};},started:n=>calls.push(n.id),completed(){},failed(){},message(){}};
 await assert.rejects(s.run(nodes,edges,'start','one',host,controller.signal));assert.equal(s.snapshot()?.nodes.a,'success');assert.equal(calls.includes('b'),false);
 await s.run(nodes,edges,'continue','two',host);assert.equal(calls.filter(x=>x==='a').length,1);assert.equal(calls.filter(x=>x==='b').length,1);
});
