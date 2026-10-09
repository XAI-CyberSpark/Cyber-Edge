import policy from '../data/inferencePolicy.json';
export function inferenceTimeoutMs(model: string, provider?: unknown): number {
  const models = policy.models as Record<string, { timeoutMs: number }>;
  return (!provider && models[model]?.timeoutMs) || policy.defaultTimeoutMs;
}
export function inferenceDeadline(model: string, provider?: unknown, signal?: AbortSignal) {
  const timeoutMs = inferenceTimeoutMs(model, provider);
  const timeout = AbortSignal.timeout(timeoutMs + policy.transportGraceMs);
  return { timeoutMs, signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
}
