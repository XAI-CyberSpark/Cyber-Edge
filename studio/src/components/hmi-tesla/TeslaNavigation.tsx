import { uiText, useUiLanguage } from '@/i18n';
import {useEffect,useRef,useState} from 'react';
import {TeslaAsset,teslaAssetUrl} from './assets';
function ReferenceMap({zoom}: {zoom:number}) {
  useUiLanguage();
  const container=useRef<HTMLDivElement>(null);
  const [scale,setScale]=useState(1);
  useEffect(()=>{
    if(!container.current || typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setScale(Math.max(r.width/1340,r.height/1080));});
    observer.observe(container.current);return()=>observer.disconnect();
  },[]);
  return <div className="tesla-map-canvas" ref={container}><div className="tesla-map-artwork" style={{transform:`translate(-50%,-50%) scale(${scale*zoom})`}} aria-label={uiText("设计参考地图，非当前位置")}>
    <div className="tesla-map-background"><img src={teslaAssetUrl('nav-497-13861:imgMapBg')} alt=""/><img className="tesla-map-light" src={teslaAssetUrl('nav-497-13861:imgLight')} alt=""/></div>
    <img className="tesla-map-route" src={teslaAssetUrl('nav-497-13861:imgRoute')} alt={uiText("设计参考路线")}/>
    <img className="tesla-map-position" src={teslaAssetUrl('nav-497-13861:imgGroup')} alt={uiText("示例位置")}/>
    <img className="tesla-map-charger" src={teslaAssetUrl('nav-497-13861:imgChargingStation')} alt={uiText("示例充电站")}/>
    {[[415,197,'75'],[124,826,'20'],[716,786,'75'],[1086,176,'85'],[855,143,'400']].map(([x,y,label],i)=><span className="tesla-map-road type-hmi-title" key={i} style={{left:Number(x),top:Number(y)}}>{uiText(label)}</span>)}
  </div></div>;
}
export function TeslaNavigation({destination,onDestination}: {destination:string;onDestination:(value:string)=>void}) {
  useUiLanguage();
  const [query,setQuery]=useState('');
  const [zoom,setZoom]=useState(1);
  return <section className="tesla-navigation" aria-label={uiText("导航页面")} data-figma-node="497:13860">
    <ReferenceMap zoom={zoom}/>
    <form onSubmit={e=>{e.preventDefault();if(query.trim())onDestination(query.trim());}}><label className="type-hmi-caption" htmlFor="tesla-destination">{uiText("导航目的地")}</label><div><input id="tesla-destination" placeholder={uiText("想去哪里")} value={query} onChange={e=>setQuery(e.target.value)} required /><button type="submit">{uiText("设置")}</button></div></form>
    <aside className="tesla-directions"><h3 className="type-hmi-title">{uiText(destination==='Home'?uiText("家"):destination||uiText("尚未设置目的地"))}</h3><p>{uiText(destination?uiText("目的地已同步"):uiText("输入目的地开始"))}</p><p className="type-hmi-caption">{uiText("尚未接入定位和路线服务。背景为设计参考地图，不提供实时导航指引。")}</p><button type="button" disabled={!destination} onClick={()=>onDestination('')}>{uiText("清除目的地")}</button></aside>
    <div className="tesla-map-tools"><button type="button" aria-label={uiText("放大参考地图")} disabled={zoom>=2} onClick={()=>setZoom(Math.min(2,zoom+.25))}>＋</button><button type="button" aria-label={uiText("缩小参考地图")} disabled={zoom<=1} onClick={()=>setZoom(Math.max(1,zoom-.25))}>−</button><button type="button" aria-label={uiText("重置参考地图")} onClick={()=>setZoom(1)}><TeslaAsset slot="nav-497-13865:imgDirection" size={24}/></button></div>
  </section>;
}
