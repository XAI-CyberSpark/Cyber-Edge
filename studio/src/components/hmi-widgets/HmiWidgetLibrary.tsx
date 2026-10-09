import { uiText, useUiLanguage  } from '@/i18n';
import { Play } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FigmaWidgetArtwork } from './FigmaWidgetArtwork';
import { HMI_WIDGET_CATALOG, HMI_WIDGET_CAPABILITIES, type HmiWidgetAction, type HmiWidgetAdapter, type HmiWidgetCategory, type HmiWidgetData, type HmiWidgetId } from './catalog';
import './hmi-widgets.css';

interface Props {
  category?: HmiWidgetCategory;
  data?: HmiWidgetData;
  adapter?: HmiWidgetAdapter;
  onSimulateDestination?: (destination: string) => void;
  onSimulateMedia?: (track: string, playing: boolean) => void;
}
const sourceNames = { online: '在线音乐', radio: '收音机', bluetooth: '蓝牙媒体', usb: 'USB媒体' } as const;
const sampleTracks = ['说好的幸福在哪里', '每日30首', '精选有声书', '每日精选MV'];
export function HmiWidgetLibrary({category, data, adapter, onSimulateDestination, onSimulateMedia}: Props) {
  useUiLanguage();
  const [filter,setFilter] = useState<HmiWidgetCategory | 'all'>(category ?? 'all');
  const [track,setTrack] = useState(data?.media?.title || sampleTracks[0]);
  const [playing,setPlaying] = useState(data?.media?.playing ?? false);
  const [favorite,setFavorite] = useState(data?.media?.favorite ?? false);
  const [source,setSource] = useState<keyof typeof sourceNames>(data?.media?.source ?? 'online');
  const [detail,setDetail] = useState<HmiWidgetId | null>(null);
  const [query,setQuery] = useState('');
  const [notice,setNotice] = useState(adapter ? '服务已连接，等待操作。' : '设计示例已载入，可体验本地状态。');
  const [pending,setPending] = useState(false);
  const [failed,setFailed] = useState(false);
  const controller=useRef<AbortController | null>(null);
  const details=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{setFilter(category ?? 'all');setDetail(null);},[category]);
  useEffect(()=>{ if(data?.media?.title) setTrack(data.media.title); if(data?.media?.playing!==undefined)setPlaying(data.media.playing); if(data?.media?.favorite!==undefined)setFavorite(data.media.favorite); if(data?.media?.source)setSource(data.media.source); },[data?.media?.title,data?.media?.playing,data?.media?.favorite,data?.media?.source]);
  useEffect(()=>{if(detail)details.current?.focus();},[detail]);
  const act=async(action:HmiWidgetAction) => {
    if(controller.current) return;
    setFailed(false);
    if(adapter){
      const request=new AbortController();controller.current=request;setPending(true);
      try { const result=await adapter.execute(action,{signal:request.signal}); if(!request.signal.aborted){setNotice(result.message);setFailed(result.status==='unavailable');} }
      catch(error){ if(!request.signal.aborted){setFailed(true);setNotice(error instanceof Error ? error.message : '操作失败，请重试。');} }
      finally {if(controller.current===request){controller.current=null;if(!request.signal.aborted)setPending(false);}}
      return;
    }
    switch(action.type){
      case 'navigation.destination': onSimulateDestination?.(action.destination);setNotice(`模拟目的地已设为${action.destination==='Home'?'家':action.destination}；路线仍为设计示例。`);break;
      case 'navigation.search': setNotice(`已预览“${action.query || (action.kind==='favorite'?'收藏地点':'加油站')}”查询入口，地点服务待接入。`);break;
      case 'media.playback': setTrack(action.track);setPlaying(action.playing);onSimulateMedia?.(action.track,action.playing);setNotice(`媒体状态模拟：${action.playing?'播放':'暂停'} · ${action.track}。此预览不输出音频。`);break;
      case 'media.favorite':setFavorite(action.favorite);setNotice(action.favorite?'已在本次预览中收藏。':'已取消本次预览收藏。');break;
      case 'media.source':setSource(action.source);setNotice(`已选择${sourceNames[action.source]}入口，媒体服务待接入。`);break;
      case 'gallery.open':setNotice('正在查看设计示例照片，尚未读取个人图库。');break;
      case 'calendar.open':setNotice('正在查看设计示例日程，尚未连接个人日历。');break;
    }
  };
  const open=(id:HmiWidgetId)=>{setDetail(id);if(id.startsWith('gallery'))void act({type:'gallery.open',photoId:id});if(id.startsWith('schedule'))void act({type:'calendar.open',date:data?.calendar?.date || '2022-09-20'});};
  const labels:Record<string,string>={
    '1:19881':data?.media?.title || track, '1:19882':data?.media?.artist || '周杰伦',
    ...(data?.navigation?.road ? {'1:19773':data.navigation.road,'1:19964':`进入${data.navigation.road}`} : {}),
    ...(data?.navigation?.distanceMeters!==undefined ? {'1:19775':String(data.navigation.distanceMeters),'1:19966':String(data.navigation.distanceMeters)} : {}),
    ...(data?.gallery?.dateLabel?{'1:19850':data.gallery.dateLabel,'1:19972':data.gallery.dateLabel}:{}),
    ...(data?.gallery?.yearLabel?{'1:19851':data.gallery.yearLabel,'1:19973':data.gallery.yearLabel}:{}),
    ...(data?.calendar?.day?{'1:19983':data.calendar.day}:{}),
    ...(data?.calendar?.weekday?{'1:19985':data.calendar.weekday}:{}),
    ...(data?.calendar?.eventTitle?{'1:19979':data.calendar.eventTitle}:{}),
    ...(data?.calendar?.timeRange?{'1:19977':data.calendar.timeRange}:{}),
    ...(data?.calendar?.monthLabel?{'1:20004':data.calendar.monthLabel,'1:20002':'','1:20003':''}:{}),
  };
  const dateNodes=[14,15,16,17,18,19,20,22,23,24,25,26,27,28,30,31,32,33,34,35,36,38,39,40,41,42,43,44,46,47,48,49,50,51];
  data?.calendar?.dayLabels?.slice(0,dateNodes.length).forEach((day,i)=>{labels[`1:200${dateNodes[i]}`]=day;});
  function artwork(id:HmiWidgetId,interactive=true){
    const spec=HMI_WIDGET_CATALOG.find(w=>w.id===id)!;
    const navShort=id==='navigation-map'||id==='navigation-shortcuts';
    return <div className={`hmi-widget-frame ${spec.width===216?'is-small':''}`} data-widget-id={id} data-playing={playing} data-favorite={favorite} style={{'--widget-width':`${spec.width/2}px`,'--widget-height':`${spec.height/2}px`} as CSSProperties}>
      <div className="hmi-widget-canvas" aria-hidden="true"><FigmaWidgetArtwork id={id} labels={labels} images={{album:data?.media?.coverUrl,photo:data?.gallery?.photoUrl}}/></div>
      {interactive&&navShort&&<div className={`hmi-widget-nav-actions ${id==='navigation-map'?'is-map':''}`}>
        {[uiText("搜索"),uiText("回家"),uiText("收藏"),uiText("加油")].map((name,i)=><button key={name} type="button" aria-label={`${uiText(spec.name)}: ${name}`} disabled={pending} onClick={()=>{if(i===1)void act({type:'navigation.destination',destination:'Home'});else if(i>1)void act({type:'navigation.search',query:'',kind:i===2?'favorite':'fuel'});else {open(id);setQuery('');}}}/>)}
      </div>}
      {interactive&&id==='media-player'&&<div className="hmi-widget-player-actions">
        <button type="button" aria-label={uiText(playing?uiText("暂停媒体预览"):uiText("播放媒体预览"))} aria-pressed={playing} disabled={pending} onClick={()=>void act({type:'media.playback',track,playing:!playing})}>{!playing&&<Play className="hmi-widget-play-icon" fill="currentColor" aria-hidden="true"/>}</button>
        <button type="button" aria-label={uiText("下一首媒体预览")} disabled={pending} onClick={()=>void act({type:'media.playback',track:sampleTracks[(sampleTracks.indexOf(track)+1)%sampleTracks.length],playing:true})}/>
        <button type="button" aria-label={uiText(favorite?uiText("取消曲目收藏"):uiText("收藏曲目"))} aria-pressed={favorite} disabled={pending} onClick={()=>void act({type:'media.favorite',track,favorite:!favorite})}/>
      </div>}
      {interactive&&!navShort&&id!=='media-player'&&<button type="button" className="hmi-widget-open" disabled={pending} aria-label={uiText("打开{0}", [spec.name])} onClick={()=>open(id)}/>}
    </div>;
  }
  return <section className="hmi-widget-library" aria-label={uiText("HMI桌面组件")}>
    <div className="hmi-widget-toolbar"><div className="hmi-widget-tabs" aria-label={uiText("组件分类")}>{(category ? HMI_WIDGET_CAPABILITIES.filter(item=>item.id===category) : [{id:'all',name:uiText("全部")},...HMI_WIDGET_CAPABILITIES]).map(item=><button key={item.id} type="button" className="type-hmi-label" aria-pressed={filter===item.id} onClick={()=>{setFilter(item.id as typeof filter);setDetail(null);}}>{uiText(item.name)}</button>)}</div><span className="type-hmi-caption hmi-widget-mode">{uiText(adapter?uiText("服务已连接"):uiText("本地预览"))}</span></div>
    <p className="type-hmi-caption hmi-widget-intro">{uiText("导航、音乐、图库与日程 ·")}{data?.navigation?.destination ? uiText("当前目的地：{0}。", [data.navigation.destination==='Home'?'家':data.navigation.destination]) : ''}{uiText("地图与内容默认使用设计示例。")}</p>
    <div className="hmi-widget-grid">{HMI_WIDGET_CATALOG.filter(item=>filter==='all'||item.category===filter).map(item=><article key={item.id} className={`hmi-widget-item ${item.width===216?'is-small':''}`} aria-label={uiText(item.name)} data-figma-node={item.nodeId}><h3 className="type-hmi-caption">{uiText(item.name)}</h3>{artwork(item.id)}</article>)}</div>
    <div className={`hmi-widget-feedback ${failed?'has-error':''}`} role={failed?'alert':'status'}><span className="type-hmi-caption">{uiText(pending?uiText("正在处理…"):notice)}</span>{pending&&<button type="button" className="type-hmi-label" onClick={()=>{controller.current?.abort();controller.current=null;setPending(false);setNotice('已取消。');}}>{uiText("取消")}</button>}</div>
    {detail&&<div className="hmi-widget-detail" ref={details} tabIndex={-1} aria-label={uiText("组件详情")}><div className="hmi-widget-detail-heading"><h3 className="type-hmi-title">{uiText(HMI_WIDGET_CATALOG.find(w=>w.id===detail)?.name)}</h3><button type="button" className="type-hmi-label" onClick={()=>setDetail(null)}>{uiText("关闭详情")}</button></div>
      {detail.startsWith('navigation')&&<form onSubmit={event=>{event.preventDefault();if(query.trim())void act({type:'navigation.destination',destination:query.trim()});}}><label className="type-hmi-label" htmlFor="widget-destination">{uiText("目的地")}</label><input id="widget-destination" className="type-hmi-body" value={query} onChange={e=>setQuery(e.target.value)} placeholder={uiText("搜索地点或输入目的地")} required/><button className="type-hmi-label" disabled={pending} type="submit">{uiText(adapter?uiText("设置目的地"):uiText("设置模拟目的地"))}</button><p className="type-hmi-caption">{uiText("地图与车道为设计示例，当前不会计算实际路线。")}</p></form>}
      {detail.startsWith('media')&&<div className="hmi-widget-detail-actions">{detail==='media-source'?(Object.keys(sourceNames) as Array<keyof typeof sourceNames>).map(key=><button key={key} type="button" className="type-hmi-label" aria-pressed={source===key} disabled={pending} onClick={()=>void act({type:'media.source',source:key})}>{uiText(sourceNames[key])}</button>):<><p className="type-hmi-body">{uiText(HMI_WIDGET_CATALOG.find(w=>w.id===detail)?.name)}</p><button type="button" className="type-hmi-label" disabled={pending} onClick={()=>void act({type:'media.playback',track:HMI_WIDGET_CATALOG.find(w=>w.id===detail)!.name,playing:true})}>{uiText("载入")}{uiText(adapter?'':uiText("模拟"))}{uiText("媒体")}</button></>}</div>}
      {detail.startsWith('gallery')&&<><div className="hmi-widget-gallery-preview">{artwork('gallery-large',false)}</div><p className="type-hmi-caption">{uiText("设计示例照片 ·")}{uiText(data?.gallery?.dateLabel || uiText("5月24日"))} · {uiText(data?.gallery?.yearLabel || uiText("2022年"))}</p></>}
      {detail.startsWith('schedule')&&<><p className="type-hmi-body">{uiText(data?.calendar?.eventTitle || uiText("仪表项目组三季度启动会议"))}</p><p className="type-hmi-label">{uiText(data?.calendar?.timeRange || '09:00–09:30')}</p><p className="type-hmi-caption">{uiText("设计示例日程，尚未连接个人日历。")}</p></>}
    </div>}
  </section>;
}
