import { uiText, useUiLanguage  } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageCircleWarning } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const FallbackNode = memo(({ data, selected }: { data: any; selected?: boolean }) => {
  useUiLanguage();
  const responseText = data.responseText || '暂时无法可靠识别，请用户确认后再继续。';

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-background border w-64 transition-all relative ${getNodeFrameClass(data.status, selected ? 'border-amber-500 ring-1 ring-amber-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center gap-3">
        <div className="rounded-full w-10 h-10 flex items-center justify-center bg-amber-500/15 text-amber-300">
          <MessageCircleWarning className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="type-item-title  truncate text-foreground">{uiText(data.label || uiText("兜底回复"))}</div>
          <div className="type-caption text-muted-foreground">{uiText(data.trigger || "未识别或低置信度")}</div>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/10 p-2 type-body  text-amber-100">
        {responseText}
      </div>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-amber-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-amber-500" />
    </div>
  );
});
