import {connectionDiagnostics} from './connectionContract';
import {repeatedWaitGraph} from './flowLoops';
import {validateExpression} from './expression';
import {isGeneralFlow} from './flowSession';
import {validateFlowNode,validateFlowGraph} from './flowContract';
import { hmiNodeRequests, validateHmiControl, isHmiValueBinding } from './hmiControls';
import { isCatalogModel, CATALOG_MODEL_PENDING } from './catalogModelNode';
import { validateInteractionPlan } from './scenarioSession';
import { validOutputFields } from './modelOutput';
import catalog from '@/data/nodeCapabilities.json';

export type CapabilityNode = { id: string; type?: string; data: Record<string, any>; parentId?: string };
type CapabilityEdge = { id?: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
type Field = { label: string; required?: boolean; enum?: (string | number | boolean)[] | null; validation?: string; min?: number; max?: number };
export type NodeCapability = { name: string; source: string; description: string; inputs: string; outputs: string; fields: Record<string, Field>; generatable: boolean };
export type NodeIssue = { nodeId?: string; message: string; severity: 'error' | 'warning' };
export const NODE_CAPABILITIES = catalog.nodes as Record<string, NodeCapability>;
export const CAPABILITY_VERSION = catalog.version;
const isAmbient = (n: CapabilityNode) => n.type === 'car_control' && n.data.executionMode === 'hmi_mock' && ['ambient_light.set','ambient_light.restore'].includes(n.data.action) && !n.data.module && !n.data.signalKey && !n.data.function;
const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
export function getNodeCapability(node: CapabilityNode): NodeCapability | undefined {
  const spec = NODE_CAPABILITIES[node.type || ''];
  if (!spec) return undefined;
  if(node.type==='tool'&&(node.data.tool_id||node.data.tool)==='mcp')return {...spec,name:'MCP 工具',source:node.data.catalogId?'已封装MCP·运行时连接':'已登记MCP真实调用·待验证',description:'调用指定服务的工具，参数可引用上游字段。首次运行按安装配方准备环境；调用失败进入失败出口，不自动重试。',inputs:'工具参数或上游字段',outputs:'工具原始内容与可选结构化数据'};
  if (node.type === 'recognition') return { ...spec, source: node.data.resultSource === 'vision' ? '解析真实模型结果·待验证' : '预设结果·仅模拟' };
  if (node.type === 'systemInput') return { ...spec, source: node.data.inputType === 'weather' ? '仿真天气与车辆状态' : '单帧图片输入·非持续监测' };
  return spec;
}
export function validateNode(node: CapabilityNode): NodeIssue[] {
  const spec = NODE_CAPABILITIES[node.type || ''];
  const issues: NodeIssue[] = [];
  const error = (message: string) => issues.push({ nodeId: node.id, severity: 'error', message });
  const d = node.data || {};
  if (isCatalogModel(d)) { error(CATALOG_MODEL_PENDING); return issues; }
  if (d.designOnly) { error(String(d.designIssue || '设计草稿尚未通过验证，不能运行。')); return issues; }
  if (!spec) { error(`节点类型「${node.type || '未指定'}」尚未实现，不能执行。`); return issues; }
  for (const [key, field] of Object.entries(spec.fields)) {
    if (field.validation === 'node') continue;
    const value = d[key];
    if (!present(value)) { if (field.required) error(`请配置${field.label}。`); continue; }
    if (field.enum && !field.enum.includes(String(value))) error(`${field.label}仅支持：${field.enum.join('、')}。`);
    if ((field.min !== undefined || field.max !== undefined) && (typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < (field.min ?? -Infinity) || Number(value) > (field.max ?? Infinity))) error(`${field.label}必须在 ${field.min}–${field.max} 范围内。`);
  }
  if (node.type === 'input' && d.inputFormat === 'json' && !validOutputFields(d.outputFields)) error('模拟事件需要声明 outputFields 字段和类型。');
  if (node.type === 'interaction') validateInteractionPlan(d.plan).forEach(error);
  if (node.type === 'llm' && ('prompt' in d || 'promptTemplate' in d)) error('模型指令使用systemPrompt字段，prompt/promptTemplate不是可执行配置。');
  if (node.type === 'llm' && d.outputFormat === 'json' && !validOutputFields(d.outputFields)) error('JSON 模式需要 outputFields 对象，例如 {summary: "string", score: "number"}；不是数组或 JSON Schema。');
  if (node.type === 'llm' && d.jsonRepairAttempts !== undefined) {
    if (!Number.isInteger(d.jsonRepairAttempts) || d.jsonRepairAttempts < 0 || d.jsonRepairAttempts > 2) error('jsonRepairAttempts必须是0–2的整数，默认0。');
    if (d.jsonRepairAttempts !== 0 && d.outputFormat !== 'json') error('JSON格式修复仅适用于outputFormat=json。');
  }
  if (node.type === 'video_display' && d.source === 'browser_stream') {
    try { const url = new URL(String(d.streamUrl || '')); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
    catch { error('请填写浏览器可播放的 HTTP(S) 视频流地址。'); }
  }
  if (node.type === 'logic') {
    const mode = d.logic_type || d.type || 'if';
    if (!['if','filter'].includes(mode)) error('当前逻辑执行器仅支持 if 和 filter，尚未实现循环或 switch。');
    if (!present(d.condition) && !present(d.script)) error('请填写判断条件；空条件不能默认为通过。');
    if (present(d.script) || present(d.condition)) {
      const code = String(d.script || d.condition);
      try { validateExpression(code); }
      catch (cause) { error(`判断条件不可执行：${cause instanceof Error ? cause.message : '请检查表达式'}`); }
    }
  }
  if(node.type==='tool'){
    if((d.tool_id||d.tool)==='mcp'){
      if(typeof d.serverId!=='string'||!d.serverId.trim()||typeof d.toolName!=='string'||!d.toolName.trim())error('MCP节点需要serverId和toolName。');
      if(d.arguments!==undefined&&(!d.arguments||Array.isArray(d.arguments)||typeof d.arguments!=='object'))error('MCP工具arguments必须为对象，可使用通用$ref字段绑定。');
      if(['url','headers','command','apiKey','endpoint','env'].some(k=>k in d))error('连接地址、凭据与进程命令只能由服务端登记。');
    }else if(!['music','nav','call_phone'].includes(String(d.tool_id||d.tool)))error('工具未接入；请使用已登记MCP或music/nav/call_phone界面仿真。');
  }
  if (node.type === 'car_control') {
    if (d.device_type && d.device_type !== 'car') error('当前工作台仅支持座舱车辆仿真。');
    let requests = null;
    try { requests = hmiNodeRequests(d); } catch (cause) { error((cause as Error).message); }
    if (requests) {
      try {
        if (d.controlOperation && !['set','get'].includes(d.controlOperation)) throw new Error('HMI 只支持读取和设置。');
        if (d.valueField) {
          if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(d.valueField) || ['constructor','prototype','__proto__'].includes(d.valueField)) throw new Error('上游字段名无效。');
          requests.forEach(r=>validateHmiControl({...r,operation:'get'}));
        } else if(d.executionMode==='hmi' && isHmiValueBinding(d.controlValue)) requests.forEach(r=>validateHmiControl({...r,operation:'get'}));
        else requests.forEach(validateHmiControl);
      } catch (cause) { error((cause as Error).message); }
    }
    else if (isAmbient(node)) {
      if (['light_color','light_brightness','light_reason','pose_tips'].some(key=>key in d)) error('氛围灯节点配置使用color/brightness/reason/poseTips；light_color/light_brightness/light_reason/pose_tips仅用于上游input.data。');
    }
    else if (d.module || d.signalKey || d.function) {
      if (d.module !== 'vehicleControl' || d.signalKey !== 'WINDOW_POSITION' || d.function !== 'set') error('当前图执行器仅接入 WINDOW_POSITION/set 车窗接口；此车辆接口尚未接入。');
      else {
        if (![0,1,2,3,4,5,6].includes(Number(d.area))) error('请选择有效车窗区域（0–6）。');
        if (!present(d.targetStatus) || !Number.isFinite(Number(d.targetStatus)) || Number(d.targetStatus) < 0 || Number(d.targetStatus) > 100) error('请设置目标开度 targetStatus（0–100）；运行状态不能作为开度。');
      }
    } else if (d.action === 'windows') {
      if (!['open_all','close_all'].includes(String(d.parameter))) error('请选择打开全部或关闭全部车窗。');
    } else if (!['windows.open_all','windows.close_all','auto','emergency.protocol','hazard_lights','hazard_lights.on'].includes(String(d.action))) error('请配置已接入的车窗动作；自动泊车等动作尚未实现。');
  }
  validateFlowNode(node).forEach(error);
  return issues;
}
export function validateGraph(nodes: CapabilityNode[], edges: CapabilityEdge[]): NodeIssue[] {
  const issues = nodes.flatMap(validateNode);
  const add = (message: string, nodeId?: string, severity: NodeIssue['severity'] = 'error') => issues.push({ message, nodeId, severity });
  const ids = new Set<string>();
  for (const n of nodes) { if (!n.id || ids.has(n.id)) add('节点 ID 缺失或重复。',n.id); ids.add(n.id); }
  const general=isGeneralFlow(nodes);
  if(general)issues.push(...validateFlowGraph(nodes,edges));
  else for(const n of nodes)if(n.type==='car_control' && n.data.executionMode==='hmi' && isHmiValueBinding(n.data.controlValue))add('动态HMI目标值需要通用流程，运行时才会解析引用。',n.id);
  const interactions=nodes.filter(n=>n.type==='interaction');
  if(!general && interactions.length>1) add('当前每个工作流支持一个持续互动节点。');
  if(!general && interactions.length && (nodes.filter(n=>['input','systemInput'].includes(n.type || '')).length!==1 || edges.some(e=> ['input','systemInput'].includes(nodes.find(n=>n.id===e.source)?.type || '') && e.target!==interactions[0].id))) add('持续互动工作流需要唯一输入并直接进入互动，不能同时启动其他分支。');
  const starts = nodes.filter(n => ['input','systemInput'].includes(n.type || ''));
  if (!starts.length) add('请添加用户输入或环境输入节点。');
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) add('连线引用了不存在的节点。', ids.has(e.source) ? e.source : undefined);
    if (e.id && edgeIds.has(e.id)) add('连线 ID 重复。', e.source);
    if (e.id) edgeIds.add(e.id);
  }
  for(const d of connectionDiagnostics(nodes,edges)) add(d.message,d.node_id);
  for (const n of nodes) {
    const outgoing = edges.filter(e => e.source === n.id && e.sourceHandle !== 'error');
    const errorEdges = edges.filter(e => e.source === n.id && e.sourceHandle === 'error');
    if (!general && (errorEdges.length > 1 || errorEdges.length && !['llm','interaction'].includes(n.type || ''))) add('错误出口仅支持模型或持续互动节点，且只能连接一个处理节点。',n.id);
    if (['llm','interaction'].includes(n.type || '') && outgoing.some(e => nodes.find(x => x.id === e.target)?.type === 'fallback')) add('模型失败反馈必须连接 error 出口，不能混在成功路径。',n.id);
    if (!general && n.type === 'interaction') {
      const incoming=edges.filter(e=>e.target===n.id);
      if(incoming.length!==1 || !['input','systemInput'].includes(nodes.find(x=>x.id===incoming[0]?.source)?.type || '')) add('持续互动需要直接连接唯一输入起点，避免每次回答重复执行上游动作。',n.id);
    }
    if (n.type === 'logic' && (n.data.logic_type || n.data.type || 'if') === 'if') {
      if (outgoing.some(e => e.sourceHandle && !['true','false'].includes(e.sourceHandle)) || outgoing.length > 1 && outgoing.some(e => !e.sourceHandle)) add('请明确连接 true（成立）或 false（不成立）出口，不能按连线顺序猜分支。',n.id);
      if (!outgoing.some(e => e.sourceHandle === 'false')) add('未连接 false 出口；条件不成立时本分支结束。',n.id,'warning');
    }
    if (n.type === 'recognition' && n.data.resultSource !== 'vision') add('当前使用预设识别结果，只能验证流程，不能证明模型识别准确。',n.id,'warning');
    if (n.type === 'recognition' && n.data.resultSource === 'vision' && !edges.some(e => e.target === n.id && nodes.find(p => p.id === e.source)?.type === 'llm')) add('视觉结果解析节点需要直接连接上游模型节点。',n.id);
  }
  const loops=repeatedWaitGraph(nodes,edges),backEdges=loops.backEdges;
  for(const [gate,region] of loops.descendants)if([...region].some(id=>nodes.find(n=>n.id===id)?.type==='interaction'))add('重复等待下游不能使用旧interaction会话；请用wait/state与模型组成多轮图。',gate);
  const reachable = new Set<string>();
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) { add('环路必须经过repeat=true的wait，并从其下游返回该等待点；自动环路尚未接入。',id); return; }
    if (reachable.has(id)) return;
    reachable.add(id);
    const next = new Set(path); next.add(id);
    for (const e of edges.filter(e => e.source === id && !backEdges.has(e))) visit(e.target,next);
  };
  starts.forEach(n => visit(n.id,new Set()));
  nodes.filter(n => n.type!=='stage' && !reachable.has(n.id)).forEach(n => add('此节点无法从输入起点到达，请连接或移除。',n.id));
  return issues;
}
