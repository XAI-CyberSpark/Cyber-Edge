import { uiText, useUiLanguage } from '@/i18n';
import { AppIcon } from '@/components/ui/AppIcon';
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, ArrowUpRight } from 'lucide-react';
import { BloubAvatar } from '@/components/avatar/BloubAvatar';
import { AvatarPlayback } from '@/components/avatar/avatarPlayback';
import { BotEngine } from '@/vendor/bloub/engine';
import { SEQUENCE, POSES, type StateId } from '@/vendor/bloub/states';
import { RAYON } from '@/vendor/bloub/repere';
import './avatar-preview.css';

const labels: Record<StateId, string> = { idle:'静止', thinking:'思考', wink:'眨眼', wide:'睁大眼睛', alert:'警示', notify:'通知', exclaim:'感叹号', sleep:'休眠', egg:'蛋形', hexagon:'六边形', play:'播放', orbit:'轨道', burst:'爆散', comet:'彗星', swirl:'漩涡' };
const thumbnails = SEQUENCE.map(state => ({ state, frame: new BotEngine(RAYON, state).sample(POSES[state]) }));

export default function AvatarPreviewPage() {
  useUiLanguage();
  const [transport] = useState(() => new AvatarPlayback('alert'));
  const [view, setView] = useState(() => ({ frame: transport.frame, state: transport.state, elapsed: transport.elapsed }));
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [cycling, setCycling] = useState(false);
  const [size, setSize] = useState(256);
  const [darkVariant, setDarkVariant] = useState<'cream' | 'original'>('cream');
  const raf = useRef(0);
  const refresh = () => setView({ frame: transport.frame, state: transport.state, elapsed: transport.elapsed });
  useEffect(() => {
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) transport.advance((now - last) / 1000);
      last = now;
      setView({ frame: transport.frame, state: transport.state, elapsed: transport.elapsed });
      raf.current = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(raf.current); last = null;
      if (playing && !document.hidden) raf.current = requestAnimationFrame(tick);
    };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => { cancelAnimationFrame(raf.current); document.removeEventListener('visibilitychange', sync); };
  }, [playing, transport]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { if (query.matches) setPlaying(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const choose = (state: StateId) => {
    transport.select(state); setCycling(false);
    if (!playing) transport.seek(POSES[state]);
    refresh();
  };
  const startCycle = () => { transport.startCycle(); setCycling(true); setPlaying(true); refresh(); };
  return <main className="avatar-preview">
    <header className="avatar-preview-header"><div><p className="avatar-preview-eyebrow">{uiText("OAKEgde Studio · 动画对照")}</p><h1>{uiText("让形象先对得上")}</h1><p>{uiText("左右共享同一帧。先确认动画，再接入 HMI。")}</p></div><a href="/">{uiText("返回 Studio")}</a></header>
    <section className="avatar-preview-comparison" aria-label={uiText("动画配色对照")}>
      <article className="avatar-preview-stage is-original"><header><span>{uiText("原版")}</span><small>{uiText("黑色形象 · 浅色背景")}</small></header><div className="avatar-preview-canvas"><BloubAvatar frame={view.frame} size={size} label={uiText("原版：{0}", [uiText(labels[view.state])])} /></div><footer>{uiText(labels[view.state])}</footer></article>
      <article className="avatar-preview-stage is-hmi"><header><span>{uiText("HMI 预览")}</span><select aria-label={uiText("HMI 形象配色")} value={darkVariant} onChange={e => setDarkVariant(e.target.value as 'cream' | 'original')}><option value="cream">{uiText("浅色形象")}</option><option value="original">{uiText("黑色形象＋浅底")}</option></select></header><div className="avatar-preview-canvas"><div className={darkVariant === 'original' ? 'avatar-preview-matte' : undefined}><BloubAvatar frame={view.frame} size={size} ink={darkVariant === 'cream' ? '#f1efe9' : '#0a0a0c'} paper={darkVariant === 'cream' ? '#050505' : '#f9f9f9'} label={`HMI: ${uiText(labels[view.state])}`} /></div></div><footer>{uiText("尺寸")}{uiText(size)}{uiText("px · 仅预览")}</footer></article>
    </section>
    <section className="avatar-preview-controls" aria-label={uiText("动画播放控制")}>
      <div className="avatar-preview-transport"><button onClick={() => setPlaying(!playing)} aria-label={uiText(playing ? uiText("暂停动画") : uiText("播放动画"))}><AppIcon name={playing ? 'pause' : 'play'} size={16} />{uiText(playing ? uiText("暂停") : uiText("播放"))}</button><button onClick={() => { transport.restart(); refresh(); }}><RotateCcw size={16}/>{uiText("重播当前")}</button><button onClick={startCycle} aria-pressed={cycling}>{uiText("连续播放全部")}</button><span role="status">{uiText(labels[view.state])} · {uiText(cycling ? uiText("按原版顺序轮播") : uiText("单个状态"))}</span></div>
      <div className="avatar-preview-adjust"><label>{uiText("逐帧查看")}<input aria-label={uiText("动画时间")} type="range" min="0" max={transport.duration} step="0.01" value={Math.min(view.elapsed, transport.duration)} onChange={e => { setPlaying(false); setCycling(false); transport.seek(Number(e.target.value)); refresh(); }}/><output>{uiText(Math.min(view.elapsed, transport.duration).toFixed(2))}s</output></label><label>{uiText("显示尺寸")}<select aria-label={uiText("显示尺寸")} value={size} onChange={e => setSize(Number(e.target.value))}>{[48,72,96,160,256].map(value=><option key={value} value={value}>{uiText(value)}px</option>)}</select></label></div>
    </section>
    <section aria-label={uiText("全部动画状态")}><div className="avatar-preview-section-title"><h2>{uiText("14 种原版动画")}</h2><a href="https://bloub.vercel.app/#planche" target="_blank" rel="noreferrer">{uiText("打开原站对照")}<ArrowUpRight size={15}/></a></div><div className="avatar-preview-grid">{thumbnails.map(({state,frame})=><button key={state} className="avatar-preview-tile" aria-pressed={view.state===state} onClick={()=>choose(state)}><BloubAvatar frame={frame} size={84} ink="#f1efe9" paper="#141416" label={uiText(labels[state])}/><span>{uiText(labels[state])}</span><small>{uiText(state)}</small></button>)}</div></section>
    <details className="avatar-preview-extra"><summary>{uiText("补充：原项目的入场漩涡")}</summary><p>{uiText("此动画随引擎保留，不属于原站 14 项公开轮播。")}</p><button onClick={()=>choose('swirl')}>{uiText("播放漩涡")}</button></details>
    <footer className="avatar-preview-footer"><p>{uiText("本页未连接模型、车辆或麦克风。原动画核心与参数保留，HMI 配色使用原项目的奶油色。")}</p><p><a href="https://github.com/jeremy-prt/bloub" target="_blank" rel="noreferrer">bloub · Jérémy Perret · MIT</a>{uiText("。原作者说明：代码许可不涵盖其模仿的 x.ai 形象设计。")}</p></footer>
  </main>;
}
