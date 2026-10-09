import { uiText, useUiLanguage  } from '@/i18n';
import { useEffect, useId, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { capabilityPurpose, inputParameters, parameterChoiceLabel, resultDescription, type Capability, type Parameter } from '@/domain/capabilityPresentation';
function original(value: string) { if (!value) return uiText('资料未提供'); try { return JSON.stringify(JSON.parse(value),null,2); } catch { return value; } }
function ParameterField({ field }: { field: Parameter }) {
  useUiLanguage();
  const id=useId(); const [value,setValue]=useState(''); const spec=field.schema;
  const help = field.choicesFromText ? field.key==='location' ? '选择需要调整温度的座位区域。' : `资料支持 ${field.choices?.[0]}—${field.choices?.at(-1)} 的整数。` : field.description;
  const scalar = ['string','number','integer','boolean'].includes(spec.type || '');
  const constraints = [spec.minimum != null ? `最小 ${spec.minimum}`:'', spec.maximum != null ? `最大 ${spec.maximum}`:'', spec.minLength != null ? `至少 ${spec.minLength} 个字符`:'', spec.maxLength != null ? `最多 ${spec.maxLength} 个字符`:''].filter(Boolean);
  const error = value && ((spec.type==='integer' && !Number.isInteger(Number(value))) || (spec.minimum != null && Number(value)<spec.minimum) || (spec.maximum != null && Number(value)>spec.maximum) || (spec.minLength != null && value.length<spec.minLength) || (spec.maxLength != null && value.length>spec.maxLength));
  return <div className="cl-parameter"><label htmlFor={id}>{uiText(field.label)}<small>{uiText(field.required ? uiText("必填"):uiText("选填"))}</small></label>
    {field.conflict ? <p className="cl-parameter-conflict">{uiText("资料中的必填要求与说明冲突，请先核对。暂不试填此项。")}</p> : field.choices || spec.type==='boolean' ? <select id={id} aria-describedby={`${id}-help`} value={value} onChange={e=>setValue(e.target.value)}><option value="">{uiText("请选择")}{uiText(field.label)}</option>{(field.choices || ['true','false']).map(choice=><option key={choice} value={choice}>{uiText(spec.type==='boolean' ? choice==='true'?uiText("是"):uiText("否"):parameterChoiceLabel(choice))}</option>)}</select> : scalar ? <input id={id} aria-describedby={`${id}-help`} aria-invalid={!!error} type={spec.type==='number'||spec.type==='integer'?'number':'text'} value={value} min={spec.minimum} max={spec.maximum} step={spec.type==='integer'?1:'any'} onChange={e=>setValue(e.target.value)} placeholder={uiText("填写{0}", [uiText(field.label)])} /> : <p>{uiText("复杂结构，请在技术详情中核对格式。")}</p>}
    <div id={`${id}-help`} className="cl-parameter-help">{help && <p>{uiText(help)}</p>}{constraints.length>0 && <p>{constraints.map(text => uiText(text)).join(' · ')}</p>}{field.choicesFromText && <p>{uiText("选项按资料说明整理。")}</p>}{field.key==='temp' && !/摄氏|华氏|℃|℉/.test(field.description) && <p>{uiText("资料未注明温度单位，需确认。")}</p>}{spec.default !== undefined && <p>{uiText("资料默认值：")}{JSON.stringify(spec.default)}</p>}{error && <p role="status">{uiText("填写内容不符合以上格式或范围。")}</p>}</div>
  </div>;
}
function CapabilityBinding({ item, onUpdate }: { item: Capability; onUpdate?: (item: Capability) => void }) {
  useUiLanguage();
  const [serverId, setServerId] = useState(item.binding?.server_id || '');
  const [toolName, setToolName] = useState(item.binding?.tool_name || '');
  // Keep inputs in sync when the same item's binding is refreshed from outside (list reload, bind/unbind).
  useEffect(() => { setServerId(item.binding?.server_id || ''); setToolName(item.binding?.tool_name || ''); }, [item.binding?.server_id, item.binding?.tool_name]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const request = async (path: string, init: RequestInit) => {
    setBusy(init.method === 'POST' ? '正在检查连接…' : init.method === 'DELETE' ? '正在解除绑定…' : '正在绑定 MCP 工具…');
    setError('');
    try {
      const response = await fetch(apiUrl(path), init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `请求未完成（${response.status}），请重试。`);
      onUpdate?.(body as Capability);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : '操作失败，请重试。');
    } finally {
      setBusy('');
    }
  };
  const base = `/v1/capabilities/${encodeURIComponent(item.import_id || '')}/items/${encodeURIComponent(item.id)}/binding`;
  const disabled = !serverId.trim() || !toolName.trim() || !!busy;
  return <section className="cl-binding"><h3>{uiText("MCP 工具绑定")}</h3>
    <p className="cl-subtle">{uiText("绑定只选择服务 ID 和工具名，不允许在前端填写 URL、密钥或进程；真实执行仍需单独验收。")}</p>
    <div className="cl-binding-grid"><label>{uiText("MCP 服务 ID")}<input aria-label={uiText("MCP 服务 ID")} value={serverId} disabled={!!busy} onChange={event=>setServerId(event.target.value)} placeholder="mock_vehicle" /></label><label>{uiText("MCP 工具名")}<input aria-label={uiText("MCP 工具名")} value={toolName} disabled={!!busy} onChange={event=>setToolName(event.target.value)} placeholder="window.status" /></label></div>
    <dl className="cl-binding-status"><div><dt>{uiText("绑定状态")}</dt><dd>{uiText(item.binding_status?.state || item.invocation || '未接入')}</dd></div><div><dt>{uiText("验证状态")}</dt><dd>{uiText(item.verification || '未验证')}</dd></div>{item.binding_status?.allow_trials !== undefined && <div><dt>{uiText("试跑授权")}</dt><dd>{uiText(item.binding_status.allow_trials ? '允许试跑' : '不允许试跑')}</dd></div>}{item.connection && <div><dt>{uiText("连接检查")}</dt><dd>{uiText(item.connection.available ? '可用' : '不可用')} · {uiText(item.connection.issue || item.connection.source || '')}</dd></div>}</dl>
    <div className="cl-binding-actions"><button className="cl-button cl-primary" disabled={disabled} onClick={()=>void request(base,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({server_id:serverId.trim(),tool_name:toolName.trim()})})}>{uiText("绑定 MCP 工具")}</button><button className="cl-button" disabled={!item.binding || !!busy} onClick={()=>void request(`${base}/check`,{method:'POST'})}>{uiText("检查连接")}</button><button className="cl-button" disabled={!item.binding || !!busy} onClick={()=>void request(base,{method:'DELETE'})}>{uiText("解除绑定")}</button></div>
    {busy && <p role="status" className="cl-subtle">{uiText(busy)}</p>}{error && <p role="alert" className="cl-error">{uiText(error)}</p>}
  </section>;
}
export function CapabilityDetails({ item, builtin=false, onUpdate }: {item:Capability;builtin?:boolean;onUpdate?: (item: Capability) => void}) {
  useUiLanguage();
  const parameters=inputParameters(item);
  return <div className="cl-details cl-readable-details">
    <section><h3>{uiText("能做什么")}</h3><p>{uiText(capabilityPurpose(item))}</p></section>
    <section><h3>{uiText("需要设置什么")}</h3>{parameters.known ? parameters.fields.length ? <><p className="cl-subtle">{uiText("参数试填仅用于理解配置，不保存，也不发送到车辆。")}</p><div className="cl-parameters">{parameters.fields.map(field=><ParameterField key={`${item.id}-${field.key}`} field={field}/>)}</div></> : <p>{uiText("资料中没有列出输入参数。")}</p> : <p>{uiText(parameters.text && !/^[\[{]/.test(parameters.text) ? parameters.text : uiText("参数结构尚未整理成表单，请查看技术详情中的原始定义。"))}</p>}</section>
    <section><h3>{uiText("会得到什么结果")}</h3><p>{uiText(resultDescription(item))}</p>{!builtin && <p className="cl-subtle">{uiText("以上来自资料，尚未验证实际调用。")}</p>}</section>
    {!builtin && <CapabilityBinding item={item} onUpdate={onUpdate} />}
    {!builtin && <section className="cl-next-step"><h3>{uiText("运行前还需要什么")}</h3><p>{uiText("当前可查阅和试填参数。接入对应车辆服务、确认权限与调用条件后，才能验证实际执行；暂不能拖入运行画布。")}</p><dl><div><dt>{uiText("权限要求")}</dt><dd>{uiText(item.permissions || uiText("资料未提供，需车企确认"))}</dd></div><div><dt>{uiText("调用条件")}</dt><dd>{uiText(item.conditions || uiText("资料未提供，需车企确认"))}</dd></div></dl>{item.missing.length>0 && <p>{uiText("待补充：")}{uiText(item.missing.join('、'))}</p>}</section>}
    <details className="cl-technical"><summary>{uiText("技术详情与原始资料")}</summary><dl>{[
      [uiText("原始名称"),item.name],[uiText("原始描述"),item.description],[uiText("调用方法"),item.interface],[uiText("输入参数"),item.inputs],[uiText("返回定义"),item.outputs],
      [uiText("权限要求"),item.permissions],[uiText("调用条件"),item.conditions],[uiText("适用平台"),item.platform],[uiText("资料版本"),item.version],[uiText("原业务分类"),[item.source_group,item.source_category].filter(Boolean).join(' / ')],[uiText("资料来源"),item.source],
    ].map(([label,value])=><div key={label}><dt>{uiText(label)}</dt><dd><pre>{original(value)}</pre></dd></div>)}</dl>{item.evidence && <details><summary>{uiText("查看原文依据")}</summary><pre className="cl-evidence">{item.evidence}</pre></details>}</details>
  </div>;
}
