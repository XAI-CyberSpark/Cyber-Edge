import React, {useEffect,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {VideoReplayProvider,useVideoReplay,VideoReplayInput,VideoReplayScreen} from '../src/components/core/VideoReplay';
import {GraphEngine} from '../src/utils/GraphEngine';
import graph from './fixtures/child-care-contract.json';
function Harness(){
 const replay=useVideoReplay()!;const state=useSyncExternalStore(replay.subscribe,replay.getSnapshot);
 useEffect(()=>{
  const saved=window.fetch;
  window.fetch=async()=>Response.json({model:'opensparx-cabin-intent:3b',choices:[{finish_reason:'stop',message:{content:JSON.stringify({status:'risk',confidence:.95,risk_action:'测试站起',summary:'预设风险，仅验证界面'})}}]});
  replay.setRunner((input,signal)=>new GraphEngine(graph.nodes as any,graph.edges,{updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){},updateSimulatorState(){},showVideoReplay:frame=>replay.show(frame)}).run(input,{signal}));
  return()=>{replay.setRunner(undefined);window.fetch=saved;};
 },[replay]);
 return <main style={{fontFamily:'sans-serif',background:'#161616',color:'#eee',height:'95vh',display:'flex',gap:20,padding:12}}>
 <div style={{width:350}}><h2>预设风险 · 界面测试</h2><p>无模型请求，不代表真实识别结果。</p><VideoReplayInput session={replay} disabled={false}/><p data-testid="state">{state.phase} / {state.popup?'popup':'preview'}</p></div>
 <div style={{flex:1,position:'relative',background:'#000',minWidth:0}}><h2>中控展示区</h2><VideoReplayScreen/></div></main>;
}
createRoot(document.getElementById('root')!).render(<VideoReplayProvider><Harness/></VideoReplayProvider>);
