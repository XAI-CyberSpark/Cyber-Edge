import { uiText, useUiLanguage } from '@/i18n';
/* Renderer adapted from jeremy-prt/bloub BloubBot.vue. MIT; see vendor/bloub/LICENSE. */
import { memo, useId } from 'react';
import { NOTIF_BLUE } from '@/vendor/bloub/decor';
import type { BotFrame } from '@/vendor/bloub/engine';
import { DEMI_VIEWBOX as VB, RAYON as R } from '@/vendor/bloub/repere';
import { mixHex } from '@/vendor/bloub/skins';

export const BloubAvatar = memo(function BloubAvatar({ frame, ink = '#0a0a0c', paper = '#f9f9f9', size = 256, label = 'Bloub 动画形象' }: {
  frame: BotFrame; ink?: string; paper?: string; size?: number; label?: string;
}) {
  useUiLanguage();
  const uid = useId().replace(/:/g, '_');
  const maskId = `${uid}-mask`;
  const dots = () => frame.dots.map((dot, i) => {
    const fill = dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
    return dot.d
      ? <path key={i} d={dot.d} fill={fill} opacity={dot.opacity} transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`} />
      : <circle key={i} fill={fill} opacity={dot.opacity} cx={dot.x} cy={dot.y} r={dot.r} />;
  });
  const arcs = (side: 'back' | 'front') => <g fill="none" strokeLinecap="round">{frame.arcs.map(arc => <path key={`${side}-${arc.id}`} d={arc[side]} stroke={`url(#${uid}-${arc.id})`} strokeWidth={arc.width} opacity={arc.opacity} />)}</g>;
  return <svg className="bloub-avatar" width={size} height={size} viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`} role="img" aria-label={uiText(label)}>
    <defs>
      <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
        <path d={frame.bodyPath} fill="#fff" />
        {frame.eyes.map((eye, i) => <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />)}
        {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />}
      </mask>
      {frame.arcs.map(arc => <linearGradient key={arc.id} id={`${uid}-${arc.id}`} gradientUnits="userSpaceOnUse" x1={arc.grad.x1} y1={arc.grad.y1} x2={arc.grad.x2} y2={arc.grad.y2}>
        {arc.grad.stops.map((color, i) => <stop key={i} offset={i / (arc.grad.stops.length - 1)} stopColor={color} />)}
      </linearGradient>)}
    </defs>
    {arcs('back')}
    {frame.dotsBehind && <g>{dots()}</g>}
    <g opacity={frame.bodyAlpha}>
      <path d={frame.bodyPath} fill={paper} />
      <g mask={`url(#${maskId})`}><rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} /></g>
    </g>
    {!frame.dotsBehind && <g>{dots()}</g>}
    {frame.notif && <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />}
    {arcs('front')}
  </svg>;
});
