import { uiText, useUiLanguage  } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ScanEye, TimerReset } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const RiskMonitorNode = memo(({ data, selected }: { data: any; selected?: boolean }) => {
  useUiLanguage();


  return (
    <div className={`relative w-64 rounded-lg border bg-background px-4 py-3 shadow-lg transition-all ${getNodeFrameClass(data.status, selected ? 'border-violet-400 ring-1 ring-violet-400/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
          <ScanEye className="h-5 w-5" />
        </div>
        <div>
          <div className="type-item-title  text-foreground">{uiText(data.label || uiText("后续证据占位"))}</div>
          <div className="type-caption text-muted-foreground">{uiText("未接入连续监测")}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-violet-400/20 bg-violet-500/10 px-2.5 py-2 type-body text-violet-100">
        <TimerReset className="h-3.5 w-3.5 shrink-0" />
        <span>{uiText("仅记录缺少新画面；不会自动等待或复核")}</span>
      </div>
      <Handle type="target" position={Position.Left} className="h-3 w-3 bg-violet-500" />
      <Handle type="source" position={Position.Right} className="h-3 w-3 bg-violet-500" />
    </div>
  );
});
