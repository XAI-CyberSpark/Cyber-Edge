import { uiText, useUiLanguage  } from '@/i18n';
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { VideoReplay, replayTime } from '@/domain/videoReplay';
import './video-replay.css';
const ReplayContext = createContext<VideoReplay | null>(null);
export function VideoReplayProvider({ sessionKey, children }: { sessionKey?: string; children: ReactNode }) {
  useUiLanguage();
  const session = useMemo(() => new VideoReplay(), [sessionKey]);
  useEffect(() => {
    const hide = () => { if (document.hidden) session.pause(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); session.dispose(); };
  }, [session]);
  return <ReplayContext.Provider value={session}>{children}</ReplayContext.Provider>;
}
export const useVideoReplay = () => useContext(ReplayContext);
export function VideoReplayInput({ session, disabled }: { session: VideoReplay; disabled: boolean }) {
  useUiLanguage();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const file = useRef<HTMLInputElement>(null);
  const active = state.phase === 'playing';
  return <section className="replay-input" aria-label={uiText("视频输入")}>
    <input ref={file} hidden type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm" aria-label={uiText("选择视频")} onChange={e => { const f = e.target.files?.[0]; if (f) { session.setLoop(true); session.load(f); } e.target.value = ''; }} />
    <div ref={session.attachPreview} className="replay-preview" hidden={!state.name || state.popup} />
    {state.name && <p className="replay-name" title={state.name}>{state.name}</p>}
    <div className="replay-actions">
      <button type="button" className={state.name ? '' : 'replay-select'} disabled={active || disabled} onClick={() => file.current?.click()}>{uiText(state.name ? uiText("更换视频") : uiText("选择视频"))}</button>
      {state.name && <button className="replay-start" type="button" disabled={!active && (disabled || !state.duration)} onClick={() => active ? session.pause() : void session.play()}>{uiText(active ? uiText("暂停") : uiText("播放"))}</button>}
    </div>
    {state.error && <p role="alert">{uiText(state.error)}</p>}
  </section>;
}
export function VideoReplayScreen() {
  useUiLanguage();
  const session = useVideoReplay();
  return session ? <ReplayScreen session={session} /> : null;
}
function ReplayScreen({ session }: { session: VideoReplay }) {
  useUiLanguage();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <section className="replay-screen" hidden={!state.popup} aria-label={uiText("后排视频回放")}>
    <header><div><small>{uiText("儿童关怀")}</small><strong>{uiText("请留意后排儿童")}</strong></div><button type="button" aria-label={uiText("收起后排视频")} onClick={() => session.dismiss()}>{uiText("收起")}</button></header>
    <div ref={session.attachScreen} className="replay-screen-video" />
    <footer><span>{uiText("后排画面 · 测试录像")}</span><span>{uiText("当前")}{uiText(replayTime(state.time))}{state.displayedSample !== null && uiText(" · 触发画面 {0}", [replayTime(state.displayedSample)])}</span></footer>
  </section>;
}
