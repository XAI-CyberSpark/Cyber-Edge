import {inspectTestPlan} from './testPlanPreflight';
import {errorDetails} from './contractErrors';
/** Scenario-independent acceptance driver using the production engine.
 * Run in a dedicated worker process: model transport is explicitly supplied by
 * its host; HMI and memory are isolated. No real devices or media are opened.
 */
import { GraphEngine, type GraphCallbacks } from '../utils/GraphEngine';
import { ScenarioSessions } from './scenarioSession';
import { VehicleWorld, type WindowKey } from './vehicleWorld';
import { evaluateExpression, validateExpression } from './expression';
import { bindFlowValue } from './flowSession';

export type Assertion = { path: string[]; op: 'equals' | 'contains' | 'exists' | 'not_exists' | 'gte' | 'lte' | 'satisfies'; value?: unknown };
export type ExecutionPlan = { cases: Array<{
  name: string;
  weather?: string;
  controls?: Array<{ control: string; value: any }>;
  initial_windows?: Record<WindowKey, number> | null;
  blocked_window?: WindowKey | null;
  steps: Array<{ input: any; event_id?: string; status?: string; assertions?: Assertion[] }>;
}> };
export type ExecutionAdapters = {
  inference?: (body: any) => Promise<any>;
  mcp?: (body: any) => Promise<any>;
};
const ownPath = (root: any, parts: string[]) => parts.reduce((v, p) =>
  !['__proto__','constructor','prototype'].includes(p) && v != null && Object.hasOwn(Object(v), p) ? v[p] : undefined, root);
function same(a: any, b: any): boolean {
  if (Object.is(a,b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b,k) && same(a[k],b[k]));
}
export function assertionPass(assertion: Assertion, actual: unknown): boolean {
  switch (assertion.op) {
    case 'exists': return actual !== undefined;
    case 'not_exists': return actual === undefined;
    case 'equals': return same(actual, assertion.value);
    case 'contains': return typeof actual === 'string' && typeof assertion.value === 'string' ? actual.includes(assertion.value)
      : Array.isArray(actual) && actual.some(v => same(v, assertion.value));
    case 'lte': return typeof actual === 'number' && typeof assertion.value === 'number' && actual <= assertion.value;
    case 'gte': return typeof actual === 'number' && typeof assertion.value === 'number' && actual >= assertion.value;
    case 'satisfies':
      if (typeof assertion.value !== 'string') throw Error('satisfies需要纯数据表达式');
      return evaluateExpression(assertion.value, actual);
    default: return false;
  }
}
export async function executeScenario(project: any, plan: ExecutionPlan, adapters: ExecutionAdapters = {}) {
  const reports: any[] = [];
  let modelCalls = 0, toolCalls = 0;
  const originalFetch = globalThis.fetch;
  try {
    if (!Array.isArray(plan?.cases) || !plan.cases.length || plan.cases.length > 6) throw Error('测试计划需要1–6个用例');
    if (!project?.nodes?.length || project.nodes.length > 60 || project.edges?.length > 120) throw Error('图大小超出执行预算');
    const preflight=inspectTestPlan(project,plan);
    if(preflight.errors.length)return {status:'failed',cases:[],model_calls:0,tool_calls:0,issue:preflight.errors.map(e=>e.message).join('；'),contract_diagnostics:preflight.errors};
    // Reject executable code or unsupported syntax in any case before the first
    // model/tool/action call. Runtime type errors remain failed assertions.
    for (const test of plan.cases) for (const step of test.steps || []) for (const assertion of step.assertions || []) {
      if (assertion.op === 'satisfies') {
        if (typeof assertion.value !== 'string') throw Error('satisfies需要纯数据表达式');
        validateExpression(assertion.value);
      }
    }
    for (const test of plan.cases) {
      if (!test.steps?.length || test.steps.length > 30) throw Error('每个用例需要1–30步');
      const world = new VehicleWorld(), sessions = new ScenarioSessions();
      const hmi: Record<string, unknown> = {}, outputs: Record<string, any> = {}, nodes: Record<string, any> = {};
      const messages: string[] = [], actions: any[] = [], memories: any[] = [], steps: any[] = [];
      for (const control of test.controls || []) world.executeHmiControl(control);
      if (test.initial_windows) world.setCar(car => ({...car,windows:{...test.initial_windows!}}));
      world.setFault(test.blocked_window ?? null);
      const initialVehicle={windows:structuredClone(world.getSnapshot().car.windows),blocked_window:world.getSnapshot().blockedWindow};
      globalThis.fetch = async (url, init) => {
        const path = new URL(String(url)).pathname, body = JSON.parse(String(init?.body || '{}'));
        if (path === '/v1/inference/chat/completions') {
          if (!adapters.inference) throw Error('模型测试适配器未连接');
          if (++modelCalls > 12) throw Error('本次试跑达到12次模型调用预算');
          return Response.json(await adapters.inference(body));
        }
        if(path==='/v1/mcp/invoke'){
          if(!adapters.mcp)throw Error('MCP试跑适配器未连接');
          if(++toolCalls>12)throw Error('本次试跑达到12次MCP调用预算');
          return Response.json(await adapters.mcp(body));
        }
        if (path === '/v1/memory/query') return Response.json({results: memories.slice(-Math.min(Number(body.limit) || 10, 100))});
        if (path === '/v1/memory/add') { memories.push({content:body.content,metadata:body.metadata}); return Response.json({success:true}); }
        throw Error('自动试跑没有此服务适配器');
      };
      const callbacks: GraphCallbacks = {
        updateNodeStatus(id, status, output) { nodes[id] = status; if (output !== undefined) outputs[id] = output; },
        updateKernel(){}, updateMemory(){}, updateSafety(){}, updateMiddleware(){}, log(){},
        getSimulatorState: () => ({car:world.getSnapshot().car, hmi, scenario:{weather:test.weather || 'sunny'}}),
        updateSimulatorState(category, key, value) {
          if (category === 'hmi') { hmi[key] = value; if (key === 'message') messages.push(String(value)); }
          else throw Error(`此仿真动作尚无试跑适配器：${category}.${key}`);
        },
        executeHmiControl(request) { const result=world.executeHmiControl(request); actions.push(result); return result; },
        executeAmbientLight(request) { const result=world.setAmbientLight(request); actions.push(result); return result; },
        restoreAmbientLight() { const result=world.restoreAmbientLight(); actions.push(result); return result; },
        executeWindowTargets: async targets => { const result=await world.moveWindows(targets,'workflow',0); actions.push(result); return result; },
        executeWindowAction: async action => { const n=action==='open_all'?100:0; const result=await world.moveWindows({fl:n,fr:n,rl:n,rr:n},'workflow',0); actions.push(result); return result; },
      };
      for (const [index, step] of test.steps.entries()) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 65000);
        let run: any;
        try { run = await new GraphEngine(structuredClone(project.nodes), structuredClone(project.edges), callbacks, sessions).run(step.input, {eventId:step.event_id || `step-${index}`,signal:controller.signal}); }
        finally { clearTimeout(timer); }
        const snapshot=sessions.flow.snapshot();
        const evidence={run, state:snapshot?.state || {}, car:structuredClone(world.getSnapshot().car), initial_vehicle:structuredClone(initialVehicle), hmi:{...hmi}, nodes:snapshot?.nodes ? {...snapshot.nodes} : {...nodes}, outputs:structuredClone(snapshot?.outputs || outputs), messages:[...messages], actions:structuredClone(actions)};
        const assertions=(step.assertions || []).map(a => {
          const actual=ownPath(evidence,a.path), record={...a, actual:actual === undefined ? null : actual, actual_missing:actual === undefined};
          try { return {...record, passed:assertionPass(a,actual)}; }
          catch(error) { return {...record, passed:false, error:error instanceof Error?error.message:'断言表达式无效'}; }
        });
        const failedNodes=run.events.filter((e:any)=>e.type==='node_failed').map((e:any)=>({node_id:e.nodeId,error:e.payload.error,category:e.payload.category||'graph_logic',code:e.payload.code||'GRAPH_EXECUTION',...(e.payload.field?{field:e.payload.field}:{})}));
        const passed=(step.status ? run.status === step.status : run.status !== 'failed') && assertions.every(a=>a.passed);
        const waitingNodes=(snapshot?.waiting || []).map(id=>{
          const node=project.nodes.find((n:any)=>n.id===id);
          const d=bindFlowValue(node?.data || {},{input:snapshot?.outputs[id],state:snapshot?.state,outputs:snapshot?.outputs,event:run.finalOutput?.event});
          const completed=[...run.events].reverse().find((e:any)=>e.type==='node_completed'&&e.nodeId===id);
          return {node_id:id,type:node?.type,prompt:(completed?.payload as any)?.output?.reply ?? d.prompt ?? '等待输入。',
            eventName:d.eventName || 'message',inputType:d.inputType || 'any',match:d.match || 'any',
            answers:d.answers || [],aliases:d.aliases || [],hintInputs:d.hintInputs || []};
        });
        steps.push({index,status:run.status,expected_status:step.status || 'not_failed',passed,assertions,failed_nodes:failedNodes,waiting_nodes:waitingNodes,evidence});
        if (!passed) break;
      }
      reports.push({name:test.name,passed:steps.length===test.steps.length && steps.every(s=>s.passed),steps});
    }
    return {status:reports.every(r=>r.passed)?'passed':'failed',cases:reports,model_calls:modelCalls,tool_calls:toolCalls,scope:'production_graph_engine_with_isolated_hmi_and_memory',independent_intent_review:false};
  } catch (error) {
    return {status:'failed',cases:reports,model_calls:modelCalls,tool_calls:toolCalls,issue:error instanceof Error?error.message:'执行失败',...errorDetails(error),scope:'production_graph_engine_with_isolated_hmi_and_memory',independent_intent_review:false};
  } finally { globalThis.fetch=originalFetch; }
}
