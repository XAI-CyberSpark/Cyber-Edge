export const OPENSPARX_MODEL = 'opensparx-cabin-intent:3b';

// Only model-issued, supported actions may reach the vehicle executor.
export function parseOpenSparXPlan(content: string, allowedActions: Set<string>, command: string, hasImage: boolean) {
  const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.reply !== 'string' || !parsed.reply.trim()) throw new Error('OpenSparX 返回的动作缺少有效回复');
  if (parsed.confidence !== undefined && (typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1)) throw new Error('OpenSparX 返回的置信度无效');
  if (parsed.actions !== undefined && !Array.isArray(parsed.actions)) throw new Error('OpenSparX 返回的动作列表无效');
  const actions = parsed.actions?.length ? parsed.actions : (parsed.action && parsed.action !== 'none' ? [{ name: parsed.action, parameters: parsed.parameters || {} }] : []);
  if (!actions.length && parsed.action !== 'none' && !Array.isArray(parsed.actions)) throw new Error('OpenSparX 没有给出明确的动作计划');
  for (const action of actions) {
    if (!action || !allowedActions.has(action.name) || (action.parameters !== undefined && (!action.parameters || typeof action.parameters !== 'object' || Array.isArray(action.parameters)))) throw new Error('OpenSparX 返回了当前工作流不支持的动作');
  }
  return { intent: parsed.intent || 'none', action: actions[0]?.name || 'none', actions, parameters: parsed.parameters || {}, reply: parsed.reply.trim(), text: parsed.reply.trim(), raw_command: command, has_image: hasImage, raw_model_output: content, confidence: parsed.confidence, strict_inference: true };
}
