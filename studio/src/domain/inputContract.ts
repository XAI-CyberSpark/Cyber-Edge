import {validOutputFields, type OutputFields} from './modelOutput';
import {ContractError} from './contractErrors';
/** A text property denotes a wrapper; business fields belong in its parsed object. */
export function parseInputObject(input: unknown, fields: OutputFields, nodeId: string): Record<string, unknown> {
  const fail=(code:string,reason:string,field?:string):never=>{throw new ContractError(`入口节点 ${nodeId} 的 JSON 输入不符合字段约定：${reason}`,'input_contract',code,field);};
  if(!validOutputFields(fields)) fail('INPUT_FIELDS_SCHEMA','请声明有效的 outputFields。');
  let value:unknown=input;
  if(value && typeof value==='object' && !Array.isArray(value) && Object.hasOwn(value,'text')) value=(value as Record<string,unknown>).text;
  if(typeof value==='string') {
    try { value=JSON.parse(value); } catch { fail('INPUT_JSON_PARSE','无法解析 JSON 字符串。'); }
  }
  if(!value || typeof value!=='object' || Array.isArray(value)) fail('INPUT_OBJECT_REQUIRED','需要 JSON 对象、JSON 字符串或 text 字符串包装。');
  const object=value as Record<string,unknown>;
  for(const [key,type] of Object.entries(fields)) {
    if(!Object.hasOwn(object,key)) fail('INPUT_FIELD_MISSING',`缺少 ${key}（${type}）`,key);
    const v=object[key],actual=Array.isArray(v)?'array':v===null?'null':typeof v;
    if(actual!==type || type==='number'&&!Number.isFinite(v)) fail('INPUT_FIELD_TYPE',`字段 ${key} 必须是 ${type}，实际 ${actual}`,key);
  }
  return Object.fromEntries(Object.keys(fields).map(key=>[key,object[key]]));
}
