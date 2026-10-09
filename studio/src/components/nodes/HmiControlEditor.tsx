import { uiText, useUiLanguage } from '@/i18n';
import { HMI_CONTROLS } from '@/domain/hmiControls';

export function HmiControlEditor({data}: {data:Record<string,any>}) {
  useUiLanguage();
  const id = String(data.controlId || 'ac.temp'), spec = HMI_CONTROLS[id];
  const update = (patch:Record<string,unknown>) => { const next={...data,...patch};if(data.onUpdate)data.onUpdate(next);else Object.assign(data,next); };
  const className='w-full rounded border border-border bg-background p-2 type-label text-foreground';
  return <div className="nodrag space-y-2 type-body">
    <p className="type-caption text-muted-foreground">{uiText("HMI 共享状态 · 执行后回读")}</p>
    <label className="block">{uiText("控制项")}<select className={className} aria-label={uiText("HMI 控制项")} value={id} onChange={e=>update({controlId:e.target.value,controlValue:HMI_CONTROLS[e.target.value].default,valueField:''})}>{Object.entries(HMI_CONTROLS).map(([key,s])=><option key={key} value={key}>{uiText(s.label)} · {uiText(key)}</option>)}</select></label>
    <label className="block">{uiText("操作")}<select className={className} value={data.controlOperation || 'set'} onChange={e=>update({controlOperation:e.target.value})}><option value="set">{uiText("设置并回读")}</option><option value="get">{uiText("读取当前状态")}</option></select></label>
    {data.controlOperation!=='get' && <>
      <label className="block">{uiText("目标值来源")}<select className={className} value={data.valueField?'input':'fixed'} onChange={e=>update({valueField:e.target.value==='input'?'value':''})}><option value="fixed">{uiText("节点配置")}</option><option value="input">{uiText("上游 JSON 字段")}</option></select></label>
      {data.valueField ? <label className="block">{uiText("input.data 字段")}<input className={className} value={data.valueField} onChange={e=>update({valueField:e.target.value})} /></label> : spec?.type==='boolean' ? <label className="block">{uiText("目标状态")}<select className={className} value={String(data.controlValue??spec.default)} onChange={e=>update({controlValue:e.target.value==='true'})}><option value="true">{uiText("开启")}</option><option value="false">{uiText("关闭")}</option></select></label> : spec?.options ? <label className="block">{uiText("目标选项")}<select className={className} value={String(data.controlValue??spec.default)} onChange={e=>update({controlValue:e.target.value})}>{Object.entries(spec.options).map(([key,label])=><option key={key} value={key}>{uiText(label)}</option>)}</select></label> : <label className="block">{uiText("目标值")}{uiText(spec?.unit)}<input className={className} type={spec?.type==='number'?'number':spec?.format==='color'?'color':'text'} min={spec?.min} max={spec?.max} step={spec?.step} value={String(data.controlValue??spec?.default??'')} onChange={e=>update({controlValue:spec?.type==='number' ? (e.target.value===''?'':Number(e.target.value)) : e.target.value})} /></label>}
    </>}
    {data.output?.action_result && <p className="type-caption break-words" role="status">{uiText("实际值：")}{JSON.stringify(data.output.action_result.actual)}</p>}
  </div>;
}
