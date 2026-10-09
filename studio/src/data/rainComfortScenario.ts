import type { Node, Edge } from '@xyflow/react';

export function buildRainComfortScenario(): { name: string; nodes: Node[]; edges: Edge[]; meta: Record<string, unknown> } {
  return {
    name: '雨天自动关窗',
    meta: { scenario_id: 'rain-comfort', execution_mode: 'behavioral-simulation', goal: '下雨时关闭车窗，核对执行反馈，失败时提示具体车窗。' },
    nodes: [
      { id: 'rain-input', type: 'systemInput', position: { x: 0, y: 80 }, data: { label: '读取天气与车窗', inputType: 'weather' } },
      { id: 'rain-gate', type: 'logic', position: { x: 290, y: 80 }, data: { label: '下雨且有车窗开启？', condition: "input.weather === 'rain' && Object.values(input.windows).some(value => Number(value) > 0)" } },
      { id: 'rain-close', type: 'car_control', position: { x: 590, y: 0 }, data: { label: '关闭全部车窗', action: 'windows', parameter: 'close_all' } },
      { id: 'rain-check', type: 'logic', position: { x: 890, y: 0 }, data: { label: '检查关窗反馈', condition: 'input.action_result.success === true' } },
      { id: 'rain-success', type: 'fallback', position: { x: 1190, y: -90 }, data: { label: '提示关窗完成', responseText: '检测到下雨，全部车窗已关闭。', severity: 'info' } },
      { id: 'rain-failure', type: 'fallback', position: { x: 1190, y: 130 }, data: { label: '提示车窗故障', responseText: '部分车窗未能关闭，请检查车辆控制面板中的故障车窗。', severity: 'warning' } },
      { id: 'rain-idle', type: 'fallback', position: { x: 590, y: 240 }, data: { label: '无需关窗', responseText: '当前无需自动关窗。', severity: 'info' } },
    ],
    edges: [
      { id: 'r1', source: 'rain-input', target: 'rain-gate' },
      { id: 'r2', source: 'rain-gate', sourceHandle: 'true', target: 'rain-close' },
      { id: 'r3', source: 'rain-gate', sourceHandle: 'false', target: 'rain-idle' },
      { id: 'r4', source: 'rain-close', target: 'rain-check' },
      { id: 'r5', source: 'rain-check', sourceHandle: 'true', target: 'rain-success' },
      { id: 'r6', source: 'rain-check', sourceHandle: 'false', target: 'rain-failure' },
    ],
  };
}
