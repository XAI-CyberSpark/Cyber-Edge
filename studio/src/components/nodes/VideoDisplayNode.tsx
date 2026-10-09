import { uiText, useUiLanguage  } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MonitorPlay } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';
export const VideoDisplayNode = memo(({ data, selected }: { data: any; selected?: boolean }) =>  { useUiLanguage(); return (<div className={`relative w-64 rounded-lg border bg-background p-4 ${getNodeFrameClass(data.status, selected ? 'border-sky-400' : 'border-border')}`}>
  <NodeActivityOverlay status={data.status}/><NodeStatusBadge status={data.status} activationIndex={data.activationIndex}/>
  <div className="ce-node-header flex gap-2 items-center type-item-title "><span className="ce-node-icon"><MonitorPlay size={20}/></span><span className="ce-node-title">{uiText(data.label || uiText("中控展示后排视频"))}</span></div>
  <p className="mt-2 type-body text-muted-foreground">{uiText("风险时自动显示后排画面")}</p>
  <p className="mt-2 type-caption text-muted-foreground">{uiText(data.source === 'browser_stream' ? uiText("后排视频流") : uiText("演示录像"))}</p>
  {data.status === 'success' && <p className="mt-2 type-body">{uiText(data.output?.video_display === 'opened' ? uiText("已显示后排画面") : data.output?.video_display === 'already-notified' ? uiText("本次回放已提醒，不重复弹出") : uiText("未展示后排画面"))}</p>}
  <Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/>
</div>); });
