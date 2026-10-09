import { uiText, useUiLanguage  } from '@/i18n';
import { useHmiSpeech } from '@/hooks/useHmiSpeech';
import { AppIcon } from '@/components/ui/AppIcon';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Wind, Car, Check, X } from 'lucide-react';
import type { VehicleWorld, VehicleWorldSnapshot } from '@/domain/vehicleWorld';
import type { HMIState } from './VehicleSimulator';
import { OPENSPARX_MODEL } from '@/domain/opensparx';
import { modelTestResponse } from '@/domain/modelTest';
import { apiUrl } from '@/lib/api';
import { assistantMessages, groundAssistantPlan, executeAssistantPlan, parseAssistantPlan, planLabel, type AssistantPlan } from '@/domain/cockpitAssistant';
import { HmiAssistantAvatar } from '@/components/avatar/HmiAssistantAvatar';
import './cockpit-assistant.css';
import { useVoiceInput } from '@/hooks/useVoiceInput';

type Entry = { id: number; role: 'user' | 'assistant'; text: string; plan?: AssistantPlan; state?: 'ready' | 'executing' | 'done' | 'failed' | 'dismissed'; error?: boolean };
export function CockpitAssistant({ world, snapshot, hmi, running = false, active = true }: { active?: boolean; world: VehicleWorld; snapshot: VehicleWorldSnapshot; hmi: HMIState; running?: boolean }) {
  useUiLanguage();
  const speech = useHmiSpeech(hmi.speechRequest, active);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [voicePrompt, setVoicePrompt] = useState('');
  const liveText = useRef<HTMLSpanElement>(null);
  const [pending, setPending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [dismissedScene, setDismissedScene] = useState('');
  const [sceneExpanded, setSceneExpanded] = useState(false);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const executeLock = useRef(false);
  const sequence = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const replyDismissed = useRef(false);
  const voice = useVoiceInput(transcript => {
    setVoicePrompt(transcript);
    void send(transcript);
  });
  useEffect(() => { if (liveText.current) liveText.current.scrollTop = liveText.current.scrollHeight; }, [voice.transcript]);
  const normalScene = hmi.message && hmi.message !== 'System Ready' && hmi.message !== '你好，今天想去哪里？';
  const sceneText = hmi.careSummary || (normalScene ? hmi.message : '');
  const warning = hmi.alert === 'warning';
  // Ignore image frame changes: a repeated observation updates one surface, not a stack of alerts.
  const sceneKey = sceneText ? `${warning}:${sceneText}` : '';
  const hasScene = !!sceneKey;
  const sceneVisible = hasScene && (sceneKey !== dismissedScene || sceneExpanded);
  // Outside interaction collapses the presentation, never deletes a conversation
  // or accepts/cancels a vehicle suggestion. Let the target receive its click.
  useEffect(() => {
    if (!open && !sceneVisible && !pending) return;
    const dismiss = (event: PointerEvent) => {
      if (event.button !== 0 || !surface.current || event.composedPath().includes(surface.current)) return;
      if (request.current) replyDismissed.current = true;
      setOpen(false);
      if (sceneVisible) { setDismissedScene(sceneKey); setSceneExpanded(false); }
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [open, sceneVisible, sceneKey, pending]);
  const busy = running || executing || snapshot.moving;
  const avatarState = sceneVisible && warning ? 'alert'
    : pending || executing || voice.phase === 'transcribing' || hmi.agentStatus === 'processing' ? 'thinking'
    : voice.phase === 'recording' ? 'wide' : sceneVisible ? 'notify' : 'idle';
  useEffect(() => { if ((busy || pending) && voice.active) voice.cancel(); }, [busy, pending, voice.active, voice.cancel]);
  useEffect(() => { setDismissedScene(''); setSceneExpanded(false); }, [sceneKey]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [entries, pending, open]);
  const updateEntry = (id: number, change: Partial<Entry>) => { if (alive.current) setEntries(old => old.map(e => e.id === id ? { ...e, ...change } : e)); };
  const send = async (utterance: string) => {
    const prompt = utterance.trim();
    if (request.current || pending || busy || !prompt) return;
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 90000);
    replyDismissed.current = false;
    setPending(true);
    setEntries(old => [...old.slice(-19), { id: ++sequence.current, role: 'user', text: prompt }]);
    try {
      const response = await fetch(apiUrl('/v1/inference/chat/completions'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model: OPENSPARX_MODEL, temperature: 0.1, max_tokens: 512, json_mode: true,
          messages: assistantMessages(world.getSnapshot().car, entries, prompt) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `模型服务暂不可用（${response.status}）`);
      const raw = modelTestResponse(data, OPENSPARX_MODEL).content;
      let plan: AssistantPlan;
      try { plan = groundAssistantPlan(parseAssistantPlan(raw), prompt, entries); } catch { throw new Error('模型未返回有效的车机回复，本次没有执行操作。你可以重试，或使用底部车辆控制。'); }
      if (alive.current) { setEntries(old => [...old, { id: ++sequence.current, role: 'assistant', text: planLabel(plan), plan, state: 'ready' }]); speech.speak(planLabel(plan)); }
    } catch (cause) {
      if (alive.current) setEntries(old => [...old, { id: ++sequence.current, role: 'assistant', text: controller.signal.aborted ? '等待模型超时，请重试。基础车辆控制仍可使用。' : cause instanceof Error ? cause.message : '本次请求失败，请重试。', error: true }]);
    } finally { clearTimeout(timer); request.current = null; if (alive.current) { setPending(false); if (!replyDismissed.current) setOpen(true); } }
  };
  const confirm = async (entry: Entry) => {
    if (executeLock.current || busy || pending || entry.state !== 'ready' || !entry.plan) return;
    executeLock.current = true; setExecuting(true); updateEntry(entry.id, { state: 'executing' });
    try { const result = await executeAssistantPlan(entry.plan, world); updateEntry(entry.id, { state: result.success ? 'done' : 'failed', text: result.text, error: !result.success }); speech.speak(result.text); }
    catch (cause) { updateEntry(entry.id, { state: 'failed', error: true, text: cause instanceof Error ? cause.message : '执行失败' }); }
    finally { executeLock.current = false; if (alive.current) setExecuting(false); }
  };
  const closeConversation = () => {
    if (request.current) replyDismissed.current = true;
    speech.stop(); voice.cancel(); setOpen(false);
    toggle.current?.focus({ preventScroll: true });
  };
  const startVoice = () => { speech.stop(); setOpen(false); void voice.start(); };
  const headerStatus = pending || executing ? '正在处理…' : busy ? '请稍候' : '点击麦克风继续';
  const barText = voice.active
    ? voice.transcript || (voice.phase === 'requesting' ? '正在打开麦克风…' : voice.phase === 'recording' ? '正在聆听…' : '正在识别…')
    : pending && voicePrompt ? voicePrompt : '';
  return <div ref={surface} className={`cockpit-assistant ${open ? 'is-open' : ''} ${sceneVisible ? 'has-scene' : ''}`} aria-label={uiText("顶部车机助手")} onKeyDown={event => {
    if (event.key === 'Escape' && (open || voice.active || voice.error) && !event.nativeEvent.isComposing) {
      event.stopPropagation(); closeConversation();
    }
  }}>
    <div className="ca-topline">
      {open && <button type="button" className="ca-close" aria-label={uiText("关闭语音对话")} onClick={closeConversation}><X size={20} /></button>}
      <button ref={toggle} className="ca-toggle" aria-expanded={open} aria-controls="cockpit-assistant-body" onClick={() => { if (open && request.current) replyDismissed.current = true; voice.cancel(); setOpen(!open && (entries.length > 0 || pending)); }}><HmiAssistantAvatar state={avatarState} /><span className={barText ? "ca-live-copy" : undefined}>{barText ? <span ref={liveText} className="ca-live-text" title={uiText(barText)}>{uiText(barText)}</span> : <strong>{uiText(open ? headerStatus : uiText("CYBER 助手"))}</strong>}</span></button>
      <button type="button" className={`ca-microphone ${voice.phase === 'recording' ? 'is-recording' : ''}`} aria-label={uiText(voice.phase === 'recording' ? uiText("说完了，立即处理") : voice.active ? uiText("取消语音输入") : uiText("开始语音输入"))} title={uiText(voice.phase === 'recording' ? uiText("说完了，立即处理") : voice.active ? uiText("取消语音输入") : uiText("开始语音输入"))} disabled={pending || busy} onClick={() => {
        if (voice.phase === 'recording') void voice.stop();
        else if (voice.active) voice.cancel();
        else startVoice();
      }}><AppIcon name={voice.phase === 'recording' ? 'square' : voice.active ? 'loader-circle' : 'mic'} spinning={voice.active && voice.phase !== 'recording'} size={19} /></button>
      {hasScene && !sceneVisible && <button className={`ca-scene-badge ${warning ? 'is-warning' : ''}`} onClick={() => setSceneExpanded(true)}><AppIcon name={warning ? 'triangle-alert' : 'shield-check'} size={15} />{uiText("场景提醒")}</button>}
    </div>
    {sceneVisible && <section className={`ca-scene ${warning ? 'is-warning' : ''}`} aria-label={uiText("场景主动反馈")}><header><AppIcon name={warning ? 'triangle-alert' : 'shield-check'} size={18} /><strong>{uiText(hmi.careFrame ? uiText("儿童关怀") : uiText("场景反馈"))}</strong><span>{uiText(running ? uiText("处理中") : warning ? uiText("请留意") : uiText("最新结果"))}</span><button aria-label={uiText("收起场景提醒")} onClick={() => { setDismissedScene(sceneKey); setSceneExpanded(false); }}><X size={17} /></button></header><p role={warning ? 'alert' : 'status'}>{sceneText}</p>{hmi.careFrame && <details><summary>{uiText("查看本次座舱画面")}</summary><img src={hmi.careFrame} alt={uiText("本次识别的座舱图片")} /><small>{uiText("本次图片 · 非实时视频")}</small></details>}</section>}
    {open && <div id="cockpit-assistant-body" className="ca-body">
      {(entries.length > 0 || pending) && <div ref={log} className="ca-conversation" role="log" aria-label={uiText("车机助手对话")} aria-live="polite">
        {entries.map(entry => <article className={`ca-entry ${entry.role} ${entry.error ? 'is-error' : ''}`} key={entry.id} aria-label={uiText(entry.role === 'user' ? uiText("你的语音") : uiText("助手回复"))}>{entry.plan?.kind === 'clarify' && <small>{uiText("需要补充")}</small>}
          <p>{entry.text}</p>
          {entry.plan && (entry.plan.kind === 'windows' || entry.plan.kind === 'climate') && <div className="ca-action-card"><span>{entry.plan.kind === 'windows' ? <Car size={22} /> : <Wind size={22} />}{uiText(entry.state === 'done' ? uiText("已执行") : entry.state === 'failed' ? uiText("未完成") : entry.state === 'dismissed' ? uiText("已取消建议") : uiText("车辆操作"))}</span>
            {entry.state === 'ready' && <div><button disabled={busy || pending} onClick={() => void confirm(entry)}>{uiText("确认执行")}</button><button onClick={() => updateEntry(entry.id, { state: 'dismissed', text: `${entry.text}（未执行）` })}>{uiText("暂不执行")}</button></div>}
            {entry.state === 'executing' && <LoaderCircle className="ca-spin" size={18} />}{entry.state === 'done' && <Check size={18} />}
          </div>}
          {entry.error && !pending && <button className="ca-retry" disabled={busy || voice.active} onClick={startVoice}>{uiText("重新说一次")}</button>}
          {entry.role === 'assistant' && !entry.error && <>
            <div className="ca-followups" aria-label={uiText("推荐追问")}><p>{uiText("你也可以说：")}</p><span>{uiText("暂无推荐追问")}</span></div>
            <div className="ca-feedback-tools" aria-label={uiText("回复工具")}>
              <button type="button" disabled aria-label={uiText("点赞（暂未接入）")} title={uiText("点赞暂未接入")}><span className="ca-figma-icon ca-figma-like"><img src="/hmi/assistant-figma/thumb-up.svg" alt="" /></span></button>
              <button type="button" disabled aria-label={uiText("点踩（暂未接入）")} title={uiText("点踩暂未接入")}><span className="ca-figma-icon ca-figma-dislike"><span><img src="/hmi/assistant-figma/thumb-down-main.svg" alt="" /><img src="/hmi/assistant-figma/thumb-down-side.svg" alt="" /></span></span></button>
              <button type="button" disabled className="ca-share" aria-label={uiText("分享（暂未接入）")} title={uiText("分享暂未接入")}><span className="ca-figma-icon ca-figma-share"><img src="/hmi/assistant-figma/share.svg" alt="" /></span></button>
            </div>
          </>}
        </article>)}
        {pending && <div className="ca-pending" role="status"><LoaderCircle size={16} className="ca-spin" />{uiText("正在理解你的需求…")}</div>}
      </div>}

    </div>}
    <span className="ca-voice-status" role="status">{uiText(voice.phase === 'requesting' ? uiText("请允许使用麦克风，再次点击可取消") : voice.phase === 'recording' ? uiText("正在聆听，说完后自动处理，Escape 取消") : voice.phase === 'transcribing' ? uiText("正在本地识别，再次点击可取消") : '')}</span>
    {voice.error && <div className="ca-voice-feedback is-error"><span role="alert">{uiText(voice.error)}</span><button type="button" onClick={voice.cancel} aria-label={uiText("关闭语音提示")}><X size={16} /></button></div>}
  </div>;
}
