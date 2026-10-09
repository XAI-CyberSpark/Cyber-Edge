import { uiText, useUiLanguage  } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Eye, Volume2 } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const CockpitAlertNode = memo(({ data, selected }: { data: any; selected?: boolean }) => {
  useUiLanguage();
  const singleFrame = data.displayMode === 'uploaded_frame' || Boolean(data.output?.source_image);

  return (
    <div className={`relative w-72 rounded-lg border bg-background px-4 py-3 shadow-lg transition-all ${getNodeFrameClass(data.status, selected ? 'border-amber-400 ring-1 ring-amber-400/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
          <Volume2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate type-item-title  text-foreground">{uiText(data.label || uiText("一次性座舱警示"))}</div>
          <div className="type-caption text-muted-foreground">{uiText("驾驶员无需交互")}</div>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/10 px-2.5 py-2 type-body  text-amber-100">
        “{data.voicePrompt || uiText("儿童危险，请注意后排。")}”
      </div>
      <div className="mt-2 flex items-center gap-2 type-caption text-muted-foreground">
        <Eye className="h-3.5 w-3.5 text-sky-300" />
        <span>{uiText(singleFrame ? uiText("本次画面与助手提醒 · 本机语音") : uiText("座舱提醒仿真 · 语音取决于本机支持"))}</span>
      </div>
      <Handle type="target" position={Position.Left} className="h-3 w-3 bg-amber-500" />
      <Handle type="source" position={Position.Right} className="h-3 w-3 bg-amber-500" />
    </div>
  );
});
