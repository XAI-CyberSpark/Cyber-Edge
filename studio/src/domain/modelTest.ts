import { OPENSPARX_MODEL } from './opensparx';

export function modelTestRequest(model: string, text: string, image?: string) {
  if (!model) throw new Error('请先为节点选择模型。');
  if (!text.trim() && !image) throw new Error('请输入文字或选择图片。');
  return {
    model, temperature: 0.1, max_tokens: 512, json_mode: false,
    messages: [{ role: 'user', content: image ? [
      { type: 'text', text: text.trim() || '请描述这张图片。' },
      { type: 'image_url', image_url: { url: image } },
    ] : text.trim() }],
  };
}

export function modelTestResponse(result: any, model: string) {
  const choice = result?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回有效内容。');
  if (choice.finish_reason === 'length') throw new Error('模型输出被截断，请缩短问题后重试。');
  if (model === OPENSPARX_MODEL && result.model !== model) throw new Error('返回模型与选定的 OpenSparX 不一致。');
  return { content, model: result.model || model, tokens: result.usage?.total_tokens };
}
