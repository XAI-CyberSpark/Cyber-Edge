/** Presentation only: original definitions remain unchanged and authoritative. */
export type Capability = {
  id: string; name: string; category: string; description: string; summary?: string; interface: string;
  inputs: string; outputs: string; permissions: string; conditions: string; platform: string;
  version: string; source: string; source_group?: string; source_category?: string; evidence: string; missing: string[];
  invocation: string; verification: string;
  binding?: { server_id: string; tool_name: string; bound_at?: number };
  binding_status?: { state: string; allow_trials?: boolean; issue?: string };
  connection?: { checked_at?: number; source?: string; available?: boolean; issue?: string; input_schema?: unknown };
  import_id?: string;
};
type Schema = { type?: string; title?: string; description?: string; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[]; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; default?: unknown; items?: Schema };
export type Parameter = { key: string; label: string; description: string; required: boolean; schema: Schema; choices?: string[]; choicesFromText?: boolean; conflict: boolean };
const names: Record<string, string> = {
  com_sgm_service_climate_setTemperature: '调整空调温度',
  com_sgm_cpeservice_showMcpPanelPopup: '显示提示卡片',
};
const shortNames: Record<string,string> = {
  '设置主屏或者中控屏幕亮度值和是否能自动调节':'调整中控屏亮度与自动调节',
  '设置后排吸顶屏亮度值和是否能自动调节':'调整后排屏亮度与自动调节',
  '设置乘客屏或者副驾屏幕亮度值和是否能自动调节':'调整副驾屏亮度与自动调节',
  '设置主驾仪表屏亮度值和是否能自动调节':'调整仪表屏亮度与自动调节',
  '获取当前按键背光亮度是否允许调节':'读取按键背光调节权限',
  '设置按键背光亮度是否允许调节':'设置按键背光调节权限',
  '通过安卓原生的方法获取当前的定位信息':'读取当前位置',
  '后排电动侧滑门的控制':'控制后排电动侧滑门',
  '控制车内主音区音乐暂停功能':'暂停主音区音乐',
  '控制车内主音区音乐播放功能':'播放主音区音乐',
  '左上角的小弹框':'显示提示卡片', '展示toast':'显示短暂提示',
  '展示二维码弹框页面':'显示二维码弹窗',
  '可以获取当下有几个儿童在车内':'读取车内儿童信息',
  '可以获取当下有几只宠物在车内':'读取车内宠物信息',
  '可以获取下车内有几个人做了手势':'读取乘员手势信息',
  '进入看护模式可以看到实车第二排第三排的状况':'打开后排看护画面',
};
export function capabilityName(item: Capability) {
  return names[item.interface] || shortNames[item.name] || item.name.replace(/^获取(?:当前)?/, '读取').replace(/^主动(?=进入|退出)/,'');
}
export function capabilityPurpose(item: Capability) {
  if (item.summary?.trim()) return item.summary.trim();
  if (item.interface === 'com_sgm_service_climate_setTemperature') return '设置指定座位区域的空调目标温度。';
  if (item.interface === 'com_sgm_cpeservice_showMcpPanelPopup') return '在屏幕左上角显示带标题、内容和按钮的提示卡片。';
  return (item.interface ? item.description.split(/[:：]|[,，](?=[a-zA-Z_])/)[0] : item.description).trim() || '资料尚未说明用途，请查看技术详情。';
}
export function capabilityGroup(item: Capability) { return item.source_category || item.source_group || item.category; }
const fieldNames: Record<string,string> = {
  location:'控制区域', temp:'目标温度', value:'设置值', mode:'模式', enabled:'是否启用', enable:'是否启用',
  level:'档位', isOpen:'是否打开', sourceName:'来源名称', isAuto:'是否自动调节', state:'状态',
  duration:'持续时间', title:'标题', content:'内容', latitude:'纬度', longitude:'经度', poi_name:'地点名称',
  address:'地址', poi_id:'地点标识', brightness:'亮度', time:'时间', isAllowed:'是否允许', type:'类型',
  position:'位置', iconBitmap:'图标图片', firstButton:'按钮文字', qrImageContent:'二维码图片内容', qrContent:'二维码内容',
  angle:'角度', songName:'歌曲名称', songId:'歌曲标识', fanDirection:'送风方向', preState:'前一状态',
  currentState:'当前状态', startMinute:'开始分钟', startHour:'开始小时', endMinute:'结束分钟', endHour:'结束小时',
  status:'状态', targetSOC:'目标电量', keyword:'搜索关键词', headrestType:'头枕类型', rearviewMirror:'后视镜',
};
const choiceNames: Record<string,string> = { FRONT_LEFT:'前排左侧', FRONT_RIGHT:'前排右侧', REAR_LEFT:'后排左侧', REAR_RIGHT:'后排右侧' };
export const parameterChoiceLabel = (value:string) => choiceNames[value] || value;
export function inputParameters(item: Capability): { fields: Parameter[]; known: boolean; text: string } {
  let schema: Schema;
  try { schema = JSON.parse(item.inputs); } catch { return { fields:[], known:false, text:item.inputs }; }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { fields:[], known:false, text:item.inputs };
  if (!schema.properties || Array.isArray(schema.properties) || typeof schema.properties !== 'object' || 'oneOf' in schema || 'anyOf' in schema || 'allOf' in schema || '$ref' in schema) return {fields:[],known:false,text:item.inputs};
  const fields = Object.entries(schema.properties || {}).map(([key, raw]) => {
    const spec = raw && typeof raw === 'object' ? raw : {};
    const description = spec.description || '';
    let choices = Array.isArray(spec.enum) && spec.enum.every(v => ['string','number','boolean'].includes(typeof v)) ? spec.enum.map(String) : undefined;
    let choicesFromText = false;
    // Only extract explicitly enumerated values from the documented temperature/seat interface.
    if (!choices && item.interface === 'com_sgm_service_climate_setTemperature') {
      if (key === 'location') choices = description.match(/\b(?:FRONT_LEFT|FRONT_RIGHT|REAR_LEFT|REAR_RIGHT)\b/g) || undefined;
      if (key === 'temp') choices = description.match(/可以选择([\d、\s]+)$/)?.[1].split('、').map(v=>v.trim()).filter(Boolean);
      choicesFromText = !!choices?.length;
    }
    return { key, label: spec.title || fieldNames[key] || key, description, required:Array.isArray(schema.required) && schema.required.includes(key), schema:spec, choices, choicesFromText,
      conflict: item.missing.some(note=>note.includes(key) && /冲突|矛盾/.test(note)) };
  });
  return {fields,known:true,text:''};
}
export function resultDescription(item: Capability) {
  const value = item.outputs.replace(/^原文返回说明（未验证）：/, '').trim();
  if (!value) return '资料未说明返回内容，接入前需要补充。';
  if (/^Return value of type (java\.lang\.)?String\.?$/i.test(value)) return '返回一段文本；资料尚未说明文本内容和成功、失败的判断方式。';
  if (/^Return value of type (java\.lang\.)?(boolean|Boolean)\.?$/i.test(value)) return '返回“是 / 否”；具体代表什么状态，需要结合接口说明确认。';
  if (value === '是否成功调用方法') return '返回接口调用是否成功；不代表车辆已达到目标状态。';
  if (/"(?:type|properties)"\s*:/.test(value)) return '返回结构化数据，字段及状态码定义见技术详情中的返回定义。';
  return value;
}
