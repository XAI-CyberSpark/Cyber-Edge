import { uiText, useUiLanguage  } from '@/i18n';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApp } from '@/context/AppContext';
import { Settings, Server, Cpu, HardDrive, Download, RefreshCw, Image, Mic, Volume2, Network, Activity, Save } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { apiUrl } from '@/lib/api';

interface ModelInfo {
  id: string;
  name: string;
  size: string;
  path: string;
  is_downloaded: boolean;
  category?: 'llm' | 'vlm' | 'audio' | 'tts' | 'omni';
  format?: string;
  status?: string;
  download_progress?: number | null;
}

export const SettingsPanel = () => {
  useUiLanguage();
  const { t, language, setLanguage } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [systemStatus, setSystemStatus] = useState({ cpu: 0, memory: 0, backend: false });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [edgeDevices, setEdgeDevices] = useState<any[]>([]);
  const [editingIp, setEditingIp] = useState<{[key: string]: string}>({});

  const fetchEdgeDevices = async () => {
      try {
          const res = await fetch(apiUrl('/v1/edge/devices'));
          if (res.ok) {
              const data = await res.json();
              setEdgeDevices(data.devices || []);
          }
      } catch (e) { console.error(e); }
  };

  const testConnection = async (deviceId: string) => {
      try {
          toast({ title: "Testing connection...", description: "Pinging device..." });
          const res = await fetch(apiUrl(`/v1/edge/devices/${deviceId}/check`), { method: 'POST' });
          if (res.ok) {
              const data = await res.json();
              if (data.status.includes("online")) {
                  toast({ title: "Connection Successful", description: "Device is online", variant: "default" });
              } else {
                  toast({ title: "Connection Failed", description: data.status, variant: "destructive" });
              }
              fetchEdgeDevices();
          }
      } catch (e) {
          toast({ title: "Error", description: "Failed to reach backend", variant: "destructive" });
      }
  };

  const saveIp = async (deviceId: string) => {
      const newIp = editingIp[deviceId];
      if (!newIp) return;
      
      try {
          const res = await fetch(apiUrl(`/v1/edge/devices/${deviceId}/config`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ip: newIp })
          });
          if (res.ok) {
              toast({ title: "Saved", description: "IP address updated" });
              fetchEdgeDevices();
              setEditingIp(prev => {
                  const next = { ...prev };
                  delete next[deviceId];
                  return next;
              });
          }
      } catch (e) {
          toast({ title: "Error", description: "Failed to save IP", variant: "destructive" });
      }
  };

  const fetchModels = async () => {
    try {
      // Fetch from Python backend port 8000
      const res = await fetch(apiUrl('/v1/models'));
      if (res.ok) {
        const data = await res.json();
        const modelsArray = data.models ? data.models : (Array.isArray(data) ? data : []);
        
        const enrichedData = modelsArray.map((m: any) => ({
            ...m,
            category: m.category || (m.type ? m.type.toLowerCase() : '') || (
                      m.id.includes('llava') || m.id.includes('moondream') || m.id.includes('bunny') || m.id.includes('gemini') || m.id.includes('yolo') || m.id.includes('nanollava') || m.id.includes('qwen-vl') ? 'vlm' :
                      m.id.includes('whisper') || m.id.includes('audio') ? 'audio' :
                      m.id.includes('tts') || m.id.includes('cosyvoice') ? 'tts' :
                      m.id.includes('gemma-2') ? 'omni' : 'llm')
        }));
        
        // Map embedding and asr types to match tabs
        enrichedData.forEach((m: any) => {
            if (m.category === 'asr') m.category = 'audio';
            if (m.category === 'embedding') m.category = 'llm';
        });
        
        setModels(enrichedData);
        setSystemStatus(prev => ({ ...prev, backend: true }));
      } else {
        setSystemStatus(prev => ({ ...prev, backend: false }));
      }
    } catch (e) {
      // console.error("Failed to fetch models", e); // Reduce noise
      setSystemStatus(prev => ({ ...prev, backend: false }));
    }
  };

  const fetchSystemStats = async () => {
      try {
          const res = await fetch(apiUrl('/v1/system/status'));
          if (res.ok) {
              const stats = await res.json();
              const telemetry = stats.telemetry || {};
              setSystemStatus({
                  cpu: Math.round(telemetry.cpu_usage || 0),
                  memory: Math.round(telemetry.memory_usage || 0),
                  backend: true
              });
          }
      } catch (e) {
          // ignore
      }
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchModels().then(() => setLoading(false));
      fetchSystemStats();
      fetchEdgeDevices();

      // Real polling
      const interval = setInterval(() => {
        fetchModels();
        fetchSystemStats();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const downloadModel = async (modelId: string) => {
    // Optimistic update
    setModels(prev => prev.map(m => m.id === modelId ? { ...m, status: 'downloading' } : m));
    
    try {
      await fetch(apiUrl('/v1/models/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId })
      });
      // Backend handles the rest, polling will pick up status
    } catch (e) {
      console.error("Failed to trigger download", e);
    }
  };

  // Group models by category
  const categorizedModels = {
      llm: models.filter(m => !m.category || m.category === 'llm'),
      vlm: models.filter(m => m.category === 'vlm'),
      audio: models.filter(m => m.category === 'audio'),
      tts: models.filter(m => m.category === 'tts'),
      omni: models.filter(m => m.category === 'omni'),
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          {uiText(t('settings'))}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>{uiText(t('settings'))}</DialogTitle>
          <DialogDescription className="type-body text-muted-foreground">
            Manage system configuration, models, and edge devices.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="models" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">{uiText(t('settings.general'))}</TabsTrigger>
            <TabsTrigger value="models">{uiText(t('settings.models'))}</TabsTrigger>
            <TabsTrigger value="edge">Edge Computing</TabsTrigger>
            <TabsTrigger value="system">{uiText(t('settings.system'))}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="p-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{uiText("Language / 语言")}</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button 
                  variant={language === 'zh' ? 'default' : 'outline'} 
                  onClick={() => setLanguage('zh')}
                >
                  {uiText("中文 (Chinese)")}</Button>
                <Button 
                  variant={language === 'en' ? 'default' : 'outline'} 
                  onClick={() => setLanguage('en')}
                >
                  English
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="models" className="flex-1 overflow-hidden p-1 flex flex-col">
            <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="type-section ">Model Library</h3>
                <Button size="sm" variant="ghost" onClick={fetchModels} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>
            
            <Tabs defaultValue="llm" className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-full justify-start h-9 p-0 bg-transparent border-b rounded-none mb-2">
                    <TabsTrigger value="llm" className="data-[state=active]:bg-muted border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4">LLM</TabsTrigger>
                    <TabsTrigger value="vlm" className="data-[state=active]:bg-muted border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4">VLM</TabsTrigger>
                    <TabsTrigger value="audio" className="data-[state=active]:bg-muted border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4">Audio</TabsTrigger>
                    <TabsTrigger value="tts" className="data-[state=active]:bg-muted border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4">TTS</TabsTrigger>
                </TabsList>

                {['llm', 'vlm', 'audio', 'tts'].map(cat => (
                    <TabsContent key={cat} value={cat} className="flex-1 overflow-hidden min-h-0 mt-0">
                        <ScrollArea className="h-[350px] border rounded-md p-4 bg-muted/10">
                            <div className="space-y-3">
                                {(categorizedModels[cat as keyof typeof categorizedModels] || []).map(model => (
                                  <div key={model.id} className="flex items-center justify-between p-3 border rounded-lg bg-card shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <div className={`p-2 rounded-full ${cat === 'vlm' ? 'bg-pink-100 text-pink-600' : cat === 'audio' ? 'bg-yellow-100 text-yellow-600' : cat === 'tts' ? 'bg-cyan-100 text-cyan-600' : 'bg-purple-100 text-purple-600'}`}>
                                        {cat === 'vlm' ? <Image className="w-5 h-5" /> : cat === 'audio' ? <Mic className="w-5 h-5" /> : cat === 'tts' ? <Volume2 className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
                                      </div>
                                      <div>
                                        <div className=" type-item-title flex items-center gap-2">
                                            {uiText(model.name)}
                                            {model.format && (
                                                <Badge variant="outline" className="type-tag min-h-5 px-1 py-0">
                                                    {uiText(model.format)}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="type-caption text-muted-foreground">{uiText(model.size)} • {uiText(model.id)}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 min-w-[100px] justify-end">
                                      {model.status === 'downloading' || (model.download_progress !== undefined && model.download_progress !== null) ? (
                                          <div className="w-24 space-y-1">
                                              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden relative">
                                                  <div 
                                                    className={`h-full bg-primary transition-all duration-300 ${model.download_progress === undefined || model.download_progress === null ? 'animate-pulse w-full' : ''}`} 
                                                    style={model.download_progress !== undefined && model.download_progress !== null ? { width: `${model.download_progress * 100}%` } : {}} 
                                                  />
                                              </div>
                                              <div className="type-caption text-center text-muted-foreground">
                                                  {uiText(model.download_progress !== undefined && model.download_progress !== null ? `${Math.round(model.download_progress * 100)}%` : 'Downloading...')}
                                              </div>
                                          </div>
                                      ) : model.is_downloaded ? (
                                        <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                          {uiText(t('model.ready'))}
                                        </Badge>
                                      ) : (
                                        <Button size="sm" variant="outline" onClick={() => downloadModel(model.id)}>
                                          <Download className="w-4 h-4 mr-2" />
                                          {uiText(t('model.download'))}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {(categorizedModels[cat as keyof typeof categorizedModels] || []).length === 0 && (
                                    <div className="text-center text-muted-foreground py-8 type-body">No models found in this category.</div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                ))}
            </Tabs>
          </TabsContent>

          <TabsContent value="edge" className="p-4 space-y-4">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="type-section  flex items-center gap-2">
                      <Network className="w-5 h-5" /> Edge Devices
                  </h3>
                  <Button size="sm" variant="outline" onClick={fetchEdgeDevices}>
                      <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                  </Button>
              </div>
              
              <div className="grid gap-4">
                  {edgeDevices.map(dev => (
                      <Card key={dev.id}>
                          <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                  <div className={`p-3 rounded-full ${dev.status === 'online' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                      <Server className="w-6 h-6" />
                                  </div>
                                  <div>
                                      <div className=" type-item-title">{uiText(dev.name)}</div>
                                      <div className="flex items-center gap-2 mt-1">
                                          <span className="type-label text-muted-foreground">IP:</span>
                                          <Input 
                                              className="h-6 w-32 type-label" 
                                              value={editingIp[dev.id] !== undefined ? editingIp[dev.id] : dev.ip}
                                              onChange={(e) => setEditingIp(prev => ({...prev, [dev.id]: e.target.value}))}
                                          />
                                          {editingIp[dev.id] && (
                                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveIp(dev.id)}>
                                                  <Save className="w-4 h-4" />
                                              </Button>
                                          )}
                                      </div>
                                      {dev.last_error && (
                                          <div className="type-body text-red-500 mt-1">Error: {dev.last_error}</div>
                                      )}
                                  </div>
                              </div>
                              
                              <div className="flex flex-col items-end gap-2">
                                  <Badge variant={dev.status === 'online' ? 'default' : 'secondary'} className={dev.status === 'online' ? 'bg-green-500' : ''}>
                                      {uiText(dev.status)}
                                  </Badge>
                                  <Button size="sm" variant="outline" onClick={() => testConnection(dev.id)}>
                                      <Activity className="w-3 h-3 mr-2" />
                                      Test Connection
                                  </Button>
                              </div>
                          </CardContent>
                      </Card>
                  ))}
              </div>
          </TabsContent>

          <TabsContent value="system" className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="type-item-title  flex items-center gap-2">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    {uiText(t('sys.backend'))}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`type-metric  ${systemStatus.backend ? 'text-green-500' : 'text-red-500'}`}>
                    {uiText(systemStatus.backend ? t('sys.connected') : t('sys.disconnected'))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="type-item-title  flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                    {uiText(t('sys.cpu'))}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="type-metric ">{uiText(systemStatus.cpu)}%</div>
                  <div className="h-2 bg-secondary mt-2 rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${systemStatus.cpu}%` }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
