export type QualcommModel = {
  id: string; name: string; domain: string; use_case: string; runtimes: string[];
  chipsets: string[]; tags: string[]; has_quantized: boolean; url: string;
  headline?: string; description?: string; image_url?: string;
  source: 'qualcomm'; connection_status: 'not_connected';
};
export type QualcommCatalog = {
  version: string; synced_at: string; items: QualcommModel[];
  cache_status: 'live' | 'cached' | 'stale'; warning: string;
};
export const catalogLabels: Record<string, string> = {
  'Computer Vision': '计算机视觉', 'Audio': '语音与音频', 'Multimodal': '多模态', 'Generative AI': '生成式 AI',
  'Audio Classification': '音频分类', 'Audio Generation': '音频生成', 'Depth Estimation': '深度估计',
  'Driver Assistance': '驾驶辅助', 'Gaze Estimation': '视线估计', 'Image Classification': '图像分类',
  'Image Editing': '图像编辑', 'Image Generation': '图像生成', 'Image To Text': '图像理解',
  'Object Detection': '目标检测', 'Pose Estimation': '姿态估计', 'Robotics': '机器人',
  'Semantic Segmentation': '语义分割', 'Speech Recognition': '语音识别', 'Super Resolution': '超分辨率',
  'Text Generation': '文本生成', 'Video Classification': '视频分类', 'Video Generation': '视频生成',
  'Video Object Tracking': '视频目标跟踪',
  qnn_context_binary: 'QNN Context Binary', qnn_dlc: 'QNN DLC', onnx: 'ONNX Runtime',
  precompiled_qnn_onnx: 'ONNX + QNN', tflite: 'TFLite', genie: 'Genie',
  geniex_llamacpp: 'GenieX · llama.cpp', geniex_qairt: 'GenieX · QAIRT', voice_ai: 'Qualcomm Voice AI',
};
export const catalogLabel = (value: string) => catalogLabels[value] || value || '未提供';
export const chipsetLabel = (value: string) => value.replace(/^qualcomm-/, '').replace(/-/g, ' ').replace(/\b(qcs\d+|sa\d+p|iq\d+)\b/gi, s => s.toUpperCase()).replace(/\bsnapdragon\b/g, 'Snapdragon');
export type CatalogFilters = { query: string; domain: string; useCase: string; chipset: string; runtime: string; quantized: string };
export const emptyCatalogFilters: CatalogFilters = { query: '', domain: '', useCase: '', chipset: '', runtime: '', quantized: '' };
export function matchesQualcommModel(model: QualcommModel, f: CatalogFilters) {
  const text = [model.id, model.name, model.headline, model.description, model.domain, catalogLabel(model.domain), model.use_case, catalogLabel(model.use_case), ...model.tags, ...model.chipsets, ...model.chipsets.map(chipsetLabel), ...model.runtimes.map(catalogLabel)].join(' ').toLowerCase();
  return f.query.toLowerCase().trim().split(/\s+/).every(term => text.includes(term)) &&
    (!f.domain || model.domain === f.domain) && (!f.useCase || model.use_case === f.useCase) &&
    (!f.chipset || model.chipsets.includes(f.chipset)) && (!f.runtime || model.runtimes.includes(f.runtime)) &&
    (!f.quantized || (f.quantized === 'yes' ? model.has_quantized : !model.has_quantized));
}
export function parseQualcommCatalog(value: unknown): QualcommCatalog {
  const data = value as QualcommCatalog;
  if (!data || typeof data.version !== 'string' || typeof data.synced_at !== 'string' || !Array.isArray(data.items) ||
      !['live', 'cached', 'stale'].includes(data.cache_status) || data.items.some(m =>
        !m || typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(m.id) || typeof m.name !== 'string' ||
        [m.headline, m.description, m.image_url].some(v => v !== undefined && typeof v !== 'string') ||
        (m.image_url && m.image_url !== `https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/${m.id}/web-assets/model_demo.png`) ||
        typeof m.domain !== 'string' || typeof m.use_case !== 'string' || typeof m.has_quantized !== 'boolean' ||
        ![m.chipsets, m.runtimes, m.tags].every(a => Array.isArray(a) && a.every(v => typeof v === 'string')))) {
    throw new Error('高通目录格式异常，请稍后重试。');
  }
  return data;
}
