import { uiText, useUiLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { BotEngine } from '@/vendor/bloub/engine';
import { POSES, type StateId } from '@/vendor/bloub/states';
import { RAYON } from '@/vendor/bloub/repere';
import { BloubAvatar } from './BloubAvatar';

type AssistantAvatarState = Extract<StateId, 'idle' | 'thinking' | 'notify' | 'alert' | 'wide'>;
const labels: Record<AssistantAvatarState, string> = { wide: '聆听中', idle: '待机', thinking: '思考中', notify: '有新提醒', alert: '请留意警示' };

/** One continuous upstream clock; state changes morph from the current pose. No demo cycle. */
export function HmiAssistantAvatar({ state }: { state: AssistantAvatarState }) {
  useUiLanguage();
  const [engine] = useState(() => new BotEngine(RAYON, state));
  const clock = useRef(0);
  const reduced = useRef(false);
  const [frame, setFrame] = useState(() => engine.sample(0));
  useEffect(() => {
    if (reduced.current) {
      engine.reset(state, clock.current);
      clock.current += POSES[state];
    } else engine.setState(state, clock.current);
    setFrame(engine.sample(clock.current));
  }, [engine, state]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) clock.current += Math.min(Math.max(0, (now - last) / 1000), 0.064);
      last = now;
      setFrame(engine.sample(clock.current));
      raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(raf); last = null;
      reduced.current = preference.matches;
      if (reduced.current) {
        engine.reset(engine.state, clock.current);
        clock.current += POSES[engine.state];
        setFrame(engine.sample(clock.current));
      } else if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    sync();
    preference.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      cancelAnimationFrame(raf);
      preference.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [engine]);
  return <span className="ca-orb" data-avatar-state={state}>
    <BloubAvatar frame={frame} size={40} ink="#f1efe9" paper="var(--ca-avatar-paper, #050505)" label={uiText("CYBER 助手：{0}", [uiText(labels[state])])} />
  </span>;
}
