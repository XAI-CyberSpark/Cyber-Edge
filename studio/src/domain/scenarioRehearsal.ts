import {isGeneralFlow} from './flowSession';
import {VehicleWorld} from './vehicleWorld';
import type { Edge, Node } from '@xyflow/react';
import { GraphEngine, type GraphCallbacks } from '@/utils/GraphEngine';
import { ScenarioSessions, type InteractionPlan } from './scenarioSession';

export type Rehearsal = { status: 'passed' | 'failed' | 'not_supported'; inputs: number; checks: string[]; issue?: string };

/** Use the real engine with isolated state and no external-capability nodes.
 * This verifies transitions, not answer truth, content quality or real devices.
 */
export async function rehearseScenario(project: { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> }): Promise<Rehearsal> {
  const nodes = structuredClone(project.nodes) as Node[];
  const edges = structuredClone(project.edges) as Edge[];
  if(isGeneralFlow(nodes))return rehearseGeneral(nodes,edges);
  const interaction = nodes.find(n=>n.type==='interaction');
  if (nodes.length !== 2 || edges.length !== 1 || !interaction || nodes.filter(n=>n.type==='input').length !== 1 || (interaction.data.plan as InteractionPlan)?.mode !== 'authored') {
    return {status:'not_supported', inputs:0,checks:[]};
  }
  const plan = interaction.data.plan as InteractionPlan;
  let inputs=0;
  const checks: string[]=[];
  const callbacks: GraphCallbacks = {
    updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},
    getSimulatorState:()=>({}),updateSimulatorState(){},
  };
  const ensure=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
  const sessions=new ScenarioSessions();
  const state=()=>sessions.snapshot(interaction.id)!;
  const run=async(text:string,eventId?:string)=>{
    inputs++;
    const result=await new GraphEngine(nodes,edges,callbacks,sessions).run(text,{eventId});
    ensure(result.status!=='failed',result.events.find(e=>e.type==='node_failed')?.payload.error as string || '场景运行失败');
    return result;
  };
  try {
    await run('开始');ensure(state().index===0,'未从第一阶段启动');
    await run('暂停');const paused=state().index;await run('下一站');ensure(state().status==='paused'&&state().index===paused,'暂停期间发生推进');
    await run('继续');ensure(state().status==='waiting','无法恢复互动');checks.push('暂停与恢复');
    let answers=0;
    for(let i=0;i<plan.steps.length;i++) {
      ensure(state().index===i,'阶段推进不符合配置');
      const step=plan.steps[i];
      if(step.waitFor==='answer') {
        const before=state().rewards.length;
        await run('___invalid_rehearsal_answer___');ensure(!state().solved,'错误答案被判为正确');
        await run('提示');ensure(!state().solved,'提示提前完成题目');
        const answer=step.acceptedAnswers?.[0] || step.content?.answers?.[0];ensure(answer,'缺少可输入的答案');
        const id=`rehearsal-answer-${i}`;
        await run(answer!,id);ensure(state().solved,'已配置答案不能完成题目');
        const count=state().rewards.length;
        ensure(count===before+(step.content?.reward?1:0),'奖励发放数量不正确');
        await run(answer!,id);ensure(state().rewards.length===count,'重复事件重复发奖');answers++;
      }
      await run(step.waitFor==='arrival'?'到达了':'下一站',`rehearsal-next-${i}`);
    }
    ensure(state().status==='completed','没有正常结束');checks.push(`${answers}个问题的错误、提示、正确和去重`, '全部阶段与结束');
    await run('重新开始');await run('跳过');ensure(state().rewards.length===0,'跳过仍发放奖励');checks.push('跳过不发奖');
    const arrival=plan.steps.findIndex(s=>s.waitFor==='arrival');
    if(arrival>=0){await run('重新开始');await run('到达了');ensure(arrival===plan.steps.length-1?state().status==='completed':state().index===arrival+1,'提前到达没有进入对应收尾');checks.push('提前到达');}
    return {status:'passed',inputs,checks};
  }catch(error){return {status:'failed',inputs,checks,issue:error instanceof Error?error.message:'自动试运行失败'};}
}

/** Capability rehearsal with isolated HMI state. External models/tools and scripts
 * require separately injected test adapters; never invoke them silently here. */
async function rehearseGeneral(nodes:Node[],edges:Edge[]):Promise<Rehearsal>{
 if(nodes.some(n=>n.type==='wait'&&n.data.repeat===true))return {status:'not_supported',inputs:0,checks:[],issue:'重复等待需要显式多轮输入及退出断言的执行计划；自动填入单个示例无法验证循环，不据此判定场景失败。'};
 const unsupported=nodes.find(n=>!['input','state','wait','stage','output','car_control'].includes(n.type||'') || n.type==='car_control'&&!(n.data.executionMode==='hmi_mock'&&['ambient_light.set','ambient_light.restore'].includes(String(n.data.action))));
 if(unsupported)return {status:'not_supported',inputs:0,checks:[],issue:`${unsupported.data.label||unsupported.type}需要单独的能力测试适配器；未调用外部服务。`};
 const sessions=new ScenarioSessions(),world=new VehicleWorld();let inputs=0;const checks:string[]=[];
 const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({car:world.getSnapshot().car}),updateSimulatorState(){},executeAmbientLight:world.setAmbientLight,restoreAmbientLight:world.restoreAmbientLight};
 const run=async(value:unknown,id?:string)=>{inputs++;const r=await new GraphEngine(nodes,edges,cb,sessions).run(value,{eventId:id});if(r.status==='failed')throw Error(String((r.finalOutput as any)?.reply||r.events.find(e=>e.type==='node_failed')?.payload.error||'执行失败'));return r;};
 try{
  await run('隔离试运行');
  const visited=new Set<string>();
  for(let budget=0;budget<=nodes.length;budget++){
   const snapshot=sessions.flow.snapshot()!;
   if(snapshot.status==='completed'){checks.push('配置路径完成（不代表所有分支或内容质量通过）');return {status:'passed',inputs,checks};}
   const id=snapshot.waiting.find(id=>!visited.has(id));if(!id)throw Error('存在未完成路径，未获得可推进的等待节点');
   const node=nodes.find(n=>n.id===id)!;visited.add(id);
   await run({$event:{control:'pause'}});await run({$event:{control:'resume'}});
   if(sessions.flow.snapshot()!.nodes[id]!=='waiting')throw Error('恢复错误地消费了等待事件');
   const before=JSON.stringify(sessions.flow.snapshot()!.state),eventId=`rehearsal:${id}`;
   if(node.data.match==='exact'){
    await run({$event:{name:node.data.eventName,target:id,text:'__not_a_configured_answer__'}});
    if(JSON.stringify(sessions.flow.snapshot()!.state)!==before)throw Error('不匹配输入改变了状态');
   }
   const text=node.data.match==='exact'?(node.data.answers as string[])[0]:'隔离示例输入';
   const event={$event:{name:node.data.eventName,target:id,text}};
   await run(event,eventId);const after=JSON.stringify(sessions.flow.snapshot());await run(event,eventId);
   if(JSON.stringify(sessions.flow.snapshot())!==after)throw Error('重复事件改变了进度');
   checks.push(`${node.data.label||id}：等待恢复、输入、去重`);
  }
  throw Error('隔离试运行达到图步数预算');
 }catch(error){return {status:'failed',inputs,checks,issue:error instanceof Error?error.message:'隔离试运行失败'};}
}
