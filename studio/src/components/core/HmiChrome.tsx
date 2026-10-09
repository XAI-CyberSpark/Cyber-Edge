import { uiLocale } from '@/i18n';
import { uiText, useUiLanguage } from '@/i18n';
import type { HMIState } from './VehicleSimulator';

const assetRoot = '/hmi/figma-chrome/';
function Icon({ name, className = '' }: { name: string; className?: string }) {
  useUiLanguage();
  return <img className={`hmi-chrome-icon ${className}`} src={`${assetRoot}${name}.svg`} alt="" draggable={false} />;
}
export type HmiPanel = 'vehicle' | 'navigation' | 'media' | 'phone' | 'apps' | 'widgets' | 'gallery' | 'schedule' | null;

export function HmiStatusBar({ clock, speed, hmi, onPhone, distanceUnit='km' }: { distanceUnit?: 'km'|'mi'; clock: Date; speed: number; hmi: HMIState; onPhone: () => void }) {
  useUiLanguage();
  // The simulator exposes speed, not a transmission or range model.
  const gear = speed === 0 ? 'P' : speed < 0 ? 'R' : 'D';
  return <header className="hmi-statusbar hmi-figma-status" data-figma-node="556:3522" aria-label={uiText("车机状态栏")}>
    <div className="hmi-chrome-driving">
      <time className="hmi-chrome-time">{uiText(clock.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }))}</time>
      <div className="hmi-chrome-range" aria-label={uiText("预估续航未接入")} title={uiText("尚未接入续航数据")}>
        <div><span>—<small>{uiText(distanceUnit)}</small></span><small>{uiText("预估")}</small></div>
        <span className="hmi-chrome-range-track" />
      </div>
      <div className="hmi-chrome-gears" aria-label={uiText("仿真挡位 {0}", [gear])} title={uiText("依据仿真速度显示，未接入真实挡位")}>
        {['P', 'R', 'N', 'D'].map(item => <span key={item} className={item === gear ? 'is-current' : undefined}>{uiText(item)}</span>)}
      </div>
    </div>
    <div className="hmi-chrome-connections">
      <span className="hmi-chrome-status-icon" role="img" aria-label={uiText(hmi.message || uiText("暂无座舱消息"))} title={uiText(hmi.message || uiText("暂无座舱消息"))}><Icon name="message" />{hmi.alert === 'warning' && <i className="hmi-chrome-notification" />}</span>
      <span className="hmi-chrome-status-icon" role="img" aria-label={uiText("车机 Wi-Fi 状态未接入")} title={uiText("车机 Wi-Fi 状态未接入")}><Icon name="wifi" /></span>
      <button type="button" className="hmi-chrome-status-icon" aria-label={uiText("手机互联")} title={uiText("手机互联")} onClick={onPhone}><Icon name="connect" /></button>
    </div>
  </header>;
}

function Temperature({ side, value, onAdjust, onSettings }: { side: 'left' | 'right'; value: number; onAdjust: (delta: number) => void; onSettings: () => void }) {
  useUiLanguage();
  const label = side === 'left' ? '左侧' : '右侧';
  const [integer, fraction] = value.toFixed(1).split('.');
  return <div className="hmi-chrome-temperature" title={uiText("当前仿真为全舱联动温度，尚未接入独立双温区")}>
    <button type="button" aria-label={uiText(side === 'left' ? uiText("降低温度") : uiText("右侧降低温度"))} disabled={value <= 16} onClick={() => onAdjust(-1)}><Icon name="temperature-arrow" className="hmi-chrome-arrow hmi-chrome-arrow--left" /></button>
    <button type="button" aria-label={uiText(side === 'left' ? uiText("空调设置") : uiText("右侧空调设置"))} onClick={onSettings}><span className="hmi-chrome-temperature-value" aria-label={uiText("{0}全舱联动温度 {1} 摄氏度", [label, value])}>{uiText(integer)}<small>.{uiText(fraction)}</small></span></button>
    <button type="button" aria-label={uiText(side === 'left' ? uiText("升高温度") : uiText("右侧升高温度"))} disabled={value >= 30} onClick={() => onAdjust(1)}><Icon name="temperature-arrow" className="hmi-chrome-arrow hmi-chrome-arrow--right" /></button>
  </div>;
}

export function HmiDock({ temperature, acOn, music, panel, onHome, onPanel, onAdjust, onToggleAc }: {
  temperature: number; acOn: boolean; music: string; panel: HmiPanel;
  onHome: () => void; onPanel: (panel: HmiPanel) => void; onAdjust: (delta: number) => void; onToggleAc: () => void;
}) {
  useUiLanguage();
  return <footer className="hmi-dock hmi-figma-dock" data-figma-node="556:3524" aria-label={uiText("车机快捷控制栏")}>
    <nav className="hmi-chrome-dock-items" aria-label={uiText("车机 Dock")}>
      <button type="button" className="hmi-chrome-dock-button" aria-label={uiText("返回车机桌面")} title={uiText("返回车机桌面")} onClick={onHome}><Icon name="home" /></button>
      <button type="button" className="hmi-chrome-dock-button" aria-label={uiText("打开车辆控制")} title={uiText("车辆控制")} aria-pressed={panel === 'vehicle'} onClick={() => onPanel('vehicle')}><Icon name="vehicle" /></button>
      <button type="button" className="hmi-chrome-dock-button" aria-label={uiText("导航")} title={uiText("导航")} aria-pressed={panel === 'navigation'} onClick={() => onPanel('navigation')}><Icon name="navigation" /></button>
      <button type="button" className="hmi-chrome-dock-button" aria-label={uiText("打开应用中心")} title={uiText("应用中心")} aria-pressed={panel === 'apps'} onClick={() => onPanel('apps')}><Icon name="apps" /></button>
      <Temperature side="left" value={temperature} onAdjust={onAdjust} onSettings={() => onPanel('vehicle')} />
      <button type="button" className="hmi-chrome-dock-button" aria-label={uiText("切换空调")} title={uiText(acOn ? uiText("关闭空调") : uiText("开启空调"))} aria-pressed={acOn} onClick={onToggleAc}><Icon name="fan" /></button>
      <Temperature side="right" value={temperature} onAdjust={onAdjust} onSettings={() => onPanel('vehicle')} />
      <span className="hmi-chrome-unavailable" title={uiText("前风挡除雾尚未接入")}><button type="button" className="hmi-chrome-dock-button" aria-label={uiText("前风挡除雾（尚未接入）")} disabled><span className="hmi-chrome-front-defrost"><Icon name="defrost-front-glass" /><Icon name="defrost-front-air" /></span></button></span>
      <span className="hmi-chrome-unavailable" title={uiText("后窗除雾尚未接入")}><button type="button" className="hmi-chrome-dock-button" aria-label={uiText("后窗除雾（尚未接入）")} disabled><Icon name="defrost-rear" /></button></span>
      <button type="button" className="hmi-chrome-media" aria-label={uiText("音乐空间")} title={uiText(music || uiText("打开音乐空间"))} onClick={() => onPanel('media')}>
        <img className="hmi-chrome-album" src={`${assetRoot}album.png`} alt="" />
        <span className="hmi-chrome-track"><span>{uiText(music || uiText("未播放"))}</span><span className="hmi-chrome-track-line" /></span>
      </button>
    </nav>
  </footer>;
}
