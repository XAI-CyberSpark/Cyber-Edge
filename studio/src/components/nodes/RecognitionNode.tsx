import { uiText, useUiLanguage  } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ScanSearch } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const RecognitionNode = memo(({ data, selected }: { data: any; selected?: boolean }) => {
  useUiLanguage();
  const targets = Array.isArray(data.targets) ? data.targets : [];
  const vision = data.resultSource === 'vision';
  const completed = data.status === 'success' && data.output && typeof data.output === 'object';
  const result = completed ? data.output.recognition || {} : {};
  const confidence = completed ? data.output.confidence : undefined;
  const stateLabel = data.status === 'running' ? '正在校验本次结果…' : data.status === 'error' ? '本次校验失败，请查看运行记录' : '尚未判断';

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-background border w-64 transition-all relative ${getNodeFrameClass(data.status, selected ? 'border-cyan-500 ring-1 ring-cyan-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center gap-3">
        <div className="rounded-full w-10 h-10 flex items-center justify-center bg-cyan-500/15 text-cyan-300">
          <ScanSearch className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="type-item-title  truncate text-foreground">{uiText(data.label || uiText("识别结果"))}</div>
          <div className="type-caption text-muted-foreground">{uiText(vision ? uiText("解析本次模型结果 · 不重复识别") : uiText("预设结果 · 仅模拟"))}</div>
        </div>
      </div>

      {!vision && targets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {targets.map((target: string) => (
            <span key={target} className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 type-tag text-cyan-200">
              {uiText(target)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-md border border-border bg-secondary/35 p-2 type-body text-foreground space-y-1">
        {!completed && <p>{uiText(stateLabel)}</p>}
        {Object.entries(result).filter(([key]) => !vision || ['status', 'risk_action', 'summary'].includes(key)).slice(0, 3).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{uiText(key)}</span>
            <span className="truncate font-medium">{uiText(String(value))}</span>
          </div>
        ))}
        {typeof confidence === 'number' && (
          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-1.5">
            <span className="text-muted-foreground">{uiText(vision ? uiText("模型自评分") : uiText("模拟分数"))}</span>
            <span className="font-semibold">{uiText(Math.round(confidence * 100))}%</span>
          </div>
        )}
      </div>

      {vision && <p className="mt-2 type-body text-muted-foreground">{uiText("模型自评分未经校准，不代表准确率；分流阈值在判断节点配置。")}</p>}

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-cyan-500" />
    </div>
  );
});
