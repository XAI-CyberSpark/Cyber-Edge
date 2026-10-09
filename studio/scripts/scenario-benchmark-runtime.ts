/** Offline execution of a candidate with the actual engine and injected dependencies.
 * This process never connects devices, opens video streams or invokes an LLM.
 */
import { readFileSync } from 'node:fs';
import { GraphEngine, type GraphCallbacks } from '../src/utils/GraphEngine';
import { ScenarioSessions } from '../src/domain/scenarioSession';
import { rehearseScenario } from '../src/domain/scenarioRehearsal';
import { VehicleWorld } from '../src/domain/vehicleWorld';

const ensure=(value:unknown,reason:string)=>{if(!value)throw Error(reason);};
const safeConditions=new Set([
 "input.weather === 'rain' && Object.values(input.windows).some(value => Number(value) > 0)",
 'input.action_result.success === true',
].map(x=>x.replace(/\s/g,'')));
function safeGraph(project:any, profile:string):string|undefined {
 const nodes=project?.nodes,edges=project?.edges;
 if(!Array.isArray(nodes)||!Array.isArray(edges)||nodes.length>60||edges.length>120)return '图大小或格式不受支持';
 const allowed=new Set(profile==='interaction'?['input','interaction']:profile==='child'?['input','systemInput','llm','recognition','logic','cockpit_alert','video_display','event_log','fallback','risk_monitor','output']:['input','systemInput','llm','logic','car_control','fallback','output']);
 for(const node of nodes){
  if(!allowed.has(node.type))return `离线执行器暂不覆盖 ${node.type}`;
  const data=node.data||{};
  if(data.script)return '不执行候选自定义脚本';
  if(node.type==='interaction'&&data.plan?.mode!=='authored')return '不调用实时模型创作章节';
  if(node.type==='logic'){
   if((data.logic_type||data.type||'if')!=='if')return '不执行动态参数过滤';
   const condition=String(data.condition||'').replace(/"/g,"'").replace(/\s/g,'');
   const simple=/^input\.(?:recognition\.)?status==='(?:risk|normal|unknown)'$/;
   const threshold=/^input\.confidence>=(?:0(?:\.\d+)?|1(?:\.0+)?)&&input\.(?:recognition\.)?status==='(?:risk|normal|unknown)'$/;
   if(!simple.test(condition)&&!threshold.test(condition)&&!safeConditions.has(condition))return '此条件尚未进入离线安全表达式集合，需扩展检查器';
  }
 }
}

export async function executeCase(project:any,profile:string){
 if(profile==='none')return {status:'not_required',checks:[],scope:'无执行承诺'};
 const unsupported=safeGraph(project,profile);
 if(unsupported)return {status:'not_supported',checks:[],issue:unsupported};
 const checks:string[]=[];
 const previousFetch=globalThis.fetch;
 try{
  if(profile==='interaction'){
   globalThis.fetch=async()=>{throw Error('离线互动测试禁止网络调用');};
   const r=await rehearseScenario(project);if(r.status!=='passed')return r;
   checks.push(...r.checks);
   const sessions=new ScenarioSessions();const id=project.nodes.find((n:any)=>n.type==='interaction').id;
   const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){return{};},updateSimulatorState(){}};
   const run=(text:string)=>new GraphEngine(structuredClone(project.nodes),structuredClone(project.edges),cb,sessions).run(text);
   await run('开始');await run('退出');await run('随便聊聊');ensure(sessions.snapshot(id)?.status==='stopped','普通聊天自动重启已退出场景');
   await run('重新开始');ensure(sessions.snapshot(id)?.index===0&&sessions.snapshot(id)?.rewards.length===0,'重开未清空进度/奖励');checks.push('退出后不自动重启','重新开始清空进度');
   return {status:'passed',checks,scope:'真实引擎，预生成内容；题目真伪和趣味仍待评审'};
  }
  let status='risk',videoAvailable=true,inferenceAvailable=true,opened:any[]=[],messages:string[]=[],world=new VehicleWorld(),weather='rain',actions:any[]=[];
  globalThis.fetch=async(url,init)=>{
   if(!String(url).endsWith('/v1/inference/chat/completions'))throw Error('离线运行禁止访问外部服务');
   if(!inferenceAvailable)return new Response('{}',{status:503});
   if(profile==='child'){
    const body=JSON.parse(String(init?.body));
    ensure(JSON.stringify(body.messages).includes('benchmark-photo'),'识别请求没有使用本次图片');
   }
   return Response.json({model:'benchmark-injected',choices:[{finish_reason:'stop',message:{content:JSON.stringify(profile==='child'?{status,confidence:.95,risk_action:status==='risk'?'站起':'无',summary:status==='risk'?'测试注入：儿童站起':status==='normal'?'测试注入：正常就座':'测试注入：无法判断'}:{reply:'关闭右后窗',action:'windows.close_all'})}}]});
  };
  const cb:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},
   getSimulatorState:()=>({car:world.getSnapshot().car,scenario:{weather}}),
   updateSimulatorState(category,key,value){if(category==='hmi'&&key==='message')messages.push(String(value));if(profile==='child'&&key==='care_frame'&&value)throw Error('上传照片被当作后排画面显示');},
   showRearVideo:async(source)=>{if(!videoAvailable)throw Error('基准注入：后排视频断流');ensure(source.source==='local_replay'||source.source==='browser_stream','没有独立的视频来源');ensure(!JSON.stringify(source).includes('benchmark-photo'),'视频来源误用输入照片');opened.push(source);return 'opened';},
   executeWindowTargets:async targets=>{if(profile==='child')throw Error('儿童关怀不允许车控');actions.push(targets);return world.moveWindows(targets,'workflow',0);},
   executeWindowAction:async action=>{if(profile==='child')throw Error('儿童关怀不允许车控');actions.push(action);const n=action==='open_all'?100:0;return world.moveWindows({fl:n,fr:n,rl:n,rr:n},'workflow',0);},
  };
  const run=()=>new GraphEngine(structuredClone(project.nodes),structuredClone(project.edges),cb).run(profile==='child'?{type:'image',content:'data:image/jpeg;base64,benchmark-photo'}:'关闭右后窗');
  if(profile==='child'){
   for(const value of ['risk','normal','unknown']){
    status=value;opened=[];messages=[];const r=await run();ensure(r.status==='completed',`${value} 运行未完成`);
    ensure(opened.length===(value==='risk'?1:0),`${value} 的视频触发次数不正确`);
    if(value==='unknown')ensure((r.finalOutput as any)?.decision_status==='unknown'||String((r.finalOutput as any)?.reply||'').includes('无法'),'unknown 未给出明确无法判断反馈');
    checks.push(`${value} 分支`);
   }
   status='risk';opened=[];videoAvailable=false;const broken=await run();ensure(broken.status==='failed'&&opened.length===0,'断流仍标为成功');checks.push('断流不冒充播放成功');
   videoAvailable=true;inferenceAvailable=false;opened=[];const failed=await run();ensure(failed.status==='failed'&&opened.length===0,'识别失败仍触发展示');checks.push('识别失败停止后续展示');
   return {status:'passed',checks,scope:'真实图引擎 + 注入识别和视频回执；未测视觉准确率、真实视频播放、重复提醒策略'};
  }
  const reset=()=>{world=new VehicleWorld();world.setCar(p=>({...p,windows:{fl:20,fr:40,rl:60,rr:80}}));actions=[];messages=[];};
  reset();const result=await run();ensure(result.status==='completed','车窗流程未完成');
  const expected=profile==='window'?{fl:20,fr:40,rl:60,rr:0}:{fl:0,fr:0,rl:0,rr:0};ensure(JSON.stringify(world.getSnapshot().car.windows)===JSON.stringify(expected),'车窗动作范围或目标错误');checks.push(profile==='window'?'仅右后窗变化':'雨天关闭开启车窗');
  if(profile==='rain'){reset();weather='sunny';await run();ensure(actions.length===0,'晴天仍执行关窗');checks.push('晴天无车控');}
  return {status:'passed',checks,scope:'真实引擎与车辆行为仿真；实车反馈/故障文案仍需专项评审'};
 }catch(error){return {status:'failed',checks,issue:error instanceof Error?error.message:'离线运行失败'};}
 finally{globalThis.fetch=previousFetch;}
}

if(process.argv[2]){
 const {project,profile}=JSON.parse(readFileSync(process.argv[2],'utf8'));
 process.stdout.write(JSON.stringify(await executeCase(project,profile))+'\n');
}
