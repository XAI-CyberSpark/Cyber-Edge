import { uiText, useUiLanguage } from '@/i18n';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Plug, ChevronRight, Search, Globe, X, Cloud, Eye, Plus } from 'lucide-react';
import { mcpCategories, mcpCategoryName, type McpCatalogEntry, type McpCatalogPage, type McpCategoryCounts, type McpCanvasProps, mcpNodeSpec } from '@/data/mcpCatalog';
import { apiUrl } from '@/lib/api';
import './mcp-catalog.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CategoryLabel } from './CategoryLabel';
import { CatalogToolbar, CatalogPagination } from './CatalogChrome';

async function readCatalog<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(`/v1/mcp/${path}`), { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : '目录加载失败，请稍后重试。');
  }
  return response.json();
}

export function McpCategoryNav({ category, onSelect }: { category: string; onSelect: (value: string) => void }) {
  useUiLanguage();
  const [expanded, setExpanded] = useState(false);
  const [counts, setCounts] = useState<McpCategoryCounts | null>(null);
  const active = category === 'MCP' || category.startsWith('MCP:');
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    readCatalog<McpCategoryCounts>('categories', controller.signal).then(value => {
      if (!controller.signal.aborted) setCounts(value);
    }).catch(() => {}); // Missing counts remain unknown; browsing has its own error and retry state.
    return () => controller.abort();
  }, [expanded]);
  return <div className="cl-mcp-nav"><div className={`cl-mcp-parent ${active ? 'is-current' : ''}`}>
    <button className={category === 'MCP' ? 'is-active' : ''} aria-pressed={category === 'MCP'} onClick={() => { setExpanded(true); onSelect('MCP'); }}><Plug size={16}/><CategoryLabel>MCP</CategoryLabel>{counts?.total != null && <small>{uiText(counts.total.toLocaleString())}</small>}</button>
  </div>{expanded && <div id="mcp-subcategories" className="cl-mcp-children">{mcpCategories.map(({ id, name }) => {
    const count = counts?.categories.find(c => c.id === id)?.count;
    return <button key={id} className={category === `MCP:${id}` ? 'is-active' : ''} aria-pressed={category === `MCP:${id}`} onClick={() => onSelect(`MCP:${id}`)}><CategoryLabel>{uiText(name)}</CategoryLabel>{count != null && <small>{uiText(count.toLocaleString())}</small>}</button>;
  })}</div>}</div>;
}

function McpServiceIcon({ item }: { item: McpCatalogEntry }) {
  useUiLanguage();
  const [failed, setFailed] = useState(false);
  return <span className="cl-mcp-service-icon" aria-hidden="true">{item.logo_url && !failed ? <img src={item.logo_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <Plug size={28}/>}</span>;
}

function McpDetail({ item, onClose, onAddToCanvas, addDisabledReason }: { item: McpCatalogEntry; onClose: () => void } & McpCanvasProps) {
  useUiLanguage();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeButton.current?.focus(); }, []);
  const [detail, setDetail] = useState<McpCatalogEntry | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setDetail(null);
    readCatalog<McpCatalogEntry>(`detail?${new URLSearchParams({ server_id: item.id })}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDetail(value); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [item.id, retry]);
  return <section className="cl-detail-panel cl-mcp-detail" aria-label={uiText("{0}服务详情", [item.name])}>
    <div className="cl-detail-heading"><div><strong>{uiText(item.name)}</strong><p>{uiText("提供方：")}{uiText(detail?.provider || item.provider || uiText("未提供"))}</p></div><button className="cl-icon-button" aria-label={uiText("收起MCP详情")} ref={closeButton} onClick={onClose}><X size={16}/></button></div>
    {error ? <p role="alert">{uiText(error)} <button className="cl-mcp-detail-link" onClick={() => setRetry(n => n + 1)}>{uiText("重试详情")}</button></p> : !detail ? <p role="status">{uiText("正在读取服务详情…")}</p> : <>
      <p>{uiText(detail.description || uiText("提供方暂未填写服务简介。"))}</p>
      <div className="cl-mcp-tools">{detail.categories.map(tag => <span key={tag}>{uiText(mcpCategoryName(tag))}</span>)}{detail.is_hosted === true && <span>{uiText("支持云端托管")}</span>}</div>
      <section className="cl-mcp-section"><h3>{uiText("运行准备")}</h3>
        {detail.installation ? <>
          <span className="cl-mcp-ready type-tag">{uiText(detail.installation.status === 'installed' ? "已安装 · Run 时连接" : "首次 Run 自动安装")}</span>
          <p>{uiText("拖入画布并连接输入，Run 时在运行主机的独立环境准备服务，后续运行复用。")}</p>
          <p className="type-caption text-muted-foreground">{detail.installation.package} · {detail.installation.version}</p>
          <p className="type-caption text-muted-foreground">{uiText(detail.installation.usage_note || "请根据服务说明配置运行参数。")}</p>
          <McpDragItem className="cl-mcp-add" item={detail} onAddToCanvas={onAddToCanvas} addDisabledReason={addDisabledReason} showParameters/>
        </> : <><p>{uiText("尚未封装安装配方，暂不能添加到画布。")}</p>{!!detail.installation_methods?.length && <p className="type-caption">{uiText("提供方安装方式：")}{detail.installation_methods.join(' / ')}</p>}</>}
        {!!detail.configuration_fields?.length && <dl className="cl-mcp-fields">{detail.configuration_fields.map(field => <div key={field.name}><dt className="type-code">{field.name} {field.required && <span className="type-tag">{uiText("必填")}</span>}</dt><dd>{field.description || uiText("服务凭证或运行配置")}</dd></div>)}</dl>}
      </section>

      <details className="cl-mcp-section" open={!detail.installation}><summary>{uiText("完整说明")}</summary><div className="cl-mcp-readme"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a: ({children}) => <span>{children}</span>, img: ({alt}) => <span>{alt}</span>}}>{detail.readme || uiText("提供方暂未提供详细说明。")}</ReactMarkdown></div>{detail.readme_truncated && <p role="status">{uiText("说明超过展示上限，当前显示前120000字符。")}</p>}</details>
    </>}
    <p className="type-caption text-muted-foreground">{uiText("资料来源：魔搭社区 · 提供方原文")}</p>
  </section>;
}

export function McpCatalogPanel({ category, onImport, onCategoryChange, ...canvas }: { category: string; onImport: () => void; onCategoryChange?: (value: string) => void } & McpCanvasProps) {
  useUiLanguage();
  return <CatalogResults category={category} onImport={onImport} onCategoryChange={onCategoryChange} {...canvas}/>;
}
function CatalogResults({ category, onImport, onCategoryChange, ...canvas }: { category: string; onImport: () => void; onCategoryChange?: (value: string) => void } & McpCanvasProps) {
  useUiLanguage();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<McpCatalogPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<McpCatalogEntry | null>(null);
  const group = category.startsWith('MCP:') ? category.slice(4) : '';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null); setSelected(null);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ category: group, q: query.trim(), page: String(page) });
      readCatalog<McpCatalogPage>(`catalog?${params}`, controller.signal)
        .then(value => { if (!controller.signal.aborted) setResult(value); })
        .catch(err => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [group, query, page, retry]);
  const search = (value: string) => { setQuery(value); setPage(1); setSelected(null); };
  const lastTitle = useRef<HTMLButtonElement | null>(null);
  const select = (item: McpCatalogEntry, target: HTMLButtonElement) => { lastTitle.current = target; setSelected(item); };
  const closeDetail = () => { setSelected(null); requestAnimationFrame(() => lastTitle.current?.focus()); };
  return <section className="cl-main cl-mcp-main" aria-label={uiText("MCP服务目录")}>
    <CatalogToolbar
      search={<label className="cl-search"><Search size={15}/><input aria-label={uiText("搜索MCP服务")} maxLength={200} placeholder={uiText("搜索 MCP 名称或开发者…")} value={query} onChange={e => search(e.target.value)}/>{query && <button type="button" aria-label={uiText("清空MCP搜索")} onClick={() => search('')}><X size={15}/></button>}</label>}
      add={<button className="cl-icon-button cl-primary cl-import-trigger" aria-label={uiText("导入资料")} title={uiText("导入资料")} onClick={onImport}><Plus size={16}/></button>}
      filters={<select aria-label={uiText("MCP服务分类")} value={category} onChange={e => { search(''); onCategoryChange?.(e.target.value); }}><option value="MCP">{uiText("全部 MCP 服务")}</option>{mcpCategories.map(({id, name}) => <option key={id} value={`MCP:${id}`}>{uiText(name)}</option>)}</select>}
      count={result?.total ?? null} loading={loading} source={<span>{uiText("魔搭社区")}</span>}
    />
    <div className="cl-mcp-scroll" hidden={!!selected} key={`${page}:${query}`} aria-busy={loading}>
      {loading ? <div className="cl-empty" role="status"><Cloud size={28}/><strong>{uiText("正在读取魔搭目录…")}</strong></div> : error ? <div className="cl-empty" role="alert"><Globe size={28}/><strong>{uiText("暂时无法加载 MCP 目录")}</strong><p>{uiText(error)}</p><button className="cl-button" onClick={() => setRetry(n => n + 1)}>{uiText("重新加载")}</button></div> : result?.items.length ? <div className="cl-mcp-grid">{result.items.map(item => <McpDragItem className={`cl-mcp-card ${selected?.id === item.id ? 'is-selected' : ''}`} key={item.id} item={item} {...canvas}>
        <div className="cl-mcp-card-top"><button className="cl-mcp-card-title" aria-label={uiText("查看{0}服务详情", [item.name])} aria-expanded={selected?.id === item.id} onClick={e => select(item, e.currentTarget)}>{uiText(item.name)}</button>{item.is_hosted === true && <span className="cl-mcp-cloud"><Cloud size={12}/>Hosted</span>}</div>
        <McpServiceIcon item={item}/>
        <div className="cl-mcp-tags">{item.categories.slice(0, 2).map(tag => <span key={tag}>{uiText(mcpCategoryName(tag))}</span>)}</div>
        <p className="cl-mcp-description">{uiText(item.description || uiText("提供方暂未填写服务简介，点击查看详情。"))}</p>
        <div className="cl-mcp-card-bottom"><span title={uiText("提供方：{0}", [item.provider])}>{uiText(item.provider || uiText("未提供开发者"))}</span>{item.view_count != null && <span className="cl-mcp-views"><Eye size={12}/>{uiText(item.view_count.toLocaleString())}</span>}<button className="cl-mcp-detail-link" onClick={e => select(item, e.currentTarget)} aria-label={uiText("了解{0}", [item.name])}>{uiText("详情")}<ChevronRight size={13}/></button></div>
      </McpDragItem>)}</div> : <div className="cl-empty"><Search size={28}/><strong>{uiText("没有找到匹配的 MCP 服务")}</strong><p>{uiText("试试其他名称或分类。")}</p>{query && <button className="cl-button" onClick={() => search('')}>{uiText("清空搜索")}</button>}</div>}
    </div>
    {selected && <McpDetail key={selected.id} item={selected} onClose={closeDetail} {...canvas}/>}
    {!selected && <CatalogPagination page={page} pageSize={result?.page_size} pages={result ? Math.max(1, Math.ceil(Math.min(result.total, result.max_results) / result.page_size)) : undefined}
      previousDisabled={loading || page <= 1} nextDisabled={loading || !result?.has_next}
      onPrevious={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} previousLabel="上一页MCP服务" nextLabel="下一页MCP服务"
      note={result && result.total > result.max_results ? uiText("每次查询最多浏览前 {0} 项，可通过搜索缩小范围", [result.max_results]) : undefined}/>}
  </section>;
}

function McpDragItem({item, onAddToCanvas, addDisabledReason, showParameters = false, children, className}: {item: McpCatalogEntry; showParameters?: boolean; children?: ReactNode; className: string} & McpCanvasProps) {
  const selectId = useId();
  const [toolName, setToolName] = useState(item.installation?.tools[0]?.name);
  const tool = item.installation?.tools.find(value => value.name === toolName) ?? item.installation?.tools[0];
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const spec = mcpNodeSpec(item, tool);
  const canDrag = !!spec && !addDisabledReason;
  return <div className={className} draggable={canDrag} tabIndex={canDrag ? 0 : undefined}
    aria-label={canDrag ? uiText("拖入{0}", [item.name]) : undefined}
    title={uiText(addDisabledReason || (spec ? "拖入画布；Alt+Enter 添加" : "尚未封装安装配方，暂不能添加到画布。"))}
    onKeyDown={event => {
      if (event.altKey && event.key === 'Enter' && canDrag && spec && !(event.target as HTMLElement).closest('select,input,textarea')) {
        event.preventDefault(); event.stopPropagation(); onAddToCanvas?.(spec);
      }
    }}
    onDragStart={event => {
      if (!canDrag || !spec || (event.target as HTMLElement).closest('select,input,textarea')) { event.preventDefault(); return; }
      event.dataTransfer.setData('application/reactflow', spec.type);
      event.dataTransfer.setData('application/reactflow-label', spec.label);
      event.dataTransfer.setData('application/reactflow-data', JSON.stringify(spec.data));
      event.dataTransfer.effectAllowed = 'move';
      const panel = event.currentTarget.closest('.component-library-panel');
      frame.current = requestAnimationFrame(() => panel?.classList.add('cl-dragging'));
    }} onDragEnd={event => {cancelAnimationFrame(frame.current); event.currentTarget.closest('.component-library-panel')?.classList.remove('cl-dragging');}}>
    {children}
    {item.installation && item.installation.tools.length > 1 && <label className="cl-mcp-tool-picker type-label" htmlFor={selectId}>{uiText("选择工具")}
      <select id={selectId} value={tool?.name} onChange={event => setToolName(event.target.value)} disabled={!!addDisabledReason}>
        {item.installation.tools.map(value => <option key={value.name} value={value.name}>{uiText(value.title || value.name)}</option>)}
      </select>
    </label>}
    {spec && <span className="cl-mcp-drag-status type-caption">{uiText(addDisabledReason || (item.installation?.status === 'installed' ? "可拖入 · 已安装" : "可拖入 · 首次 Run 安装"))}</span>}
    {showParameters && tool && <section className="cl-mcp-section"><h3>{uiText("工具与参数")} <code>{tool.name}</code></h3><dl className="cl-mcp-fields">{tool.parameters.map(parameter => <div key={parameter.name}><dt><code>{parameter.name}</code><span className="type-tag">{uiText(parameter.required ? "必填" : "可选")}</span></dt><dd>{uiText(parameter.description)}{parameter.default !== undefined && <span className="type-caption"> · {uiText("默认值：")}{String(parameter.default)}</span>}</dd></div>)}</dl></section>}
  </div>;
}
