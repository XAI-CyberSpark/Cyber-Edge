import { uiText, useUiLanguage  } from '@/i18n';
import { useState } from 'react';
import { CarFront, Thermometer, PanelTop } from 'lucide-react';
import { HMI_CONTROLS, readHmiControl, type HmiValue } from '@/domain/hmiControls';
import { WINDOW_KEYS, WINDOW_NAMES, type VehicleWorld, type VehicleWorldSnapshot } from '@/domain/vehicleWorld';
import { TeslaAsset } from './assets';
import './tesla-hmi.css';

const pages = [
  ['quick','快捷控制','imgQuickControls','497:13883'], ['lights','灯光','imgLights','497:13896'],
  ['locks','车锁','imgLock','497:13922'], ['display','显示','imgGroup','497:13935'],
  ['driving','驾驶','','497:13948'], ['autopilot','驾驶辅助','imgSteeringWheelSmall','497:13961'],
  ['safety','安全','imgSafetyAndSecurity','497:13974'], ['service','维护','imgService','497:13987'],
  ['climate','空调与座椅','',''], ['windows','车窗','',''],
] as const;

export function TeslaSettings({world,snapshot,initialPage='quick'}: {world:VehicleWorld;snapshot:VehicleWorldSnapshot;initialPage?:string}) {
  useUiLanguage();
  const [page,setPage] = useState(initialPage);
  const [adjustment,setAdjustment] = useState<'mirrors'|'steering'|null>(null);
  const [error,setError] = useState('');
  const car = snapshot.car;
  const value = (id:string) => readHmiControl(car,id);
  const set = (id:string,next:HmiValue) => {try {world.executeHmiControl({control:id,value:next});setError('');}catch(cause){setError((cause as Error).message);}};
  const field = (id:string,compact=false) => {
    const spec = HMI_CONTROLS[id], current = value(id);
    if(id==='autopilot.distance') return <div className="tesla-field" key={id}><span>{uiText(spec.label)}</span><div className="tesla-follow-distance"><output>{uiText(String(current))}</output><button type="button" aria-label={uiText("增加跟车距离")} disabled={Number(current)>=7} onClick={()=>set(id,Number(current)+1)}><TeslaAsset slot="autopilot:imgArrow" /></button><button type="button" aria-label={uiText("减少跟车距离")} disabled={Number(current)<=1} onClick={()=>set(id,Number(current)-1)}><TeslaAsset slot="autopilot:imgArrow1" /></button></div></div>;
    if (spec.type === 'boolean') return <label className={`tesla-switch-row ${compact ? 'tesla-pill-toggle' : ''}`} key={id}>
      <span>{id==='service.wiper' && <TeslaAsset slot="service:imgWiper"/>}{uiText(spec.label)}</span><input type="checkbox" role="switch" aria-label={uiText(spec.label)} checked={Boolean(current)} onChange={e=>set(id,e.target.checked)} /><span className="tesla-switch-track" aria-hidden="true" />
    </label>;
    if (spec.options) return <fieldset className="tesla-field" key={id}><legend>{uiText(spec.label)}</legend><div className="tesla-segments">{Object.entries(spec.options).map(([option,label])=><button type="button" key={option} aria-pressed={current===option} onClick={()=>set(id,option)}>{uiText(option==='off' ? '关' : label)}</button>)}</div></fieldset>;
    if (spec.format === 'color') return <label className="tesla-field tesla-color" key={id}>{uiText(spec.label)}<input type="color" aria-label={uiText(spec.label)} value={String(current)} onChange={e=>set(id,e.target.value)} /><output>{uiText(String(current).toUpperCase())}</output></label>;
    return <label className="tesla-field" key={id}><span>{uiText(spec.label)}<output>{uiText(id==='ac.temp' && value('display.temperature')==='F' ? `${Math.round(Number(current)*9/5+32)}°F` : `${String(current)}${spec.unit||''}`)}</output></span><input aria-label={uiText(spec.label)} type="range" min={spec.min} max={spec.max} step={spec.step} value={Number(current)} onChange={e=>set(id,Number(e.target.value))} /></label>;
  };
  const title = (text:string,icon?:string) => <h3 className="tesla-section-title">{icon && <TeslaAsset slot={`quick:${icon}`} />}{uiText(text)}</h3>;
  return <section className="tesla-settings" data-figma-node={pages.find(p=>p[0]===page)?.[3]} aria-label={uiText("SU7 车辆设置")}>
    <nav className="tesla-settings-nav" aria-label={uiText("车辆设置分类")}>
      <div className="tesla-car-brand type-hmi-title">XIAOMI <span>SU7</span></div>
      {pages.map(([key,label,icon])=><button type="button" key={key} aria-current={page===key ? 'page' : undefined} onClick={()=>{setPage(key);setAdjustment(null);}}>
        <span className="tesla-settings-icon" aria-hidden="true">{icon ? <TeslaAsset slot={`quick:${icon}`} size={24} /> : key==='driving' ? <CarFront size={24} /> : key==='climate' ? <Thermometer size={24} /> : <PanelTop size={24} />}</span><span>{uiText(label)}</span>
      </button>)}
      <button type="button" className="tesla-glovebox" aria-pressed={Boolean(value('glovebox.open'))} onClick={()=>set('glovebox.open',!value('glovebox.open'))}><span className="tesla-settings-icon" aria-hidden="true"><TeslaAsset slot="quick:imgGlovebox" size={24} /></span><span>{uiText("手套箱")}{uiText(value('glovebox.open')?uiText(" · 已打开"):'')}</span></button>
      <p className="type-hmi-caption">{uiText("HMI 仿真 · 设置与节点同步")}</p>
    </nav>
    <div key={page} className="tesla-settings-body">
      <h2 className="tesla-page-heading">{uiText(pages.find(p=>p[0]===page)?.[1])}</h2>
      {page==='quick' && <>
        {field('display.brightness')}{title(uiText("外部灯光"),'imgHeadlightsSmall')}{field('lights.headlights')}{field('lights.fog',true)}
        {title(uiText("位置调节"),'imgAdjustments')}<div className="tesla-adjustments">
          <button type="button" aria-expanded={adjustment==='mirrors'} onClick={()=>setAdjustment(adjustment==='mirrors'?null:'mirrors')}><span className="tesla-mirrors"><TeslaAsset slot="quick:imgMirror" /><TeslaAsset slot="quick:imgMirror1" /></span>{uiText("后视镜")}</button>
          <button type="button" aria-expanded={adjustment==='steering'} onClick={()=>setAdjustment(adjustment==='steering'?null:'steering')}><TeslaAsset slot="quick:imgSteeringWheelSmall1" />{uiText("方向盘")}</button>
        </div>{field('mirrors.folded',true)}
        {adjustment==='mirrors' && <div className="tesla-adjustment-detail">{field('mirrors.horizontal')}{field('mirrors.vertical')}<p className="type-hmi-caption">{uiText("调整仿真角度；当前车模没有独立镜面动画。")}</p></div>}
        {adjustment==='steering' && <div className="tesla-adjustment-detail">{field('steering.height')}{field('steering.reach')}</div>}
      </>}
      {page==='lights' && <>{title(uiText("外部灯光"))}{field('lights.headlights')}{field('lights.fog',true)}{field('lights.hazard',true)}{title(uiText("内部灯光"))}{field('lights.dome')}{field('lights.ambient',true)}{field('lights.color')}{field('lights.brightness')}<div className="tesla-light-preview" aria-label={uiText("当前氛围灯")} style={{background:String(value('lights.color')),opacity:value('lights.ambient') ? Number(value('lights.brightness'))/100 : 0}} /></>}
      {page==='locks' && <>{field('doors.locked')}{field('locks.walkUp')}{field('locks.walkAway')}{field('locks.child')}{field('locks.parkUnlock')}<p className="type-hmi-caption">{uiText("自动上锁与儿童锁设置已保存。靠近、离车与挡位触发器尚未接入。")}</p></>}
      {page==='display' && <>{title(uiText("可见性"))}{field('display.mode')}{field('display.brightness')}<p className="type-hmi-caption">{uiText("亮度作用于车机界面，日夜模式作用于设置面板。")}</p>{title(uiText("单位与格式"))}{field('display.distance')}{field('display.temperature')}</>}
      {page==='driving' && <>{field('driving.steering')}{field('driving.regen')}<p className="type-hmi-caption">{uiText("驾驶偏好保存在仿真状态中，当前没有车辆动力学执行器。")}</p>{title(uiText("牵引力控制"))}{field('driving.slipStart',true)}{field('driving.creep',true)}</>}
      {page==='autopilot' && <>{field('autopilot.distance')}{field('autopilot.autosteer')}{field('autopilot.laneChange')}<p className="type-hmi-caption">{uiText("仅保存辅助驾驶设置；当前仿真未实现自动转向、跟车或变道轨迹。")}</p></>}
      {page==='safety' && <>{title(uiText("驻车制动"))}<button type="button" className="tesla-brake" aria-pressed={Boolean(value('safety.parkingBrake'))} onClick={()=>set('safety.parkingBrake',!value('safety.parkingBrake'))}><span className="tesla-brake-icon"><TeslaAsset slot="safety:imgEllipse18" size={44}/><span className="tesla-brake-ring"><TeslaAsset slot="safety:imgEllipse2" size={32}/><b>P</b></span></span><span>{uiText(value('safety.parkingBrake')?uiText("驻车制动已启用"):uiText("驻车制动已释放"))}</span></button>{title(uiText("车辆电源"))}{field('safety.power',true)}<p className="type-hmi-caption">{uiText("车辆电源与驻车状态可由节点回读；界面保留操作入口以便恢复。")}</p></>}
      {page==='service' && <>{title(uiText("雨刷"))}{field('service.wiper',true)}{title(uiText("大灯调节"),'imgHeadlightsSmall')}{field('service.headlightHeight')}<button type="button" className="tesla-pill" onClick={()=>set('service.headlightHeight',0)}>{uiText("重置大灯高度")}</button><p className="type-hmi-caption">{uiText("维护参数已接入共享状态，SU7 车模暂未提供对应部件动画。")}</p></>}
      {page==='climate' && <>{field('ac.on')}{field('ac.temp')}{field('ac.mode')}{field('ac.fan')}{field('ac.frontDefrost')}{field('ac.rearDefrost')}{title(uiText("座椅"))}<div className="tesla-seat-grid">{[0,1,2,3].map(i=><section key={i}>{field(`seat.heat.${i}`)}{field(`seat.vent.${i}`)}{i<2 && field(`seat.position.${i}`)}</section>)}</div>{title(uiText("遮阳帘"))}{[1,2,3,4].map(i=>field(`sunshade.${i}`))}</>}
      {page==='windows' && <>{title(uiText("车窗开度"))}{WINDOW_KEYS.map(key=><label className="tesla-field" key={key}><span>{uiText(WINDOW_NAMES[key])}<output>{uiText(car.windows[key])}%</output></span><input aria-label={uiText("{0}开度", [uiText(WINDOW_NAMES[key])])} type="range" min="0" max="100" step="10" disabled={snapshot.moving} value={car.windows[key]} onChange={e=>void world.moveWindows({[key]:Number(e.target.value)},'manual',300)} />{snapshot.blockedWindow===key && <small>{uiText("执行器卡住")}</small>}</label>)}<div className="tesla-segments">{[100,0].map(v=><button type="button" key={v} disabled={snapshot.moving} onClick={()=>void world.moveWindows({fl:v,fr:v,rl:v,rr:v},'manual')}>{uiText(v?uiText("全部打开"):uiText("全部关闭"))}</button>)}</div>{snapshot.lastResult && <p role="status">{uiText(snapshot.lastResult.success?uiText("车窗已达到目标开度"):uiText("车窗未达到目标开度，请检查故障"))}</p>}</>}
      {error && <p role="alert">{uiText(error)}</p>}
    </div>
  </section>;
}
