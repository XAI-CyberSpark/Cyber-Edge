import { uiText, useUiLanguage  } from '@/i18n';
import { AppIcon } from '@/components/ui/AppIcon';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { RearVideo } from '@/domain/rearVideo';
import { apiUrl } from '@/lib/api';
import './rear-video.css';
const RearVideoContext = createContext<RearVideo | null>(null);
export function RearVideoProvider({ sessionKey, children }: { sessionKey?: string; children: ReactNode }) {
  useUiLanguage();
  const session = useMemo(() => new RearVideo(apiUrl('/v1/media/rear-seat')), [sessionKey]);
  useEffect(() => {
    const hide = () => { if (document.hidden) session.close(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); session.dispose(); };
  }, [session]);
  return <RearVideoContext.Provider value={session}>{children}</RearVideoContext.Provider>;
}
export const useRearVideo = () => useContext(RearVideoContext);
export function RearVideoWindow() {
  useUiLanguage(); const session = useRearVideo(); return session ? <Window session={session} /> : null; }
function Window({ session }: { session: RearVideo }) {
  useUiLanguage();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <section className={`rear-video-window${state.expanded ? ' is-expanded' : ''}`} hidden={!state.visible} aria-label={uiText("后排视频")}>
    <div ref={session.attach} className="rear-video-picture" />
    <div className="rear-video-actions"><button type="button" aria-label={uiText("关闭后排视频")} onClick={session.close}><X size={19} /></button><button type="button" aria-label={uiText(state.expanded ? uiText("缩小后排视频") : uiText("放大后排视频"))} onClick={session.toggleExpanded}><AppIcon name={state.expanded ? 'minimize-2' : 'maximize-2'} size={18} /></button></div>
    {state.phase === 'connecting' && <p className="rear-video-message" role="status">{uiText("正在连接后排画面…")}</p>}
    {state.phase === 'error' && <p className="rear-video-message" role="alert">{uiText(state.error)}</p>}
  </section>;
}
