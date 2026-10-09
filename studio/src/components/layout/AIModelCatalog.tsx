import { uiText, useUiLanguage  } from '@/i18n';
import { catalogModelNode } from '@/domain/catalogModelNode';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Box, ChevronLeft, ExternalLink, ImageOff, Plus, RefreshCw, Search, X, SlidersHorizontal } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { catalogLabel, chipsetLabel, emptyCatalogFilters, matchesQualcommModel, parseQualcommCatalog, type CatalogFilters, type QualcommCatalog, type QualcommModel } from '@/domain/qualcommCatalog';
import { capabilityName, capabilityPurpose, type Capability } from '@/domain/capabilityPresentation';
import { CapabilityDetails } from './CapabilityDetails';
import './ai-model-catalog.css';
import { CatalogToolbar, CatalogPagination } from './CatalogChrome';

type LocalItem = Capability & { origin: 'imported' | 'builtin'; nodeType?: string; nodeData?: Record<string, unknown> };
type Props = { localItems: LocalItem[]; localError: string; localLoading: boolean; onRetryLocal: () => void; onImport?: () => void;
  onAddToCanvas?: (spec: { type: string; label: string; data?: Record<string, unknown> }) => void; addDisabledReason?: string };
const PAGE_SIZE = 20;
function ModelCover({ model, detail = false }: { model?: QualcommModel; detail?: boolean }) {
  useUiLanguage();
  const [imageAttempt, setImageAttempt] = useState(0);
  const url = model?.image_url;
  useEffect(() => setImageAttempt(0), [url]);
  const preview = url ? `https://aihub.qualcomm.com/_next/image?url=${encodeURIComponent(url)}&w=${detail ? 640 : 384}&q=75` : '';
  return <span className={'ai-model-cover' + (!model ? ' is-local' : '')}>
    {url && imageAttempt < 2 ? <img src={imageAttempt === 0 ? preview : url} alt={uiText("{0} 官方应用场景", [model.name])} draggable={false} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageAttempt(v => v + 1)}/> : <span className="ai-model-cover-fallback">{model ? <ImageOff size={28}/> : <Box size={32}/>}<span>{uiText(model ? uiText("暂无场景预览") : 'OAKEgde Studio')}<small>{uiText(model ? catalogLabel(model.use_case) : uiText("已有模型与组件"))}</small></span></span>}
  </span>;
}
export function AIModelCatalog({ localItems, localError, localLoading, onRetryLocal, onImport, onAddToCanvas, addDisabledReason }: Props) {
  useUiLanguage();
  const [catalog, setCatalog] = useState<QualcommCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState('all');
  const [filters, setFilters] = useState<CatalogFilters>(emptyCatalogFilters);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(1);
  const dragFrame = useRef(0);
  const dragModel = (event: DragEvent, spec: { type: string; label: string; data?: Record<string, unknown> }) => {
    if (!spec.type || addDisabledReason) { event.preventDefault(); return; }
    event.dataTransfer.setData('application/reactflow', spec.type);
    event.dataTransfer.setData('application/reactflow-label', spec.label);
    event.dataTransfer.setData('application/reactflow-data', JSON.stringify(spec.data || {}));
    event.dataTransfer.effectAllowed = 'move';
    const panel = event.currentTarget.closest('.component-library-panel');
    dragFrame.current = requestAnimationFrame(() => panel?.classList.add('cl-dragging'));
  };
  const search = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let active = true;
    setLoading(true); setError('');
    fetch(apiUrl('/v1/catalog/qualcomm/catalog' + (revision ? '?refresh=true' : '')), { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : '高通目录加载失败。');
        return parseQualcommCatalog(body);
      }).then(data => { if (active) setCatalog(data); })
      .catch(err => { if (active) setError(controller.signal.aborted ? '高通目录请求超时，请重试。' : err instanceof Error ? err.message : '高通目录加载失败。'); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [revision]);
  useEffect(() => { if (selected) back.current?.focus(); }, [selected]);
  const change = (key: keyof CatalogFilters, value: string) => { setFilters(f => ({ ...f, [key]: value })); setSelected(''); setPage(1); };
  const reset = () => { setFilters(emptyCatalogFilters); setSource('all'); setSelected(''); setPage(1); };
  const hasFacets = !!(filters.domain || filters.useCase || filters.chipset || filters.runtime || filters.quantized);
  const activeCount = [filters.domain, filters.useCase, filters.chipset, filters.runtime, filters.quantized].filter(Boolean).length;
  const options = useMemo(() => {
    const entries = catalog?.items || [];
    const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
    return { domains: distinct(entries.map(m => m.domain)), useCases: distinct(entries.map(m => m.use_case)),
      chipsets: distinct(entries.flatMap(m => m.chipsets)), runtimes: distinct(entries.flatMap(m => m.runtimes)) };
  }, [catalog]);
  const local = source !== 'qualcomm' && !hasFacets ? localItems.filter(m => [capabilityName(m), m.name, capabilityPurpose(m), m.nodeData?.model, m.nodeData?.category].join(' ').toLowerCase().includes(filters.query.trim().toLowerCase())) : [];
  const remote = source !== 'local' ? (catalog?.items || []).filter(m => matchesQualcommModel(m, filters)) : [];
  const rows: ({ kind: 'local'; item: LocalItem } | { kind: 'qualcomm'; item: QualcommModel })[] = [
    ...local.map(item => ({ kind: 'local' as const, item })), ...remote.map(item => ({ kind: 'qualcomm' as const, item })),
  ];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const selectedRow = rows.find(row => row.kind + ':' + row.item.id === selected);
  const selectFilter = (label: string, key: keyof CatalogFilters, values: string[], format = catalogLabel) => <label>{uiText(label)}<select aria-label={uiText(label)} value={filters[key]} onChange={e => change(key, e.target.value)}><option value="">{uiText("全部")}</option>{values.map(v => <option key={v} value={v}>{uiText(format(v))}</option>)}</select></label>;
  const returnToList = () => { setSelected(''); requestAnimationFrame(() => search.current?.focus()); };
  return <section className="cl-main ai-model-catalog" aria-label={uiText("AI模型目录")}>
    <CatalogToolbar
      search={<label className="cl-search"><Search size={15}/><input ref={search} aria-label={uiText("搜索AI模型")} placeholder={uiText("搜索模型、用途或芯片")} value={filters.query} maxLength={200} onChange={e => change('query', e.target.value)}/>{filters.query && <button type="button" aria-label={uiText("清空模型搜索")} onClick={() => change('query', '')}><X size={15}/></button>}</label>}
      add={<button className="cl-icon-button cl-primary cl-import-trigger" aria-label={uiText("添加模型资料")} title={uiText("添加模型资料")} disabled={!onImport} onClick={onImport}><Plus size={16}/></button>}
      filters={<><select aria-label={uiText("模型来源")} value={source} onChange={e => { setSource(e.target.value); setFilters(f => ({ ...emptyCatalogFilters, query: f.query })); setPage(1); setSelected(''); }}><option value="all">{uiText("全部来源")}</option><option value="qualcomm">Qualcomm AI Hub</option><option value="local">{uiText("已有模型与组件")}</option></select>
        <button disabled={source === 'local'} className="cl-icon-button" aria-label={uiText("模型筛选条件")} title={uiText("筛选条件")} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><SlidersHorizontal size={16}/>{activeCount > 0 && <sup className="type-caption">{uiText(activeCount)}</sup>}</button></>}
      count={source === 'qualcomm' && !catalog || source === 'local' && localLoading || source === 'all' && !catalog && localLoading ? null : rows.length} loading={loading || localLoading} source={source === 'local' ? <span>OAKEgde Studio</span> : <a href="https://aihub.qualcomm.com/models" target="_blank" rel="noreferrer">Qualcomm AI Hub <ExternalLink size={12}/></a>}
      actions={source !== 'local' && <button className="cl-icon-button" aria-label={uiText(loading ? "正在同步高通目录" : "同步高通目录")} aria-busy={loading} title={uiText("同步当前发布版本的目录")} disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16}/></button>}
    />
    {expanded && source !== 'local' && <div className="ai-model-facets">
      {selectFilter(uiText("模型领域"), 'domain', options.domains)}{selectFilter(uiText("模型用途"), 'useCase', options.useCases)}
      {selectFilter(uiText("官方测评芯片"), 'chipset', options.chipsets, chipsetLabel)}{selectFilter(uiText("模型运行时"), 'runtime', options.runtimes)}
      <label>{uiText("量化版本")}<select aria-label={uiText("量化版本")} value={filters.quantized} onChange={e => change('quantized', e.target.value)}><option value="">{uiText("全部")}</option><option value="yes">{uiText("有量化版本")}</option><option value="no">{uiText("目录未列量化版本")}</option></select></label>
      <button className="cl-link" onClick={reset}>{uiText("重置筛选")}</button>
    </div>}
    {source !== 'local' && (error || catalog?.warning) && <p role="alert" className="ai-model-message">{uiText(error || catalog?.warning)}{uiText(error && catalog ? uiText(" 当前保留上次目录。") : '')}<button className="cl-link" disabled={loading} onClick={() => setRevision(v => v + 1)}>{uiText("重试")}</button></p>}
    {source !== 'qualcomm' && localError && <p role="alert" className="ai-model-message">{uiText(localError)}<button className="cl-link" onClick={onRetryLocal}>{uiText("重试已有模型")}</button></p>}
    <div className="ai-model-body" aria-busy={loading && source !== 'local'}>
      {selectedRow ? <section aria-label={uiText("模型详情")} className="ai-model-detail"><button ref={back} className="cl-back" onClick={returnToList}><ChevronLeft size={16}/>{uiText("返回模型目录")}</button>
        {selectedRow.kind === 'qualcomm' ? <>
          <ModelCover model={selectedRow.item} detail/><h3>{uiText(selectedRow.item.name)}</h3><p>{uiText(selectedRow.item.description || selectedRow.item.headline)}</p><p className="ai-model-id">{uiText(selectedRow.item.id)}</p><span className="ai-model-status">{uiText("高通目录 · 可编排 · 待部署")}</span>
          <dl><div><dt>{uiText("模型领域")}</dt><dd>{uiText(catalogLabel(selectedRow.item.domain))}</dd></div><div><dt>{uiText("用途")}</dt><dd>{uiText(catalogLabel(selectedRow.item.use_case))}</dd></div><div><dt>{uiText("量化版本")}</dt><dd>{uiText(selectedRow.item.has_quantized ? uiText("官方目录包含量化版本") : uiText("当前目录未列出量化版本"))}</dd></div><div><dt>{uiText("已发布运行时")}</dt><dd>{uiText(selectedRow.item.runtimes.map(catalogLabel).join('、') || uiText("未提供"))}</dd></div><div><dt>{uiText("官方测评芯片")}</dt><dd>{uiText(selectedRow.item.chipsets.map(chipsetLabel).join('、') || uiText("未提供"))}</dd></div></dl>
          <p>{uiText(addDisabledReason || uiText("可先拖入画布、连线并保存。模型尚未部署，接入运行服务后才能执行。"))}</p>
          <p>{uiText("芯片与运行时来自官方目录，具体组合和设备兼容性需进一步核验。")}</p>
          <p>{uiText("下载条件、模型许可与完整性能数据请查看官方说明。")}</p>
          <a className="cl-link ai-model-external" href={'https://aihub.qualcomm.com/models/' + selectedRow.item.id} target="_blank" rel="noreferrer">{uiText("查看高通模型详情")}<ExternalLink size={14}/></a>
        </> : <><h3>{uiText(capabilityName(selectedRow.item))}</h3><CapabilityDetails item={selectedRow.item} builtin={selectedRow.item.origin === 'builtin'}/><p>{uiText(!selectedRow.item.nodeType ? uiText("此资料尚未接入运行画布。") : addDisabledReason || uiText("可拖入画布配置，不会自动运行。"))}</p></>}
      </section> : <>
        {loading && !catalog && source !== 'local' && <p role="status" className="ai-model-message">{uiText("正在读取高通模型目录…")}</p>}
        {localLoading && source !== 'qualcomm' && <p role="status" className="ai-model-message">{uiText("正在读取已有模型…")}</p>}
        {!rows.length && !(loading && source !== 'local') && !(localLoading && source !== 'qualcomm') && <div className="cl-empty"><strong>{uiText(error && !catalog && source === 'qualcomm' ? uiText("目录暂不可用") : uiText("没有匹配的模型"))}</strong><p>{uiText("调整关键词、来源或筛选条件。")}</p><button className="cl-button" onClick={reset}>{uiText("重置筛选")}</button></div>}
        <ul className="ai-model-grid">{rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(row => <li key={row.kind + ':' + row.item.id} draggable={!addDisabledReason && (row.kind === 'qualcomm' || !!row.item.nodeType)} onDragStart={e => { dragModel(e, row.kind === 'qualcomm' ? catalogModelNode(row.item, catalog?.version || '') : { type: row.item.nodeType || '', label: capabilityName(row.item), data: row.item.nodeData }); }} onDragEnd={e => { cancelAnimationFrame(dragFrame.current); e.currentTarget.closest('.component-library-panel')?.classList.remove('cl-dragging'); }}>
          <button className="ai-model-card" title={uiText(addDisabledReason || uiText("拖入画布；点击查看详情；Alt+Enter 添加"))} aria-label={uiText("查看{0}模型详情", [row.kind === 'local' ? capabilityName(row.item) : row.item.name])} onKeyDown={event => {
            if (event.altKey && event.key === 'Enter' && !addDisabledReason && (row.kind === 'qualcomm' || row.item.nodeType)) {
              event.preventDefault(); onAddToCanvas?.(row.kind === 'qualcomm' ? catalogModelNode(row.item, catalog?.version || '') : {type: row.item.nodeType!, label: capabilityName(row.item), data: row.item.nodeData});
            }
          }} onClick={() => setSelected(row.kind + ':' + row.item.id)}>
            <ModelCover model={row.kind === 'qualcomm' ? row.item : undefined}/>
            <span className="ai-model-card-content"><strong>{uiText(row.kind === 'local' ? capabilityName(row.item) : row.item.name)}</strong>
              <span className="ai-model-summary">{uiText(row.kind === 'qualcomm' ? row.item.headline || `${catalogLabel(row.item.domain)} · ${catalogLabel(row.item.use_case)}` : capabilityPurpose(row.item))}</span>
              <span className="ai-model-card-tags"><span className="ai-model-use-case">{uiText(row.kind === 'qualcomm' ? catalogLabel(row.item.use_case) : uiText("已有模型"))}</span>{row.kind === 'qualcomm' && row.item.has_quantized && <span className="ai-model-quantized">{uiText("量化")}</span>}{row.kind === 'local' && <small>OAKEgde Studio</small>}</span>
            </span>
          </button>
        </li>)}</ul>
      </>}
    </div>
    {!selectedRow && <CatalogPagination className="model-catalog-pagination" page={currentPage} pages={pages} pageSize={PAGE_SIZE} previousDisabled={currentPage === 1} nextDisabled={currentPage === pages} onPrevious={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} previousLabel="上一页模型" nextLabel="下一页模型"/>}
  </section>;
}
