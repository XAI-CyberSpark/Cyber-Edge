import { uiText, useUiLanguage  } from '@/i18n';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Settings2, X, LoaderCircle, ChevronDown, ChevronRight, ChevronLeft, Check, Search, RotateCcw, RefreshCw } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import './authoring-model-picker.css';

export type ReasoningSettings = { enabled: boolean; effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' };
type ReasoningCapability = { supported: boolean; can_disable: boolean; efforts: NonNullable<ReasoningSettings['effort']>[]; default_enabled: boolean; default_effort?: ReasoningSettings['effort'] | null };
const effortLabels = { minimal: '最小', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高' };

type Provider = { id: string; label: string; model: string; configured: boolean; reasoning?: ReasoningCapability };
interface Props {
  providerId: string;
  model?: string;
  disabled?: boolean;
  reasoning?: ReasoningSettings;
  onChange: (providerId: string, model: string, reasoning?: ReasoningSettings) => void;
  onAvailability: (ready: boolean) => void;
}
const field = 'mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 type-body focus:outline-none focus:ring-2 focus:ring-ring';

export function AuthoringModelPicker({ providerId, model, disabled, reasoning, onChange, onAvailability }: Props) {
  useUiLanguage();
  const trigger = useRef<HTMLButtonElement>(null);
  const secretInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Provider | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState({ left: 12, bottom: 64, maxHeight: 480 });
  const [overrideCapability, setOverrideCapability] = useState<ReasoningCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<Provider | null>(null);
  const [draftModel, setDraftModel] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = providers.find(p => p.id === providerId);
  const label = current?.label || ({ minimax: 'MiniMax', openai: 'GPT', anthropic: 'Claude', deepseek: 'DeepSeek' } as Record<string,string>)[providerId] || '模型';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    fetch(apiUrl('/v1/orchestration/providers'), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error(); return response.json(); })
      .then(data => { if (!Array.isArray(data.providers)) throw Error(); if (!controller.signal.aborted) setProviders(data.providers); })
      .catch(() => { if (!controller.signal.aborted) setLoadError('模型配置暂时无法读取，请刷新重试。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => { onAvailability(!!current?.configured); }, [current?.configured, providerId, onAvailability]);

  const modelOf = (provider: Provider) => provider.id === providerId ? model || provider.model : provider.model;
  const capability = options?.id === providerId && model && model !== current?.model
    ? overrideCapability : options?.reasoning;
  const selectedSettings = options?.id === providerId ? reasoning : undefined;
  const visible = providers.filter(provider => `${provider.label} ${provider.id} ${modelOf(provider)}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    setOverrideCapability(null); setCapabilityError(false);
    if (!model || !current || model === current.model) return;
    const controller = new AbortController();
    fetch(apiUrl(`/v1/orchestration/providers/${providerId}/reasoning?model=${encodeURIComponent(model)}`), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setOverrideCapability(data); })
      .catch(() => { if (!controller.signal.aborted) setCapabilityError(true); });
    return () => controller.abort();
  }, [providerId, model, current, refresh]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const bottom = Math.max(12, window.innerHeight - rect.top + 8);
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), bottom,
        maxHeight: Math.max(180, window.innerHeight - bottom - 12) });
    };
    reposition(); window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [open]);
  const choose = (provider: Provider) => {
    if (!provider.configured) { configure(provider); return; }
    onChange(provider.id, modelOf(provider), provider.id === providerId ? reasoning : undefined); setOpen(false);
  };
  const changeReasoning = (settings?: ReasoningSettings) => {
    if (options?.configured) onChange(options.id, modelOf(options), settings);
  };
  const moveFocus = (event: React.KeyboardEvent) => {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    if (event.target instanceof HTMLInputElement && !['ArrowDown','ArrowUp'].includes(event.key)) return;
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[data-model-choice]:not(:disabled)') || [])];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
      event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  };

  const configure = (provider: Provider) => {
    setOpen(false); setEditing(provider); setDraftModel(provider.id === providerId ? model || provider.model : provider.model);
    setKey(''); setError('');
  };
  const close = () => { if (!busy) { setEditing(null); setKey(''); setError(''); } };
  const save = async () => {
    if (!editing || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(apiUrl(`/v1/orchestration/providers/${editing.id}`), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: draftModel.trim(), ...(key.trim() ? { api_key: key.trim() } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(typeof body.detail === 'string' ? body.detail : '配置未保存，请检查模型 ID 和 API 密钥。');
      setProviders(items => items.map(p => p.id === body.id ? body : p));
      onChange(body.id, body.model); setEditing(null); setKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败，请重试。');
    } finally { setBusy(false); }
  };
  return <>
    <div className="authoring-model-picker">
      <button ref={trigger} type="button" className="authoring-model-trigger type-label" aria-label={uiText("场景创作模型")}
        aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
        title={model || current?.model || uiText(label)} onClick={() => { setOptions(null); setQuery(''); setOpen(true); }}>
        <span>{model || current?.model || uiText(label)}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60]" />
        <Dialog.Content ref={menu} className="authoring-model-menu" style={position} onKeyDown={moveFocus}
          onOpenAutoFocus={event => { event.preventDefault(); searchInput.current?.focus(); }}
          onCloseAutoFocus={event => { event.preventDefault(); if (!editing) trigger.current?.focus(); }}>
          <Dialog.Title className="sr-only">{uiText("选择创作模型")}</Dialog.Title>
          <Dialog.Description className="sr-only">{uiText("搜索模型，选择供应商或调整思考设置。")}</Dialog.Description>
          {options ? <>
            <div className="authoring-model-options-heading">
              <button type="button" aria-label={uiText("返回模型列表")} onClick={() => { setOptions(null); requestAnimationFrame(() => searchInput.current?.focus()); }}><ChevronLeft size={16} /></button>
              <span className="type-label">{modelOf(options)}</span>
            </div>
            <div className="authoring-model-options">
              {capability?.supported ? <>
                <label className="authoring-thinking-toggle type-label"><span>{uiText("思考")}{!selectedSettings && <small className="type-caption text-muted-foreground"> · {uiText("默认")}</small>}</span>
                  <input type="checkbox" role="switch" aria-label={uiText("思考")} checked={selectedSettings?.enabled ?? capability.default_enabled}
                    disabled={!options.configured || !capability.can_disable}
                    onChange={event => changeReasoning({ enabled: event.target.checked, ...(event.target.checked && capability.default_effort ? { effort: capability.default_effort } : {}) })} />
                </label>
                {!capability.can_disable && <p className="type-caption text-muted-foreground">{uiText("此模型始终开启思考")}</p>}
                {capability.efforts.length > 0 ? <fieldset disabled={!options.configured || !(selectedSettings?.enabled ?? capability.default_enabled)}>
                  <legend className="type-caption text-muted-foreground">{uiText("推理强度")}</legend>
                  {capability.efforts.map(effort => <label key={effort} className="authoring-effort-option type-label">
                    <input type="radio" name="authoring-effort" checked={(selectedSettings?.effort ?? capability.default_effort) === effort}
                      onChange={() => changeReasoning({ enabled: true, effort })} />
                    <span>{uiText(effortLabels[effort])}</span><Check size={14} aria-hidden="true" />
                  </label>)}
                </fieldset> : <p className="type-caption text-muted-foreground">{uiText("此模型不提供推理强度调节")}</p>}
              </> : <p className="type-body text-muted-foreground">{uiText(capabilityError ? "思考设置暂时无法读取，请刷新重试。" : capability ? "此模型暂不支持可配置思考" : "正在读取模型能力…")}</p>}
              {!options.configured && <p className="type-caption text-muted-foreground">{uiText("请先接入模型")}</p>}
              <button type="button" className="authoring-menu-action type-label" disabled={!options.configured || !selectedSettings} onClick={() => changeReasoning()}><RotateCcw size={14}/>{uiText("恢复默认思考设置")}</button>
              <button type="button" className="authoring-menu-action type-label" onClick={() => configure(options)}><Settings2 size={14}/>{uiText("编辑模型…")}</button>
            </div>
          </> : <>
            <label className="authoring-model-search"><Search size={16} aria-hidden="true" /><input ref={searchInput} className="type-body" aria-label={uiText("搜索创作模型")} placeholder={uiText("搜索模型")} value={query} onChange={event => setQuery(event.target.value)}/></label>
            <div className="authoring-model-list">
              {loading && <p role="status" className="type-caption text-muted-foreground">{uiText("正在加载模型…")}</p>}
              {!loading && !visible.length && !loadError && <p className="type-body text-muted-foreground">{uiText("没有匹配的模型")}</p>}
              {visible.map(provider => <section key={provider.id} aria-label={provider.label}>
                <h4 className="type-caption text-muted-foreground">{provider.label}</h4>
                <div className={`authoring-model-row ${provider.id === providerId ? 'is-selected' : ''}`}>
                  <button type="button" data-model-choice aria-pressed={provider.id === providerId} disabled={loading} className="type-label" onClick={() => choose(provider)}>
                    <span>{modelOf(provider)}</span>{!provider.configured && <small className="type-tag">{uiText("未接入")}</small>}{provider.id === providerId && <Check size={15} aria-hidden="true" />}
                  </button>
                  <button type="button" className="authoring-model-options-button" aria-label={uiText("{0}模型选项", [provider.label])} onClick={() => setOptions(provider)}><ChevronRight size={16} aria-hidden="true"/></button>
                </div>
              </section>)}
            </div>
            {loadError && <p role="alert" className="authoring-model-error type-body text-destructive">{uiText(loadError)}</p>}
            <div className="authoring-model-footer">
              <button type="button" className="authoring-menu-action type-label" disabled={!current?.configured} onClick={() => { if (current) { onChange(current.id, current.model); setOpen(false); } }}><RotateCcw size={14}/>{uiText("使用设置中的默认模型")}</button>
              <button type="button" className="authoring-menu-action type-label" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} className={loading ? 'animate-spin motion-reduce:animate-none' : ''}/>{uiText("刷新模型")}</button>
              <button type="button" className="authoring-menu-action type-label" disabled={!current} onClick={() => current && configure(current)}><Settings2 size={14}/>{uiText("编辑模型…")}</button>
            </div>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={!!editing} onOpenChange={open => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content data-project-dialog className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl focus:outline-none"
          onOpenAutoFocus={e => { e.preventDefault(); secretInput.current?.focus(); }}
          onCloseAutoFocus={e => { e.preventDefault(); trigger.current?.focus(); }}
          onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => e.preventDefault()}>
          <Dialog.Title className="type-panel ">{uiText("接入")}{uiText(editing?.label)}</Dialog.Title>
          <Dialog.Description className="mt-2 type-body  text-muted-foreground">{uiText("用于场景创作。密钥仅保存在本机后端；生成时会向所选服务发送需求与当前场景。")}</Dialog.Description>
          <button aria-label={uiText("关闭模型设置")} disabled={busy} onClick={close} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"><X size={16}/></button>
          <form onSubmit={e => { e.preventDefault(); void save(); }} className="mt-5 space-y-4">
            <label className="block type-label">{uiText("API 密钥")}<input ref={secretInput} type="password" autoComplete="off" spellCheck={false} value={key} disabled={busy} maxLength={4096} onChange={e => setKey(e.target.value)}
                placeholder={uiText(editing?.configured ? uiText("已保存，留空保持现有密钥") : uiText("输入 API 密钥"))} className={field}/>
            </label>
            <label className="block type-label">{uiText("模型 ID")}<input value={draftModel} disabled={busy} spellCheck={false} autoComplete="off" maxLength={150} onChange={e => setDraftModel(e.target.value)} className={field}/>
            </label>
            <p className="type-caption  text-muted-foreground">{uiText("验证会发起一次简短调用，可能产生少量 API 费用。")}</p>
            {error && <p role="alert" className="type-body text-red-500">{uiText(error)}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={busy} onClick={close} className="rounded-lg border border-border px-4 py-2 type-label hover:bg-accent disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring">{uiText("取消")}</button>
              <button type="submit" disabled={busy || !draftModel.trim() || (!editing?.configured && !key.trim())} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 type-label text-primary-foreground hover:bg-primary/90 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring">{busy && <LoaderCircle size={14} className="animate-spin"/>}{uiText(busy ? uiText("正在验证…") : uiText("验证并保存"))}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
