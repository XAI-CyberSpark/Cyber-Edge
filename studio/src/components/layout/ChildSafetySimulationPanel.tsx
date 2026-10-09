import { uiText, useUiLanguage } from '@/i18n';
import { useState } from 'react';
import { Eye, Play, ShieldCheck, TimerReset } from 'lucide-react';

interface ChildSafetySimulationPanelProps {
  onInject: (event: string) => Promise<void>;
}

const events = [
  { label: '模拟儿童探窗', event: '儿童探窗', note: '高风险 · 实时后排画面' },
  { label: '模拟儿童站起', event: '儿童站起', note: '高风险 · 实时后排画面' },
  { label: '模拟风险持续', event: '儿童探窗 风险持续', note: '到时静默监测，不重复播报' },
];

export function ChildSafetySimulationPanel({ onInject }: ChildSafetySimulationPanelProps) {
  useUiLanguage();
  const [runningEvent, setRunningEvent] = useState<string | null>(null);

  const run = async (event: string) => {
    setRunningEvent(event);
    try {
      await onInject(event);
    } finally {
      setRunningEvent(null);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-2 type-panel  text-foreground"><Play className="h-4 w-4 text-sky-400" /> {uiText("儿童关怀仿真")}</div>
        <p className="mt-1 type-caption  text-muted-foreground">{uiText("注入事件，观察中控 HMI 是否遵守场景规格。")}</p>
      </div>
      <div className="space-y-2 p-4">
        {events.map((item) => (
          <button
            key={item.event}
            onClick={() => void run(item.event)}
            disabled={runningEvent !== null}
            className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-sky-400/45 hover:bg-sky-500/5 disabled:opacity-50"
          >
            <span className="flex items-center gap-2 type-label  text-foreground"><Eye className="h-3.5 w-3.5 text-sky-300" /> {uiText(item.label)}</span>
            <span className="mt-1 block type-caption  text-muted-foreground">{uiText(runningEvent === item.event ? uiText("正在运行场景…") : item.note)}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto space-y-3 border-t border-border p-4 type-body  text-muted-foreground">
        <div className="flex gap-2"><TimerReset className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" /><span>{uiText("观察画面是否在规格配置时长后自动收起。")}</span></div>
        <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" /><span>{uiText("验收：仅一次播报、不要求驾驶员操作、未产生车控动作。")}</span></div>
      </div>
    </aside>
  );
}
