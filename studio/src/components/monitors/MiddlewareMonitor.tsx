import { uiText, useUiLanguage } from '@/i18n';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Camera, 
  Mic, 
  Activity, 
  Wifi, 
  ShieldCheck, 
  Cpu,
  Layers,
  Video
} from "lucide-react";

export interface MiddlewareState {
    sensors: {
        camera: { status: 'active' | 'idle' | 'error', fps: number, latency: number };
        lidar: { status: 'active' | 'idle' | 'error', points: number };
        mic: { status: 'active' | 'idle' | 'error', vad: boolean, db: number };
    };
    services: {
        asr: { status: 'ready' | 'processing', backend: string };
        tts: { status: 'ready' | 'playing', backend: string };
        v2x: { status: 'connected' | 'disconnected', peers: number };
    };
    bus: {
        can: { status: 'ok' | 'warning', load: number, errors: number };
        ethernet: { status: 'ok', bandwidth: number };
    };
}

interface MiddlewareMonitorProps {
    state: MiddlewareState;
}

import { useApp } from "@/context/AppContext";

export const MiddlewareMonitor = ({ state }: MiddlewareMonitorProps) => {
  useUiLanguage();
    const { t } = useApp();
    return (
        <div className="h-full flex flex-col gap-4 bg-background p-4">
            
            {/* Sensor Layer */}
            <div className="space-y-2">
                <h3 className="type-section  text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3 h-3" /> {uiText(t('hal.layer'))}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    <Card className="bg-background border-border">
                        <CardContent className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${state.sensors.camera.status === 'active' ? 'bg-blue-500/20 text-blue-400' : 'bg-background text-foreground'}`}>
                                    <Camera className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="type-item-title  text-foreground">{uiText(t('hal.camera'))}</div>
                                    <div className="type-code text-foreground font-mono">{uiText(state.sensors.camera.fps)} FPS • {uiText(state.sensors.camera.latency)}ms</div>
                                </div>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${state.sensors.camera.status === 'active' ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-foreground/50'}`} />
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-background border-border">
                        <CardContent className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${state.sensors.lidar.status === 'active' ? 'bg-purple-500/20 text-purple-400' : 'bg-background text-foreground'}`}>
                                    <Activity className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="type-item-title  text-foreground">{uiText(t('hal.lidar'))}</div>
                                    <div className="type-code text-foreground font-mono">{uiText(state.sensors.lidar.points)} pts/s</div>
                                </div>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${state.sensors.lidar.status === 'active' ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-foreground/50'}`} />
                        </CardContent>
                    </Card>

                    <Card className="bg-background border-border">
                        <CardContent className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${state.sensors.mic.status === 'active' ? 'bg-amber-500/20 text-amber-400' : 'bg-background text-foreground'}`}>
                                    <Mic className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="type-item-title  text-foreground">{uiText(t('hal.mic'))}</div>
                                    <div className="type-code text-foreground font-mono">{uiText(state.sensors.mic.db)}dB • VAD: {uiText(state.sensors.mic.vad ? 'ON' : 'OFF')}</div>
                                </div>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${state.sensors.mic.vad ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Audio/Visual Services */}
            <div className="space-y-2">
                <h3 className="type-section  text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Video className="w-3 h-3" /> {uiText(t('hal.av_services'))}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-background border border-border rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Badge variant="outline" className="bg-background text-foreground border-border">{uiText(t('hal.asr'))}</Badge>
                            <span className="type-caption text-foreground">{uiText(state.services.asr.backend)}</span>
                        </div>
                        <Badge className={`${state.services.asr.status === 'processing' ? 'bg-blue-600 animate-pulse' : 'bg-background text-foreground'}`}>
                            {uiText(state.services.asr.status)}
                        </Badge>
                    </div>
                    <div className="bg-background border border-border rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Badge variant="outline" className="bg-background text-foreground border-border">{uiText(t('hal.tts'))}</Badge>
                            <span className="type-caption text-foreground">{uiText(state.services.tts.backend)}</span>
                        </div>
                         <Badge className={`${state.services.tts.status === 'playing' ? 'bg-green-600 animate-pulse' : 'bg-background text-foreground'}`}>
                            {uiText(state.services.tts.status)}
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Vehicle Bus & Connectivity */}
            <div className="flex-1 flex gap-4 min-h-0">
                <div className="flex-1 border border-border rounded-lg bg-background overflow-hidden flex flex-col">
                    <div className="h-8 border-b border-border bg-background px-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Cpu className="w-3.5 h-3.5 text-red-500" />
                            <span className="type-section  text-foreground">{uiText(t('hal.can_bus'))}</span>
                        </div>
                        <span className="type-code text-foreground font-mono">Load: {uiText(state.bus.can.load)}%</span>
                    </div>
                    <div className="flex-1 p-3 flex items-center justify-center">
                         {/* Mock CAN Visualizer */}
                         <div className="w-full h-full flex items-end gap-1">
                             {[...Array(20)].map((_, i) => (
                                 <div 
                                    key={i} 
                                    className="flex-1 bg-red-500/20 rounded-t-sm transition-all duration-100"
                                    style={{ height: `${Math.random() * state.bus.can.load}%` }}
                                 />
                             ))}
                         </div>
                    </div>
                </div>

                <div className="flex-1 border border-border rounded-lg bg-background overflow-hidden flex flex-col">
                    <div className="h-8 border-b border-border bg-background px-3 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <Wifi className="w-3.5 h-3.5 text-cyan-500" />
                            <span className="type-section  text-foreground">{uiText(t('hal.v2x'))}</span>
                        </div>
                        <Badge variant="outline" className="type-tag min-h-5 border-cyan-500/30 text-cyan-400">5G-NR</Badge>
                    </div>
                     <div className="flex-1 p-3 flex flex-col items-center justify-center gap-2">
                        <div className="type-metric  text-foreground">{uiText(state.services.v2x.peers)}</div>
                        <div className="type-caption text-foreground uppercase tracking-wider">{uiText(t('hal.peers'))}</div>
                        <div className="flex gap-1 mt-2">
                            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                            <div className="w-2 h-2 rounded-full bg-cyan-500" />
                            <div className="w-2 h-2 rounded-full bg-cyan-500" />
                        </div>
                    </div>
                </div>
            </div>

             {/* Safety Layer */}
             <div className="h-10 bg-green-900/20 border border-green-500/20 rounded-lg flex items-center px-4 justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    <span className="type-section  text-green-400">{uiText(t('hal.safety'))}</span>
                </div>
                <div className="flex gap-4 type-code text-green-300/70 font-mono">
                    <span>{uiText(t('hal.input_filter'))}</span>
                    <span>{uiText(t('hal.command_policy'))}</span>
                    <span>{uiText(t('hal.latency_watchdog'))}</span>
                </div>
             </div>
        </div>
    );
};
