import type { RuntimeRunResult } from './runtime';

export interface SimulationReport {
  runId: string;
  status: RuntimeRunResult['status'];
  durationMs: number | null;
  completed: number;
  failed: number;
  nodes: { id: string; label: string; status: 'completed' | 'failed' | 'running'; durationMs: number | null; error?: string }[];
  models: { node: string; model: string; durationMs: number | null; tokens: number | null }[];
  observations: string[];
  hmi: string[];
}
const measured = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export const formatDuration = (ms: number | null) => ms === null ? '未采集' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
export function simulationReport(result: RuntimeRunResult): SimulationReport {
  const nodes: SimulationReport['nodes'] = [], models: SimulationReport['models'] = [];
  const starts = new Map<string, { index: number; time: number }>();
  const observations = new Set<string>(), hmi = new Set<string>();
  for (const e of result.events) {
    const id = e.nodeId || '未关联节点';
    if (e.type === 'node_started') {
      starts.set(id, { index: nodes.length, time: e.timestamp });
      nodes.push({ id, label: String(e.payload.label || id), status: 'running', durationMs: null });
    }
    if (e.type === 'node_completed' || e.type === 'node_failed') {
      const start = starts.get(id);
      const row = start ? nodes[start.index] : { id, label: id, status: 'running' as const, durationMs: null };
      if (!start) nodes.push(row);
      row.status = e.type === 'node_failed' ? 'failed' : 'completed';
      row.durationMs = start ? measured(e.timestamp - start.time) : null;
      if (e.type === 'node_failed') row.error = String(e.payload.error || '执行失败');
      starts.delete(id);
      const output = e.payload.output as Record<string, unknown> | undefined;
      const recognition = output?.recognition as Record<string, unknown> | undefined;
      if (recognition && typeof recognition.status === 'string') {
        const status = ({ risk: '风险', normal: '未识别到风险', unknown: '无法判断' } as Record<string, string>)[recognition.status] || recognition.status;
        const confidence = measured(recognition.confidence ?? output?.confidence);
        observations.add(`识别结果：${status}${confidence !== null && confidence <= 1 ? ` · 模型自评分（未校准） ${(confidence * 100).toFixed(1)}%` : ''}`);
      }
      if (output?.result_source === 'simulation-preset') observations.add('识别来源：模拟预设，非真实模型识别');
      if (output?.video_display === 'opened') observations.add(`后排画面：已打开${output.video_source === 'local_replay' ? '（演示回放）' : ''}`);
      for (const t of Array.isArray(e.payload.trace) ? e.payload.trace : []) {
        if (t.step === 'Inference') models.push({ node: row.label, model: typeof t.model === 'string' ? t.model : '未返回模型名称', durationMs: measured(t.durationMs), tokens: measured(t.tokens) });
        if (typeof t.step === 'string' && t.step.includes('(Fallback)')) observations.add('使用了规则回退，非真实模型推理结果');
      }
    }
    if (e.type === 'simulator_command' && e.payload.category === 'hmi' && e.payload.key === 'message' && typeof e.payload.value === 'string' && e.payload.value.trim()) hmi.add(e.payload.value);
  }
  return { runId: result.runId, status: result.status,
    durationMs: Number.isFinite(result.startedAt) && Number.isFinite(result.finishedAt) ? measured(result.finishedAt - result.startedAt) : null,
    completed: nodes.filter(n => n.status === 'completed').length, failed: nodes.filter(n => n.status === 'failed').length,
    nodes, models, observations: [...observations], hmi: [...hmi] };
}
