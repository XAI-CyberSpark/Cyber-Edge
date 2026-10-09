import { uiText, useUiLanguage  } from '@/i18n';
import { TeslaMedia } from '../hmi-tesla/TeslaMedia';
import { TeslaNavigation } from '../hmi-tesla/TeslaNavigation';
import { TeslaSettings } from '../hmi-tesla/TeslaSettings';
import { TeslaDock } from '../hmi-tesla/TeslaDock';
import { readHmiControl } from '@/domain/hmiControls';
import { HmiWidgetLibrary } from '../hmi-widgets/HmiWidgetLibrary';
import type { HmiWidgetAdapter, HmiWidgetData } from '../hmi-widgets/catalog';
import { AppIcon } from '@/components/ui/AppIcon';
import { RearVideoWindow } from './RearVideo';
import { HmiStatusBar, type HmiPanel } from './HmiChrome';
import { CockpitAssistant } from './CockpitAssistant';
import { useEffect, useRef, useState } from 'react';
import { Car, CloudRain, Sun, SlidersHorizontal, RotateCcw, Navigation, X, Music2, Smartphone, LayoutGrid, Images, CalendarDays } from 'lucide-react';
import type { VehicleWorld, VehicleWorldSnapshot } from '@/domain/vehicleWorld';
import { WINDOW_NAMES } from '@/domain/vehicleWorld';
import type { HMIState, ScenarioState, VehicleDynamics } from './VehicleSimulator';
import type { RuntimeRunResult } from '@/domain/runtime';
import { HmiCarStage } from '@/components/spatial/HmiCarStage';
import './cockpit-hmi.css';
import './hmi-chrome.css';
import './hmi-refinements.css';
import './assistant-figma.css';
import './ambient-light.css';

interface Props {
  active?: boolean;
  widgetAdapter?: HmiWidgetAdapter; widgetData?: HmiWidgetData;
  world: VehicleWorld; snapshot: VehicleWorldSnapshot; scenario: ScenarioState; hmi: HMIState; dynamics: VehicleDynamics;
  update: (category: string, key: string, value: string) => void;
  onRun?: () => Promise<RuntimeRunResult>; onCreateRain?: () => void; onCreateChild?: () => void; running?: boolean; workflowName?: string;
}
export function CockpitHmi({ active = true, world, snapshot, scenario, hmi, dynamics, update, onRun, onCreateRain, onCreateChild, running, workflowName, widgetAdapter, widgetData }: Props) {
  useUiLanguage();
  const [tools, setTools] = useState(false);
  const [settingsPage,setSettingsPage]=useState('quick');
  const [panel, setPanel] = useState<HmiPanel>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [clock, setClock] = useState(new Date());
  const [modelError, setModelError] = useState(false);
  const [runResult, setRunResult] = useState<RuntimeRunResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const { car, moving, blockedWindow, lastResult } = snapshot;
  const busy = !!running || pending || moving;
  const windowsOpen = Object.values(car.windows).filter(value => value > 0).length;
  const music = hmi.musicTrack && hmi.musicTrack !== 'off' ? hmi.musicTrack : '';
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 10000); return () => window.clearInterval(timer); }, []);
  const panelOpen = Boolean(panel);
  useEffect(() => {
    if (!panelOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentDialog = dialog.current;
    return () => {
      // Keep focus in the workspace if the user has already moved outside the HMI.
      if (document.activeElement === document.body || currentDialog?.contains(document.activeElement)) {
        trigger?.focus({ preventScroll: true });
      }
    };
  }, [panelOpen]);
  useEffect(() => {
    if (panel) dialog.current?.querySelector<HTMLButtonElement>('.cockpit-close')?.focus({ preventScroll: true });
  }, [panel]);
  const widgetPanel = panel === 'widgets' || panel === 'gallery' || panel === 'schedule';
  const panelTitle = panel ? ({ vehicle: '车辆控制', navigation: '导航', media: '音乐空间', phone: '手机互联', apps: '应用中心', widgets: '桌面组件', gallery: '图库', schedule: '日程' }[panel]) : '';
  const run = async () => {
    if (!onRun || busy) return;
    setPending(true); setError(''); setRunResult(null);
    try { setRunResult(await onRun()); } catch (cause) { setError(cause instanceof Error ? cause.message : '工作流运行失败'); }
    finally { setPending(false); }
  };
  return <section className={`cockpit-hmi cockpit-showroom cockpit-minimal ${scenario.time === 'night' ? 'cockpit-night' : ''} ${readHmiControl(car,'display.mode')==='night' || readHmiControl(car,'display.mode')==='auto' && scenario.time==='night' ? 'tesla-theme-night' : ''}`} style={{filter:`brightness(${Number(readHmiControl(car,'display.brightness'))/100})`}} aria-label={uiText("座舱 HMI 仿真")}>
    <div className="hmi-surface" inert={panelOpen}>
    <HmiStatusBar distanceUnit={readHmiControl(car,'display.distance') as 'km'|'mi'} clock={clock} speed={dynamics.speed} hmi={hmi} onPhone={() => setPanel('phone')} />
    <CockpitAssistant active={active} world={world} snapshot={snapshot} hmi={hmi} running={!!running || pending} />
    <div className="hmi-home">
      <div className="hmi-vehicle-caption"><p>{uiText(car.doors.locked ? uiText("车辆已锁定") : uiText("车辆已解锁"))}<span>·</span>{uiText(moving ? uiText("车窗调节中") : windowsOpen ? uiText("{0} 扇车窗开启", [windowsOpen]) : uiText("车窗全部关闭"))}</p></div>
      <div className="cockpit-car"><HmiCarStage locked={car.doors.locked} onUnlock={() => world.setCar(p => ({ ...p, doors: { ...p.doors, locked: false } }))} windows={car.windows} night={scenario.time === 'night'} onError={() => setModelError(true)} /></div>
      {modelError && <div className="cockpit-model-error">{uiText("车模加载失败，车辆控制仍可使用。")}</div>}
      {music && <button className="hmi-now-playing" onClick={() => setPanel('media')} aria-label={uiText("查看当前媒体")}><Music2 size={16} /><span>{uiText(music)}</span><small>{uiText("媒体目标")}</small></button>}
    </div>
    {snapshot.ambientFeedback && <section className="hmi-ambient-feedback" aria-label={uiText("氛围灯体验")} aria-live="polite">
      <div className="hmi-ambient-strip" data-color={car.lights.ambientColor} data-brightness={car.lights.brightness} style={{ backgroundColor: car.lights.ambientColor, opacity: car.lights.brightness / 100 }} />
      <div className="hmi-ambient-content"><div className="hmi-ambient-heading"><strong className="type-hmi-label">{uiText(snapshot.ambientFeedback.restored ? uiText("氛围灯已恢复") : uiText("氛围灯已调节"))}</strong><span className="type-hmi-caption">{uiText("HMI 仿真 ·")}{uiText(car.lights.ambientColor)} · {uiText(car.lights.brightness)}%</span></div>
      {snapshot.ambientFeedback.reason && <p className="type-hmi-caption">{uiText(snapshot.ambientFeedback.reason)}</p>}
      {snapshot.ambientFeedback.poseTips && <p className="type-hmi-body">{uiText(snapshot.ambientFeedback.poseTips)}</p>}
      {!snapshot.ambientFeedback.restored && <button type="button" className="type-hmi-label" disabled={busy} onClick={() => { world.restoreAmbientLight(); update('hmi', 'message', '自拍结束，已恢复原来的氛围灯。'); }}>{uiText("结束自拍 · 恢复灯光")}</button>}</div>
    </section>}
    <div className="tesla-ambient-status type-hmi-caption" aria-label={uiText("氛围灯当前状态")}><i style={{backgroundColor:car.lights.ambientColor,opacity:readHmiControl(car,'lights.ambient') ? car.lights.brightness/100 : 0}}/><span>{uiText("氛围灯")}{uiText(readHmiControl(car,'lights.ambient') ? `${car.lights.brightness}%` : uiText("关闭"))}</span></div>
    <RearVideoWindow />
    <TeslaDock world={world} car={car} onPanel={next=>{setSettingsPage('quick');setPanel(next);}} onClimate={()=>{setSettingsPage('climate');setPanel('vehicle');}} onHome={()=>{setPanel(null);setTools(false);}} />
    </div>
    <div className="hmi-panel-layer" hidden={!panelOpen} onClick={event => { if (event.target === event.currentTarget) setPanel(null); }}>
    <dialog ref={dialog} open={panelOpen} className={`hmi-dialog ${panel === 'vehicle' ? 'hmi-vehicle-dialog' : ''} ${widgetPanel ? 'hmi-widget-dialog' : ''} ${['vehicle','media','navigation'].includes(panel || '') ? 'tesla-dialog' : ''}`} onCancel={() => setPanel(null)} onClose={() => setPanel(null)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPanel(null); } }} aria-label={uiText(panelTitle)}>
      <div className="hmi-dialog-content"><button className="cockpit-close" aria-label={uiText("关闭面板")} onClick={() => setPanel(null)}><X size={21} /></button>
      <h2>{uiText(panelTitle)}</h2>
      {panel === 'vehicle' && <TeslaSettings key={settingsPage} world={world} snapshot={snapshot} initialPage={settingsPage} />}
      {widgetPanel && <HmiWidgetLibrary category={panel === 'widgets' ? undefined : panel as 'navigation' | 'media' | 'gallery' | 'schedule'} adapter={widgetAdapter}
        data={{ ...widgetData, navigation: { destination: hmi.navDestination, ...widgetData?.navigation }, media: { title: music || undefined, playing: !!music, ...widgetData?.media } }}
        onSimulateDestination={value => update('hmi', 'nav', value)} onSimulateMedia={(value, playing) => update('hmi', 'music', playing ? value : 'off')} />}
      {panel === 'navigation' && <TeslaNavigation destination={hmi.navDestination} onDestination={value=>update('hmi','nav',value)} />}
      <TeslaMedia active={panel==='media'} track={hmi.musicTrack} onTrack={value=>update('hmi','music',value)} />
      {panel === 'phone' && <div className="hmi-detail"><Smartphone size={48} /><h3>{uiText("等待连接手机")}</h3><p>{uiText("连接后可在车机访问手机应用与通话。")}</p><small>{uiText("当前尚未接入手机互联服务。")}</small></div>}
      {panel === 'apps' && <div className="hmi-app-grid"><button onClick={() => setPanel('widgets')}><LayoutGrid />{uiText("桌面组件")}</button><button onClick={() => setPanel('gallery')}><Images />{uiText("图库")}</button><button onClick={() => setPanel('schedule')}><CalendarDays />{uiText("日程")}</button><button onClick={() => setPanel('vehicle')}><Car />{uiText("车辆控制")}</button><button onClick={() => setPanel('navigation')}><Navigation />{uiText("导航")}</button><button onClick={() => setPanel('media')}><Music2 />{uiText("音乐")}</button><button onClick={() => setPanel('phone')}><Smartphone />{uiText("手机互联")}</button><button aria-label={uiText("切换日夜")} onClick={() => update('scenario', 'time', scenario.time === 'day' ? 'night' : 'day')}><AppIcon name={scenario.time === 'day' ? 'moon' : 'sun'} />{uiText(scenario.time === 'day' ? uiText("夜间模式") : uiText("日间模式"))}</button><button onClick={() => { setPanel(null); setTools(true); }}><SlidersHorizontal />{uiText("测试台")}</button></div>}
      {panel === 'vehicle' && lastResult && <p className={lastResult.success ? '' : 'has-fault'} role="status"><AppIcon name={lastResult.success ? 'check' : 'triangle-alert'} size={15} />{uiText(lastResult.success ? uiText("车窗动作已完成") : uiText("{0}未达到目标开度", [lastResult.failedWindows.map(key => uiText(WINDOW_NAMES[key])).join(' / ')]))}</p>}
      {hmi.rearCamera.visible && <p>{uiText("后排画面请求已收到 · 未接入视频流")}</p>}
      </div>
    </dialog>
    </div>
    {tools && <aside inert={panelOpen} className="cockpit-testbench" aria-label={uiText("仿真测试台")}><div className="cockpit-test-title"><div><small>SIMULATION LAB</small><h3>{uiText("场景测试台")}</h3></div><button aria-label={uiText("收起测试台")} onClick={() => setTools(false)}><X size={18} /></button></div>
      <p>{uiText("先打开车窗，再设置天气；运行当前工作流，观察车辆反馈。")}</p>
      <div className="cockpit-button-pair"><button disabled={busy} onClick={() => update('scenario', 'weather', 'rain')} className={scenario.weather === 'rain' ? 'is-active' : ''}><CloudRain size={15} />{uiText("注入下雨")}</button><button disabled={busy} onClick={() => update('scenario', 'weather', 'clear')} className={scenario.weather === 'clear' ? 'is-active' : ''}><Sun size={15} />{uiText("恢复晴天")}</button></div>
      <label className="cockpit-fault-switch"><input type="checkbox" checked={blockedWindow === 'rr'} disabled={busy} onChange={event => world.setFault(event.target.checked ? 'rr' : null)} />{uiText("注入右后窗卡住")}</label>
      <div className="cockpit-current-flow"><small>{uiText("当前工作流")}</small><strong>{workflowName || uiText("未命名")}</strong><button disabled={busy || !onCreateRain} onClick={onCreateRain}>{uiText("新建「雨天自动关窗」工作流 ↗")}</button><button disabled={busy || !onCreateChild} onClick={onCreateChild}>{uiText("新建「儿童关怀」工作流 ↗")}</button></div>
      <button className="cockpit-run" disabled={busy || !onRun} onClick={() => void run()}><AppIcon name={busy ? 'loader-circle' : 'play'} spinning={busy} size={16} />{uiText(busy ? uiText("执行中…") : uiText("运行当前工作流"))}</button>
      <button className="cockpit-wide" disabled={busy} onClick={() => { world.reset(); update('scenario', 'weather', 'clear'); update('hmi', 'message', '车辆状态已复位。'); update('hmi', 'alert', 'none'); setRunResult(null); setError(''); }}><RotateCcw size={14} />{uiText("复位车辆与故障")}</button>
      {error && <p role="alert" className="has-fault">{uiText(error)}</p>}
      {runResult && <div className="cockpit-trace"><strong>{uiText(runResult.status === 'completed' ? uiText("流程执行结束") : uiText("流程包含失败动作"))}</strong><small>{uiText("执行记录不等于自动验收通过")}</small>{runResult.events.filter(event => event.type === 'node_completed' || event.type === 'node_failed').map(event => <div key={event.id}><span className={event.type === 'node_failed' ? 'has-fault' : ''}>{uiText(event.type === 'node_failed' ? '!' : '✓')}</span><code>{event.nodeId}</code></div>)}</div>}
      <small className="cockpit-test-note">{uiText("车窗执行器为行为模型。本轮不连接真实车辆，不验证传感器精度。")}</small>
    </aside>}
  </section>;
}
