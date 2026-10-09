import { uiText, useUiLanguage } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, Database } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

const icons: Record<string, any> = {
  file: FileText,
  db: Database,
};

const colors: Record<string, string> = {
  file: 'text-foreground bg-background',
  db: 'text-orange-400 bg-orange-900/30',
};

export const DataNode = memo(({ data, selected }: { data: any, selected?: boolean }) => {
  useUiLanguage();
  const type = data.type || 'file';
  const Icon = icons[type] || FileText;
  const colorClass = colors[type] || colors.file;

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
          <div className="type-caption text-foreground truncate">{data.format || 'Raw Data'}</div>
        </div>
      </div>
      
      <div className="mt-3 pt-2 border-t border-border flex justify-between type-caption text-foreground uppercase font-medium tracking-wide">
        <span>Params</span>
        <span>Content</span>
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
    </div>
  );
});
