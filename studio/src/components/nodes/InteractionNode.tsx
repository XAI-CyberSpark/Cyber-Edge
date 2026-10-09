import { uiText, useUiLanguage  } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { BookOpen } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';
export const InteractionNode = memo(({data,selected}:{data:any;selected?:boolean}) => {
  useUiLanguage();
  const state=data.output?.session;
  return <div className={`px-4 py-3 shadow-lg rounded-lg bg-background border w-64 relative ${getNodeFrameClass(data.status,selected?'border-blue-500 ring-1 ring-blue-500/50':'border-border')}`}>
    <NodeActivityOverlay status={data.status}/>{!(data.status==='success' && ['waiting','paused'].includes(state?.status)) && <NodeStatusBadge status={data.status} activationIndex={data.activationIndex}/>}
    <div className="ce-node-header flex items-center gap-3"><div className="ce-node-icon"><BookOpen className="w-5 h-5"/></div><div className="min-w-0"><div className="type-item-title  truncate">{uiText(data.label || uiText("持续互动"))}</div><div className="type-caption text-muted-foreground">{uiText(data.plan?.mode==='live'?uiText("逐章模型创作"):uiText("预先编排内容"))} · {data.plan?.steps?.length || 0} {uiText("个阶段")}</div></div></div>
    {state && <p className="mt-3 type-body">{uiText(data.plan?.steps?.[state.index]?.title)} · {uiText(({waiting:uiText("等待互动"),paused:uiText("已暂停"),completed:uiText("已完成"),stopped:uiText("已退出")} as Record<string,string>)[state.status])}{state.rewards?.length>0 && uiText(" · {0} 条线索", [state.rewards.length])}</p>}
    <Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/>
    <Handle type="source" id="error" position={Position.Bottom} title={uiText("失败")} className="bg-destructive"/>
  </div>;
});
