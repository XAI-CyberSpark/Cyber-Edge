import { WINDOW_KEYS, WINDOW_NAMES, type VehicleWorld, type VehicleState, type WindowKey } from './vehicleWorld';

export type AssistantPlan =
  | { kind: 'reply'; text: string }
  | { kind: 'clarify'; text: string }
  | { kind: 'climate'; temperature: number; on: boolean }
  | { kind: 'windows'; targets: Partial<Record<WindowKey, number>> };

/** Entire plan is validated before a card can offer an executable action. */
export function parseAssistantPlan(raw: string): AssistantPlan {
  const p = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('模型返回的界面描述无效，本次没有执行操作。');
  if (p.kind === 'reply' || p.kind === 'clarify') {
    if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > 6000) throw new Error('模型回复为空或过长，请重试。');
    return { kind: p.kind, text: p.text.trim() };
  }
  if (p.kind === 'climate' && typeof p.on === 'boolean' && typeof p.temperature === 'number' && Number.isFinite(p.temperature) && p.temperature >= 16 && p.temperature <= 30) {
    return { kind: 'climate', temperature: Math.round(p.temperature * 2) / 2, on: p.on };
  }
  if (p.kind === 'windows' && p.targets && typeof p.targets === 'object' && !Array.isArray(p.targets)) {
    const entries = Object.entries(p.targets);
    if (entries.length && entries.every(([key, value]) => WINDOW_KEYS.includes(key as WindowKey) && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)) {
      return { kind: 'windows', targets: Object.fromEntries(entries.map(([key, value]) => [key, Math.round(value as number)])) };
    }
  }
  throw new Error('模型提出了不支持的操作或参数，本次没有执行。请换一种说法重试。');
}

export function planLabel(plan: AssistantPlan): string {
  if (plan.kind === 'climate') return plan.on ? `将空调设为 ${plan.temperature}°C` : '关闭空调';
  if (plan.kind === 'windows') return Object.entries(plan.targets).map(([key, value]) => `${WINDOW_NAMES[key as WindowKey]} ${value === 0 ? '关闭' : value === 100 ? '打开' : `开至 ${value}%`}`).join('，');
  return plan.text;
}

export async function executeAssistantPlan(plan: AssistantPlan, world: VehicleWorld): Promise<{ success: boolean; text: string }> {
  if (world.getSnapshot().moving) throw new Error('车窗正在执行其他操作，请稍后再试。');
  if (plan.kind === 'windows') {
    const result = await world.moveWindows(plan.targets, 'manual');
    if (!result.success) return { success: false, text: `车窗操作未完成：${result.failedWindows.map(k => WINDOW_NAMES[k]).join('、') || '执行被取消或已有操作进行中'}。请检查实际开度。` };
    return { success: true, text: `已完成：${Object.keys(plan.targets).map(k => `${WINDOW_NAMES[k as WindowKey]} ${world.getSnapshot().car.windows[k as WindowKey]}%`).join('，')}` };
  }
  if (plan.kind === 'climate') {
    world.setCar(car => ({ ...car, ac: { ...car.ac, on: plan.on, temp: plan.temperature } }));
    const ac = world.getSnapshot().car.ac;
    return { success: true, text: ac.on ? `空调已设为 ${ac.temp}°C。` : '空调已关闭。' };
  }
  throw new Error('这张卡片没有可执行的车辆操作。');
}

export function assistantSystemPrompt(car: VehicleState) {
  return `你是一个 JSON 接口。把用户请求转换为 JSON，不要直接回复或执行。车窗fl左前/fr右前/rl左后/rr右后，0关闭100打开。空调16到30度。普通问题用kind=reply和text回答。对象不明确用kind=clarify和text追问。只支持车窗、空调和问答，其他操作说明未接入。车控只提出建议，禁止声称已经执行。前面五轮是格式示例，不是用户历史。后续会话才是用户历史，没有实际上下文的“再低一点”必须追问。当前实际状态：${JSON.stringify({windows:car.windows,ac:car.ac})}`;
}

export function assistantMessages(car: VehicleState, history: {role: string; text: string}[], prompt: string) {
  return [{role:'system',content:assistantSystemPrompt(car)},
    {role:'user',content:'你好'}, {role:'assistant',content:'{"kind":"reply","text":"你好，有什么可以帮你？"}'},
    {role:'user',content:'空调调到24度'}, {role:'assistant',content:'{"kind":"climate","temperature":24,"on":true}'},
    {role:'user',content:'关闭右后车窗'}, {role:'assistant',content:'{"kind":"windows","targets":{"rr":0}}'},
    {role:'user',content:'打开左前车窗'}, {role:'assistant',content:'{"kind":"windows","targets":{"fl":100}}'},
    {role:'user',content:'打开一点'}, {role:'assistant',content:'{"kind":"clarify","text":"你想调节什么？请说明设备、位置和目标。"}'},
    ...history.slice(-10).map(turn=>({role:turn.role,content:turn.role==='assistant' ? JSON.stringify({kind:'reply',text:turn.text}) : turn.text})),
    {role:'user',content:prompt+'\n请按示例格式，只输出JSON。'}];
}

/** Ambiguous targets must not become executable cards, even if the model guesses. */
export function groundAssistantPlan(plan: AssistantPlan, prompt: string, history: {role:string; text:string}[]): AssistantPlan {
  if (plan.kind === 'reply' || plan.kind === 'clarify') return plan;
  const prior = history.filter(t => t.role === 'user').at(-1)?.text || '';
  const context = /再|继续|还是|刚才/.test(prompt) ? prior + ' ' + prompt : prompt;
  if (plan.kind === 'climate') {
    if (!/空调|温度|度|热|冷/.test(context)) return {kind:'clarify',text:'你想调节什么？请说明空调温度或具体车窗。'};
    return plan;
  }
  const names: Record<WindowKey,RegExp> = {fl:/左前|主驾/,fr:/右前|副驾/,rl:/左后/,rr:/右后/};
  const all = /全部|所有|四个|四扇/.test(context) && /窗/.test(context);
  const keys = Object.keys(plan.targets) as WindowKey[];
  if (!all && keys.some(k=>!names[k].test(context))) return {kind:'clarify',text:'你想调节哪一扇车窗？请说明左前、右前、左后、右后，或全部车窗。'};
  if (!/\d+\s*%|百分之/.test(prompt) && /打开|全开/.test(prompt) && Object.values(plan.targets).some(v=>v !== 100)) return {kind:'clarify',text:'请确认希望打开的程度，例如“右后车窗开至 50%”或“完全打开右后车窗”。'};
  return plan;
}
