import { uiText, useUiLanguage } from '@/i18n';
import { Eye, ShieldCheck, Sparkles, TimerReset, Volume2 } from 'lucide-react';
import type { ChildSafetyScenarioSpec } from '@/data/childSafetyScenario';

interface ScenarioSpecPanelProps {
  spec: ChildSafetyScenarioSpec;
  onGenerateFlow: () => void;
}

export function ScenarioSpecPanel({ spec, onGenerateFlow }: ScenarioSpecPanelProps) {
  useUiLanguage();
  const applied = spec.status === 'applied';

  return (
    <section className="shrink-0 border-b border-border bg-secondary/30 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 type-section  text-foreground">
            <Sparkles className="h-4 w-4 text-amber-400" />
            {uiText("场景规格")}</div>
          <p className="mt-0.5 type-caption text-muted-foreground">{uiText("先定义体验，再生成流程")}</p>
        </div>
        <span className={`rounded-full px-2 py-1 type-tag  ${applied ? 'bg-emerald-500/10 text-emerald-300' : 'bg-sky-500/10 text-sky-300'}`}>
          {uiText(applied ? uiText("已同步画布") : uiText("方案可生成"))}
        </span>
      </div>

      <div className="mt-3 space-y-2 rounded-lg border border-border bg-background/70 p-3 type-body">
        <div>
          <span className="font-medium text-foreground">{uiText(spec.title)}</span>
          <p className="mt-0.5 leading-4 text-muted-foreground">{uiText(spec.objective)}</p>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span>{uiText(spec.sensor)}：{spec.triggerActions.map(text => uiText(text)).join(' / ')}</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span>{uiText("显示“")}{uiText(spec.voicePrompt)}{uiText("”及本次上传的图片")}</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <TimerReset className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
          <span>{uiText("每张图片独立判断；不将静态图片当作实时监测")}</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <span>{spec.safetyConstraints.map(text => uiText(text)).join('; ')}</span>
        </div>
      </div>

      <button
        onClick={onGenerateFlow}
        className={`mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg type-label  transition-colors ${
          applied
            ? 'border border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
            : 'bg-sky-500 text-white hover:bg-sky-600'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {uiText(applied ? uiText("重新同步语义流程") : uiText("确认并生成语义流程"))}
      </button>
    </section>
  );
}
