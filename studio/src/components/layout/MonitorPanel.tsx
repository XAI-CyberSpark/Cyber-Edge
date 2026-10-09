import { uiText, useUiLanguage } from '@/i18n';
import { useState } from 'react';
import { X, Terminal, Activity, Brain, Shield, Cpu } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { KernelMonitor, type KernelState } from '@/components/monitors/KernelMonitor';
import { MemoryMonitor, type MemoryState } from '@/components/monitors/MemoryMonitor';
import { MiddlewareMonitor, type MiddlewareState } from '@/components/monitors/MiddlewareMonitor';
import { SafetyMonitor, type SafetyState } from '@/components/monitors/SafetyMonitor';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: 'system' | 'agent' | 'vehicle' | 'user';
  message: string;
}

interface MonitorPanelProps {
  open: boolean;
  onClose: () => void;
  systemLogs: LogEntry[];
  middlewareState: MiddlewareState;
  memoryState: MemoryState;
  safetyState: SafetyState;
  kernelState: KernelState;
}

type MonitorTab = 'telemetry' | 'hal' | 'memory' | 'safety' | 'kernel';

const tabs: { id: MonitorTab; icon: typeof Terminal; label: string }[] = [
  { id: 'telemetry', icon: Terminal, label: '遥测' },
  { id: 'hal', icon: Activity, label: '硬件层' },
  { id: 'memory', icon: Brain, label: '记忆' },
  { id: 'safety', icon: Shield, label: '安全' },
  { id: 'kernel', icon: Cpu, label: '内核' },
];

export function MonitorPanel({ open, onClose, systemLogs, middlewareState, memoryState, safetyState, kernelState }: MonitorPanelProps) {
  useUiLanguage();
  const [activeTab, setActiveTab] = useState<MonitorTab>('telemetry');

  if (!open) return null;


  return (
    <aside aria-label={uiText("系统监控面板")} className="left-panel absolute left-0 top-0 bottom-0 z-30 w-[min(520px,100%)] bg-card border-r workspace-divider shadow-xl flex flex-col animate-in slide-in-from-left duration-200 motion-reduce:animate-none">
      <div className="left-panel-header flex items-center justify-between p-2 border-b workspace-divider shrink-0">
        <h2 className="type-panel  px-2">{uiText("系统监控")}</h2>
        <button aria-label={uiText("关闭系统监控")} onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1 p-2 border-b workspace-divider shrink-0" aria-label={uiText("监控分类")}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md type-label  transition-colors ${
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{uiText(tab.label)}</span>
                {tab.id === 'telemetry' && systemLogs.length > 0 && (
                  <Badge variant="outline" className="type-tag min-h-5 px-1 ml-0.5">{uiText(systemLogs.length)}</Badge>
                )}
              </button>
            );
          })}
      </div>

      {/* Content */}
      <ScrollArea className="left-panel-content flex-1 min-h-0">
        {activeTab === 'telemetry' && (
          <div className="font-mono type-code space-y-1">
            {systemLogs.length === 0 && <div className="text-muted-foreground italic text-center py-8">{uiText("暂无日志")}</div>}
            {systemLogs.map(log => (
              <div key={log.id} className="flex gap-1.5 leading-tight">
                <span className="text-muted-foreground shrink-0">[{uiText(log.timestamp)}]</span>
                <span className={`shrink-0 w-12 ${
                  log.level === 'info' ? 'text-blue-500' :
                  log.level === 'warn' ? 'text-amber-500' :
                  log.level === 'error' ? 'text-red-500' : 'text-green-500'
                }`}>{uiText(log.level)}</span>
                <span className="text-foreground break-all">{uiText(log.message)}</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'hal' && <MiddlewareMonitor state={middlewareState} />}
        {activeTab === 'memory' && <MemoryMonitor state={memoryState} />}
        {activeTab === 'safety' && <SafetyMonitor state={safetyState} />}
        {activeTab === 'kernel' && <KernelMonitor state={kernelState} />}
      </ScrollArea>
    </aside>
  );
}
