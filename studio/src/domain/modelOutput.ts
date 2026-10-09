import {ContractError} from './contractErrors';
export type OutputFields = Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>;
const types=['string','number','boolean','array','object'];
export function validOutputFields(fields: unknown): fields is OutputFields {
  return !!fields && typeof fields==='object' && !Array.isArray(fields) && Object.keys(fields).length>0 && Object.entries(fields).every(([k,v])=>/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k) && !['constructor','prototype','__proto__'].includes(k) && types.includes(String(v)));
}
export function parseModelObject(content: string): Record<string, unknown> {
  let result: unknown;
  try { result=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')); }
  catch { throw new ContractError('模型未按约定返回有效 JSON，进度未推进，请重试。','model_output','MODEL_JSON_PARSE'); }
  if (!result || typeof result!=='object' || Array.isArray(result)) throw new ContractError('模型必须返回 JSON 对象。','model_output','MODEL_OBJECT_REQUIRED');
  return result as Record<string, unknown>;
}
export function validateModelFields(value: Record<string, unknown>,fields: OutputFields): Record<string, unknown> {
  if(!validOutputFields(fields)) throw new ContractError('请声明有效的模型输出字段。','graph_logic','MODEL_FIELDS_SCHEMA');
  for(const [key,type] of Object.entries(fields)) {
    const v=value[key];
    const actual=Array.isArray(v)?'array':v===null?'null':typeof v;
    if(actual!==type || type==='number' && !Number.isFinite(v)) throw new ContractError(`模型输出字段 ${key} 必须是 ${type}，已停止下游执行。`,'model_output','MODEL_FIELD_TYPE',key);
  }
  // A data result cannot inject execution metadata, actions or a trusted inference flag.
  return Object.fromEntries(Object.keys(fields).map(k=>[k,value[k]]));
}
