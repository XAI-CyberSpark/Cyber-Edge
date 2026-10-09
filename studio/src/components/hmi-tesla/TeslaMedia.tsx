import { uiText, useUiLanguage  } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { TeslaAsset, teslaAssetUrl } from './assets';

const favorites=[18,23,22,21,20,19], stations=[0,5,4,3,2,1,6,11,10,9,8,7,12,17,16,15,14,13];
export function TeslaMedia({track,onTrack,active}: {track:string;onTrack:(track:string)=>void;active:boolean}) {
  useUiLanguage();
  const audio=useRef<HTMLAudioElement>(null);
  const urls=useRef<string[]>([]);
  const [files,setFiles]=useState<{name:string;url:string}[]>([]);
  const [selected,setSelected]=useState(24);
  const [source,setSource]=useState('streaming');
  const [search,setSearch]=useState('');
  const [playing,setPlaying]=useState(false);
  const [error,setError]=useState('');
  const local=files.find(f=>f.name===track);
  useEffect(()=>()=>urls.current.forEach(url=>URL.revokeObjectURL(url)),[]);
  useEffect(()=>{
    if(!audio.current)return;
    if(!local){audio.current.pause();return;}
    audio.current.load();
    void audio.current.play().catch(()=>setError('点击播放以启用浏览器音频。'));
  },[local]);
  const move=(delta:number)=>{if(!files.length)return;const index=files.findIndex(f=>f.name===track);onTrack(files[(index+delta+files.length)%files.length].name);};
  return <section hidden={!active} className="tesla-media" aria-label={uiText("音乐空间")} data-figma-node="497:14060">
    <header className="tesla-player"><img className="tesla-player-cover" src={teslaAssetUrl(`music:imgAlbumCover${selected || ''}`)} alt={uiText("选中的专辑封面")} />
      <div className="tesla-player-description"><TeslaAsset slot="music:imgHeart" size={20} /><strong className="type-hmi-title">{uiText(track && track!=='off'?track:uiText("选择音乐"))}</strong><span className="type-hmi-label">{uiText(local?uiText("本地音频"): uiText("尚未连接音源"))}</span><small className="type-hmi-caption">{uiText(local?uiText("播放状态来自浏览器音频"): uiText("导入音频后可播放，也可由音乐节点选曲"))}</small></div>
      <div className="tesla-player-actions"><button type="button" aria-label={uiText("上一曲")} disabled={!files.length} onClick={()=>move(-1)}><TeslaAsset slot="music:imgPrevtrack" /></button>
      <button type="button" aria-label={uiText(playing?uiText("暂停"):uiText("播放"))} disabled={!local} onClick={()=>{if(playing)audio.current?.pause();else void audio.current?.play().catch(cause=>setError(cause.message));}}>{playing?<TeslaAsset slot="music:imgPause" />:<span>▶</span>}</button>
      <button type="button" aria-label={uiText("下一曲")} disabled={!files.length} onClick={()=>move(1)}><TeslaAsset slot="music:imgNexttrack" /></button></div>
    </header>
    <audio ref={audio} src={local?.url} controls={!!local} onPlay={()=>{setPlaying(true);setError('');}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>setError('音频无法播放，请选择浏览器支持的音频文件。')} />
    <div className="tesla-media-tabs"><label><TeslaAsset slot="music:imgSearch" size={22}/><input aria-label={uiText("搜索音乐")} placeholder={uiText("搜索音乐")} value={search} onChange={e=>setSearch(e.target.value)} /></label><nav aria-label={uiText("音乐来源")}>{[['streaming',uiText("在线音乐")],['radio',uiText("电台")],['local',uiText("本地音频")]].map(([id,label])=><button type="button" key={id} aria-pressed={source===id} onClick={()=>setSource(id)}>{uiText(label)}</button>)}</nav></div>
    {source==='local'?<div className="tesla-local-media"><label className="tesla-pill">{uiText("导入音频")}<input type="file" accept="audio/*" multiple onChange={event=>{const added=Array.from(event.target.files||[]).map(file=>({name:file.name,url:URL.createObjectURL(file)}));urls.current.push(...added.map(f=>f.url));setFiles(previous=>[...previous,...added.filter(f=>!previous.some(p=>p.name===f.name))]);if(added[0])onTrack(added[0].name);}} /></label>{files.filter(f=>f.name.toLowerCase().includes(search.toLowerCase())).map(file=><button type="button" className="tesla-local-track" key={file.url} aria-pressed={track===file.name} onClick={()=>onTrack(file.name)}>{file.name}</button>)}{!files.length&&<p>{uiText("音频留在此浏览器，不上传。导入后可由音乐节点按文件名选曲。")}</p>}</div>:<>
      <p className="tesla-media-note type-hmi-caption">{uiText(source==='radio'?uiText("电台服务未连接"):uiText("在线音乐服务未连接"))} {uiText("· 以下为设计中的专辑封面预览")}</p>
      {[[uiText("收藏"),favorites],[uiText("热门电台"),stations]].map(([label,items])=><section key={String(label)}><h3 className="type-hmi-title">{uiText(label)}</h3><div className="tesla-cover-grid">{(items as number[]).filter(i=>!search || `专辑 ${i+1}`.includes(search)).map(i=><button type="button" key={i} aria-label={uiText("预览专辑 {0}", [i+1])} aria-pressed={selected===i} onClick={()=>setSelected(i)}><img src={teslaAssetUrl(`music:imgAlbumCover${i||''}`)} alt={uiText("设计专辑 {0}", [i+1])} /></button>)}</div></section>)}
    </>}
    {error&&<p role="alert" className="tesla-media-note">{uiText(error)}</p>}
  </section>;
}
