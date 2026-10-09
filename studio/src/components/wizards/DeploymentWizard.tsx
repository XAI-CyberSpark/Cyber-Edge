import { uiText } from '@/i18n';
import { isCatalogModel, CATALOG_MODEL_PENDING } from '@/domain/catalogModelNode';
import { useState, useEffect, useRef } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Loader2, 
  Rocket, 
  Cpu, 
  HardDrive, 
  Terminal
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApp } from "@/context/AppContext";
import { useReactFlow } from '@xyflow/react';
import { apiUrl } from '@/lib/api';

interface DeploymentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetDevice: string;
  currentProjectName?: string;
  currentProjectFileName?: string;
}

export const DeploymentWizard = ({ open, onOpenChange, targetDevice, currentProjectName, currentProjectFileName }: DeploymentWizardProps) => {
  const { t, switchDevice } = useApp();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { getNodes, getEdges } = useReactFlow();
  const [step, setStep] = useState<'config' | 'provision' | 'success'>('config');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [sshConfig, setSshConfig] = useState({ hostname: '', username: 'xailab', password: '', port: 22 });
  const [deviceDir, setDeviceDir] = useState('/data/local/tmp/cyber_edge_agent_v25');
  const [bundleName, setBundleName] = useState('');
  const [modelSource, setModelSource] = useState('');
  const [includeAllProjects, setIncludeAllProjects] = useState(true);
  const [summary, setSummary] = useState<{ bundleDir?: string; manifestPath?: string; archivePath?: string; deviceDir?: string } | null>(null);
  const isLocalLikeTarget = targetDevice === 'local' || (targetDevice !== 'new_device' && !sshConfig.hostname);

  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`]);

  // Load previous config from localStorage
  useEffect(() => {
    if (open) {
      const savedConfig = localStorage.getItem('cyber-edge-ssh-config');
      if (savedConfig) {
          const parsed = JSON.parse(savedConfig);
          // Don't restore password for security
          setSshConfig(prev => ({ ...prev, ...parsed, password: '' }));
          if (parsed.deviceDir) setDeviceDir(parsed.deviceDir);
          if (parsed.modelSource) setModelSource(parsed.modelSource);
          if (typeof parsed.includeAllProjects === 'boolean') setIncludeAllProjects(parsed.includeAllProjects);
      }
      setStep('config');
      setProgress(0);
      setLogs([]);
      setSummary(null);
      const fallbackProject = (currentProjectFileName || currentProjectName || `project-${new Date().toISOString().slice(0, 10)}`).replace(/\.json$/i, '');
      setBundleName(fallbackProject);
    }
  }, [open, currentProjectFileName, currentProjectName]);

  const saveConfig = (config: any) => {
      const { password, ...safeConfig } = config;
      localStorage.setItem('cyber-edge-ssh-config', JSON.stringify(safeConfig));
  };

  const handleProvision = async () => {
      setStep('provision');
      setProgress(10);
      setLogs(['Preparing SA8397 bundle request...']);
      
      const nodes = getNodes();
      const edges = getEdges();
      if (nodes.some(n => isCatalogModel(n.data))) { setProgress(0); setLogs([CATALOG_MODEL_PENDING]); return; }
      const projectBaseName = (currentProjectFileName || currentProjectName || bundleName || 'studio-export').replace(/\.json$/i, '');
      const projectFileName = currentProjectFileName || `${projectBaseName}.json`;
      const payload = {
          deploy_mode: (targetDevice === 'new_device' || sshConfig.hostname) ? 'ssh' : 'adb',
          hostname: sshConfig.hostname || undefined,
          username: sshConfig.username || undefined,
          password: sshConfig.password || undefined,
          port: sshConfig.port,
          adb_serial: targetDevice !== 'local' && targetDevice !== 'new_device' ? targetDevice : undefined,
          device_dir: deviceDir,
          bundle_name: bundleName || projectBaseName,
          project_name: currentProjectName || projectBaseName,
          project_file_name: projectFileName,
          include_all_projects: includeAllProjects,
          model_source: modelSource,
          package_models: true,
          flow_config: {
              id: projectBaseName,
              name: currentProjectName || projectBaseName,
              file_name: projectFileName,
              nodes,
              edges,
              meta: {
                  deployed_from: 'studio',
                  target_device: targetDevice,
                  created: Date.now(),
              },
              updated_at: Date.now() / 1000,
          }
      };

      try {
          saveConfig({ ...sshConfig, deviceDir, modelSource, includeAllProjects });

          if (payload.deploy_mode === 'ssh') {
              setLogs(['Checking SSH connectivity...']);
              const connectRes = await fetch(apiUrl('/v1/edge/connect'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    hostname: sshConfig.hostname,
                    username: sshConfig.username,
                    password: sshConfig.password,
                    port: sshConfig.port,
                  })
              });
              if (!connectRes.ok) {
                  const err = await connectRes.json().catch(() => ({}));
                  throw new Error(`Connection Failed: ${err.error || err.detail || connectRes.statusText}`);
              }
              setProgress(30);
          }

          addLog('Starting bundle build and deployment...');
          setProgress(55);
          const res = await fetch(apiUrl('/v1/edge/provision'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
              setLogs(Array.isArray(data.logs) ? data.logs : []);
              throw new Error(`Provision Failed: ${data.error || data.detail || res.statusText}`);
          }

          if (data.status === 'success') {
              setLogs(data.logs);
              setSummary({
                bundleDir: data.bundle_dir,
                manifestPath: data.manifest_path,
                archivePath: data.archive_path,
                deviceDir: data.device_dir,
              });
              setProgress(100);
              setStep('success');
              if (payload.deploy_mode === 'ssh' && sshConfig.hostname) {
                switchDevice(sshConfig.hostname);
              }
          } else if (data.status === 'error') {
              setLogs(Array.isArray(data.logs) ? data.logs : []);
              throw new Error(data.error || "Provisioning failed.");
          }
      } catch (e: any) {
          addLog(`Error: ${e.message}`);
          setProgress(100);
      }
  };

  const startDeployment = () => {
    if (!modelSource.trim()) {
      window.alert(uiText("请输入 Gemma4/QNN 模型源路径，例如 /abs/path/to/sa8397-qnn 或 adb:/data/local/tmp/sa8397-qnn"));
      return;
    }
    handleProvision();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-background border-border text-foreground"
        onOpenAutoFocus={event => {
          event.preventDefault();
          titleRef.current?.focus();
        }}>
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="flex items-center gap-2 type-panel focus:outline-none">
            <Rocket className="w-5 h-5 text-blue-500" />
            {uiText(t('wizard.title'))}
          </DialogTitle>
          <DialogDescription className="text-foreground">
            {uiText(t('wizard.desc'))}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'config' && (
            <div className="space-y-4">
              <div className="bg-background p-4 rounded-lg border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="type-label  text-foreground">{uiText(t('wizard.target'))}</span>
                  <Badge variant="outline" className="bg-blue-900/20 text-blue-400 border-blue-500/30">
                    {uiText(isLocalLikeTarget ? t('wizard.local') : t('wizard.remote'))}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <Input
                    placeholder="Bundle Name"
                    value={bundleName}
                    onChange={e => setBundleName(e.target.value)}
                    className="bg-background border-border h-8 type-label"
                  />
                  <Input
                    placeholder="Target Device Dir (e.g. /data/local/tmp/cyber_edge_agent_v25)"
                    value={deviceDir}
                    onChange={e => setDeviceDir(e.target.value)}
                    className="bg-background border-border h-8 type-label"
                  />
                  <Input
                    placeholder="Gemma4/QNN Source (e.g. /abs/path/to/sa8397-qnn or adb:/data/local/tmp/sa8397-qnn)"
                    value={modelSource}
                    onChange={e => setModelSource(e.target.value)}
                    className="bg-background border-border h-8 type-label"
                  />
                  <label className="flex items-center gap-2 type-label text-foreground">
                    <input
                      type="checkbox"
                      checked={includeAllProjects}
                      onChange={e => setIncludeAllProjects(e.target.checked)}
                    />
                    Include all saved project JSON files in the bundle
                  </label>
                </div>

                {targetDevice === 'new_device' && (
                    <div className="space-y-2 mt-2 pt-2 border-t border-border">
                        <Input placeholder="IP Address (e.g. 192.168.1.100)" value={sshConfig.hostname} onChange={e => setSshConfig({...sshConfig, hostname: e.target.value})} className="bg-background border-border h-8 type-label" />
                        <div className="flex gap-2">
                            <Input placeholder="Username" value={sshConfig.username} onChange={e => setSshConfig({...sshConfig, username: e.target.value})} className="bg-background border-border h-8 type-label flex-1" />
                            <Input type="password" placeholder="Password" value={sshConfig.password} onChange={e => setSshConfig({...sshConfig, password: e.target.value})} className="bg-background border-border h-8 type-label flex-1" />
                            <Input type="number" placeholder="Port" value={sshConfig.port} onChange={e => setSshConfig({...sshConfig, port: parseInt(e.target.value)})} className="bg-background border-border h-8 type-label w-16" />
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="type-label  text-foreground">{uiText(t('wizard.opt'))}</span>
                  <Badge variant="outline" className="text-green-400 border-green-500/30">{uiText(t('wizard.quant'))}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="type-label  text-foreground">{uiText(t('wizard.runtime'))}</span>
                  <Badge variant="outline" className="text-purple-400 border-purple-500/30">OAKEgde Studio Runtime v2.1</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border border-border rounded-lg bg-background flex items-center gap-3">
                    <Cpu className="w-8 h-8 text-foreground" />
                    <div>
                        <div className="type-label text-foreground">{uiText(t('wizard.latency'))}</div>
                        <div className="type-body font-bold text-foreground">45ms</div>
                    </div>
                </div>
                <div className="p-3 border border-border rounded-lg bg-background flex items-center gap-3">
                    <HardDrive className="w-8 h-8 text-foreground" />
                    <div>
                        <div className="type-label text-foreground">{uiText(t('wizard.size'))}</div>
                        <div className="type-body font-bold text-foreground">2.4 GB</div>
                    </div>
                </div>
              </div>
            </div>
          )}

          {step === 'provision' && (
            <div className="space-y-6">
               <div className="space-y-2">
                   <div className="flex justify-between type-body">
                       <span className="text-foreground">
                           Provisioning Device...
                       </span>
                       <span className="text-blue-400 font-mono">{uiText(Math.round(progress))}%</span>
                   </div>
                   <Progress value={progress} className="h-2 bg-background" />
               </div>

               <div className="rounded-md bg-background border border-border p-3 font-mono type-code h-[200px] overflow-hidden flex flex-col">
                   <div className="flex items-center gap-2 text-foreground border-b border-border pb-2 mb-2">
                       <Terminal className="w-3 h-3" /> {uiText(t('wizard.log'))}
                   </div>
                   <ScrollArea className="flex-1">
                       <div className="space-y-1">
                           {logs.map((log, i) => (
                               <div key={i} className="text-foreground">{uiText(log)}</div>
                           ))}
                           <div className="animate-pulse text-blue-500">_</div>
                       </div>
                   </ScrollArea>
               </div>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <div>
                    <h3 className="type-section  text-foreground">{uiText(t('wizard.success'))}</h3>
                    <p className="type-body text-foreground max-w-[300px] mx-auto mt-2">
                        {uiText(t('wizard.live'))} <span className="text-blue-400">{uiText(isLocalLikeTarget ? t('wizard.local') : t('wizard.remote'))}</span>.
                    </p>
                </div>
                {summary && (
                  <div className="text-left type-body text-foreground bg-background border border-border rounded-lg p-3 w-full">
                    <div>bundle_dir: {uiText(summary.bundleDir)}</div>
                    <div>manifest: {uiText(summary.manifestPath)}</div>
                    <div>archive: {uiText(summary.archivePath || '(not generated)')}</div>
                    <div>device_dir: {uiText(summary.deviceDir)}</div>
                  </div>
                )}
                <div className="flex gap-4 type-caption text-foreground mt-4">
                    <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {uiText(t('wizard.api_ready'))}</div>
                    <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {uiText(t('wizard.monitoring'))}</div>
                </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'config' && (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>{uiText(t('wizard.cancel'))}</Button>
                <Button onClick={startDeployment} className="bg-blue-600 hover:bg-blue-500">
                    <Rocket className="w-4 h-4 mr-2" />
                    {uiText(t('wizard.start'))}
                </Button>
              </>
          )}
          {step === 'provision' && (
              <Button disabled variant="secondary">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {uiText(t('wizard.processing'))}
              </Button>
          )}
          {step === 'success' && (
              <Button onClick={() => onOpenChange(false)} className="bg-green-600 hover:bg-green-500">
                  {uiText(t('wizard.done'))}
              </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
