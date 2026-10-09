import { uiText, useUiLanguage } from '@/i18n';
import './retro-computer-logo.css';

export function RetroComputerLogo({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  useUiLanguage();
  return <span className={`retro-computer-logo ${className}`} role={decorative ? undefined : 'img'} aria-label={uiText(decorative ? undefined : uiText("屏幕显示白色 OpenSparX 标志的复古电脑"))} aria-hidden={decorative || undefined}>
    <img src="/opensparx-retro-computer.png" alt="" width={1254} height={1254} decoding="async" className="retro-computer-logo__base" />
    <img src="/opensparx-screen-mark.png" alt="" className="retro-computer-logo__mark" />
  </span>;
}
