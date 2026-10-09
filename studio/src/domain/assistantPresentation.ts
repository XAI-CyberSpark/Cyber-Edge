import { planLabel, type AssistantPlan } from './cockpitAssistant';

export type ContentSource = { kind: 'tool' | 'knowledge'; id: string };
export type SourcedImage = { url: string; alt: string };
export type ResultItem = { id: string; title: string; description?: string; detail?: string; image?: SourcedImage };
export type AssistantPresentation =
  | { kind: 'confirmation'; text: string; plan: Extract<AssistantPlan, { kind: 'climate' | 'windows' }> }
  | { kind: 'text'; text: string; clarification: boolean }
  | { kind: 'image'; text: string; source: ContentSource; image: SourcedImage }
  | { kind: 'list'; text: string; source: ContentSource; items: ResultItem[] };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;

function image(value: unknown): SourcedImage | undefined {
  if (!object(value) || !text(value.url, 4096) || !text(value.alt, 300)) return;
  // Resource URLs come from a separately supplied tool/knowledge envelope, never
  // from prose, Markdown, keyword matching, or a model-invented presentation kind.
  const url = value.url.trim();
  if (/[\\\s\u0000-\u001f\u007f]/.test(url)) return;
  if (url.startsWith('/') && !url.startsWith('//')) return { url, alt: value.alt.trim() };
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return;
    return { url, alt: value.alt.trim() };
  } catch { return; }
}

/**
 * Plan is the existing validated/grounded assistant result. `toolContent` must
 * come from the same request's server-side tool or knowledge adapter, outside
 * model message.content. A source ID is traceability, not proof of authenticity.
 * There is currently no production producer for this envelope.
 */
export function selectAssistantPresentation(plan: AssistantPlan, toolContent?: unknown): AssistantPresentation {
  if (plan.kind === 'climate' || plan.kind === 'windows') return { kind: 'confirmation', text: planLabel(plan), plan };
  const fallback: AssistantPresentation = { kind: 'text', text: plan.text, clarification: plan.kind === 'clarify' };
  if (plan.kind === 'clarify' || !object(toolContent) || toolContent.version !== 1 || !object(toolContent.source)) return fallback;
  const rawSource = toolContent.source;
  if ((rawSource.kind !== 'tool' && rawSource.kind !== 'knowledge') || !text(rawSource.id, 200)) return fallback;
  const source: ContentSource = { kind: rawSource.kind, id: rawSource.id.trim() };
  if (toolContent.kind === 'image') {
    const content = image(toolContent.image);
    return content ? { kind: 'image', text: plan.text, source, image: content } : fallback;
  }
  if (toolContent.kind !== 'list' || !Array.isArray(toolContent.items) || !toolContent.items.length || toolContent.items.length > 100) return fallback;
  const items: ResultItem[] = [];
  const seen = new Set<string>();
  for (const raw of toolContent.items) {
    if (!object(raw) || !text(raw.id, 200) || !text(raw.title, 300)) return fallback;
    const id = raw.id.trim();
    if (seen.has(id)) return fallback;
    seen.add(id);
    if (raw.description !== undefined && !text(raw.description, 2000)) return fallback;
    if (raw.detail !== undefined && !text(raw.detail, 6000)) return fallback;
    // Actions/links are intentionally not part of v1. Until an adapter exists,
    // a result cannot silently become navigation, execution or a fake click.
    if (raw.action !== undefined || raw.href !== undefined) return fallback;
    const thumbnail = image(raw.image);
    items.push({ id, title: raw.title.trim(),
      ...(typeof raw.description === 'string' ? { description: raw.description.trim() } : {}),
      ...(typeof raw.detail === 'string' ? { detail: raw.detail.trim() } : {}),
      ...(thumbnail ? { image: thumbnail } : {}),
    });
  }
  return { kind: 'list', text: plan.text, source, items };
}

/** Call on <img onError>; keep the actual explanation and never invent media. */
export function withoutFailedImage(panel: AssistantPresentation, itemId?: string): AssistantPresentation {
  if (panel.kind === 'image') return { kind: 'text', text: panel.text, clarification: false };
  if (panel.kind !== 'list' || !itemId) return panel;
  return { ...panel, items: panel.items.map(item => {
    if (item.id !== itemId) return item;
    const { image: failedImage, ...rest } = item;
    void failedImage;
    return rest;
  }) };
}

/** “More” only reveals already returned records. It never implies a remote fetch. */
export function listPage(panel: Extract<AssistantPresentation, { kind: 'list' }>, count = 3) {
  const visible = Number.isFinite(count) ? Math.max(1, Math.min(100, Math.floor(count))) : 3;
  return { items: panel.items.slice(0, visible), hasMore: visible < panel.items.length };
}
