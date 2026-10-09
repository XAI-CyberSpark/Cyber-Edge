import { uiText, useUiLanguage } from '@/i18n';
type NodeStatus = 'idle' | 'running' | 'success' | 'error' | undefined

const labelClasses: Record<Exclude<NodeStatus, undefined>, string> = {
  idle: 'bg-background text-foreground border-border',
  running: 'bg-amber-500/15 text-amber-300 border-amber-400/40',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',
  error: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
}

const labelText: Record<Exclude<NodeStatus, undefined>, string> = {
  idle: '未运行',
  running: '运行中',
  success: '已完成',
  error: '失败',
}

export const NodeStatusBadge = ({ status, activationIndex }: { status?: NodeStatus; activationIndex?: number }) => {
  useUiLanguage();
  if ((!status || status === 'idle') && activationIndex === undefined) {
    return null
  }

  const tone = labelClasses[status && status !== 'idle' ? status : 'idle']
  const label = labelText[status && status !== 'idle' ? status : 'idle']

  return (
    <div className="ce-node-status relative z-10 flex items-center justify-end gap-1">
      {activationIndex !== undefined && (
        <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 type-tag  tracking-wide text-sky-200">
          #{uiText(activationIndex)}
        </span>
      )}
      <span className={`rounded-full border px-2 py-0.5 type-tag  tracking-wide ${tone}`}>
        {uiText(label)}
      </span>
    </div>
  )
}

export const NodeActivityOverlay = ({ status }: { status?: NodeStatus }) => {
  useUiLanguage();
  if (status !== 'running') {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-400/5 animate-pulse" />
  )
}
