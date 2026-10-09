export type RuntimeEventType =
  | 'run_started'
  | 'node_started'
  | 'node_diagnostic'
  | 'node_completed'
  | 'node_failed'
  | 'simulator_command'
  | 'run_completed';

export interface RuntimeEvent {
  id: string;
  runId: string;
  sequence: number;
  timestamp: number;
  type: RuntimeEventType;
  nodeId?: string;
  payload: Record<string, unknown>;
}

export interface RuntimeRunResult {
  runId: string;
  status: 'completed' | 'failed' | 'waiting' | 'paused';
  input: unknown;
  startedAt: number;
  finishedAt: number;
  events: RuntimeEvent[];
  finalOutput?: unknown;
}
