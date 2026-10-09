import { uiText, useUiLanguage } from '@/i18n';
import type { VehicleWorld, VehicleState } from '@/domain/vehicleWorld';
import { readHmiControl } from '@/domain/hmiControls';
import type { HmiPanel } from '../core/HmiChrome';
import { TeslaAsset } from './assets';

export function TeslaDock({world,car,onPanel,onClimate,onHome}: {world:VehicleWorld;car:VehicleState;onPanel:(panel:HmiPanel)=>void;onClimate:()=>void;onHome:()=>void}) {
  useUiLanguage();
  const set = (control:string,value:number|boolean) => { if(control==='ac.temp') world.executeHmiControl({control:'ac.on',value:true}); return world.executeHmiControl({control,value}); };
  const toggle = (control:string) => set(control,!readHmiControl(car,control));
  const temp = readHmiControl(car,'display.temperature') === 'F' ? Math.round(car.ac.temp*9/5+32) : car.ac.temp;
  const temperature = (side:string) => <div className="tesla-dock-temperature">
    <button type="button" aria-label={uiText(side==='左侧'?uiText("降低温度"):uiText("{0}降低温度", [side]))} disabled={car.ac.temp<=16} onClick={()=>set('ac.temp',car.ac.temp-1)}>−</button>
    <button type="button" aria-label={uiText("{0}空调设置", [side])} onClick={onClimate}>{uiText(temp)}°</button>
    <button type="button" aria-label={uiText(side==='左侧'?uiText("升高温度"):uiText("{0}升高温度", [side]))} disabled={car.ac.temp>=30} onClick={()=>set('ac.temp',car.ac.temp+1)}>+</button>
  </div>;
  return <footer className="tesla-dock" data-figma-node="497:13871" aria-label={uiText("车机快捷控制栏")}><nav aria-label={uiText("车机 Dock")}>
    <button type="button" aria-label={uiText("打开车辆控制")} onClick={()=>onPanel('vehicle')}><span className="tesla-su7-wordmark">SU7</span></button>
    <button type="button" aria-label={uiText("前风挡除雾")} aria-pressed={Boolean(readHmiControl(car,'ac.frontDefrost'))} onClick={()=>toggle('ac.frontDefrost')}><TeslaAsset slot="dock:imgDefrost" /></button>
    <button type="button" aria-label={uiText("后窗除雾")} aria-pressed={Boolean(readHmiControl(car,'ac.rearDefrost'))} onClick={()=>toggle('ac.rearDefrost')}><TeslaAsset slot="dock:imgHeater" /></button>
    <button type="button" aria-label={uiText("主驾座椅加热 {0} 档", [readHmiControl(car,'seat.heat.0')])} aria-pressed={Number(readHmiControl(car,'seat.heat.0'))>0} onClick={()=>set('seat.heat.0',(Number(readHmiControl(car,'seat.heat.0'))+1)%4)}><TeslaAsset slot="dock:imgSeat1" /></button>
    {temperature(uiText("左侧"))}
    <button type="button" aria-label={uiText("切换空调")} aria-pressed={car.ac.on} onClick={()=>toggle('ac.on')}><TeslaAsset slot="dock:imgFan" /><small>{uiText(car.ac.on ? car.ac.mode==='auto'?'AUTO':uiText("{0} 档", [car.ac.fan]):'OFF')}</small></button>
    {temperature(uiText("右侧"))}
    <button type="button" aria-label={uiText("副驾座椅加热 {0} 档", [readHmiControl(car,'seat.heat.1')])} aria-pressed={Number(readHmiControl(car,'seat.heat.1'))>0} onClick={()=>set('seat.heat.1',(Number(readHmiControl(car,'seat.heat.1'))+1)%4)}><span className="tesla-seat-mirror"><TeslaAsset slot="dock:imgSeat" /></span></button>
    <button type="button" aria-label={uiText("音乐空间")} onClick={()=>onPanel('media')}><TeslaAsset slot="dock:imgMusic" /></button>
    <button type="button" aria-label={uiText("手机互联")} onClick={()=>onPanel('phone')}><TeslaAsset slot="dock:imgPhone" /></button>
    <button type="button" aria-label={uiText("导航")} onClick={()=>onPanel('navigation')}>↗</button>
    <button type="button" aria-label={uiText("打开应用中心")} onClick={()=>onPanel('apps')}>···</button>
    <button type="button" aria-label={uiText("返回车机桌面")} onClick={onHome}>⌂</button>
  </nav></footer>;
}
