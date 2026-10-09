import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canApplyScenario, describeScenarioBuild, type ScenarioBuildReport } from '../src/domain/scenarioBuild';
import { rehearseScenario } from '../src/domain/scenarioRehearsal';

const report: ScenarioBuildReport = {
 status:'preview',can_apply:true,runtime_verified:false,
 brief:{title:'探险',goal:'探险',experience_outline:['启程','解谜','收尾'],assumptions:['乘客文字互动'],questions:[],requirements:[]},
 coverage:[{requirement_id:'R1',status:'simulated',node_ids:['story'],note:'到达由聊天模拟'}],issues:[],
};
test('only valid nonempty reviewed candidates can replace a project',()=>{
 const base={validation:{passed:true},project:{nodes:[{}]},build_report:report};
 assert.equal(canApplyScenario(base),true);
 assert.equal(canApplyScenario({...base,validation:{passed:false}}),false);
 assert.equal(canApplyScenario({...base,project:{nodes:[]}}),false);
 for(const status of ['needs_changes','needs_input','capability_gap'] as const) assert.equal(canApplyScenario({...base,build_report:{...report,status}}),false);
 assert.equal(canApplyScenario({...base,build_report:{...report,can_apply:false}}),false);
});
test('preview explains experience and simulation without technical report clutter',()=>{
 const text=describeScenarioBuild(report);
 assert.match(text,/启程 → 解谜 → 收尾/);assert.match(text,/到达由聊天模拟/);assert.match(text,/仍需/);
 assert.doesNotMatch(text,/JSON|Token|接口：|已通过运行/);
});
test('missing capabilities and blocking questions are actionable in the existing chat',()=>{
 const gap={...report,status:'capability_gap' as const,can_apply:false,coverage:[{requirement_id:'R1',status:'missing' as const,node_ids:[],note:'未连接自动驾驶执行器'}]};
 assert.match(describeScenarioBuild(gap),/当前画布已保留/);assert.match(describeScenarioBuild(gap),/未连接自动驾驶/);
 const question={...report,status:'needs_input' as const,can_apply:false,brief:{...report.brief,questions:['目的地是哪？']}};
 assert.match(describeScenarioBuild(question),/1\. 目的地是哪/);
});
const plan={mode:'authored',premise:'想象探险',ending:'生日快乐',steps:[
 {id:'q',title:'谜题',waitFor:'answer',content:{message:'开始探险',question:'2加3等于几？',answers:['5','五'],hint:'比四多一',reward:'星星'}},
 {id:'a',title:'等待',waitFor:'arrival',content:{message:'等待到达'}},
 {id:'e',title:'收尾',waitFor:'continue',content:{message:'生日快乐'}}]};
const project={nodes:[{id:'i',type:'input',position:{x:0,y:0},data:{}},{id:'s',type:'interaction',position:{x:1,y:0},data:{plan}}],edges:[{id:'e',source:'i',target:'s'}]};
test('automatic rehearsal uses real engine, checks all stages, never calls external services',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('Rehearsal must not call network');});
 const before=JSON.stringify(project),result=await rehearseScenario(project);
 assert.equal(result.status,'passed',result.issue);assert.ok(result.inputs>10);assert.ok(result.checks.includes('提前到达'));
 assert.equal(JSON.stringify(project),before);
});
test('rehearsal catches runtime-only contract failures and declines device workflows',async()=>{
 const broken=structuredClone(project);Object.assign(broken.nodes[1].data.plan!.steps[0],{acceptedAnswers:['不匹配']});
 const result=await rehearseScenario(broken);assert.equal(result.status,'failed');
 const external=structuredClone(project);external.nodes[1].type='llm';
 assert.equal((await rehearseScenario(external)).status,'not_supported');
});

test('generated API node sends its provider and exact model to runtime', async t => {
 const {GraphEngine}=await import('../src/utils/GraphEngine');
 const nodes=[{id:'i',type:'input',position:{x:0,y:0},data:{}},{id:'m',type:'llm',position:{x:100,y:0},data:{model:'claude-sonnet-5',providerId:'anthropic',outputFormat:'text'}}];
 let body:any;
 t.mock.method(globalThis,'fetch',async (_url,init)=>{body=JSON.parse(String(init?.body));return Response.json({model:'claude-sonnet-5',choices:[{message:{content:'欢迎登船'},finish_reason:'stop'}]});});
 const callbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){return {};},updateSimulatorState(){}};
 const result=await new GraphEngine(nodes,[{id:'e',source:'i',target:'m'}],callbacks).run('开始');
 assert.equal(result.status,'completed');assert.equal(body.provider_id,'anthropic');assert.equal(body.model,'claude-sonnet-5');assert.equal(body.api_key,undefined);
});


test('non-executable drafts can be inspected only on empty canvases',async()=>{
 const {canInspectScenario}=await import('../src/domain/scenarioBuild');
 const draft={project:{nodes:[{data:{designOnly:true}}]},build_report:{...report,status:'capability_gap' as const,can_apply:false,can_inspect:true}};
 assert.equal(canInspectScenario(draft,0),true);
 assert.equal(canInspectScenario(draft,1),false);
 assert.equal(canInspectScenario({...draft,project:{nodes:[{data:{}}]}},0),false);
 assert.match(describeScenarioBuild({...draft.build_report,draft_displayed:true}),/节点草稿.*尚不能运行/);
});
test('draft graph stops before any model or device execution, including after reload',async t=>{
 const {GraphEngine}=await import('../src/utils/GraphEngine');
 t.mock.method(globalThis,'fetch',()=>{throw Error('Draft must never call a service');});
 const draft=JSON.parse(JSON.stringify({nodes:[{id:'i',type:'input',position:{x:0,y:0},data:{designOnly:true}},{id:'m',type:'llm',position:{x:300,y:0},data:{model:'claude-sonnet-5',providerId:'anthropic',designOnly:true}}],edges:[{id:'e',source:'i',target:'m'}]}));
 const callbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){return {};},updateSimulatorState(){}};
 const result=await new GraphEngine(draft.nodes,draft.edges,callbacks).run('测试');
 assert.equal(result.status,'failed');
});
