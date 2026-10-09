import { uiText, useUiLanguage } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, HardDrive } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

const icons: Record<string, any> = {
  vector: Database,
  buffer: HardDrive,
};

const colors: Record<string, string> = {
  vector: 'text-cyan-400 bg-cyan-900/30',
  buffer: 'text-teal-400 bg-teal-900/30',
};

export const MemoryNode = memo(({ data, selected }: { data: any, selected?: boolean }) => {
  useUiLanguage();
  const type = data.type || 'vector';
  const Icon = icons[type] || Database;
  const colorClass = colors[type] || colors.vector;

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-background border w-64 transition-all relative ${getNodeFrameClass(data.status, selected ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center">
        <div className={`rounded-full w-10 h-10 flex justify-center items-center mr-3 ${colorClass.split(' ').slice(1).join(' ')}`}>
          <Icon className={`w-5 h-5 ${colorClass.split(' ')[0]}`} />
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="type-item-title  truncate text-foreground">{uiText(data.label)}</div>
          <div className="type-caption text-foreground truncate">{data.provider || 'Local Memory'}</div>
        </div>
      </div>
      
      <div className="mt-3 pt-2 border-t border-border flex justify-between type-caption text-foreground uppercase font-medium tracking-wide">
        <span>Query</span>
        <span>Context</span>
      </div>

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-background0" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
    </div>
  );
});
