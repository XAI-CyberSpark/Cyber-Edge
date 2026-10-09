import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HmiCarStage } from '../src/components/spatial/HmiCarStage';
import '../src/index.css';
import concept from './fixtures/car-concept.rig.json';
import {readCarRig} from '../src/domain/carRig';
const selectedRig=new URLSearchParams(location.search).has('concept') ? readCarRig(concept) : undefined;
import '../src/components/core/cockpit-hmi.css';
function Review(){
 const [windows,setWindows]=useState({fl:0,fr:0,rl:0,rr:0});const [locked,setLocked]=useState(false);const [night,setNight]=useState(false);const [error,setError]=useState(false);
 return <main style={{background:'#000',color:'#fff',height:760,width:1100}}><div style={{height:660}}><HmiCarStage rig={selectedRig} windows={windows} locked={locked} onUnlock={()=>setLocked(false)} night={night} onError={()=>setError(true)}/></div><div className="type-body">{(['fl','fr','rl','rr'] as const).map(k=><button key={k} onClick={()=>setWindows(w=>({...w,[k]:w[k]===100?0:w[k]+50}))}>{k}: {windows[k]}</button>)}<button onClick={()=>setLocked(!locked)}>locked: {String(locked)}</button><button onClick={()=>setNight(!night)}>night: {String(night)}</button><output>{error?'加载失败':'模型验收'}</output></div></main>
}createRoot(document.getElementById('root')!).render(<Review/>);
