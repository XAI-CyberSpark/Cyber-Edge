import { uiText, useUiLanguage  } from '@/i18n';
import { Handle, Position } from '@xyflow/react';
import { Brain } from 'lucide-react';
import { getNodeFrameClass } from './nodeStatus';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { catalogLabel } from '@/domain/qualcommCatalog';
export function CatalogModelNode({ data, selected }: { data: any; selected?: boolean }) {
  useUiLanguage();
  return <div className={`relative border ${getNodeFrameClass(data.status, selected ? 'border-primary' : 'border-border')}`}>
    <NodeActivityOverlay status={data.status}/><NodeStatusBadge status={data.status} activationIndex={data.activationIndex}/>
    <div className="ce-node-header"><div className="ce-node-icon ce-node-icon--model"><Brain size={20}/></div><div><div className="type-item-title ">{uiText(data.label || data.catalogModel?.name || uiText("高通模型"))}</div><div className="type-caption text-muted-foreground">{uiText("Qualcomm AI Hub · 待部署")}</div></div></div>
    <div className="space-y-2"><div className="ce-node-model-row" title={data.catalogModel?.id || data.model}><span>{data.catalogModel?.name || data.model}</span></div>
      <p className="ce-node-description" title={data.taskDescription || data.description}>{data.taskDescription || data.description || catalogLabel(data.catalogModel?.useCase)}</p>
      <p className="type-body text-muted-foreground">{uiText("可连线编排；部署后才能运行。")}</p>
    </div>
    <Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/><Handle type="source" id="error" position={Position.Bottom} title={uiText("失败")}/>
  </div>;
}
