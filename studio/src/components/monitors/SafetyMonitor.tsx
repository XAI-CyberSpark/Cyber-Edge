import { uiText, useUiLanguage  } from '@/i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Shield, 
  ShieldAlert, 
  Lock, 
  Eye, 
  FileWarning, 
  Activity
} from "lucide-react";

export interface SafetyState {
    status: 'secure' | 'warning' | 'critical';
    metrics: {
        totalRequests: number;
        blocked: number;
        flagged: number;
    };
    policies: {
        id: string;
        name: string;
        enabled: boolean;
        violations: number;
    }[];
    events: {
        id: string;
        timestamp: string;
        type: 'input' | 'output' | 'system';
        severity: 'low' | 'medium' | 'high';
        policy: string;
        content: string;
        action: 'block' | 'flag' | 'monitor';
    }[];
}

interface SafetyMonitorProps {
    state: SafetyState;
}

import { useApp } from "@/context/AppContext";

export const SafetyMonitor = ({ state }: SafetyMonitorProps) => {
  useUiLanguage();
    const { t } = useApp();
    return (
        <div className="h-full flex flex-col gap-4 bg-background p-4">
            {/* Top Status */}
            <div className="grid grid-cols-2 gap-3 h-28 shrink-0">
                <Card className={`bg-background border-border ${state.status === 'warning' ? 'border-amber-500/50' : ''}`}>
                    <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="type-item-title  text-foreground uppercase flex items-center gap-2">
                            <Shield className={`w-3.5 h-3.5 ${state.status === 'secure' ? 'text-green-500' : 'text-amber-500'}`} /> 
                            {uiText(t('safety.status'))}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`type-metric  ${
                                state.status === 'secure' ? 'text-green-400' : 
                                state.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                            }`}>
                                {uiText(state.status === 'secure' ? t('safety.secure') : t('safety.threat'))}
                            </span>
                        </div>
                        <div className="flex gap-2 type-caption text-foreground">
                             <div className="flex flex-col">
                                 <span className="font-bold text-foreground">{uiText(state.metrics.blocked)}</span>
                                 <span>{uiText(t('safety.blocked'))}</span>
                             </div>
                             <div className="w-[1px] h-6 bg-background" />
                             <div className="flex flex-col">
                                 <span className="font-bold text-foreground">{uiText(state.metrics.flagged)}</span>
                                 <span>{uiText(t('safety.flagged'))}</span>
                             </div>
                             <div className="w-[1px] h-6 bg-background" />
                             <div className="flex flex-col">
                                 <span className="font-bold text-foreground">{uiText((state.metrics.blocked / (state.metrics.totalRequests || 1) * 100).toFixed(1))}%</span>
                                 <span>{uiText(t('safety.rate'))}</span>
                             </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-background border-border">
                    <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="type-item-title  text-foreground uppercase flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 text-blue-500" /> {uiText(t('safety.active_policies'))}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 pt-0">
                         <ScrollArea className="h-16">
                            <div className="space-y-1 mt-2">
                                {state.policies.map(p => (
                                    <div key={p.id} className="flex items-center justify-between type-body">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${p.enabled ? 'bg-green-500' : 'bg-foreground/50'}`} />
                                            <span className={p.enabled ? 'text-foreground' : 'text-foreground'}>{uiText(p.name)}</span>
                                        </div>
                                        <Badge variant="outline" className="min-h-5 type-tag border-border text-foreground">
                                            {uiText(p.violations)}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                         </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Real-time Threat Monitor */}
            <div className="flex-1 flex flex-col min-h-0 border border-border rounded-lg bg-background overflow-hidden">
                <div className="h-8 border-b border-border bg-background px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5 text-cyan-500" />
                        <span className="type-section  text-foreground">{uiText(t('safety.log'))}</span>
                    </div>
                    <Badge variant="outline" className="type-tag min-h-5 border-cyan-500/30 text-cyan-400">{uiText(t('safety.live'))}</Badge>
                </div>
                <ScrollArea className="flex-1 p-0">
                    <div className="flex flex-col">
                        {state.events.length === 0 && (
                            <div className="p-4 text-center type-body text-foreground">{uiText(t('safety.no_events'))}</div>
                        )}
                        {state.events.map((event, i) => (
                            <div key={i} className={`
                                p-3 border-b border-border transition-colors
                                ${event.action === 'block' ? 'bg-red-950/10 hover:bg-red-950/20' : 'hover:bg-background'}
                            `}>
                                <div className="flex justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        {event.action === 'block' ? (
                                            <ShieldAlert className="w-3 h-3 text-red-500" />
                                        ) : event.action === 'flag' ? (
                                            <FileWarning className="w-3 h-3 text-amber-500" />
                                        ) : (
                                            <Activity className="w-3 h-3 text-foreground" />
                                        )}
                                        <span className={`type-caption font-bold uppercase ${
                                            event.action === 'block' ? 'text-red-400' : 
                                            event.action === 'flag' ? 'text-amber-400' : 'text-foreground'
                                        }`}>{uiText(event.action)}</span>
                                        <span className="type-code text-foreground font-mono">[{uiText(event.timestamp)}]</span>
                                    </div>
                                    <Badge variant="outline" className="type-tag min-h-5 border-border text-foreground">{uiText(event.policy)}</Badge>
                                </div>
                                <div className="type-code text-foreground font-mono bg-background p-1.5 rounded border border-border">
                                    {event.content}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Privacy / PII Masking */}
            <div className="h-16 shrink-0 border border-border rounded-lg bg-background p-3 flex items-center justify-between">
                <div>
                     <div className="type-section  text-foreground flex items-center gap-2">
                         <Lock className="w-3 h-3 text-purple-500" /> {uiText(t('safety.privacy'))}
                     </div>
                     <div className="type-body text-foreground mt-1">{uiText(t('safety.masking'))}</div>
                </div>
                <div className="flex gap-1">
                     <div className="w-8 h-1 bg-purple-500/20 rounded-full overflow-hidden">
                         <div className="h-full bg-purple-500 animate-[shimmer_2s_infinite]" style={{ width: '60%' }} />
                     </div>
                </div>
            </div>
        </div>
    );
};
