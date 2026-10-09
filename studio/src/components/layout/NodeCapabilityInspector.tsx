import { uiText, useUiLanguage } from '@/i18n';
import {FlowCapabilityEditor} from './FlowCapabilityEditor';
import { InteractionEditor } from './InteractionEditor';
import { getNodeCapability, validateNode, type CapabilityNode } from '@/domain/nodeCapabilities';

export function NodeCapabilityInspector({ node, onChange }: { node: CapabilityNode; onChange: (patch: Record<string, unknown>) => void }) {
  useUiLanguage();
  const capability = getNodeCapability(node);
  const issues = validateNode(node);
  const d = node.data;
  const selectClass = 'w-full h-10 rounded-md border border-input bg-background px-3 type-body';
  return <section aria-label={uiText("节点能力与配置检查")} className="space-y-3 type-body">
    <p className="font-medium">{uiText(capability?.name || uiText("未接入能力"))} · {uiText(capability?.source || uiText("尚无执行器"))}</p>
    <p className="text-muted-foreground leading-relaxed">{uiText(capability?.description || uiText("此节点可以保留在项目中，但当前不能运行。"))}</p>
    {capability && <details><summary className="cursor-pointer py-2 type-label">{uiText("输入与输出")}</summary><p className="py-1">{uiText("输入：")}{uiText(capability.inputs)}</p><p className="py-1">{uiText("输出：")}{uiText(capability.outputs)}</p></details>}
    {['wait','state','stage'].includes(node.type||'') && <FlowCapabilityEditor type={node.type} data={d} onChange={onChange}/>}
    {!['wait','state','stage','interaction'].includes(node.type||'') && <FlowCapabilityEditor type={node.type} data={d} onChange={onChange}/>}
    {node.type === 'interaction' && <InteractionEditor value={d.plan} onChange={plan=>onChange({plan})}/>}
    {node.type === 'llm' && <label className="block space-y-1 type-label"><span>{uiText("输出格式")}</span><select aria-label={uiText("模型输出格式")} className={selectClass} value={d.outputFormat || 'auto'} onChange={e=>onChange({outputFormat:e.target.value})}><option value="auto">{uiText("兼容旧配置")}</option><option value="text">{uiText("文字")}</option><option value="json">{uiText("结构化数据")}</option><option value="actions">{uiText("受控动作")}</option></select>{d.outputFormat==='json' && <p>{uiText("字段：")}{JSON.stringify(d.outputFields || {})}{uiText("。下游从 input.data 读取；可通过编排对话修改字段。")}</p>}</label>}
    {node.type === 'systemInput' && <label className="block space-y-1 type-label"><span>{uiText("输入来源")}</span><select className={selectClass} aria-label={uiText("输入来源")} value={d.inputType || ''} onChange={e => onChange({ inputType: e.target.value })}><option value="">{uiText("请选择")}</option><option value="weather">{uiText("仿真天气与车窗")}</option><option value="image">{uiText("上传单帧图片")}</option><option value="camera">{uiText("相机 / 上传单帧图片")}</option><option value="rear_camera">{uiText("后排单帧图片")}</option>{d.inputType && !['weather','camera','rear_camera','image'].includes(d.inputType) && <option value={d.inputType}>{d.inputType}{uiText("（未接入）")}</option>}</select></label>}
    {node.type === 'car_control' && <div className="space-y-2">
      <button type="button" className="min-h-10 underline underline-offset-4" onClick={() => onChange({ device_type: 'car', action: 'windows', parameter: 'close_all', module: 'vehicleControl', function: 'set', signalKey: 'WINDOW_POSITION', area: 4, targetStatus: 0 })}>{uiText("配置为关闭右后窗（仿真）")}</button>
      {d.signalKey === 'WINDOW_POSITION' && <>
        <label className="block space-y-1 type-label"><span>{uiText("目标车窗")}</span><select className={selectClass} aria-label={uiText("目标车窗")} value={String(d.area ?? '')} onChange={e => onChange({ area: Number(e.target.value) })}><option value="">{uiText("请选择")}</option>{[uiText("全部车窗"),uiText("左前窗"),uiText("右前窗"),uiText("左后窗"),uiText("右后窗"),uiText("前排车窗"),uiText("后排车窗")].map((label, i) => <option key={i} value={i}>{uiText(label)}</option>)}</select></label>
        <label className="block space-y-1 type-label"><span>{uiText("目标开度（0 关闭，100 全开）")}</span><input className={selectClass} aria-label={uiText("目标开度")} type="number" min="0" max="100" value={d.targetStatus ?? ''} onChange={e => onChange({ targetStatus: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
      </>}
    </div>}
    {node.type === 'video_display' && <div className="space-y-2"><label className="block space-y-1 type-label"><span>{uiText("后排视频")}</span><select className={selectClass} aria-label={uiText("后排视频来源")} value={d.source || 'local_replay'} onChange={e => onChange({ source: e.target.value })}><option value="local_replay">{uiText("演示录像")}</option><option value="browser_stream">{uiText("视频流地址")}</option></select></label>{d.source === 'browser_stream' && <label className="block space-y-1 type-label"><span>{uiText("浏览器可播放的 HTTP(S) 地址")}</span><input className={selectClass} aria-label={uiText("后排视频流地址")} value={d.streamUrl || ''} onChange={e => onChange({ streamUrl: e.target.value })} /></label>}</div>}
    {node.type === 'recognition' && <label className="block space-y-1 type-label"><span>{uiText("结果来源")}</span><select className={selectClass} aria-label={uiText("识别结果来源")} value={d.resultSource || 'preset'} onChange={e => onChange({ resultSource: e.target.value })}><option value="vision">{uiText("解析上游儿童视觉 JSON")}</option><option value="preset">{uiText("预设结果（仅模拟）")}</option></select></label>}
    {node.type === 'cockpit_alert' && <label className="block space-y-1 type-label"><span>{uiText("提醒文字（不播报语音）")}</span><textarea className={selectClass} aria-label={uiText("提醒文字")} value={d.voicePrompt || ''} onChange={e => onChange({ voicePrompt: e.target.value })} /></label>}
    {node.type === 'fallback' && <label className="block space-y-1 type-label"><span>{uiText("记录的判断结果")}</span><select className={selectClass} aria-label={uiText("记录的判断结果")} value={d.outcome || ''} onChange={e => onChange({ outcome: e.target.value })}><option value="">{uiText("通用反馈")}</option><option value="normal">{uiText("未见明确风险")}</option><option value="unknown">{uiText("无法判断")}</option></select></label>}
    {node.type === 'logic' && /input\.confidence/.test(String(d.condition || '')) && <p className="text-muted-foreground">{uiText("此条件使用模型自评分，阈值未经图片评测校准，不代表识别准确率。")}</p>}
    {issues.length ? <ul role="alert" className="space-y-1 text-destructive">{issues.map((issue,i) => <li key={i}>{uiText(issue.message)}</li>)}</ul> : <p className="text-muted-foreground">{uiText("节点配置检查通过。服务连通性与业务效果以实际运行结果为准。")}</p>}
  </section>;
}
