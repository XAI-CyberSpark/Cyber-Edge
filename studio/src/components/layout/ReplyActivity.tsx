import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, Wrench } from 'lucide-react';
import { uiText, useUiLanguage } from '@/i18n';

export interface ReplyExecution {
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  operations: Array<{ timestamp: number; content: string }>;
}

export function formatReplyDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60
    ? uiText('{0}秒', [seconds])
    : uiText('{0}分{1}秒', [Math.floor(seconds / 60), seconds % 60]);
}

export function ReplyActivity({ execution }: { execution: ReplyExecution }) {
  useUiLanguage();
  const running = execution.status === 'running';
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!running && detailsRef.current) detailsRef.current.open = false;
  }, [running]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running, execution.startedAt]);
  const elapsed = running ? Math.max(0, now - execution.startedAt) : execution.durationMs;
  const duration = typeof elapsed === 'number' && Number.isFinite(elapsed)
    ? uiText('用时 {0}', [formatReplyDuration(elapsed)]) : uiText('用时未记录');
  const status = execution.status === 'failed' ? uiText('失败')
    : execution.status === 'interrupted' ? uiText('已中断') : running ? uiText('处理中') : '';
  return (
    <div className="co-chat-activity">
      <details ref={detailsRef} className="co-chat-activity-details">
        <summary className="type-caption text-muted-foreground">
          <span>{duration}{status ? ` · ${status}` : ''}</span>
          <ChevronRight className="co-chat-activity-chevron" size={14} aria-hidden="true" />
        </summary>
        <ol className="co-chat-operations" aria-label={uiText('操作记录')}>
          {execution.operations.map((operation, index) => (
            <li key={index} className="type-caption text-muted-foreground">
              <Wrench size={14} aria-hidden="true" />
              <span>{uiText(operation.content)}</span>
            </li>
          ))}
        </ol>
        {!execution.operations.length && <p className="type-caption text-muted-foreground">{uiText('没有可用的操作记录')}</p>}
      </details>
      {running && <div className="co-chat-activity-current type-caption text-muted-foreground" role="status">
        <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span>{uiText(execution.operations.at(-1)?.content || '正在处理请求…')}</span>
      </div>}
    </div>
  );
}
