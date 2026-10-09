import { uiText, useUiLanguage  } from '@/i18n';
import type {ComponentType} from 'react';
import {Handle,Position} from '@xyflow/react';
import {Clock3,Layers3,Database,ChevronDown,ChevronRight} from 'lucide-react';
import {getNodeFrameClass} from './nodeStatus';
export function FlowCapabilityNode({type,data,selected}:{type?:string;data:any;selected?:boolean}){
  useUiLanguage();
 const Icon=type==='state'?Database:Clock3;
 return <div className={`ce-node px-4 py-3 border rounded-lg bg-background shadow-sm w-64 ${getNodeFrameClass(data.status,selected?'border-primary':'border-border')}`}>
  <div className="ce-node-header flex gap-3 items-center"><div className="ce-node-icon"><Icon className="w-5 h-5"/></div><div className="min-w-0"><div className="type-item-title">{uiText(data.label|| (type==='state'?uiText("会话状态"):uiText("等待事件")))}</div><div className="type-caption text-muted-foreground">{type==='state'?uiText("保存与更新状态"):data.eventName||uiText("待配置事件")}</div></div></div>
  {type==='wait'&&<p className="type-body mt-3 whitespace-pre-wrap">{uiText(data.output?.waiting?uiText("等待中 · "):'')}{data.prompt||uiText("收到事件后继续")}</p>}
  <Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/><Handle type="source" id="error" position={Position.Bottom}/>
 </div>;
}
export function StageNode({data,selected}:{data:any;selected?:boolean}){
  useUiLanguage();
 return <section className={`h-full w-full rounded-xl border bg-secondary/30 ${selected?'border-primary':'border-border'}`} aria-label={uiText("阶段：{0}", [data.label||'子流程'])}>
  <div className="ce-node-header px-4 py-3 flex items-center gap-3"><Layers3 className="w-5 h-5 shrink-0"/><span className="type-item-title flex-1">{data.label||uiText("子流程")}</span><button type="button" className="nodrag nopan min-h-10 min-w-10 flex items-center justify-center rounded-md hover:bg-secondary" aria-label={uiText("{0}阶段 {1}", [uiText(data.collapsed?'展开':'收起'), data.label||''])} aria-expanded={!data.collapsed} onClick={()=>data.onToggle?.()}>{data.collapsed?<ChevronRight className="w-5 h-5"/>:<ChevronDown className="w-5 h-5"/>}</button></div>
  {data.collapsed&&<p className="type-caption px-4 text-muted-foreground">{uiText(data.activeLabels?.length?uiText("正在等待：{0}", [data.activeLabels.join('、')]):uiText("展开查看内部能力与连线"))}</p>}
  <Handle type="target" position={Position.Left} isConnectable={false}/><Handle type="source" position={Position.Right} isConnectable={false}/>
 </section>;
}

/** Ports are derived from canonical edges, never written back into saved data. */
export function withFlowPorts(Component:ComponentType<any>,type:string){
 return function FlowPorts(props:any){return <div className="relative"><Component {...props}/>
  {!['llm','interaction','wait','state','stage'].includes(type)&&<Handle type="source" id="error" position={Position.Bottom} style={{left:'25%'}} title={uiText("失败出口")}/>}
  {['output','event_log'].includes(type)&&<Handle type="source" position={Position.Right} title={uiText("继续执行")}/>}
  {(props.data.__flowPorts||[]).map((port:string,index:number,ports:string[])=><Handle key={port} type="target" id={port} title={uiText(port)} position={Position.Left} style={{top:`${(index+1)*100/(ports.length+1)}%`}}/>)}
 </div>;};
}
