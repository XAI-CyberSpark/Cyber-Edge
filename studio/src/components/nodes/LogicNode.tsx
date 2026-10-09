import { uiText, useUiLanguage } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch, GitMerge } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const LogicNode = memo(({ data, selected }: { data: any, selected?: boolean }) => {
  useUiLanguage();
  const type = data.type || 'if';
  const Icon = type === 'if' ? GitBranch : GitMerge;
  const colorClass = 'text-red-400 bg-red-900/30';
  const condition = data.script || data.condition || '';

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-background border w-64 transition-all relative ${getNodeFrameClass(data.status, selected ? 'border-red-500 ring-1 ring-red-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center">
        <div className={`rounded-full w-10 h-10 flex justify-center items-center mr-3 ${colorClass.split(' ')[1]}`}>
          <Icon className={`w-5 h-5 ${colorClass.split(' ')[0]}`} />
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="type-item-title  truncate text-foreground">{uiText(data.label)}</div>
          <div className="type-code text-foreground truncate" title={condition}>{condition || uiText("未设置条件")}</div>
        </div>
      </div>
      
      <details className="ce-node-prompt ce-node-condition nodrag nopan nowheel"
        onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <summary className="type-label">{uiText("查看完整条件")}</summary>
        <pre className="type-code">{condition || uiText("未设置条件")}</pre>
      </details>

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-background0" />
      
      {/* If Node has two outputs: True (Top) and False (Bottom) or just Right with labels */}
      <div className="absolute -right-1.5 top-1/3 transform -translate-y-1/2 flex items-center">
        <span className="type-tag mr-1 text-green-500 ">{uiText("成立")}</span>
        <Handle type="source" position={Position.Right} id="true" className="w-3 h-3 bg-green-500" style={{ top: 'auto', right: -6 }} />
      </div>
      
      <div className="absolute -right-1.5 bottom-1/3 transform translate-y-1/2 flex items-center">
        <span className="type-tag mr-1 text-red-500 ">{uiText("不成立")}</span>
        <Handle type="source" position={Position.Right} id="false" className="w-3 h-3 bg-red-500" style={{ top: 'auto', right: -6 }} />
      </div>
    </div>
  );
});
