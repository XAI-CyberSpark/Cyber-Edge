import { uiText, useUiLanguage  } from '@/i18n';
import { simulationReport } from '@/domain/simulationReport';
import { SimulationRunReport } from './SimulationRunReport';
import { useSimulationChat } from './SimulationChatSession';
import { AppIcon } from '@/components/ui/AppIcon';
import { prepareImage, IMAGE_UPLOAD_ACCEPT } from '@/lib/prepareImage';
import type { NodeIssue } from '@/domain/nodeCapabilities';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { X, MessageSquare, Trash2 } from 'lucide-react';
import type { RuntimeRunResult } from '@/domain/runtime';
import './simulation-input.css';
import type { ReplayFrame } from '@/domain/videoReplay';

type SimulationInput = string | { type: 'image'; content: string; text?: string; replay?: ReplayFrame };
export function SimulationInputPanel({ visible = true, sessionKey, onRun, running, workflowName, requiresImage = false, issues = [], onInspectNode, samples = [], generalFlow=false, flowEvents=[] }: { visible?: boolean; generalFlow?:boolean; flowEvents?:{id:string;label:string;name:string}[]; sessionKey?: string; samples?: { label: string; input: string }[]; issues?: NodeIssue[]; onInspectNode?: (id: string) => void; supportsVideoReplay?: boolean; onRun: (input: SimulationInput, signal?: AbortSignal) => Promise<RuntimeRunResult>; running: boolean; workflowName?: string; requiresImage?: boolean }) {
  useUiLanguage();
  const { text, setText, attachment, setAttachment, entries, setEntries } = useSimulationChat(sessionKey);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { if (!pending) return; const start = Date.now(); setElapsed(0); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)), 1000); return () => window.clearInterval(timer); }, [pending]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const sequence = useRef(Math.max(0, ...entries.map(entry => entry.id)));
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
      if (lock.current) setEntries(old => [...old, { id: ++sequence.current, role: 'assistant', text: generalFlow ? '已离开本次仿真。请返回后查看进度与中断提示，再继续操作。' : '已离开本次仿真，正在处理的请求已中止。可重新发送继续测试。' }]);
    };
  }, [setEntries]);
  useEffect(() => { if (visible) bottom.current?.scrollIntoView({ block: 'nearest' }); }, [entries, pending, visible]);
  const busy = running || pending || reading;
  const blocked = issues.some(issue => issue.severity === 'error');
  const upload = async (selected?: File) => {
    if (!selected) return;
    setError('');
    setReading(true);
    try {
      const image = await prepareImage(selected);
      if (alive.current) setAttachment(image);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '读取失败'); }
    finally { if (alive.current) setReading(false); }
  };
  const send = async (override?:string, displayLabel?:string) => {
    if (blocked) { setError('请先修正节点配置，再运行场景。'); return; }
    if (busy || lock.current || (!override && !text.trim() && !attachment)) return;
    lock.current = true; setPending(true); setError('');
    const prompt = override || text.trim();
    const input: SimulationInput = attachment && !override ? { type: 'image', content: attachment.url, ...(prompt ? { text: prompt } : {}) } : prompt;
    setEntries(old => [...old, { id: ++sequence.current, role: 'user', text: displayLabel || prompt, image: override ? undefined : attachment?.url }]);
    setText(''); setAttachment(null);
    try {
      if (requiresImage && !generalFlow && typeof input === 'string') {
        setEntries(old => [...old, { id: ++sequence.current, role: 'assistant', text: '缺少测试图片，请上传后排照片再运行。' }]);
        return;
      }
      const controller = new AbortController(); request.current = controller;
      const result = await onRun(input, controller.signal);
      if (alive.current) setEntries(old => [...old, { id: ++sequence.current, role: 'assistant', ...(controller.signal.aborted ? { text: '本次执行已取消。' } : { text: '', report: simulationReport(result) }) }]);
    } catch (cause) {
      if (alive.current) setEntries(old => [...old, { id: ++sequence.current, role: 'assistant', text: request.current?.signal.aborted ? '本次执行已取消。' : cause instanceof Error ? cause.message : '执行失败，请重试。' }]);
    } finally { lock.current = false; request.current = null; if (alive.current) setPending(false); }
  };
  return <aside className="simulation-input" aria-label={uiText("链路验证面板")}>
    <header><div><h2 title={workflowName?.trim() || uiText("未命名工作流")}>{workflowName?.trim() || uiText("未命名工作流")}</h2><p>{uiText("链路验证 · 模型性能")}</p></div><button aria-label={uiText("清空仿真对话")} disabled={busy} onClick={() => setEntries([])}><Trash2 size={16} /></button></header>
    {blocked && <details className="px-4 py-2 border-b type-body max-h-48 overflow-y-auto shrink-0" open={blocked || undefined}>
      <summary className="cursor-pointer py-2">{uiText(blocked ? uiText("运行前检查：{0} 项待修正", [issues.filter(i => i.severity === 'error').length]) : uiText("结构检查通过 · 服务与业务待运行验证"))}</summary>
      <p className="py-1 text-muted-foreground">{uiText("当前为座舱行为仿真，不代表真实车辆测试。")}</p>
      {issues.map((issue,i) => <p key={i} className="py-1">{uiText(issue.severity === 'error' ? uiText("待修正：") : uiText("提示："))}{uiText(issue.message)}{issue.nodeId && onInspectNode && <button type="button" className="underline ml-2 min-h-10" onClick={() => onInspectNode(issue.nodeId!)}>{uiText("定位节点")}{uiText(issue.nodeId)}</button>}</p>)}
    </details>}
    <div className="simulation-messages" role="log" aria-label={uiText("链路验证记录")} aria-live="polite">
      {!entries.length && <div className="simulation-empty"><MessageSquare size={27} /><p>{uiText(requiresImage ? uiText("上传后排照片，验证识别与 HMI 响应") : uiText("输入测试数据，查看链路结果与模型耗时"))}</p></div>}
      {entries.map(entry => <article key={entry.id} className={`simulation-entry ${entry.role}`}>{entry.image && <img src={entry.image} alt={uiText("上传的图片")} />}{entry.text && <p>{entry.text}</p>}{entry.report && <SimulationRunReport report={entry.report} />}{entry.details && <details><summary>{uiText("查看详情")}</summary>{entry.details.map((detail, i) => <p key={i}>{uiText(detail)}</p>)}</details>}</article>)}
      {pending && <p role="status" className="simulation-pending">{uiText("正在运行链路…")}{uiText(elapsed)} {uiText("秒")}</p>}<div ref={bottom} />
    </div>
    {samples.length > 0 && <div className="simulation-samples type-caption"><p>{uiText("模拟识别结果 · 点击填入，再发送运行")}</p><div>{samples.map(sample => <button type="button" className="type-label" key={sample.label} disabled={busy} onClick={() => setText(sample.input)}>{uiText(sample.label)}</button>)}</div></div>}
    {generalFlow && <div className="px-3 py-2 space-y-2 type-caption" aria-label={uiText("流程事件与控制")}>
      <div className="flex flex-wrap gap-2">{[['pause',uiText("暂停")],['resume',uiText("继续")],['stop',uiText("结束")],['restart',uiText("重新开始")],['retry',uiText("重试失败节点")]].map(([control,label])=><button type="button" className="min-h-10 px-2 border rounded-md type-label" disabled={busy} key={control} onClick={()=>void send(JSON.stringify({$event:{control}}),label)}>{uiText(label)}</button>)}</div>
      {flowEvents.filter(e=>e.name!=='message').map(e=><button key={e.id} type="button" className="min-h-10 px-2 mr-2 border rounded-md type-label" disabled={busy} onClick={()=>void send(JSON.stringify({$event:{name:e.name,target:e.id}}),`模拟：${e.label}`)}>{uiText("模拟：")}{uiText(e.label)}</button>)}
    </div>}
    <form className="simulation-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {attachment && <div className="simulation-attachment"><img src={attachment.url} alt={uiText("待发送图片")} /><span>{attachment.name}</span><button type="button" aria-label={uiText("移除图片")} disabled={busy} onClick={() => setAttachment(null)}><X size={15} /></button></div>}
      <div className="simulation-input-bar">
      <button type="button" aria-label={uiText("上传图片")} title={uiText("上传照片")} disabled={busy} onClick={() => file.current?.click()}><AppIcon name={reading ? 'loader-circle' : 'paperclip'} spinning={reading} size={19} /></button>
      <textarea rows={1} aria-label={uiText("场景测试输入")} placeholder={uiText("输入测试数据…")} value={text} disabled={busy} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <button className="simulation-compact-send" type="submit" aria-label={uiText(pending ? uiText("取消本次运行") : uiText("发送"))} title={uiText(pending ? uiText("取消本次运行") : uiText("发送"))} onClick={event => { if (pending) { event.preventDefault(); request.current?.abort(); } }} disabled={!pending && (busy || (!text.trim() && !attachment))}><AppIcon name={pending ? 'square' : 'send'} size={17} /></button>
      </div>
      <input ref={file} type="file" aria-label={uiText("上传图片")} accept={IMAGE_UPLOAD_ACCEPT} hidden disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />

      {error && <p role="alert">{uiText(error)}</p>}
    </form>
  </aside>;
}

// Mode changes hide the view without ending the active workflow's request.
// The workflow key/unmount still owns cancellation when that scene is left.
export function SimulationInputSurface(props: ComponentProps<typeof SimulationInputPanel> & { visible: boolean }) {
  useUiLanguage();
  return <div className="w-[340px] xl:w-[370px] shrink-0 h-full" style={{ display: props.visible ? undefined : 'none' }}>
    <SimulationInputPanel {...props} />
  </div>;
}
