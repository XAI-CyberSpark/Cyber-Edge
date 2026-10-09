import type { Capability } from './capabilityPresentation';

const builtinGroups: Record<string, string> = {
  input: '输入与输出', output: '输入与输出', systemInput: '传感器输入',
  logic: '条件与分支', fallback: '异常与兜底', memory: '上下文与记忆',
  recognition: '结果解析', data: '数据处理', tool: '工具调用', openclaw: '工具调用',
  event_log: '运行记录', interaction: '持续互动', car_control: '车辆控制',
  cockpit_alert: '提醒与反馈', video_display: '影像展示', risk_monitor: '风险监测',
};
const order = ['车辆状态', '车控动作', '座舱交互', '编排基础', '待分类'];

/** Presentation hierarchy only: never rewrite imported classifications or execution data. */
export function groupCapabilities<T extends Capability & { nodeType?: string; origin?: string }>(items: T[]) {
  const categories = new Map<string, Map<string, T[]>>();
  for (const item of items) {
    const category = item.category?.trim() || '待分类';
    const group = item.source_category?.trim() || item.source_group?.trim()
      || (item.origin === 'builtin' && item.nodeType ? builtinGroups[item.nodeType] : '') || '待分类';
    if (!categories.has(category)) categories.set(category, new Map());
    const groups = categories.get(category)!;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  const rank = (name: string) => order.includes(name) ? order.indexOf(name) : order.length;
  return [...categories].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'zh-CN')).map(([name, groups]) => ({
    name, count: [...groups.values()].reduce((total, rows) => total + rows.length, 0),
    groups: [...groups].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([name, items]) => ({ name, items })),
  }));
}
