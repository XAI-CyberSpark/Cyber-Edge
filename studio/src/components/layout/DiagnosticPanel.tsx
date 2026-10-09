import { uiLocale  } from '@/i18n';
import { uiText, useUiLanguage } from '@/i18n';
import { NavigationPanel } from './NavigationPanel';
import { useEffect, useState } from 'react';
import { RefreshCw, Activity, Plug, ChevronRight } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import type { RuntimeRunResult } from '@/domain/runtime';
import './diagnostic-panel.css';

type Kind = 'runs' | 'devices';
type Props = { kind: Kind; onClose: () => void; runs: RuntimeRunResult[]; running: boolean; projectName?: string; logs: {id: string; timestamp: string; level: string; message: string}[] };
const display = (value: unknown): string => {
  if (value == null) return '未采集';
  if (typeof value === 'string') return value.startsWith('data:image/') ? '已上传图片' : value;
  return JSON.stringify(value, (_key, item) => typeof item === 'string' && item.startsWith('data:image/') ? '[图片]' : item, 2);
};
const metric = (value: unknown, unit: string) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : '未采集';

function ModelDetails({ traces }: { traces: any[] }) {
  useUiLanguage();
  const inference = traces.find(t => t.step === 'Inference');
  const contextTrace = traces.find(t => t.step === 'Model context');
  let context: any = null;
  try { context = contextTrace ? JSON.parse(contextTrace.detail) : null; } catch { /* Legacy text traces remain visible below. */ }
  return <div className="diagnostic-model">
    <div className="diagnostic-stats"><div><small>{uiText("推理耗时")}</small><strong>{uiText(metric(inference?.durationMs == null ? null : inference.durationMs / 1000, uiText(" 秒")))}</strong></div><div><small>{uiText("总 Token")}</small><strong>{inference?.tokens ?? uiText("未采集")}</strong></div></div>
    <h4>{uiText("上下文与记忆")}</h4>
    {context ? <><p className="diagnostic-muted">{uiText("实际请求 ·")}{context.model || uiText("未记录模型")}{uiText(context.hasImage ? uiText(" · 包含图片") : '')}</p><details><summary>{uiText("系统提示词")}</summary><pre>{context.systemPrompt}</pre></details><details><summary>{uiText("本次模型输入")}</summary><pre>{context.userText}</pre></details><details><summary>{uiText("使用的记忆 ·")}{context.memories?.length || 0} {uiText("条")}</summary>{context.memories?.length ? <pre>{display(context.memories)}</pre> : <p className="diagnostic-muted">{uiText("本次请求未附带记忆条目。")}</p>}</details></> : <p className="diagnostic-muted">{uiText("本次没有记录模型请求上下文。")}</p>}
    {inference && <p className="diagnostic-muted">{inference.detail}</p>}
  </div>;
}

export function DiagnosticPanel({ kind, onClose, runs, running, projectName, logs }: Props) {
  useUiLanguage();
  const [revision, setRevision] = useState(0);
  const [system, setSystem] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sampledAt, setSampledAt] = useState('');
  useEffect(() => {
    if (kind !== 'devices') return;
    const controller = new AbortController(); let alive = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setLoading(true); setErrors({}); setSystem(null); setModels([]); setSampledAt('');
    const request = async (key: string, path: string, apply: (data: any) => void) => {
      try { const response = await fetch(apiUrl(path), { signal: controller.signal }); if (!response.ok) throw new Error(`请求失败（${response.status}）`); const data = await response.json(); if (alive) apply(data); }
      catch (error) { if (alive) setErrors(old => ({ ...old, [key]: controller.signal.aborted ? '连接超时，请重试' : error instanceof Error ? error.message : '连接失败' })); }
    };
    void Promise.all([request('system', '/v1/system/status', data => { if (!data?.telemetry) throw new Error('资源响应格式异常'); setSystem(data); }), request('models', '/v1/models', data => { const rows = Array.isArray(data) ? data : data.models; if (!Array.isArray(rows)) throw new Error('模型目录格式异常'); setModels(rows); })]).finally(() => { clearTimeout(timeout); if (alive) { setLoading(false); setSampledAt(new Date().toLocaleTimeString(uiLocale())); } });
    return () => { alive = false; controller.abort(); clearTimeout(timeout); };
  }, [kind, revision]);
  const telemetry = system?.telemetry;
  // Older backends mix mock telemetry: only display metrics from the explicit measured contract.
  const measured = telemetry?.source === 'psutil' || telemetry?.source === 'psutil+jtop';
  return <NavigationPanel id={kind} title={uiText(kind === 'runs' ? uiText("运行记录") : uiText("设备连接"))} description={uiText(projectName || uiText("当前项目"))} icon={kind === 'runs' ? Activity : Plug} onClose={onClose} closeLabel={uiText("关闭诊断面板")} className={`diagnostic-panel diagnostic-panel--${kind}`}>
    <div className={`diagnostic-body diagnostic-body--${kind}`}>
      {kind === 'runs' ? <>
        <p className="diagnostic-muted">{uiText("当前项目 · 本次会话最近 20 次运行 · 切换项目后保留，刷新页面后清空")}</p>
        {running && <p role="status" className="diagnostic-notice">{uiText("工作流正在运行，完成后显示完整记录。")}</p>}
        {!runs.length && <div className="diagnostic-empty"><Activity size={28} /><h3>{uiText("还没有运行记录")}</h3><p>{uiText("在仿真页提交一次输入，运行结果会出现在这里。")}</p></div>}
        {runs.map(run => <details key={run.runId} className="diagnostic-run"><summary><span className={`diagnostic-status ${run.status}`}>{uiText(({completed:uiText("完成"),failed:uiText("未完成"),waiting:uiText("等待输入"),paused:uiText("已暂停")})[run.status])}</span><span>{uiText(new Date(run.startedAt).toLocaleTimeString(uiLocale()))}</span><span className="diagnostic-muted">{uiText(metric((run.finishedAt - run.startedAt) / 1000, uiText(" 秒")))}</span><ChevronRight size={15} /></summary><div className="diagnostic-run-body"><p className="diagnostic-muted">{uiText("运行")}{uiText(run.runId)} {uiText("· 仿真工作流")}</p>{run.events.filter(e => e.type === 'node_failed' && e.payload.phase === 'preflight').map(e => <p role="alert" key={e.id}>{uiText(e.nodeId || uiText("工作流"))}：{uiText(String(e.payload.error))}</p>)}<details><summary>{uiText("输入摘要")}</summary><pre>{display(run.input)}</pre></details>
          <ol className="diagnostic-timeline">{run.events.filter(e => e.type === 'node_started').map((event, i) => {
            const next = run.events.find(e => e.sequence > event.sequence && e.type === 'node_started' && e.nodeId === event.nodeId);
            const terminal = run.events.find(e => e.sequence > event.sequence && (!next || e.sequence < next.sequence) && e.nodeId === event.nodeId && (e.type === 'node_completed' || e.type === 'node_failed'));
            const diagnostics = run.events.filter(e => e.sequence > event.sequence && (!next || e.sequence < next.sequence) && e.nodeId === event.nodeId && e.type === 'node_diagnostic');
            const traces = [...diagnostics.flatMap(e => Array.isArray(e.payload.trace) ? e.payload.trace : []), ...(Array.isArray(terminal?.payload.trace) ? terminal.payload.trace : [])];
            return <li key={event.id}><details><summary><span>{uiText(i + 1)}. {uiText(String(event.payload.label || event.nodeId))}</span><small>{uiText(terminal ? terminal.type === 'node_failed' ? uiText("失败") : uiText("完成") : uiText("未完成"))} · {uiText(terminal ? metric((terminal.timestamp - event.timestamp) / 1000, uiText(" 秒")) : '—')}</small></summary>{terminal?.payload.error != null && <p role="alert">{uiText(String(terminal.payload.error))}</p>}{event.payload.capability != null && <p className="diagnostic-muted">{uiText("能力来源：")}{uiText(String((event.payload.capability as { source: string }).source))}</p>}<details><summary>{uiText("节点输入")}</summary><pre>{display(event.payload.input)}</pre></details>{event.payload.nodeType === 'llm' && <ModelDetails traces={traces} />}<details><summary>{uiText("节点输出")}</summary><pre>{display(terminal?.payload.output)}</pre></details></details></li>;
          })}</ol>
        </div></details>)}
        {!!logs.length && <details className="diagnostic-card"><summary>{uiText("系统消息")}<small>{uiText("初始化与仿真事件")}</small></summary>{logs.slice(0, 20).map(log => <p className="diagnostic-log" key={log.id}><time>{uiText(log.timestamp)}</time><span>{uiText(log.message)}</span></p>)}</details>}
      </> : <>
        <div className="diagnostic-toolbar"><p className="diagnostic-muted">{uiText(loading ? uiText("正在检查服务…") : sampledAt ? uiText("最近检查 {0}", [sampledAt]) : uiText("尚未检查"))}</p><button disabled={loading} aria-label={uiText("刷新连接状态")} onClick={() => setRevision(n => n + 1)}><RefreshCw size={16} /></button></div>
        <section className="diagnostic-card"><h3>{uiText("本地后端")}</h3>{errors.system ? <p role="alert">{uiText(errors.system)}</p> : <p>{uiText(loading ? uiText("正在连接") : system ? uiText("已响应") : uiText("未连接"))}{system && <small> · {system.device?.device_id || uiText("当前主机")}</small>}</p>}<details><summary>{uiText("资源详情")}</summary><p className="diagnostic-muted">{uiText("后端所在主机 ·")}{measured ? telemetry.source : uiText("尚未取得可靠采样")}</p><div className="diagnostic-stats"><div><small>CPU</small><strong>{uiText(metric(measured ? telemetry.cpu_usage : null, '%'))}</strong></div><div><small>{uiText("RAM 使用率")}</small><strong>{uiText(metric(measured ? telemetry.memory_usage : null, '%'))}</strong></div><div><small>GPU</small><strong>{uiText(metric(measured ? telemetry.gpu_usage : null, '%'))}</strong></div></div><p>{uiText("物理内存容量：")}{uiText(metric(measured && telemetry.memory_total_bytes != null ? telemetry.memory_total_bytes / 1024 ** 3 : null, ' GB'))}</p></details></section>
        <section className="diagnostic-card"><h3>{uiText("模型服务")}</h3><p className="diagnostic-muted">{uiText("目录返回只表示已注册；推理是否成功请查看运行记录。")}</p>{errors.models && <p role="alert">{uiText(errors.models)}</p>}{models.map(model => <div className="diagnostic-device" key={model.id}><span>{model.name || model.id}<small>{model.id}</small></span><span>{uiText("已注册")}</span></div>)}{!loading && !errors.models && !models.length && <p>{uiText("暂无已注册模型")}</p>}</section>
        <section className="diagnostic-card"><h3>{uiText("输入与车辆接口")}</h3><div className="diagnostic-device"><span>{uiText("座舱图片")}<small>{uiText("当前支持手动上传图片")}</small></span><span>{uiText("手动输入")}</span></div><div className="diagnostic-device"><span>{uiText("摄像头实时流")}</span><span>{uiText("未接入")}</span></div><div className="diagnostic-device"><span>{uiText("麦克风语音输入")}<small>{uiText("本地识别，使用时请求麦克风授权")}</small></span><span>{uiText("按需启用")}</span></div><div className="diagnostic-device"><span>{uiText("车辆控制")}<small>{uiText("HMI 仿真执行器，非真实车辆连接")}</small></span><span>{uiText("仿真")}</span></div></section>
      </>}
    </div>
  </NavigationPanel>;
}
