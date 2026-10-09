import { uiText, useUiLanguage  } from '@/i18n';
import { isCatalogModel } from '@/domain/catalogModelNode';
import { CatalogModelNode } from './CatalogModelNode';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Brain, Image, Mic, MessageSquare, Volume2 } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

const icons: Record<string, any> = {
  llm: MessageSquare,
  vlm: Image,
  audio: Mic,
  omni: Brain,
  tts: Volume2,
};

export const LLMNode = memo(({ data, selected }: { data: any, selected?: boolean }) => {
  useUiLanguage();
  if (isCatalogModel(data)) return <CatalogModelNode data={data} selected={selected}/>;
  const category = data.category || 'llm';
  const Icon = icons[category] || Brain;
  const currentActions = Array.isArray(data.output?.actions)
    ? data.output.actions.map((item: any) => item?.name).filter(Boolean)
    : (data.output?.action && data.output.action !== 'none' ? [data.output.action] : []);
  const allowedActions = Array.isArray(data.allowedActions) ? data.allowedActions : [];
  const basePrompt = typeof data.basePrompt === 'string' ? data.basePrompt : '';
  const structuredPrompt = typeof data.structuredPrompt === 'string' ? data.structuredPrompt : '';
  const rawModelOutput = typeof data.output?.raw_model_output === 'string' ? data.output.raw_model_output : '';
  const promptTemplateLabel = data.promptProfile === 'child_care' ? '儿童关怀 · 视觉 JSON' : data.promptProfile === 'visual_emergency' ? 'Visual Emergency' : 'Action Planner';
  const capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-background border w-64 transition-all relative ${getNodeFrameClass(data.status, selected ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center mb-3">
        <div className="ce-node-icon ce-node-icon--model">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="type-item-title  text-foreground">{uiText(data.label || "大语言模型")}</div>
          <div className="type-caption text-muted-foreground">{uiText(data.modelSize ? `${category.toUpperCase()} · ${data.modelSize}` : uiText("模型推理"))}</div>
        </div>
      </div>

      <div className="space-y-2">
          <div className="ce-node-model-row" title={data.model || uiText("待配置")}><Icon size={15}/><span>{data.model || uiText("待配置模型")}</span><small className="type-caption">{category.toUpperCase()}</small></div>
          <p className="ce-node-description" title={data.description || data.systemPrompt || ''}>{data.description || data.systemPrompt || uiText("配置模型与提示词后运行。")}</p>

        {capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {capabilities.map((capability: string) => (
              <span key={capability} className="rounded-full border border-pink-400/25 bg-pink-500/10 px-2 py-0.5 type-tag text-pink-200">
                {uiText(capability)}
              </span>
            ))}
          </div>
        )}

        {(basePrompt || structuredPrompt || allowedActions.length > 0) && (
          <details className="ce-node-prompt nodrag nowheel"><summary className="type-label">{uiText("提示词与动作配置")}</summary>
            <div className="flex items-center justify-between mb-2 type-label uppercase tracking-wide text-cyan-300">
              <span>Prompt Plan</span>
              <span>{data.promptMode === 'structured' ? 'Structured' : 'Plain'}</span>
            </div>
            <div className="mb-2 type-label uppercase tracking-wide text-cyan-300">
              Template: {uiText(promptTemplateLabel)}
            </div>
            {allowedActions.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {allowedActions.map((action: string) => (
                  <span key={action} className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 type-tag text-cyan-200">
                    {uiText(action)}
                  </span>
                ))}
              </div>
            )}
            {basePrompt && (
              <div className="space-y-1">
                <div className="type-label uppercase tracking-wide text-cyan-300">Base Prompt</div>
                <div className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-background p-2 font-mono type-code  text-cyan-50">
                  {basePrompt}
                </div>
              </div>
            )}
            {structuredPrompt && (
              <div className="mt-2 space-y-1">
                <div className="type-label uppercase tracking-wide text-cyan-300">Structured Prompt</div>
                <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-background p-2 font-mono type-code  text-cyan-50">
                  {structuredPrompt}
                </div>
              </div>
            )}
          </details>
        )}
        
        {data.output && (
             <div className="type-body bg-green-900/20 p-2 rounded border border-green-500/20 text-green-300 max-h-32 overflow-y-auto">
                 {currentActions.length > 0 && (
                   <div className="mb-1 inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 type-tag  tracking-wide text-cyan-200">
                     Action: {currentActions.join(' + ')}
                   </div>
                 )}
                 {typeof data.output === 'object' ? (data.output.text || JSON.stringify(data.output)) : data.output}
             </div>
        )}
        {rawModelOutput && (
          <div className="type-body bg-amber-950/20 p-2 rounded border border-amber-500/20 text-amber-100">
            <div className="mb-1 type-label uppercase tracking-wide text-amber-300">Raw Model Output</div>
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-background p-2 font-mono type-code  text-amber-50">
              {rawModelOutput}
            </div>
          </div>
        )}
      </div>

      <Handle type="source" id="error" position={Position.Bottom} title={uiText("失败")} className="bg-destructive" />
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-background0" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
    </div>
  );
});
