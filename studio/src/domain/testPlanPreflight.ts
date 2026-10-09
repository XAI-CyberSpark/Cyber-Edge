import {assertionShape,inspectAssertions} from './assertionContract';
import {parseInputObject} from './inputContract';
import {errorDetails} from './contractErrors';
import {eventOf, isGeneralFlow, normalizeFlowAnswer, type FlowNode, type FlowEdge} from './flowSession';
import type {ExecutionPlan} from './scenarioExecution';
export type PlanDiagnostic = {category:string;code:string;message:string;path:string;node_id?:string;field?:string;suggestions?:string[][];expected_type?:string};
/** Conservative reachability only: never evaluates model results or business expressions. */
export function inspectTestPlan(project:{nodes:FlowNode[];edges:FlowEdge[]},plan:ExecutionPlan) {
  const errors:PlanDiagnostic[]=[],warnings:PlanDiagnostic[]=[];
  const shape=assertionShape(project);
  const nodes=project.nodes.filter(n=>n.type!=='stage'),byId=new Map(nodes.map(n=>[n.id,n]));
  const roots=nodes.filter(n=>['input','systemInput'].includes(n.type||'')&&!project.edges.some(e=>e.target===n.id));
  const persistent=nodes.some(n=>['wait','interaction'].includes(n.type||'')||n.data.eventName);
  const walk=(starts:string[],stopAtWait:boolean)=>{
    const seen=new Set<string>();
    const visit=(id:string)=>{if(seen.has(id))return;seen.add(id);const n=byId.get(id);if(stopAtWait&&['wait','interaction'].includes(n?.type||''))return;
      project.edges.filter(e=>e.source===id&&e.sourceHandle!=='error').forEach(e=>visit(e.target));};
    starts.forEach(visit);return seen;
  };
  const memoryWrite=(n:FlowNode)=>n.type==='memory'&&n.data.type==='buffer'&&![...walk([n.id],false)].some(id=>byId.get(id)?.type==='llm');
  const memoryRead=(n:FlowNode)=>n.type==='memory'&&n.data.type==='buffer'&&!memoryWrite(n);
  const stateKeys=(n:FlowNode)=>n.type==='state'?[...Object.keys(n.data.values||{}),...Object.keys(n.data.increments||{})]:[];
  const previousStateWrites=new Set<string>();
  let previousCaseWrite=false;
  for(const [i,test] of plan.cases.entries()) {
    let waiting:FlowNode[]=[],caseWrite=false;const localStateWrites=new Set<string>();
    for(const [j,step] of test.steps.entries()) {
      const path=`plan.cases[${i}].steps[${j}]`,event=eventOf(step.input,`static-${j}`);
      errors.push(...inspectAssertions(shape,step.assertions||[],path));
      for(const [a,assertion] of (step.assertions||[]).entries())if(assertion.path.length===2&&assertion.path[0]==='nodes'&&assertion.op==='exists'&&byId.has(assertion.path[1]))warnings.push({category:'assertion',code:'PLAN_ASSERTION_WEAK',path:`${path}.assertions[${a}]`,node_id:assertion.path[1],message:`${path}.assertions[${a}]：nodes.${assertion.path[1]} exists 只证明有状态记录，pending/dormant/skipped 也存在，不能证明执行过。建议 equals "success"（节点状态值），或检查该节点动作回执/输出；宿主不自动改写。`});
      const matches=(n:FlowNode)=>(!event.target||event.target===n.id)&&(event.name===(n.data.eventName||'message')||(event.name==='message'&&(n.data.aliases||[]).some((s:string)=>normalizeFlowAnswer(s)===normalizeFlowAnswer(event.text))));
      const restart=event.control==='restart';
      if(restart)waiting=[];
      const entries=event.control&&!restart?[]:roots.filter(n=>n.data.eventName?matches(n):j===0||restart||!persistent);
      for(const n of entries)if(n.data.inputFormat==='json') {
        try {parseInputObject(n.data.eventName?event.value:step.input,n.data.outputFields,n.id);}
        catch(error) {errors.push({...errorDetails(error),path:path+'.input',node_id:n.id,message:`测试输入 ${path}.input（${test.name}）：${error instanceof Error?error.message:String(error)}`});}
      }
      const resumed=event.control?[]:waiting.filter(n=>n.type==='interaction'||matches(n));
      if(isGeneralFlow(nodes)&&roots.some(n=>n.data.eventName)&&!event.control&&!entries.length&&!resumed.length)warnings.push({category:'input_contract',code:'PLAN_EVENT_UNMATCHED',path:path+'.input',message:`${path}.input（${test.name}）：eventOf 识别为事件 ${JSON.stringify(event.name)}、target=${JSON.stringify(event.target??null)}；未匹配入口或可达等待。入口期望 ${JSON.stringify(roots.map(n=>({node_id:n.id,eventName:n.data.eventName||'message',aliases:n.data.aliases||[]})))}，等待期望 ${JSON.stringify(waiting.map(n=>({node_id:n.id,eventName:n.data.eventName||'message'})))}。具名入口可能全部 dormant；请在锁定前核对 $event.name/value/target。text 内的 JSON 不会自动解包为事件。`});
      const starts=[...entries.map(n=>n.id),...resumed.flatMap(n=>project.edges.filter(e=>e.source===n.id&&e.sourceHandle!=='error').map(e=>e.target))];
      const reachable=walk(starts,true);
      const reached=nodes.filter(n=>reachable.has(n.id));
      const nextWaiting=reached.filter(n=>['wait','interaction'].includes(n.type||''));
      waiting=[...waiting.filter(n=>!resumed.includes(n)),...nextWaiting];
      if(waiting.length&&(step.status==='completed'||j===test.steps.length-1))for(const n of waiting) {
        warnings.push({category:'assertion',code:'PLAN_WAITING_PATH',path,node_id:n.id,message:`${path}（${test.name}）：路径可能到达等待节点 ${n.id}（eventName=${n.data.eventName||'message'}，prompt=${String(n.data.prompt||'等待输入')}）；${step.status==='completed'?'status=completed 与该路径 waiting 预期不符；':''}${j===test.steps.length-1?'未提供后续 step；':''}若需完成该路径，在同 case 提供后续回复；若本意仅验证等待，可显式断言 waiting。动态分支和回答匹配需 trial 确认。`});
      }
      // A read cannot inherit writes from a previous case. Reachability is only
      // possible, so warn rather than pretending to prove model/branch intent.
      if(i>0&&previousCaseWrite&&!caseWrite&&!reached.some(memoryWrite))for(const n of reached.filter(memoryRead)) {
        warnings.push({category:'input_contract',code:'PLAN_CASE_MEMORY_ISOLATION',path,node_id:n.id,message:`${path}（${test.name}）：读取记忆节点 ${n.id}，本 case 尚无可达写入准备，前一个 case 的写入不会保留。每个 case 从全新状态开始，独立记忆且不共享 state；若依赖已有记忆，请把准备和读取放在同一个 case 的多个 step。此为可能依赖警告，无法静态判断模型语义。`});
      }
      if(i>0&&previousStateWrites.size)for(const n of reached) {
        // Field references, not node names or natural-language scene keywords.
        const refs=new Set<string>();
        const scan=(v:any)=>{if(typeof v==='string')for(const match of v.matchAll(/\b(?:state|input(?:\.state)?|outputs\.[A-Za-z0-9_]+\.state)\.([A-Za-z_][A-Za-z0-9_]*)/g))refs.add(match[1]);else if(v&&typeof v==='object')Object.values(v).forEach(scan);};
        scan(n.data);
        const missing=[...refs].filter(key=>previousStateWrites.has(key)&&!localStateWrites.has(key)&&!reached.some(writer=>writer.id!==n.id&&stateKeys(writer).includes(key)&&walk([writer.id],true).has(n.id)));
        if(missing.length)warnings.push({category:'input_contract',code:'PLAN_CASE_MEMORY_ISOLATION',path,node_id:n.id,message:`${path}（${test.name}）：节点 ${n.id} 引用字段 ${missing.join('、')}，前面 case 曾写入同名 state，本 case 读取前没有可达写入准备。case 不共享 state/记忆；将准备放在本 case 的前续 step，并核对 input/state 绑定。此为数据依赖可能性警告，分支需 trial 确认。`});
      }
      reached.flatMap(stateKeys).forEach(key=>localStateWrites.add(key));
      if(reached.some(memoryWrite))caseWrite=true;
    }
    previousCaseWrite ||= caseWrite;
    localStateWrites.forEach(key=>previousStateWrites.add(key));
  }
  return {errors,warnings};
}
