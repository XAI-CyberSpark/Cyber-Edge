import { uiText, useUiLanguage  } from '@/i18n';
import { AppIcon } from '@/components/ui/AppIcon';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import Prism from '@/components/backgrounds/Prism';
import './site-access.css';

export function SiteAccessGate({ children }: { children: ReactNode }) {
  useUiLanguage();
  const [unlocked, setUnlocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [key, setKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const expires = useRef(0);
  useEffect(() => {
    let saved = 'dark';
    try { saved = localStorage.getItem('cyber-edge-theme') || 'dark'; } catch { /* Storage may be disabled. */ }
    document.documentElement.classList.toggle('dark', saved !== 'light');
    return () => request.current?.abort();
  }, []);
  useEffect(() => {
    // Initial probe: when the server gate is off (or a session is still
    // valid), unlock without ever showing the dialog.
    let active = true;
    (async () => {
      try {
        const response = await fetch(apiUrl('/v1/access/session'), { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || data.authenticated) {
          expires.current = !response.ok || data.required === false ? Number.MAX_SAFE_INTEGER : Date.now() + (data.expires_in || 0) * 1000;
          setMounted(true); setUnlocked(true);
        }
      } catch { /* Backend unreachable: stay locked. */ }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    const check = async () => {
      if (document.hidden) return;
      if (Date.now() >= expires.current) { setUnlocked(false); setError('使用会话已过期，请重新输入密钥。'); return; }
      try {
        const response = await fetch(apiUrl('/v1/access/session'), { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json();
        if (active && response.ok && !data.authenticated) { setUnlocked(false); setError('使用会话已结束，请重新输入密钥。'); }
      } catch { /* Temporary network errors do not discard the workspace. */ }
    };
    const timer = window.setInterval(() => void check(), 60000);
    const focus = () => void check();
    window.addEventListener('focus', focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [unlocked]);
  useEffect(() => { if (!busy && error) input.current?.focus(); }, [busy, error]);
  const submit = async () => {
    if (request.current || !key.trim()) return;
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setBusy(true); setError('');
    try {
      const response = await fetch(apiUrl('/v1/access/login'), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.authenticated !== true) throw new Error(typeof data.detail === 'string' ? data.detail : '验证失败，请重试。');
      expires.current = Date.now() + data.expires_in * 1000;
      setKey(''); setVisible(false); setMounted(true); setUnlocked(true);
    } catch (cause) {
      setError(controller.signal.aborted ? '连接超时，请重试。' : cause instanceof Error && !(cause instanceof TypeError) ? cause.message : '无法连接验证服务，请稍后重试。');
      input.current?.focus();
    } finally { window.clearTimeout(timer); request.current = null; setBusy(false); }
  };
  return <>
    {mounted ? children : <div className="site-access-background" aria-hidden="true"><Prism animationType="rotate" noise={0} scale={3.6} timeScale={0.5} suspendWhenOffscreen /></div>}
    <Dialog.Root open={!unlocked}>
      <Dialog.Portal>
        <Dialog.Overlay className="site-access-overlay" />
        <Dialog.Content className="site-access-dialog" onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }} onCloseAutoFocus={event => event.preventDefault()} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}>
          <div className="site-access-icon"><KeyRound size={23} aria-hidden="true" /></div>
          <Dialog.Title>{uiText("输入使用密钥")}</Dialog.Title>
          <Dialog.Description>{uiText("欢迎使用 OAKEgde Studio，验证密钥后即可进入。")}</Dialog.Description>
          <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            <label className="type-label" htmlFor="site-access-key">{uiText("使用密钥")}</label>
            <div className="site-access-input">
              <input ref={input} id="site-access-key" type={visible ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={256} value={key} onChange={event => { setKey(event.target.value); setError(''); }} placeholder={uiText("请输入网站访问密钥")} disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'site-access-error' : undefined} />
              <button type="button" aria-label={uiText(visible ? uiText("隐藏密钥") : uiText("显示密钥"))} aria-pressed={visible} onClick={() => setVisible(value => !value)}><AppIcon name={visible ? 'eye-off' : 'eye'} size={18} /></button>
            </div>
            {error && <p id="site-access-error" className="site-access-error" role="alert">{uiText(error)}</p>}
            <button type="submit" className="site-access-submit" disabled={busy || !key.trim()}>{busy ? <><LoaderCircle size={17} className="animate-spin" />{uiText("正在验证")}</> : <>{uiText("验证并进入")}<ArrowRight size={17} /></>}</button>
          </form>
          <p className="site-access-help">{uiText("没有密钥？请联系网站管理员。")}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
