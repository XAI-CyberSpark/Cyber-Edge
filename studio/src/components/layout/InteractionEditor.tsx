import { uiText, useUiLanguage } from '@/i18n';
import type { InteractionPlan, InteractionStep } from '@/domain/scenarioSession';
const control='w-full min-h-10 rounded-md border border-input bg-background p-2 type-body';
export function InteractionEditor({value,onChange}:{value?:InteractionPlan;onChange:(value:InteractionPlan)=>void}) {
  useUiLanguage();
 const p:InteractionPlan=value || {mode:'live',model:'MiniMax-M3',premise:'',ending:'',steps:[]};
 const patch=(key:keyof InteractionPlan,value:unknown)=>onChange({...p,[key]:value});
 const step=(i:number,changes:Partial<InteractionStep>)=>patch('steps',p.steps.map((s,j)=>j===i?{...s,...changes}:s));
 return <div className="space-y-3" aria-label={uiText("持续互动配置")}>
   <label className="block type-label">{uiText("内容创作")}<select aria-label={uiText("内容创作")} className={control} value={p.mode} onChange={e=>patch('mode',e.target.value)}><option value="live">{uiText("进入阶段时由模型创作")}</option><option value="authored">{uiText("使用已编排内容")}</option></select></label>
   {p.mode==='live' && <label className="block type-label">{uiText("模型")}<input aria-label={uiText("互动模型")} className={control} value={p.model || ''} onChange={e=>patch('model',e.target.value)}/></label>}
   <label className="block type-label">{uiText("体验背景")}<textarea aria-label={uiText("体验背景")} className={control} value={p.premise} onChange={e=>patch('premise',e.target.value)}/></label>
   {p.steps.map((s,i)=><details key={s.id} className="border-t pt-2" open={p.steps.length===1 || undefined}>
     <summary className="cursor-pointer py-2 type-label">{uiText(i+1)}. {uiText(s.title || uiText("新阶段"))}</summary><div className="space-y-2">
     <label className="block type-label">{uiText("标题")}<input className={control} value={s.title} onChange={e=>step(i,{title:e.target.value})}/></label>
     <label className="block type-label">{uiText("等待什么")}<select className={control} value={s.waitFor} onChange={e=>step(i,{waitFor:e.target.value as InteractionStep['waitFor']})}><option value="answer">{uiText("乘客回答")}</option><option value="continue">{uiText("下一站（模拟）")}</option><option value="arrival">{uiText("到达（模拟）")}</option></select></label>
     {s.waitFor==='answer' && p.mode==='live' && <label className="block type-label">{uiText("固定答案（可选，每行一个）")}<textarea className={control} value={(s.acceptedAnswers || []).join('\n')} onChange={e=>step(i,{acceptedAnswers:e.target.value.trim()?e.target.value.split('\n'):undefined})}/></label>}
     {s.waitFor==='answer' && s.acceptedAnswers?.length && <label className="block type-label">{uiText("固定题面（可选）")}<textarea className={control} value={s.fixedQuestion || ''} onChange={e=>step(i,{fixedQuestion:e.target.value || undefined})}/></label>}
     {s.waitFor==='answer' && s.acceptedAnswers?.length && <label className="flex items-center gap-2 min-h-10 type-label"><input type="checkbox" checked={!!s.hideAnswerInOpening} onChange={e=>step(i,{hideAnswerInOpening:e.target.checked})}/>{uiText("检查开场是否泄露固定答案")}</label>}
     {p.mode==='live'?<label className="block type-label">{uiText("创作要求")}<textarea className={control} value={s.brief || ''} onChange={e=>step(i,{brief:e.target.value})}/></label>:<>
       {['message',...(s.waitFor==='answer'?['question','hint','reward']:[])].map(k=><label className="block type-label" key={k}>{uiText({message:'开场内容',question:'问题',hint:'提示',reward:'答对后的线索'}[k])}<textarea className={control} value={String(s.content?.[k as keyof typeof s.content] || '')} onChange={e=>step(i,{content:{message:'',...s.content,[k]:e.target.value}})}/></label>)}
       {s.waitFor==='answer' && <label className="block type-label">{uiText("可接受的答案（每行一个）")}<textarea className={control} value={(s.content?.answers || []).join('\n')} onChange={e=>step(i,{content:{message:'',...s.content,answers:e.target.value.split('\n')}})}/></label>}
     </>}
     <button type="button" className="min-h-10 underline" onClick={()=>patch('steps',p.steps.filter((_,j)=>i!==j))}>{uiText("移除此阶段")}</button>
     </div></details>)}
   <button type="button" className="min-h-10 underline" disabled={p.steps.length>=12} onClick={()=>patch('steps',[...p.steps,{id:crypto.randomUUID(),title:'新阶段',brief:'',waitFor:'answer'}])}>{uiText("添加阶段")}</button>
   <label className="block type-label">{uiText("结束语")}<textarea aria-label={uiText("结束语")} className={control} value={p.ending} onChange={e=>patch('ending',e.target.value)}/></label>
 </div>;
}
