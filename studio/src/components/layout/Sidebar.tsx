import { uiText, useUiLanguage  } from '@/i18n';
import './catalog-cards.css';
import { AppIcon } from '@/components/ui/AppIcon';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Folder, Plus, Search, FileText, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { apiUrl } from '@/lib/api';
import { normalizeModelCatalog, type CatalogModel } from '@/domain/modelCatalog';
import catalog from '@/data/nodeCapabilities.json';
import './component-library.css';
import { McpCatalogPanel } from './McpCatalogPanel';
import { groupCapabilities } from '@/domain/capabilityTree';
import { AIModelCatalog } from './AIModelCatalog';
import { CatalogToolbar } from './CatalogChrome';
import { CapabilityDetails } from './CapabilityDetails';
import { capabilityName, capabilityPurpose, capabilityGroup, type Capability } from '@/domain/capabilityPresentation';

type ImportRecord = { id: string; filename: string; items: Capability[]; warnings: string[]; used_ai: boolean };
type LibraryItem = Capability & { origin: 'imported' | 'builtin'; nodeType?: string; nodeData?: Record<string, unknown> };
const builtinGroup: Record<string, string> = { systemInput: '车辆状态', car_control: '车控动作', input: '座舱交互', output: '座舱交互', cockpit_alert: '座舱交互', video_display: '座舱交互', fallback: '座舱交互', recognition: '编排基础' };
const builtinDefaults: Record<string, Record<string, unknown>> = {
  wait:{eventName:'message',match:'any'}, state:{values:{},increments:{}}, stage:{collapsed:false},
  systemInput: { inputType: 'weather' }, video_display: { source: 'local_replay' },
  logic: { type: 'if', condition: '' }, memory: { type: 'buffer', window: 10 },
};
const baseItem = { interface: '', permissions: '', conditions: '', platform: 'OAKEgde Studio', version: '', evidence: '', missing: [], verification: '按场景验证' };
const builtins: LibraryItem[] = Object.entries(catalog.nodes).filter(([type]) => type !== 'llm' && type !== 'tts').map(([type, spec]) => ({
  ...baseItem, id: `builtin-${type}`, name: spec.name, description: spec.description, category: builtinGroup[type] || '编排基础',
  summary: 'summary' in spec ? spec.summary : undefined,
  inputs: spec.inputs, outputs: spec.outputs, source: '内置组件', origin: 'builtin', invocation: spec.source,
  nodeType: type, nodeData: builtinDefaults[type] || {},
}));
async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `请求未完成（${response.status}），请重试。`);
  return body;
}
function ImportDialog({ open, onClose, onImported, modelsOnly = false }: { open: boolean; onClose: () => void; onImported: (record: ImportRecord) => void; modelsOnly?: boolean }) {
  useUiLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('');
  const [version, setVersion] = useState('');
  const [allowAI, setAllowAI] = useState(false);
  const [recognizer, setRecognizer] = useState<{ model: string; provider: string; configured: boolean } | null>(null);
  const [preview, setPreview] = useState<ImportRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const request = useRef<AbortController | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(apiUrl('/v1/capabilities/recognizer'), { signal: controller.signal }).then(readResponse).then(setRecognizer).catch(() => setRecognizer(null));
    return () => { controller.abort(); request.current?.abort(); };
  }, [open]);
  const close = () => { request.current?.abort(); onClose(); };
  const identify = async () => {
    const source = file || new File([text], text.trim().startsWith('{') ? '粘贴资料.json' : '粘贴资料.txt', { type: 'text/plain' });
    if (source.size > 8 * 1024 * 1024) { setError('文件超过 8 MB，请拆分后导入。'); return; }
    setBusy('正在识别资料…'); setError('');
    const controller = new AbortController(); request.current = controller;
    const body = new FormData(); body.append('file', source); body.append('platform', platform); body.append('version', version); body.append('allow_ai', String(allowAI));
    try {
      const result: ImportRecord = await readResponse(await fetch(apiUrl('/v1/capabilities/preview'), { method: 'POST', body, signal: controller.signal }));
      if (!controller.signal.aborted) { const visible = modelsOnly ? { ...result, items: result.items.filter(item => item.category === 'AI模型') } : result; setPreview(visible); setSelected(new Set(visible.items.map(item => item.id))); }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '识别失败，请重试。'); }
    finally { if (!controller.signal.aborted) setBusy(''); }
  };
  const confirm = async () => {
    if (!preview) return;
    setBusy('正在保存…'); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await readResponse(await fetch(apiUrl(`/v1/capabilities/${preview.id}/confirm`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected_ids: [...selected] }), signal: controller.signal }));
      if (!controller.signal.aborted) onImported(result);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { if (!controller.signal.aborted) setBusy(''); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
    <DialogContent className="cl-import-dialog">
      <DialogTitle>{uiText(preview ? uiText("确认识别结果") : uiText(modelsOnly ? "添加模型资料" : "导入资料"))}</DialogTitle>
      <DialogDescription>{uiText(preview ? uiText("从 {0} 识别出 {1} 项候选能力。请核对后入库。", [preview.filename, preview.items.length]) : uiText(modelsOnly ? "导入模型说明，核对后加入模型库；接入运行服务后可执行。" : "导入接口说明或 SDK 配套资料，整理为可查阅的能力与组件。"))}</DialogDescription>
      <div className="cl-import-body">
        {!preview ? <>
          <input ref={upload} type="file" className="sr-only" aria-label={uiText("选择接口资料")} accept=".xlsx,.pdf,.docx,.md,.txt,.json,.yaml,.yml,.zip,.csv,.h,.aidl,.proto" onChange={event => { const next = event.target.files?.[0]; if (next) { setFile(next); setText(''); setError(''); } }} />
          <button className="cl-upload" disabled={!!busy} onClick={() => upload.current?.click()}><Upload size={24} /><strong>{uiText(file ? file.name : uiText("选择资料文件"))}</strong><span>{uiText("Excel、PDF、Word、Markdown、JSON、YAML 或 ZIP · 最大 8 MB")}</span></button>
          {file ? <button className="cl-link" disabled={!!busy} onClick={() => { setFile(null); if (upload.current) upload.current.value = ''; }}>{uiText("移除文件，改为粘贴说明")}</button> : <label className="cl-field">{uiText("或粘贴接口说明")}<textarea rows={4} value={text} disabled={!!busy} onChange={e => setText(e.target.value)} placeholder={uiText("粘贴接口用途、调用方法、输入参数和返回结果…")} /></label>}
          <div className="cl-two-fields"><label className="cl-field">{uiText("适用车型 / 平台（选填）")}<input value={platform} maxLength={200} disabled={!!busy} onChange={e => setPlatform(e.target.value)} placeholder={uiText("例如：座舱开发平台")} /></label><label className="cl-field">{uiText("资料版本（选填）")}<input value={version} maxLength={100} disabled={!!busy} onChange={e => setVersion(e.target.value)} placeholder={uiText("例如：SDK 1.2")} /></label></div>
          <label className="cl-consent"><input type="checkbox" checked={allowAI} disabled={!!busy || !recognizer?.configured} onChange={e => setAllowAI(e.target.checked)} /><span>{uiText("使用当前编排模型识别文档")}<span className="cl-subtle">{uiText(recognizer?.configured ? uiText("文档文字将发送至 {0}（{1}）。", [recognizer.provider, recognizer.model]) : uiText("识别模型未配置或暂不可用。"))}{uiText("Excel 接口清单、OpenAPI / 能力清单 JSON 可直接解析，无需发送给模型。")}</span></span></label>
          <p className="cl-subtle">{uiText("ZIP 仅读取其中的说明资料，不运行 SDK 程序。扫描版 PDF 需先转为可复制文字。")}</p>
        </> : <>
          <div className="cl-preview-summary"><label><input type="checkbox" checked={selected.size === preview.items.length} onChange={e => setSelected(new Set(e.target.checked ? preview.items.map(item => item.id) : []))} disabled={!!busy} />{uiText("全选 · 已选")}{uiText(selected.size)} {uiText("项")}</label><span>{uiText("实际调用：未接入")}</span></div>
          {modelsOnly && preview.items.length === 0 && <p role="status" className="cl-subtle">{uiText("未识别到模型资料，请返回修改说明或上传模型能力清单。")}</p>}
          <div className="cl-preview-list">{preview.items.map(item => <div className="cl-preview-item" key={item.id}><div><label><input type="checkbox" aria-label={uiText("选择{0}", [item.name])} checked={selected.has(item.id)} disabled={!!busy} onChange={e => setSelected(previous => { const next = new Set(previous); if (e.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /><strong>{uiText(item.name)}</strong></label><button className="cl-link" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? '' : item.id)}>{uiText("查看依据")}</button></div><p className="cl-subtle">{uiText(item.category)} · {uiText(item.missing.length ? uiText("{0} 项信息待补充", [item.missing.length]) : uiText("字段已提取，待核对"))}</p>{expanded === item.id && <CapabilityDetails item={item} />}</div>)}</div>
          {preview.warnings.length > 0 && <details><summary>{uiText("资料读取提示（")}{uiText(preview.warnings.length)}）</summary>{preview.warnings.map((note, index) => <p className="cl-subtle" key={index}>{uiText(note)}</p>)}</details>}
          <p className="cl-subtle">{uiText("确认后保存到组件库。资料识别不代表已接入车机，也不证明接口可以执行。")}</p>
        </>}
        {error && <p className="cl-error" role="alert">{uiText(error)}</p>}
        {busy && <p role="status" className="cl-subtle">{uiText(busy)} {uiText("资料较多时可能需要几分钟；关闭窗口可取消等待，结果不会自动入库。")}</p>}
      </div>
      <div className="cl-dialog-actions"><button className="cl-button" onClick={close}>{uiText("取消")}</button>{preview && <button className="cl-button" disabled={!!busy} onClick={() => { setPreview(null); setError(''); }}>{uiText("返回修改")}</button>}<button className="cl-button cl-primary" disabled={!!busy || (preview ? selected.size === 0 : !file && !text.trim())} onClick={() => void (preview ? confirm() : identify())}><AppIcon name={busy ? 'loader-circle' : preview ? 'check' : 'search'} spinning={!!busy} size={15} />{uiText(preview ? uiText("确认入库（{0}）", [selected.size]) : uiText("识别能力"))}</button></div>
    </DialogContent>
  </Dialog>;
}
export const Sidebar = ({ onAddToCanvas, addDisabledReason, view = 'components' }: { view?: 'components' | 'models' | 'mcp'; compact?: boolean; onAddToCanvas?: (spec: {type: string; label: string; data?: Record<string, unknown>}) => void; addDisabledReason?: string }) => {
  useUiLanguage();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modelError, setModelError] = useState('');
  const [revision, setRevision] = useState(0);
  const [category, setCategory] = useState(view === 'mcp' ? 'MCP' : '全部组件');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const lastItem = useRef('');
  const toggleGroup = (key: string) => setExpandedGroups(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState('all');
  const [selected, setSelected] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const dragFrame = useRef(0);
  const backButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selected) backButton.current?.focus(); }, [selected]);
  useEffect(() => {
    if (view === 'mcp') { setLoading(false); return; }
    const controller = new AbortController(); let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError(''); setModelError('');
    Promise.allSettled([
      fetch(apiUrl('/v1/capabilities'), { signal: controller.signal }).then(readResponse).then(data => { if (active) setImports(data.imports); }).catch(e => { if (active) setError(controller.signal.aborted ? '组件库请求超时，请刷新重试。' : e.message); }),
      view === 'models' ? fetch(apiUrl('/v1/models'), { signal: controller.signal }).then(readResponse).then(data => { if (active) setModels(normalizeModelCatalog(data)); }).catch(() => { if (active) setModelError('模型目录暂不可用，请刷新重试。'); }) : Promise.resolve(),
    ]).finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [revision, view]);
  const items = useMemo<LibraryItem[]>(() => [
    ...imports.flatMap(record => record.items.map(item => ({ ...item, import_id: record.id, source: item.source.startsWith(record.filename) ? item.source : `${record.filename} / ${item.source}`, origin: 'imported' as const }))),
    ...builtins,
    ...models.map(model => ({ ...baseItem, id: `model-${model.id}`, name: model.name, description: `已注册模型 · ${model.category}`, category: 'AI模型', inputs: '依模型配置', outputs: '模型结果', source: '模型注册表', origin: 'builtin' as const, invocation: '待运行验证', nodeType: 'llm', nodeData: { category: model.category, model: model.id } })),
  ], [imports, models]);
  const scoped = items.filter(item => item.category !== 'AI模型' && (origin === 'all' || item.origin === origin));
  const searched = scoped.filter(item => (category === '全部组件' || item.category === category) && `${capabilityName(item)} ${capabilityPurpose(item)} ${item.name} ${item.source} ${item.interface} ${item.source_group || ''} ${item.source_category || ''}`.toLowerCase().includes(query.toLowerCase()));
  const filtered = searched.sort((a,b) => Number(capabilityName(b).toLowerCase().includes(query.toLowerCase())) - Number(capabilityName(a).toLowerCase().includes(query.toLowerCase())));
  const tree = useMemo(() => groupCapabilities(filtered), [filtered]);
  const selectedItem = items.find(item => item.id === selected);
  // Backend binding responses omit derived fields (import_id/origin/source prefix); the `items` memo re-derives them from the record.
  const updateImportedItem = (next: Capability) => setImports(previous => previous.map(record => ({ ...record, items: record.items.map(item => item.id === next.id ? next : item) })));
  const drag = (event: DragEvent, item: LibraryItem) => {
    if (!item.nodeType || addDisabledReason) { event.preventDefault(); return; }
    event.dataTransfer.setData('application/reactflow', item.nodeType);
    event.dataTransfer.setData('application/reactflow-label', item.name);
    event.dataTransfer.setData('application/reactflow-data', JSON.stringify(item.nodeData || {}));
    event.dataTransfer.effectAllowed = 'move';
    const panel = event.currentTarget.closest('.component-library-panel');
    dragFrame.current = requestAnimationFrame(() => panel?.classList.add('cl-dragging'));
  };
  if (view === 'models') return <aside className="cl-library cl-model-library" aria-label={uiText("模型管理")}>
    <AIModelCatalog localItems={items.filter(item => item.category === 'AI模型')} localError={modelError || error} localLoading={loading} onRetryLocal={() => setRevision(v => v + 1)} onImport={() => setImportOpen(true)} onAddToCanvas={onAddToCanvas} addDisabledReason={addDisabledReason} />
    {notice && <p role="status" className="cl-notice">{uiText(notice)}</p>}
    {importOpen && <ImportDialog open modelsOnly onClose={() => setImportOpen(false)} onImported={record => { setImports(previous => [record, ...previous.filter(item => item.id !== record.id)]); setImportOpen(false); setNotice(uiText("已添加 {0} 项模型资料，接入运行服务后可执行。", [record.items.filter(item => item.category === 'AI模型').length])); }}/>}
  </aside>;

  if (view === 'mcp') return <aside className="cl-library cl-mcp-library" aria-label={uiText("MCP管理")}>
    <McpCatalogPanel category={category} onCategoryChange={setCategory} onAddToCanvas={onAddToCanvas} addDisabledReason={addDisabledReason} onImport={() => setImportOpen(true)} />
    {notice && <p role="status" className="cl-notice">{uiText(notice)}</p>}
    {importOpen && <ImportDialog open onClose={() => setImportOpen(false)} onImported={record => { setImportOpen(false); setNotice(`已入库 ${record.items.length} 项能力，可在组件库的导入资料中查看。`); }}/>} 
  </aside>;

  return <aside className="cl-library cl-hierarchical" aria-label={uiText("组件管理")}>
    <div className="cl-main">
      <CatalogToolbar
        search={<label className="cl-search"><Search size={15}/><input ref={searchInput} aria-label={uiText("搜索组件")} value={query} onChange={e => { setQuery(e.target.value); setSelected(''); }} placeholder={uiText("搜索能力或功能分组")}/>{query && <button type="button" aria-label={uiText("清空组件搜索")} onClick={() => { setQuery(''); setSelected(''); }}><X size={15}/></button>}</label>}
        add={<button className="cl-icon-button cl-primary cl-import-trigger" aria-label={uiText("导入资料")} title={uiText("导入资料")} onClick={() => setImportOpen(true)}><Plus size={16}/></button>}
        filters={<select aria-label={uiText("组件来源")} value={origin} onChange={e => { setOrigin(e.target.value); setSelected(''); }}><option value="all">{uiText("全部来源")}</option><option value="imported">{uiText("导入资料")}</option><option value="builtin">{uiText("内置组件")}</option></select>}
        count={loading ? null : filtered.length} loading={loading}
        source={<span>{uiText(origin === 'imported' ? "导入资料" : origin === 'builtin' ? "内置组件" : "OAKEgde Studio")}</span>}
      />
      {notice && <div role="status" className="cl-notice">{uiText(notice)}<button aria-label={uiText("关闭导入提示")} onClick={() => setNotice('')}><X size={14} /></button></div>}
      {error && <p role="alert" className="cl-error">{uiText(error)}<button className="cl-link" onClick={() => setRevision(v => v + 1)}>{uiText("重新加载")}</button></p>}
      <div className="cl-list-scroll" hidden={!!selectedItem}>
        {loading && <p role="status" className="cl-loading">{uiText("正在加载组件库…")}</p>}
        {!loading && filtered.length === 0 ? <div className="cl-empty"><FileText size={30}/><strong>{uiText(query ? uiText("没有找到匹配的组件") : uiText("还没有这类能力"))}</strong><p>{uiText("调整关键词或来源，也可以导入接口资料。")}</p><button className="cl-button" onClick={() => setImportOpen(true)}><Plus size={15}/>{uiText("导入资料")}</button></div> :
          <ul className="cl-tree" aria-label={uiText("能力层级目录")}>{tree.map(branch => {
            const branchKey = JSON.stringify([branch.name]);
            const open = !!query.trim() || expandedGroups.has(branchKey);
            return <li key={branchKey}>
              <button className="cl-tree-folder cl-tree-root" aria-label={uiText(branch.name)} aria-expanded={open} onClick={() => toggleGroup(branchKey)}><ChevronRight size={15} className={open ? 'is-open' : ''}/><Folder size={17}/><span>{uiText(branch.name)}</span><small>{uiText(branch.count)}</small></button>
              {open && <ul>{branch.groups.map(group => {
                const groupKey = JSON.stringify([branch.name, group.name]);
                const groupOpen = !!query.trim() || expandedGroups.has(groupKey);
                return <li key={groupKey}>
                  <button className="cl-tree-folder" aria-label={`${uiText(branch.name)} / ${uiText(group.name)}`} aria-expanded={groupOpen} onClick={() => toggleGroup(groupKey)}><ChevronRight size={14} className={groupOpen ? 'is-open' : ''}/><span>{uiText(group.name)}</span><small>{uiText(group.items.length)}</small></button>
                  {groupOpen && <ul>{group.items.map(item => <li key={item.id}>
                    <button className="cl-tree-item" draggable={!!item.nodeType && !addDisabledReason} onDragStart={e => drag(e, item)} onDragEnd={e => { cancelAnimationFrame(dragFrame.current); e.currentTarget.closest('.component-library-panel')?.classList.remove('cl-dragging'); }} onClick={() => { lastItem.current = item.id; setSelected(item.id); }} data-capability-id={item.id} title={uiText(capabilityName(item))}><span>{uiText(capabilityName(item))}</span><ChevronRight size={14}/></button>
                  </li>)}</ul>}
                </li>;
              })}</ul>}
            </li>;
          })}</ul>}
      </div>
      {selectedItem && <section className="cl-detail-panel" aria-label={uiText("{0}详情", [capabilityName(selectedItem)])}><div className="cl-detail-heading"><strong>{uiText(capabilityName(selectedItem))}</strong><button ref={backButton} type="button" className="cl-back" aria-label={uiText("返回组件列表")} title={uiText("返回组件列表")} onClick={() => { setSelected(''); requestAnimationFrame(() => { const leaf = [...document.querySelectorAll<HTMLButtonElement>('[data-capability-id]')].find(el => el.dataset.capabilityId === lastItem.current); (leaf || searchInput.current)?.focus(); }); }}><ChevronLeft size={16} aria-hidden="true"/></button><p>{uiText(selectedItem.category)} / {uiText(capabilityGroup(selectedItem))} · {uiText(selectedItem.origin === 'imported' ? uiText(selectedItem.binding_status?.state || selectedItem.invocation || "待接入服务") : selectedItem.invocation)}</p></div><CapabilityDetails key={selectedItem.id} item={selectedItem} builtin={selectedItem.origin === 'builtin'} onUpdate={updateImportedItem}/></section>}
      {selectedItem && <div className="cl-add-actions"><button className="cl-button cl-primary" disabled={!selectedItem.nodeType || !onAddToCanvas || !!addDisabledReason} aria-describedby="cl-add-help" onClick={() => { if (selectedItem.nodeType && onAddToCanvas && !addDisabledReason) onAddToCanvas({type:selectedItem.nodeType,label:capabilityName(selectedItem),data:selectedItem.nodeData}); }}><Plus size={16}/>{uiText("添加到画布")}</button><p id="cl-add-help">{uiText(!selectedItem.nodeType ? uiText("此资料接口尚未接入，暂不能添加到运行画布。") : addDisabledReason || (!onAddToCanvas ? uiText("请在项目工作台中添加组件。") : uiText("添加后可连线和配置，不会自动运行。")))}</p></div>}
    </div>
    {importOpen && <ImportDialog open onClose={() => setImportOpen(false)} onImported={record => { setImports(previous => [record, ...previous.filter(item => item.id !== record.id)]); setImportOpen(false); setOrigin('imported'); setCategory('全部组件'); setQuery(''); setSelected(''); setNotice(`已入库 ${record.items.length} 项能力 · ${record.filename}`); }}/>} 
  </aside>;
};
