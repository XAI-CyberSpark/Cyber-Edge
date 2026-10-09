import { uiText, useUiLanguage  } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ClipboardCheck } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const EventLogNode = memo(({ data, selected }: { data: any; selected?: boolean }) =>  { useUiLanguage(); return ((
  <div className={`relative w-56 rounded-lg border bg-background px-4 py-3 shadow-lg transition-all ${getNodeFrameClass(data.status, selected ? 'border-emerald-400 ring-1 ring-emerald-400/50' : 'border-border')}`}>
    <NodeActivityOverlay status={data.status} />
    <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
    <div className="ce-node-header flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
        <ClipboardCheck className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate type-item-title  text-foreground">{uiText(data.label || uiText("事件记录"))}</div>
        <div className="type-caption text-muted-foreground">{uiText("当前会话记录 · 刷新后清空")}</div>
      </div>
    </div>
    {data.description && <p className="mt-2 type-body  text-muted-foreground">{uiText(data.description)}</p>}
    {data.status === 'success' && data.output?.event_record && <div className="mt-2 type-body text-muted-foreground">
      <p>{uiText("本次结果：")}{({ risk: uiText("风险提醒"), normal: uiText("未见明确风险"), unknown: uiText("无法判断") } as Record<string, string>)[data.output.event_record.outcome] || data.output.event_record.outcome}</p>
      <p>{uiText("可在运行记录中查看判断依据与模型")}</p>
    </div>}
    <Handle type="target" position={Position.Left} className="h-3 w-3 bg-emerald-500" />
  </div>
)); });
