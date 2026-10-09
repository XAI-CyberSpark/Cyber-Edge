import { uiText, useUiLanguage } from '@/i18n';
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { User, MessageSquare } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const InputNode = memo(({ data, selected }: { data: any, selected?: boolean }) => {
  useUiLanguage();
  const inputPreview = typeof data.output === 'object' && data.output?.type === 'image';
  const label = data.label || '用户输入';
  const description = data.description || '文本、语音或传感器触发';

  return (
    <div className={`ce-node-input px-4 py-3 shadow-lg rounded-full bg-background border w-48 transition-all relative ${getNodeFrameClass(data.status, selected ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center">
        <div className="rounded-full w-8 h-8 flex justify-center items-center mr-3 bg-blue-900/30 text-blue-400">
          <User className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className=" type-item-title text-foreground" title={uiText(label)}>{uiText(label)}</div>
          
        </div>
      </div>
      <div className="ce-node-summary">{uiText(description)}</div>
      {inputPreview && (
        <div className="mt-2 flex justify-center">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 type-tag  tracking-wide text-cyan-200">
            {uiText("已附图片")}</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
    </div>
  );
});

export const OutputNode = memo(({ data, selected }: { data: any, selected?: boolean }) => {
  useUiLanguage();
  const outputActions = Array.isArray(data.output?.actions)
    ? data.output.actions.map((item: any) => item?.name).filter(Boolean)
    : (data.output?.action && data.output.action !== 'none' ? [data.output.action] : []);
  const outputText = typeof data.output === 'string'
    ? data.output
    : data.output?.text || JSON.stringify(data.output);

  const isAudioPayload = typeof outputText === 'string' && outputText.startsWith('{ "type": "audio"');
  const label = data.label || '最终回复';
  const configuredResponse = data.responseText || '';

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-background border w-64 transition-all relative ${getNodeFrameClass(data.status, selected ? 'border-green-500 ring-1 ring-green-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header ce-node-header--output flex items-center justify-between">
        <div className=" type-item-title text-foreground">{uiText(label)}</div>
        <div className="rounded-full w-8 h-8 flex justify-center items-center bg-green-900/30 text-green-400">
          <MessageSquare className="w-4 h-4" />
        </div>
      </div>
      
      {(data.output || configuredResponse) && (
          <div className="mt-2 p-2 bg-background rounded type-code font-mono text-foreground max-h-32 overflow-y-auto break-words border border-border">
              {outputActions.length > 0 && (
                <div className="mb-1 inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 type-tag  tracking-wide text-cyan-200">
                  Action: {outputActions.join(' + ')}
                </div>
              )}
              {data.output && isAudioPayload ? (
                  <div className="flex items-center gap-2">
                      <audio controls src={`data:audio/wav;base64,${JSON.parse(outputText).data}`} className="h-8 w-full" />
                  </div>
              ) : (
                  configuredResponse || outputText
              )}
          </div>
      )}

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-green-500" />
    </div>
  );
});
