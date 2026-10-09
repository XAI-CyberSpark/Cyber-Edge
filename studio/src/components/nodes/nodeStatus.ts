import './node-card.css';
type NodeStatus = 'idle' | 'running' | 'success' | 'error' | undefined

const statusClasses: Record<Exclude<NodeStatus, undefined>, string> = {
  idle: '',
  running: 'border-amber-400 ring-2 ring-amber-400/40 shadow-[0_0_24px_rgba(251,191,36,0.2)]',
  success: 'border-emerald-400 ring-1 ring-emerald-400/35 shadow-[0_0_18px_rgba(52,211,153,0.18)]',
  error: 'border-rose-400 ring-1 ring-rose-400/35 shadow-[0_0_18px_rgba(251,113,133,0.18)]',
}

export const getNodeFrameClass = (status: NodeStatus, selectedClass: string) => {
  if (status && status !== 'idle') {
    return `ce-node-card ce-node--${status} ${statusClasses[status]}`
  }
  return `ce-node-card ${selectedClass}`
}
