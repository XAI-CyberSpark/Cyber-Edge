import { uiText, useUiLanguage  } from '@/i18n';
import { prepareImage, IMAGE_UPLOAD_ACCEPT } from '@/lib/prepareImage';
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { modelTestRequest, modelTestResponse } from '@/domain/modelTest';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ModelTestPanel({ model }: { model: string }) {
  useUiLanguage();
  const [text, setText] = useState('');
  const [picture, setPicture] = useState<{url:string; name:string} | null>(null);
  const [output, setOutput] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current=true; return () => { alive.current=false; request.current?.abort(); }; }, []);
  const upload = async (file?: File) => {
    if (!file) return;
    setError('');
    setReading(true);
    try {
      const image = await prepareImage(file);
      if(alive.current) setPicture(image);
    } catch(e) { if(alive.current) setError(e instanceof Error ? e.message : '图片读取失败'); }
    finally { if(alive.current) setReading(false); }
  };
  const run = async () => {
    if(request.current || reading) return;
    const controller=new AbortController(); request.current=controller;
    setBusy(true); setError(''); setOutput(''); setDetails('');
    const timeout=setTimeout(()=>controller.abort(),180000);
    try {
      const fast=model==='apple/FastVLM-0.5B';
      if(fast && !picture) throw new Error('FastVLM 需要一张图片。');
      const payload=fast ? {model,image_url:picture?.url,prompt:text || '请描述这张图片。',max_new_tokens:512} : modelTestRequest(model,text,picture?.url);
      const res=await fetch(apiUrl(fast ? '/v1/inference/vlm/describe' : '/v1/inference/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      const result=await res.json();
      if(!res.ok) throw new Error(typeof result.detail==='string' ? result.detail : `模型服务返回 ${res.status}`);
      const reply=fast ? {content:result.text,model,tokens:undefined} : modelTestResponse(result,model);
      if(!reply.content) throw new Error('模型没有返回内容。');
      if(alive.current) {setOutput(reply.content);setDetails(`模型：${reply.model}${reply.tokens == null ? '' : ` · Tokens：${reply.tokens}`}`);}
    } catch(e) {if(alive.current) setError(controller.signal.aborted ? '测试已取消或超时，请重试。' : e instanceof Error ? e.message : '模型测试失败。');}
    finally {clearTimeout(timeout);request.current=null;if(alive.current) setBusy(false);}
  };
  return <section className="space-y-4 pt-4" aria-label={uiText("单独测试模型")}>
    <p className="type-body">{uiText("直接与模型对话，查看原始回复。")}</p>
    <p className="type-body text-muted-foreground ">{uiText("此处测试模型基础能力，不使用场景提示词，不运行工作流或车控。每次提交独立测试。")}</p>
    <p className="type-caption break-all">{uiText("当前模型：")}{uiText(model || uiText("尚未选择"))}</p>
    <label className="block type-label" htmlFor="model-test-input">{uiText("测试输入")}</label>
    <Textarea id="model-test-input" value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder={uiText("例如：你好，或请描述图片")} />
    <div className="flex gap-2"><Button variant="outline" title={uiText("PNG、JPG、WebP，大图自动压缩（原图最大 25 MB）")} disabled={busy || reading} onClick={()=>inputRef.current?.click()}>{uiText(reading ? uiText("处理图片中…") : uiText("选择测试图片"))}</Button>{picture && <Button variant="ghost" disabled={busy || reading} onClick={()=>setPicture(null)}>{uiText("移除图片")}</Button>}</div>
    <input ref={inputRef} type="file" hidden accept={IMAGE_UPLOAD_ACCEPT} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}} />
    {picture && <figure><img src={picture.url} alt={uiText("模型测试图片")} className="max-h-44 w-full object-contain" /><figcaption className="type-caption break-all">{picture.name}</figcaption></figure>}
    <Button className="w-full" disabled={busy || reading || !model || (!text.trim() && !picture)} onClick={()=>void run()}>{uiText(busy ? uiText("模型推理中…") : uiText("发送给模型"))}</Button>
    {busy && <Button variant="outline" onClick={()=>request.current?.abort()}>{uiText("取消测试")}</Button>}
    {error && <p role="alert" className="type-body text-red-400">{uiText(error)}</p>}
    {output && <div role="status" className="space-y-2"><p className="type-caption text-muted-foreground">{uiText(details)}</p><h3 className="type-section ">{uiText("模型原始回复")}</h3><pre className="whitespace-pre-wrap break-words rounded-md border p-3 type-body font-sans">{output}</pre></div>}
  </section>;
}
