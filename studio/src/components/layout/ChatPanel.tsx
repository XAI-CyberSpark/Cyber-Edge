import { uiText, uiLocale, useUiLanguage  } from '@/i18n';
import { useState, useRef, useEffect, useLayoutEffect, type ComponentPropsWithoutRef } from 'react';
import { ReplyActivity, type ReplyExecution } from './ReplyActivity';
import { Plus, ArrowUp, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AuthoringModelPicker, type ReasoningSettings } from './AuthoringModelPicker';
import './chat-panel.css';
import { chatTimestampIds, formatChatTimestamp } from '@/domain/chatTimestamps';

/* ── Markdown 自定义渲染组件（适配深/浅色气泡） ── */
const mdComponents: Components = {
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className="my-1.5 leading-relaxed" {...props} />
  ),
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="type-panel  mt-3 mb-1.5 first:mt-0" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="type-section  mt-3 mb-1 first:mt-0" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="type-section  mt-2.5 mb-1 first:mt-0" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-muted-foreground" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-muted-foreground" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<'a'>) => (
    <a className="text-primary underline underline-offset-2 hover:text-primary/80 break-all" target="_blank" rel="noreferrer" {...props} />
  ),
  code: ({ className, children, ...rest }: ComponentPropsWithoutRef<'code'>) => {
    const isBlock = /language-/.test(className || '');
    if (isBlock) {
      return (
        <code className={`${className ?? ''} block type-code`} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1 py-0.5 rounded bg-background/60 type-code font-mono text-foreground" {...rest}>
        {children}
      </code>
    );
  },
  pre: (props: ComponentPropsWithoutRef<'pre'>) => (
    <pre className="my-2 p-3 rounded-lg bg-background/50 overflow-x-auto type-code  border border-border/40" {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full type-body" {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<'thead'>) => (
    <thead className="bg-background/40" {...props} />
  ),
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th className="px-2.5 py-1.5 text-left font-semibold text-foreground border-b border-border/50" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td className="px-2.5 py-1.5 border-b border-border/30" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="my-2 pl-3 border-l-2 border-primary/40 text-muted-foreground italic" {...props} />
  ),
  hr: () => <hr className="my-3 border-border/40" />,
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  execution?: ReplyExecution;
}

interface ChatPanelProps {
  providerId: string;
  model?: string;
  reasoning?: ReasoningSettings;
  onModelChange: (providerId: string, model: string, reasoning?: ReasoningSettings) => void;
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
}

const scenarioTemplates = [
  { title: '儿童乘车关怀', prompt: '我想设计儿童乘车关怀体验，请先帮我明确适用情境、乘客需求和需要确认的问题。' },
  { title: '雨天出行提醒', prompt: '我想设计雨天出行提醒体验，请先帮我梳理提醒时机、信息来源和不打扰驾驶员的交互方式。' },
  { title: '长途旅程互动', prompt: '我想为长途出行设计座舱互动体验，请先和我讨论乘客、旅程阶段与互动方式。' },
  { title: '优化当前场景', prompt: '请结合当前画布，帮我检查并优化这个场景的体验。先说明你发现的问题和建议，确认后再修改。' },
];

export function ChatPanel({ messages, onSendMessage, isLoading, providerId, model, reasoning, onModelChange }: ChatPanelProps) {
  useUiLanguage();
  const [input, setInput] = useState('');
  const [displayNow, setDisplayNow] = useState(Date.now);
  useEffect(() => {
    const refreshTimeLabels = () => setDisplayNow(Date.now());
    const timer = window.setInterval(refreshTimeLabels, 60000);
    window.addEventListener('focus', refreshTimeLabels);
    document.addEventListener('visibilitychange', refreshTimeLabels);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshTimeLabels);
      document.removeEventListener('visibilitychange', refreshTimeLabels);
    };
  }, []);
  const [modelReady, setModelReady] = useState(false);
  const [fileNotice, setFileNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Measure on value changes (including submit/clear) and panel-width changes.
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    const resize = () => {
      field.style.height = '0px';
      const limit = Math.min(160, window.innerHeight * 0.25);
      const height = Math.max(24, Math.min(field.scrollHeight, limit));
      field.style.height = `${height}px`;
      field.style.overflowY = field.scrollHeight > height ? 'auto' : 'hidden';
    };
    resize();
    let width = field.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    });
    observer?.observe(field);
    window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, [input]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const addRequirementFile = async (file?: File) => {
    if (!file) return;
    setFileNotice(''); setFileError('');
    if (!/\.(txt|md)$/i.test(file.name)) { setFileError('请选择 .txt 或 .md 文字文件。'); return; }
    if (file.size > 64 * 1024) { setFileError('文件超过 64 KB，请拆分后添加。'); return; }
    setReadingFile(true);
    try {
      const text = (await file.text()).trim();
      if (!text || /[\u0000\ufffd]/.test(text)) throw new Error('文件为空或编码无法识别，请使用 UTF-8 文字文件。');
      setInput(previous => previous ? `${previous}\n\n${text}` : text);
      setFileNotice(`已添加 ${file.name}，确认内容后发送。`);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) { setFileError(error instanceof Error ? error.message : '无法读取文件，请重试。'); }
    finally { setReadingFile(false); }
  };

  const handleSubmit = () => {
    if (!input.trim() || isLoading || readingFile || !modelReady) return;
    onSendMessage(input.trim());
    setInput(''); setFileNotice(''); setFileError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const timestampIds = chatTimestampIds(messages);
  const renderMessage = (msg: Message) => (
    <div key={msg.id} className="co-chat-entry">
      {timestampIds.has(msg.id) && (
        <time className="co-chat-turn-time type-caption text-muted-foreground" dateTime={new Date(msg.timestamp).toISOString()} title={new Date(msg.timestamp).toLocaleString(uiLocale())}>
          {formatChatTimestamp(msg.timestamp, displayNow, uiLocale())}
        </time>
      )}
    <div className={`co-chat-message flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>

      <div
        aria-label={uiText(msg.role === 'user' ? uiText("你") : uiText("助手"))}
        className={`co-chat-bubble type-body  ${
          msg.role === 'user'
            ? 'co-chat-user text-foreground rounded-2xl px-4 py-3 whitespace-pre-wrap'
            : 'co-chat-assistant text-foreground'
        }`}
      >
        {msg.role === 'assistant' && msg.execution && <ReplyActivity execution={msg.execution} />}
        {msg.role === 'assistant' ? (msg.isStreaming && msg.execution ? null : (
          <div className="co-chat-markdown text-secondary-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {msg.content}
            </ReactMarkdown>
          </div>
        )) : (
          msg.content
        )}
        {msg.isStreaming && !msg.execution && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse" />
        )}
      </div>

    </div>
    </div>
  );

  return (
    <div className="co-chat h-full flex flex-col bg-card">
      <div className="co-chat-header px-4 py-3 border-b workspace-divider shrink-0">
        <h3 className="type-panel flex items-center gap-2 text-foreground"><Sparkles size={16} className="shrink-0 text-primary" aria-hidden="true" />{uiText("场景共创")}</h3>
      </div>

      <div ref={scrollRef} role="region" aria-label={uiText("场景共创聊天记录")} tabIndex={0} className="co-chat-history">
        {messages.length === 0 && (
          <section className="co-chat-welcome" aria-label={uiText("场景共创欢迎")}>
            <div className="co-chat-welcome-title">
              <img src="/logo.png" alt="OpenSparX" className="dark:invert" />
              <h2 className="type-panel">{uiText("想创造怎样的座舱体验？")}</h2>
            </div>
            <div className="co-chat-suggestions">
              {scenarioTemplates.map(tpl => <button key={tpl.title} type="button" disabled={isLoading || readingFile}
                onClick={() => { setInput(previous => previous.trim() ? `${previous}\n\n${uiText(tpl.prompt)}` : uiText(tpl.prompt)); inputRef.current?.focus(); }}>
                {uiText(tpl.title)}
              </button>)}
            </div>
          </section>
        )}
        {messages.map(renderMessage)}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div role="status" className="flex items-center gap-2 type-body text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span>{uiText("思考中...")}</span>
          </div>
        )}
      </div>

      <div className="co-chat-composer">
        <div className="co-chat-input-bar">
          <textarea
            ref={inputRef}
            aria-label={uiText("场景需求")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={uiText("描述体验或修改想法…")}
            className="co-chat-input"
            rows={1}
          />
          <div className="co-chat-composer-tools">
            <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" aria-label={uiText("选择需求文件")} className="sr-only" tabIndex={-1} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void addRequirementFile(file); }} />
            <button type="button" className="co-chat-add" aria-label={uiText("添加需求文件")} title={uiText("添加文字需求（.txt / .md）")} disabled={isLoading || readingFile} onClick={() => fileRef.current?.click()}>{readingFile ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none"/> : <Plus size={18}/>}</button>
            <AuthoringModelPicker providerId={providerId} model={model} reasoning={reasoning} disabled={isLoading} onChange={onModelChange} onAvailability={setModelReady} />
          <button
            onClick={handleSubmit}
            aria-label={uiText("发送场景需求")}
            disabled={!input.trim() || isLoading || readingFile || !modelReady}
            className="co-chat-send bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          </div>
        </div>
        {fileError && <p role="alert" className="co-chat-file-note text-destructive">{uiText(fileError)}</p>}
        {fileNotice && <p role="status" className="co-chat-file-note text-muted-foreground">{uiText(fileNotice)}</p>}
      </div>
    </div>
  );
}

export type { Message };
