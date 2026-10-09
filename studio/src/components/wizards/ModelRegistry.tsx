import { uiText, useUiLanguage  } from '@/i18n';
import { useState, useEffect } from 'react';
import { useApp } from "@/context/AppContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Box,
  RefreshCw,
  Save,
  Trash2,
  Power,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deviceApiBaseUrl, getApiBaseUrl } from "@/lib/api";

interface Model {
    id: string;
    name: string;
    type: string;
    category: string;
    size?: string;
    path?: string;
    status?: string;
    provider?: string;
    is_downloaded?: boolean;
}

interface ModelRegistryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ModelRegistry = ({ open, onOpenChange }: ModelRegistryProps) => {
  useUiLanguage();
    const { targetDevice, isRemote } = useApp();
    const [models, setModels] = useState<Model[]>([]);
    const [loading, setLoading] = useState(false);
    const [draft, setDraft] = useState<Model>({
        id: '',
        name: '',
        type: 'llm',
        category: 'llm',
        size: 'local',
        path: '',
        status: 'active',
        provider: 'Local',
        is_downloaded: true,
    });

    const baseUrl = isRemote ? deviceApiBaseUrl(targetDevice) : getApiBaseUrl();

    const fetchModels = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${baseUrl}/v1/models`);
            const data = await response.json();
            setModels(data.models || []);
        } catch (error) {
            console.error("Failed to fetch models", error);
            setModels([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        fetchModels();
    }, [open, baseUrl]);

    const saveModel = async () => {
        if (!draft.id.trim() || !draft.name.trim()) {
            window.alert(uiText("请填写模型 ID 和名称。"));
            return;
        }
        try {
            const response = await fetch(`${baseUrl}/v1/models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...draft,
                    id: draft.id.trim(),
                    name: draft.name.trim(),
                    size: draft.size || 'local',
                    path: draft.path || '',
                    status: draft.status || 'active',
                    provider: draft.provider || 'Local',
                    is_downloaded: draft.is_downloaded ?? true,
                }),
            });
            if (!response.ok) {
                throw new Error('save failed');
            }
            setDraft({
                id: '',
                name: '',
                type: draft.type,
                category: draft.category,
                size: 'local',
                path: '',
                status: 'active',
                provider: 'Local',
                is_downloaded: true,
            });
            fetchModels();
        } catch (error) {
            console.error("Failed to save model", error);
            window.alert(uiText("保存模型失败。"));
        }
    };

    const updateStatus = async (modelId: string, status: string) => {
        try {
            const response = await fetch(`${baseUrl}/v1/models/${encodeURIComponent(modelId)}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!response.ok) {
                throw new Error('status update failed');
            }
            fetchModels();
        } catch (error) {
            console.error("Failed to update model status", error);
        }
    };

    const deleteModel = async (modelId: string) => {
        if (!window.confirm(uiText("确认移除模型 {0} 吗？", [modelId]))) {
            return;
        }
        try {
            const response = await fetch(`${baseUrl}/v1/models/${encodeURIComponent(modelId)}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error('delete failed');
            }
            fetchModels();
        } catch (error) {
            console.error("Failed to delete model", error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] bg-background border-border text-foreground shadow-2xl">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="flex items-center gap-2 type-panel">
                                <Box className="w-5 h-5 text-blue-500" />
                                Model Registry
                            </DialogTitle>
                            <DialogDescription className="text-foreground">
                                {uiText("管理当前可用模型，支持后续新增、移除和启停。")}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="py-4">
                    <div className="grid grid-cols-6 gap-2 mb-4">
                        <Input
                            placeholder="model id"
                            value={draft.id}
                            onChange={(e) => setDraft(prev => ({ ...prev, id: e.target.value }))}
                            className="col-span-2"
                        />
                        <Input
                            placeholder="model name"
                            value={draft.name}
                            onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))}
                            className="col-span-2"
                        />
                        <Select value={draft.category} onValueChange={(value) => setDraft(prev => ({ ...prev, category: value, type: value }))}>
                            <SelectTrigger className="col-span-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="llm">LLM</SelectItem>
                                <SelectItem value="vlm">VLM</SelectItem>
                                <SelectItem value="audio">Audio</SelectItem>
                                <SelectItem value="tts">TTS</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={saveModel} className="col-span-1">
                            <Save className="w-3.5 h-3.5 mr-2" />
                            {uiText("保存")}</Button>
                        <Input
                            placeholder="path"
                            value={draft.path}
                            onChange={(e) => setDraft(prev => ({ ...prev, path: e.target.value }))}
                            className="col-span-4"
                        />
                        <Input
                            placeholder="provider"
                            value={draft.provider}
                            onChange={(e) => setDraft(prev => ({ ...prev, provider: e.target.value }))}
                            className="col-span-1"
                        />
                        <Input
                            placeholder="size"
                            value={draft.size}
                            onChange={(e) => setDraft(prev => ({ ...prev, size: e.target.value }))}
                            className="col-span-1"
                        />
                    </div>

                    <ScrollArea className="h-[300px] rounded-md border border-border bg-background">
                        <div className="p-1">
                            <div className="grid grid-cols-12 gap-2 px-4 py-2 type-label  text-foreground uppercase tracking-wider border-b border-border">
                                <div className="col-span-4">Model Name</div>
                                <div className="col-span-2">Type</div>
                                <div className="col-span-3">Path</div>
                                <div className="col-span-2">Status</div>
                                <div className="col-span-2 text-right">Actions</div>
                            </div>

                            {loading && (
                                <div className="px-4 py-8 type-body text-foreground text-center">Loading models...</div>
                            )}

                            {models.map(model => (
                                <div key={model.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-border hover:bg-background transition-colors group">
                                    <div className="col-span-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${
                                                model.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                                                'bg-background0'
                                            }`} />
                                            <div>
                                                <div className="type-item-title  text-foreground">{model.name}</div>
                                                <div className="type-caption text-foreground">{uiText(model.id)} • {uiText(model.provider || 'Local')} • {uiText(model.size || 'local')}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <Badge variant="secondary" className="bg-background text-foreground border border-border type-tag">{uiText((model.category || model.type || 'llm').toUpperCase())}</Badge>
                                    </div>
                                    <div className="col-span-3">
                                        <div className="type-code text-foreground font-mono truncate">{uiText(model.path || '-')}</div>
                                    </div>
                                    <div className="col-span-2">
                                        {model.status === 'active' && (
                                            <div className="flex items-center gap-1.5 type-body text-green-400">
                                                <Power className="w-3 h-3 fill-current" />
                                                Active
                                            </div>
                                        )}
                                        {model.status !== 'active' && <span className="type-body text-foreground">{uiText(model.status || 'inactive')}</span>}
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                        {model.status === 'active' ? (
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-400 hover:text-amber-300" onClick={() => updateStatus(model.id, 'inactive')}>
                                                <Power className="w-3.5 h-3.5" />
                                            </Button>
                                        ) : (
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400 hover:text-green-300" onClick={() => updateStatus(model.id, 'active')}>
                                                <Power className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-foreground hover:text-foreground" onClick={fetchModels}>
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteModel(model.id)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {!loading && models.length === 0 && (
                                <div className="px-4 py-8 type-body text-foreground text-center">
                                    {uiText("暂无模型。你可以在上方新增。")}</div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
};
