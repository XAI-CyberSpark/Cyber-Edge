import type { Node, Edge } from '@xyflow/react';
export const selfieSamples = [
  { label: '白色衣物 · 自拍', input: JSON.stringify({is_selfie:true,confidence:0.95,clothing_color:'白色',clothing_style:'简约'}) },
  { label: '蓝色衣物 · 自拍', input: JSON.stringify({is_selfie:true,confidence:0.95,clothing_color:'蓝色',clothing_style:'休闲'}) },
  { label: '低置信度', input: JSON.stringify({is_selfie:true,confidence:0.3,clothing_color:'未知',clothing_style:'未知'}) },
  { label: '结束自拍', input: JSON.stringify({is_selfie:false,confidence:0.99,clothing_color:'未知',clothing_style:'未知'}) },
];
/** Event input deliberately simulates perception; recommendation still uses the configured model. */
export function buildSelfieAmbientScenario(model = 'claude-sonnet-5', providerId = 'anthropic'): { nodes: Node[]; edges: Edge[] } {
 const node = (id:string,type:string,label:string,x:number,y:number,data:Record<string,unknown>={}):Node => ({id,type,position:{x,y},data:{label,status:'idle',...data}});
 const nodes = [
  node('selfie_event','input','模拟自拍识别事件',500,0,{inputFormat:'json',outputFields:{is_selfie:'boolean',confidence:'number',clothing_color:'string',clothing_style:'string'},simulationSamples:selfieSamples}),
  node('selfie_gate','logic','确认自拍与有效置信度',500,240,{type:'if',condition:'input.data.is_selfie === true && input.data.confidence >= 0.6 && input.data.confidence <= 1'}),
  node('selfie_recommend','llm','根据衣物生成配色与姿势',140,500,{model,apiModel:model,providerId,inferenceSource:'api',outputFormat:'json',outputFields:{light_color:'string',light_brightness:'number',light_reason:'string',pose_tips:'string'},maxTokens:800,temperature:0.4,systemPrompt:'你为坐在车内的乘客提供自拍建议。输入是明确标注的模拟识别事件，不是照片。根据clothing_color和clothing_style生成协调的氛围灯方案，light_color必须为#RRGGBB十六进制颜色，light_brightness为0到100的数值，light_reason简述与衣物颜色的搭配理由，pose_tips给出不离开座位、不解开安全带的简短自拍姿势建议。不声称最优或分析了真实照片。只返回约定JSON。'}),
  node('selfie_light','car_control','HMI 调节氛围灯',140,950,{action:'ambient_light.set',executionMode:'hmi_mock'}),
  node('selfie_show','output','中控展示姿势建议',140,1200),
  node('selfie_restore','car_control','恢复原灯光',870,500,{action:'ambient_light.restore',executionMode:'hmi_mock'}),
  node('selfie_idle','fallback','未确认自拍，保持原体验',870,750,{responseText:'未确认自拍或自拍已结束，已恢复原灯光。'}),
  node('selfie_error','fallback','推荐失败，保留灯光状态',-240,950,{responseText:'本次建议生成失败，未执行新的灯光调整，请重试。'}),
 ];
 const edge=(source:string,target:string,sourceHandle?:string):Edge=>({id:source+'-'+target,source,target,type:'smoothstep',...(sourceHandle?{sourceHandle}:{})});
 const edges=[edge('selfie_event','selfie_gate'),edge('selfie_gate','selfie_recommend','true'),edge('selfie_gate','selfie_restore','false'),edge('selfie_recommend','selfie_light'),edge('selfie_recommend','selfie_error','error'),edge('selfie_light','selfie_show'),edge('selfie_restore','selfie_idle')];
 return {nodes,edges};
}
