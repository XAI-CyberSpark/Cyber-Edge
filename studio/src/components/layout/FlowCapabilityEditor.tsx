import { uiText, useUiLanguage  } from '@/i18n';
import {useEffect,useState} from 'react';
const control='w-full min-h-10 rounded-md border border-input bg-background p-2 type-body';
function JsonFields({label,value,onChange}:{label:string;value:unknown;onChange:(v:unknown)=>void}){
  useUiLanguage();
 const [draft,setDraft]=useState(JSON.stringify(value||{},null,2)),[error,setError]=useState('');
 useEffect(()=>setDraft(JSON.stringify(value||{},null,2)),[value]);
 return <label className="block space-y-1 type-label">{uiText(label)}<textarea className={control} aria-label={uiText(label)} value={draft} onChange={e=>{setDraft(e.target.value);try{const v=JSON.parse(e.target.value);if(!v||Array.isArray(v)||typeof v!=='object')throw Error();setError('');onChange(v);}catch{setError('请输入有效对象。');}}}/>{error&&<span role="alert" className="type-caption text-destructive">{uiText(error)}</span>}</label>;
}
export function FlowCapabilityEditor({type,data:d,onChange}:{type?:string;data:any;onChange:(patch:Record<string,unknown>)=>void}){
  useUiLanguage();
 return <div className="space-y-3">
 {['input','systemInput'].includes(type||'')&&<>
  <label className="flex items-center gap-2 type-label"><input type="checkbox" checked={d.flowVersion===2} onChange={e=>onChange({flowVersion:e.target.checked?2:undefined})}/>{uiText("启用可恢复流程")}</label>
  <label className="block space-y-1 type-label">{uiText("触发事件（留空为启动入口）")}<input className={control} value={d.eventName||''} onChange={e=>onChange({eventName:e.target.value||undefined})}/></label>
  <label className="block space-y-1 type-label">{uiText("事件文字别名（每行一个）")}<textarea className={control} value={(d.aliases||[]).join('\n')} onChange={e=>onChange({aliases:e.target.value.split('\n').filter(Boolean)})}/></label>
  <label className="flex items-center gap-2 type-label"><input type="checkbox" checked={!!d.interrupt} onChange={e=>onChange({interrupt:e.target.checked})}/>{uiText("触发时结束其他未完成路径")}</label>
 </>}
 {type==='wait'&&<>
  {['eventName','prompt','successMessage','retryMessage','hint','storeAs'].map(k=><label key={k} className="block space-y-1 type-label">{uiText({eventName:'等待的事件',prompt:'等待时显示',successMessage:'接收成功反馈',retryMessage:'未匹配反馈',hint:'提示内容',storeAs:'保存到状态字段'}[k])}<input className={control} aria-label={uiText(k)} value={d[k]||''} onChange={e=>onChange({[k]:e.target.value})}/></label>)}
  <label className="block space-y-1 type-label">{uiText("匹配方式")}<select className={control} value={d.match||'any'} onChange={e=>onChange({match:e.target.value})}><option value="any">{uiText("接收输入，再由后续节点处理")}</option><option value="exact">{uiText("匹配配置答案")}</option></select></label>
  {['answers','aliases','hintInputs'].map(k=><label key={k} className="block space-y-1 type-label">{uiText({answers:uiText("答案（每行一个）"),aliases:uiText("事件的文字别名（每行一个）"),hintInputs:uiText("请求提示的输入（每行一个）")}[k])}<textarea className={control} value={(d[k]||[]).join('\n')} onChange={e=>onChange({[k]:e.target.value.split('\n').filter(Boolean)})}/></label>)}
 </>}
 {type==='state'&&<><JsonFields label={uiText("写入状态")} value={d.values} onChange={v=>onChange({values:v})}/><JsonFields label={uiText("增加计数")} value={d.increments} onChange={v=>onChange({increments:v})}/></>}
 {type!=='stage'&&<label className="block space-y-1 type-label">{uiText("多个输入如何汇合")}<select className={control} value={d.joinMode||''} onChange={e=>onChange({joinMode:e.target.value||undefined})}><option value="">{uiText("单个输入")}</option><option value="all">{uiText("所有路径决定后执行一次")}</option><option value="any">{uiText("任一路径到达后执行一次")}</option></select></label>}
 </div>;
}
