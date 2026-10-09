import { catalogLabel, type QualcommModel } from './qualcommCatalog';
export const CATALOG_MODEL_PENDING = '模型待部署：可编排和保存，接入运行服务后才能执行。Cybertools 部署流程尚未接通。';
export function isCatalogModel(data: Record<string, any> = {}) {
  return data.catalogModel?.source === 'qualcomm' || String(data.model || '').startsWith('qualcomm:');
}
export function catalogModelNode(model: QualcommModel, version: string) {
  return { type: 'llm', label: model.name, data: {
    model: `qualcomm:${model.id}`, category: 'catalog', description: model.headline || catalogLabel(model.use_case),
    deploymentStatus: 'pending', designOnly: true, designIssue: CATALOG_MODEL_PENDING,
    catalogModel: { source: 'qualcomm', id: model.id, name: model.name, version, domain: model.domain, useCase: model.use_case,
      url: `https://aihub.qualcomm.com/models/${model.id}`, runtimes: [...model.runtimes], chipsets: [...model.chipsets], hasQuantized: model.has_quantized },
    taskDescription: '',
  } };
}
