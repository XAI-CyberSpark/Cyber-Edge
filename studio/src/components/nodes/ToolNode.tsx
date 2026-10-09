import { uiText, useUiLanguage } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Wrench, Box } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const ToolNode = memo(({ data }: { data: any }) => {
  useUiLanguage();
  const isSkill = data.isSkill;
  const Icon = isSkill ? Box : Wrench;
  const colorClass = isSkill ? 'text-indigo-400' : 'text-blue-400';
  const bgClass = isSkill ? 'bg-indigo-900/30' : 'bg-blue-900/30';
  const handleColor = isSkill ? 'bg-indigo-500' : 'bg-blue-500';
  const lastActions = Array.isArray(data.output?.actions)
    ? data.output.actions.map((item: any) => item?.name).filter(Boolean)
    : (data.output?.action && data.output.action !== 'none' ? [data.output.action] : []);
  const lastReply = typeof data.output === 'string' ? data.output : data.output?.text || data.output?.reply;

  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-background border w-64 relative ${getNodeFrameClass(data.status, 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center">
        <div className={`rounded-full w-8 h-8 flex justify-center items-center ${bgClass} mr-2`}>
          <Icon className={`w-5 h-5 ${colorClass}`} />
        </div>
        <div className="min-w-0">
          <div className="type-item-title  text-foreground">{uiText(data.label)}</div>
          <div className="type-caption text-foreground">{data.toolName ? `${data.serverId}/${data.toolName}` : data.tool || 'Select Tool'}</div>
        </div>
      </div>
      <div className="mt-2 type-body text-foreground">
        {uiText((data.tool_id || data.tool) === 'mcp' ? '网页或服务数据 → 工具结果' : isSkill ? 'Skill Execution' : 'Input: Params → Output: Result')}
        {data.catalogId && data.status !== 'success' && <p className="type-caption text-muted-foreground mt-2">{uiText(data.status === 'running' ? '正在准备或调用 MCP 服务…' : '首次 Run 自动安装，后续复用')}</p>}
      </div>
      {lastActions.length > 0 && (
        <div className="mt-2 rounded border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 type-body font-semibold tracking-wide text-cyan-200">
          Action: {lastActions.join(' + ')}
        </div>
      )}
      {lastReply && (
        <div className="mt-2 rounded border border-border bg-background px-2 py-1 type-body text-foreground">
          {lastReply}
        </div>
      )}

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-background0" />
      <Handle type="source" position={Position.Right} className={`w-3 h-3 ${handleColor}`} />
    </div>
  );
});
