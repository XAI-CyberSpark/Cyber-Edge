import { uiText, useUiLanguage } from '@/i18n';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Cpu, 
  Layers, 
  Clock, 
  Microchip, 
  Activity
} from "lucide-react";
import { apiUrl } from "@/lib/api";

export interface KernelState {
  utilization: {
    npu: number;
    gpu: number;
    cpu: number;
    memory: number; // Total RAM
    vram: number;   // Video RAM for Models
  };
  scheduler: {
    queue: Task[];
    active: Task[];
    completed: Task[];
    policy: 'FIFO' | 'Priority' | 'RoundRobin';
  };
  memorySegments: {
    label: string;
    size: number; // MB
    color: string;
    type: 'static' | 'dynamic' | 'cache';
  }[];
}

export interface Task {
  id: string;
  name: string;
  priority: 'critical' | 'high' | 'normal' | 'background';
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'preempted';
  progress: number;
  cost: number; // ms estimate
}

interface KernelMonitorProps {
  state: KernelState;
}

import { useApp } from "@/context/AppContext";

export const KernelMonitor = ({ state }: KernelMonitorProps) => {
  useUiLanguage();
  const { t } = useApp();
  const [realMetrics, setRealMetrics] = useState<any>(null);

  // Poll Backend API
  useEffect(() => {
    const fetchMetrics = async () => {
        try {
            const res = await fetch(apiUrl('/v1/system/status'));
            if (res.ok) {
                const data = await res.json();
                setRealMetrics(data.telemetry);
            }
        } catch (e) {
            // console.error("Failed to fetch real metrics", e);
        }
    };
    
    // Initial fetch
    fetchMetrics();
    
    const interval = setInterval(fetchMetrics, 1000);
    return () => clearInterval(interval);
  }, []);

  // Merge simulated state with real metrics if available
  const displayState = {
      ...state,
      utilization: {
          ...state.utilization,
          cpu: realMetrics ? realMetrics.cpu_usage : state.utilization.cpu,
          // If real GPU usage is available (Orin), use it. Otherwise use simulated NPU load.
          npu: realMetrics && realMetrics.gpu_usage > 0 ? realMetrics.gpu_usage : state.utilization.npu, 
          memory: realMetrics ? Math.round(realMetrics.memory_usage / 100 * 16) : state.utilization.memory // Assuming 16GB total for demo
      }
  };

  return (
    <div className="h-full flex flex-col gap-4 bg-background p-4">
      
      {/* Top Row: Hardware Resources */}
      <div className="grid grid-cols-3 gap-3 h-32 shrink-0">
        <Card className="bg-background border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="type-item-title  text-foreground uppercase flex items-center gap-2">
              <Microchip className="w-3.5 h-3.5 text-blue-500" /> {uiText(t('kernel.npu'))}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex items-end gap-2 mb-2">
              <span className="type-metric font-mono  text-foreground">{uiText(Math.round(displayState.utilization.npu))}%</span>
              <span className="type-label text-foreground mb-1">{uiText(t('kernel.utilization'))}</span>
            </div>
            <div className="space-y-1">
               <div className="flex justify-between type-caption text-foreground">
                 <span>TOPS</span>
                 <span>{uiText(realMetrics ? 'Orin NX' : 'Simulated')}</span>
               </div>
               <Progress value={displayState.utilization.npu} className="h-1.5 bg-background [&>div]:bg-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="type-item-title  text-foreground uppercase flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-purple-500" /> CPU / RAM
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex items-end gap-2 mb-2">
              <span className="type-metric font-mono  text-foreground">{uiText(Math.round(displayState.utilization.cpu))}%</span>
              <span className="type-label text-foreground mb-1">Load</span>
            </div>
            <div className="space-y-1">
                <div className="flex justify-between type-caption text-foreground">
                    <span>RAM Usage</span>
                    <span>{uiText(displayState.utilization.memory)} GB</span>
                </div>
                <Progress value={displayState.utilization.cpu} className="h-1.5 bg-background [&>div]:bg-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="type-item-title  text-foreground uppercase flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-green-500" /> {uiText(t('kernel.throughput'))}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex items-end gap-2 mb-2">
              <span className="type-metric font-mono  text-foreground">124</span>
              <span className="type-label text-foreground mb-1">{uiText(t('kernel.tokens_sec'))}</span>
            </div>
            <div className="flex items-center gap-2 type-caption text-foreground mt-2">
                <Badge variant="outline" className="type-tag min-h-5 border-green-500/30 text-green-400">TensorRT-LLM</Badge>
                <span>Latency: 12ms</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheduler Section */}
      <div className="flex-1 flex flex-col min-h-0 border border-border rounded-lg bg-background overflow-hidden">
          <div className="h-10 border-b border-border bg-background px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span className="type-section  text-foreground">{uiText(t('kernel.scheduler'))}</span>
                  <Badge variant="secondary" className="type-tag min-h-5 bg-background text-foreground">{uiText(state.scheduler.policy)}</Badge>
              </div>
              <div className="flex gap-4 type-code font-mono text-foreground">
                  <span>{uiText(t('kernel.running'))}: {uiText(state.scheduler.active.length)}</span>
                  <span>{uiText(t('kernel.pending'))}: {uiText(state.scheduler.queue.length)}</span>
              </div>
          </div>

          <div className="flex-1 p-4 flex gap-4 overflow-hidden">
              {/* Ready Queue */}
              <div className="w-1/3 flex flex-col gap-2">
                  <h4 className="type-section  text-foreground uppercase tracking-wider mb-1">{uiText(t('kernel.ready_queue'))}</h4>
                  <div className="flex-1 bg-background rounded-md border border-border p-2 space-y-2 overflow-y-auto">
                      {state.scheduler.queue.length === 0 && <div className="type-body text-foreground text-center mt-10">{uiText(t('kernel.queue_empty'))}</div>}
                      {state.scheduler.queue.map(task => (
                          <div key={task.id} className="bg-background border border-border p-2 rounded flex items-center justify-between group">
                              <div>
                                  <div className="flex items-center gap-2">
                                      <Badge className={`min-h-5 px-1 type-tag ${
                                          task.priority === 'critical' ? 'bg-red-900 text-red-300' : 
                                          task.priority === 'high' ? 'bg-amber-900 text-amber-300' : 'bg-background text-foreground'
                                      }`}>
                                          {uiText(task.priority)}
                                      </Badge>
                                      <span className="type-body text-foreground font-medium">{uiText(task.name)}</span>
                                  </div>
                                  <div className="type-caption text-foreground mt-0.5">{uiText(task.agent)}</div>
                              </div>
                              <Clock className="w-3 h-3 text-foreground" />
                          </div>
                      ))}
                  </div>
              </div>

              {/* Execution Units (Cores) */}
              <div className="flex-1 flex flex-col gap-2">
                  <h4 className="type-section  text-foreground uppercase tracking-wider mb-1">{uiText(t('kernel.exec_units'))}</h4>
                  <div className="grid grid-cols-1 gap-2">
                      {state.scheduler.active.map((task, i) => (
                          <div key={task.id} className="bg-background border border-blue-500/30 p-3 rounded relative overflow-hidden">
                              <div className="absolute top-0 left-0 bottom-0 bg-blue-500/5 transition-all duration-300" style={{ width: `${task.progress}%` }} />
                              <div className="relative flex justify-between items-center z-10">
                                  <div>
                                      <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                          <span className="type-body font-bold text-blue-100">NPU Core {uiText(i)}</span>
                                          <span className="type-body text-foreground mx-2">{uiText(t('kernel.running'))}: {uiText(task.name)}</span>
                                      </div>
                                      <div className="type-caption text-foreground mt-1 pl-4">Context: 4096 tokens • Batch: 1</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="type-code font-mono text-blue-400">{uiText(Math.round(task.progress))}%</div>
                                      <div className="type-caption text-foreground">~{uiText((task.cost * (1 - task.progress/100)).toFixed(0))}ms left</div>
                                  </div>
                              </div>
                          </div>
                      ))}
                      {state.scheduler.active.length === 0 && (
                          <div className="h-16 bg-background border border-border border-dashed rounded flex items-center justify-center type-body text-foreground">
                              {uiText(t('kernel.no_active_tasks'))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};
