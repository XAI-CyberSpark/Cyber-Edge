import { uiText, useUiLanguage  } from '@/i18n';
import { isCatalogModel, CATALOG_MODEL_PENDING } from '@/domain/catalogModelNode';
import { catalogLabel } from '@/domain/qualcommCatalog';
import { McpArgumentsEditor } from './McpArgumentsEditor';
import { NodeCapabilityInspector } from './NodeCapabilityInspector';
import { ModelTestPanel } from '@/components/core/ModelTestPanel';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import "./property-panel.css";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code, Save, Wand2 } from "lucide-react";
import { useApp } from '@/context/AppContext';
import { apiUrl } from '@/lib/api';

interface PropertyPanelProps {
  selectedNode: any;
  onUpdate: (id: string, data: any) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PropertyPanel = ({ selectedNode, onUpdate, open, onOpenChange }: PropertyPanelProps) => {
  useUiLanguage();
  const { t } = useApp();
  const [data, setData] = useState<any>({});
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [availableLoras, setAvailableLoras] = useState<any[]>([]);
  // Fetch available models on mount and when panel opens
  useEffect(() => {
      if (open) {
          fetch(apiUrl('/v1/models'))
            .then(res => res.json())
            .then(data => setAvailableModels(data.models || data || []))
            .catch(err => console.error("Failed to load models for dropdown", err));

          fetch(apiUrl('/v1/lora'))
            .then(res => res.json())
            .then(data => setAvailableLoras(data.adapters || []))
            .catch(err => console.error("Failed to load lora adapters", err));
      }
  }, [open]);

  useEffect(() => {
    if (selectedNode) {
      setData(selectedNode.data || {});
    }
  }, [selectedNode]);

  // Helper to get model label
  const getModelLabel = (modelId: string) => {
      const model = availableModels.find(m => m.id === modelId);
      if (model) {
          const status = model.is_downloaded ? '✅' : '☁️';
          return `${status} ${model.name} (${model.size})`;
      }
      return modelId; // Fallback
  };

  const handleChange = (key: string, value: any) => {
    const newData = { ...data, [key]: value };
    setData(newData);
    onUpdate(selectedNode.id, newData);
  };

  if (!selectedNode) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent side="right" className="property-panel w-[400px] p-0 border-l workspace-divider bg-background shadow-2xl">
        <div className="property-panel-scroll h-full overflow-y-auto">
          <div className="min-w-0 p-5 space-y-5">
            <SheetHeader>
              <div className="flex items-center justify-between">
                <SheetTitle className="type-panel  flex items-center gap-2 pr-6">
                  <Badge variant="outline" className="uppercase type-tag tracking-wider">
                    {selectedNode.type === 'tool' && (data.tool_id || data.tool) === 'mcp' ? 'MCP' : selectedNode.type}
                  </Badge>
                  {uiText(t('prop.config'))}
                </SheetTitle>
              </div>
              <SheetDescription className="type-body text-muted-foreground">
                {uiText("配置节点参数，并查看实际能力与使用限制。")}</SheetDescription>
            </SheetHeader>

            <div className="space-y-4">
              {!isCatalogModel(data) && <NodeCapabilityInspector node={{ ...selectedNode, data }} onChange={patch => { const next = { ...data, ...patch }; setData(next); onUpdate(selectedNode.id, next); }} />}
              <div className="space-y-2">
                <Label>{uiText(t('prop.label'))}</Label>
                <Input 
                  value={data.label || ''} 
                  onChange={(e) => handleChange('label', e.target.value)} 
                />
              </div>

              {isCatalogModel(data) && <section className="space-y-3" aria-label={uiText("待部署模型配置")}>
                <Badge variant="outline">{uiText("Qualcomm AI Hub · 待部署")}</Badge>
                <p className="type-body">{data.catalogModel?.name || data.model}</p>
                <p className="type-caption text-muted-foreground">{uiText(catalogLabel(data.catalogModel?.useCase))} {uiText("· 目录 v")}{data.catalogModel?.version}</p>
                <Label htmlFor="catalog-model-task">{uiText("任务说明")}</Label><Textarea id="catalog-model-task" value={data.taskDescription || ''} onChange={e => handleChange('taskDescription',e.target.value)} placeholder={uiText("描述这个模型节点在流程中要完成的任务")}/>
                <p className="type-body text-muted-foreground">{uiText(CATALOG_MODEL_PENDING)}</p>
              </section>}
              {selectedNode.type === 'llm' && !isCatalogModel(data) && (
                <Tabs key={selectedNode.id} defaultValue="model" className="w-full">
                  <TabsList className="property-model-tabs grid w-full grid-cols-3">
                    <TabsTrigger value="model">{uiText(t('prop.model'))}</TabsTrigger>
                    <TabsTrigger value="params">{uiText(t('prop.params'))}</TabsTrigger>
                    <TabsTrigger value="test">{uiText("单独测试模型")}</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="model" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>{uiText(t('prop.source'))}</Label>
                      <Select 
                        value={data.model || ''} 
                        onValueChange={(v) => handleChange('model', v)}
                      >
                        <SelectTrigger title={uiText(data.model ? getModelLabel(data.model) : undefined)}>
                          <SelectValue placeholder="Select model">
                              {uiText(data.model ? getModelLabel(data.model) : "Select a model")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.length > 0 ? (
                              availableModels.map((model) => (
                                  <SelectItem key={model.id} value={model.id}>
                                      <div className="flex items-center gap-2">
                                          <span>{uiText(model.is_downloaded ? '✅' : '☁️')}</span>
                                          <span>{model.name}</span>
                                          <Badge variant="outline" className="type-tag min-h-5 px-1">{model.size}</Badge>
                                          {!model.is_downloaded && <span className="type-caption text-muted-foreground">(Download needed)</span>}
                                      </div>
                                  </SelectItem>
                              ))
                          ) : (
                              <div className="p-2 type-body text-muted-foreground text-center">Loading models...</div>
                          )}
                        </SelectContent>
                      </Select>
                      <Label>{uiText("模型 ID（可填写已接入的 API 模型）")}</Label>
                    <Input aria-label={uiText("模型 ID")} value={data.model || ''} onChange={e => handleChange('model',e.target.value)} placeholder={uiText("与后端登记的模型 ID 一致")} />
                    {/* Quick Download Link if selected model is not downloaded */}
                      {data.model && availableModels.find(m => m.id === data.model && !m.is_downloaded) && (
                          <div className="type-body text-amber-500 flex items-center gap-1">
                              <span>⚠️ Model not downloaded.</span>
                              <span className="underline cursor-pointer" onClick={() => document.dispatchEvent(new CustomEvent('open-model-manager'))}>Manage Models</span>
                          </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>{uiText(t('prop.quant'))}</Label>
                      <Select 
                        value={data.quantization || 'q4_k_m'} 
                        onValueChange={(v) => handleChange('quantization', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="q4_k_m">Q4_K_M (Balanced)</SelectItem>
                          <SelectItem value="q5_k_m">Q5_K_M (Better Quality)</SelectItem>
                          <SelectItem value="q8_0">Q8_0 (High Precision)</SelectItem>
                          <SelectItem value="f16">FP16 (Original)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>LoRA Adapter (Persona/Skill)</Label>
                      <Select 
                        value={data.lora || 'none'} 
                        onValueChange={(v) => handleChange('lora', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None (Base Model)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Base Model)</SelectItem>
                          {availableLoras.map((lora) => (
                              <SelectItem key={lora.id} value={lora.id}>
                                  <div className="flex flex-col text-left">
                                      <span className="font-semibold">{uiText(lora.name)}</span>
                                      <span className="type-caption text-muted-foreground">{uiText(lora.description)}</span>
                                  </div>
                              </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{uiText(t('prop.sys_prompt'))}</Label>
                      <Textarea 
                        className="min-h-[100px] font-mono type-code"
                        placeholder="You are a helpful assistant..."
                        value={data.systemPrompt || ''}
                        onChange={(e) => handleChange('systemPrompt', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Prompt Template</Label>
                      <Select
                        value={data.promptProfile || 'auto_actions'}
                        onValueChange={(v) => handleChange('promptProfile', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a prompt template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto_actions">Action Planner</SelectItem>
                          <SelectItem value="visual_emergency">Visual Emergency</SelectItem>
                          <SelectItem value="child_care">{uiText("儿童关怀 · 视觉 JSON")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="type-body text-muted-foreground">
                        {data.promptProfile === 'child_care'
                          ? uiText("仅基于本次图片判断儿童状态，返回 status、risk_action、confidence、summary；纯文字不能代替视觉判断。")
                          : data.promptProfile === 'visual_emergency'
                          ? uiText("先描述图像，再判断是否存在昏厥、晕倒、失能等紧急迹象；若存在则优先输出紧急相关 JSON。")
                          : uiText("根据下游节点能力自动生成结构化动作提示词，用于车控、导航、拨号、回复等动作规划。")}
                      </div>
                    </div>

                    {((data.basePrompt || data.structuredPrompt) || (Array.isArray(data.allowedActions) && data.allowedActions.length > 0)) && (
                      <div className="space-y-2">
                        <Label>Prompt Plan</Label>
                        {data.promptProfile && (
                          <div className="type-body text-cyan-300">
                            Template: {data.promptProfile === 'child_care' ? uiText("儿童关怀 · 视觉 JSON") : data.promptProfile === 'visual_emergency' ? 'Visual Emergency' : 'Action Planner'}
                          </div>
                        )}
                        {Array.isArray(data.allowedActions) && data.allowedActions.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {data.allowedActions.map((action: string) => (
                              <span key={action} className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 type-tag text-cyan-200">
                                {uiText(action)}
                              </span>
                            ))}
                          </div>
                        )}
                        {data.basePrompt && (
                          <div className="space-y-1">
                            <Label className="type-label uppercase text-muted-foreground">Base Prompt</Label>
                            <Textarea
                              className="min-h-[100px] font-mono type-code"
                              value={data.basePrompt || ''}
                              readOnly
                            />
                          </div>
                        )}
                        {data.structuredPrompt && (
                          <div className="space-y-1">
                            <Label className="type-label uppercase text-muted-foreground">Structured Prompt</Label>
                            <Textarea
                              className="min-h-[180px] font-mono type-code"
                              value={data.structuredPrompt || ''}
                              readOnly
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {data.output?.raw_model_output && (
                      <div className="space-y-2">
                        <Label>Raw Model Output</Label>
                        <Textarea
                          className="min-h-[140px] font-mono type-code"
                          value={data.output.raw_model_output}
                          readOnly
                        />
                      </div>
                    )}

                  </TabsContent>
                  
                  <TabsContent value="test" className="pt-4"><ModelTestPanel key={`${selectedNode.id}:${data.model}`} model={data.model || ""} /></TabsContent>
                  <TabsContent value="params" className="space-y-4 pt-4">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <Label>{uiText(t('prop.temp'))}</Label>
                        <span className="type-caption text-muted-foreground">{data.temperature || 0.7}</span>
                      </div>
                      <Slider 
                        value={[data.temperature || 0.7]} 
                        max={2} 
                        step={0.1} 
                        onValueChange={([v]) => handleChange('temperature', v)} 
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <Label>{uiText(t('prop.max_tokens'))}</Label>
                        <span className="type-caption text-muted-foreground">{data.maxTokens || 128}</span>
                      </div>
                      <Slider 
                        value={[data.maxTokens || 128]} 
                        max={2048} 
                        step={64} 
                        onValueChange={([v]) => handleChange('maxTokens', v)} 
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{uiText(t('prop.stream'))}</Label>
                      <Switch 
                        checked={data.stream ?? true}
                        onCheckedChange={(v) => handleChange('stream', v)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{uiText(t('prop.json_mode'))}</Label>
                      <Switch 
                        checked={data.jsonMode ?? false}
                        onCheckedChange={(v) => handleChange('jsonMode', v)}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              )}

              {selectedNode.type === 'memory' && <div className="space-y-3">
                <Label>{uiText("记忆模式")}</Label>
                <select aria-label={uiText("记忆模式")} className="w-full h-10 border rounded-md bg-background px-3" value={data.type || ''} onChange={e => handleChange('type',e.target.value)}><option value="">{uiText("请选择")}</option><option value="buffer">{uiText("短期记忆（后端服务）")}</option>{data.type && data.type !== 'buffer' && <option value={data.type}>{data.type}{uiText("（未接入）")}</option>}</select>
                <Label>{uiText("记忆条数")}</Label><Input aria-label={uiText("记忆条数")} type="number" min={1} max={100} value={data.window ?? 10} onChange={e => handleChange('window', Number(e.target.value))} />
              </div>}

              {selectedNode.type === 'logic' && (
                <Tabs defaultValue="condition" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="condition">Visual Builder</TabsTrigger>
                    <TabsTrigger value="code">Code Editor</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="condition" className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Logic Type</Label>
                        <Select 
                            value={data.logic_type || data.type || 'if'} 
                            onValueChange={(v) => handleChange('logic_type', v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="if">IF Condition</SelectItem>
                                <SelectItem value="filter">Filter</SelectItem>
                            </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Condition / Expression</Label>
                        <Input 
                            value={data.condition || ''} 
                            placeholder={uiText(data.logic_type === 'filter' ? 'e.g. level <= 1' : 'e.g. temperature > 30')}
                            onChange={(e) => handleChange('condition', e.target.value)} 
                        />
                      </div>
                      {data.logic_type === 'filter' && (
                        <>
                          <div className="space-y-2">
                            <Label>Then Update</Label>
                            <Input
                              value={data.true_update || ''}
                              placeholder="e.g. level=2"
                              onChange={(e) => handleChange('true_update', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Else Update</Label>
                            <Input
                              value={data.false_update || ''}
                              placeholder="e.g. level=level"
                              onChange={(e) => handleChange('false_update', e.target.value)}
                            />
                          </div>
                        </>
                      )}
                  </TabsContent>

                  <TabsContent value="code" className="space-y-4 pt-4">
                      <div className="rounded-md border bg-background p-2">
                          <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                              <span className="type-code text-foreground font-mono flex items-center gap-1">
                                  <Code className="w-3 h-3" /> logic.js
                              </span>
                              <Button variant="ghost" size="icon" className="h-5 w-5 text-foreground hover:text-blue-400" title="Auto-fix with AI">
                                  <Wand2 className="w-3 h-3" />
                              </Button>
                          </div>
                          <Textarea 
                              className="min-h-[200px] font-mono type-code bg-transparent border-0 text-green-400 p-0 focus-visible:ring-0"
                              value={data.script || ''}
                              placeholder={uiText("例如：return input.confidence >= 0.85;")}
                              onChange={(e) => handleChange('script', e.target.value)}
                              spellCheck={false}
                          />
                      </div>
                      <div className="flex justify-end">
                          <Button size="sm" variant="outline" className="h-7 type-label" onClick={() => console.log("Saved script")}>
                              <Save className="w-3 h-3 mr-1" /> Save Script
                          </Button>
                      </div>
                  </TabsContent>
                </Tabs>
              )}

              {selectedNode.type === 'tool' && (data.tool_id || data.tool) === 'mcp' && <McpArgumentsEditor key={selectedNode.id} data={data} onChange={value => handleChange('arguments', value)}/>}
              {selectedNode.type === 'tool' && (data.tool_id || data.tool) !== 'mcp' && <div className="space-y-3">
                <Label>{uiText("应用动作（仅界面仿真）")}</Label>
                <select aria-label={uiText("应用动作")} className="w-full h-10 border rounded-md bg-background px-3" value={data.tool_id || data.tool || ''} onChange={e => { const next = { ...data, tool: e.target.value, tool_id: e.target.value }; setData(next); onUpdate(selectedNode.id,next); }}><option value="">{uiText("请选择")}</option><option value="music">{uiText("音乐界面")}</option><option value="nav">{uiText("导航界面")}</option><option value="call_phone">{uiText("拨号界面")}</option>{(data.tool_id || data.tool) && !['music','nav','call_phone'].includes(data.tool_id || data.tool) && <option value={data.tool_id || data.tool}>{data.tool_id || data.tool}{uiText("（未接入）")}</option>}</select>
                <p className="type-body text-muted-foreground">{uiText("不调用外部服务，不能据此判断真实应用操作成功。")}</p>
              </div>}
              {['fallback','output'].includes(selectedNode.type) && <div className="space-y-2"><Label>{uiText("反馈文字")}{uiText(selectedNode.type === 'output' ? uiText("（留空使用上游回复）") : '')}</Label><Textarea aria-label={uiText("反馈文字")} value={data.responseText || ''} onChange={e => handleChange('responseText',e.target.value)} /></div>}
              {/* Output Inspector - Available for all nodes if output exists */}
              {(data.output || data.status) && (
                  <div className="space-y-4 pt-4 border-t">
                      <Label className="type-section ">Execution Status</Label>
                      
                      <div className="flex items-center gap-2 type-body">
                          <span className="text-muted-foreground">State:</span>
                          <Badge variant={data.status === 'success' ? 'default' : data.status === 'error' ? 'destructive' : 'secondary'}>
                              {data.status || 'idle'}
                          </Badge>
                      </div>

                      {data.output && (
                          <div className="space-y-2">
                              <Label>Last Output</Label>
                              <div className="rounded-md bg-muted p-3 type-code font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
                                  {typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2)}
                              </div>
                          </div>
                      )}
                  </div>
              )}

            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
