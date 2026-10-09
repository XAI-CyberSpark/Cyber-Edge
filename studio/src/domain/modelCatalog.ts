import { OPENSPARX_MODEL } from './opensparx';

export interface CatalogModel {
  id: string;
  name: string;
  category: string;
}

export function normalizeModelCatalog(value: unknown): CatalogModel[] {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { models?: unknown }).models : undefined;
  if (!Array.isArray(rows)) throw new Error('模型列表格式无效，请检查后端服务。');
  const models = rows.map((row): CatalogModel => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim()) throw new Error('模型列表包含无效条目，请检查后端服务。');
    const id = row.id;
    let category = String(row.category || row.type || '').toLowerCase();
    if (id === OPENSPARX_MODEL) category = 'vlm';
    else if (!category) category = /llava|moondream|bunny|gemini|yolo|qwen.*vl/i.test(id) ? 'vlm' : /whisper|audio/i.test(id) ? 'audio' : /tts|cosyvoice/i.test(id) ? 'tts' : 'llm';
    if (category === 'asr') category = 'audio';
    if (category === 'embedding') category = 'llm';
    return { id, name: typeof row.name === 'string' && row.name.trim() ? row.name : id, category };
  });
  return models.sort((a, b) => Number(b.id === OPENSPARX_MODEL) - Number(a.id === OPENSPARX_MODEL));
}

export function supportsModelCategory(model: CatalogModel, category: 'llm' | 'vlm') {
  return model.category === category || model.category === 'omni' || (category === 'llm' && model.id === OPENSPARX_MODEL);
}
