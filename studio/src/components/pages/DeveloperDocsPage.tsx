import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUpRight, ArrowRight, ArrowLeft, Search, Sun, Moon, Menu, X, Copy, Check, BookOpen, ChevronRight, FileText } from 'lucide-react';
import documentation from 'virtual:developer-docs';
import { docHref, documentHeadings, resolveDocLink, searchDocuments, updateSummaries } from '@/domain/developerDocs';
import { uiText, useUiLanguage } from '@/i18n';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './developer-docs.css';

function textContent(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : String(child)).join('');
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textContent(children).replace(/\n$/, ''));
      setCopied(true); setFailed(false); clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setFailed(true); }
  };
  return <div className="docs-code-block">
    <div className="docs-code-toolbar type-caption"><span>{uiText('代码示例')}</span><button onClick={() => void copy()} aria-label={uiText('复制代码')}>{copied ? <Check size={14} /> : <Copy size={14} />}{uiText(copied ? '已复制' : '复制')}</button></div>
    <pre tabIndex={0}>{children}</pre>
    {failed && <p role="status" className="type-caption">{uiText('无法访问剪贴板，请选中代码复制。')}</p>}
  </div>;
}

const tabs = [ ['overview', '概览'], ['quickstart', '开始使用'], ['concepts', '核心概念'], ['development', '开发指南'], ['api', 'API 参考'], ['maintenance', '资源'] ];
const descriptions: Record<string, string> = {
  quickstart: '准备开发环境，启动你的第一个工作台。',
  concepts: '理解节点、场景图与体验验证的关系。',
  development: '找到代码入口，开始开发和扩展。',
  configuration: '连接模型服务、Hermes 和 MCP 工具。',
};

export default function DeveloperDocsPage() {
  useUiLanguage();
  const [location, setLocation] = useState(() => window.location.search + window.location.hash);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('oakegde-docs-theme') === 'dark'; } catch { return false; } });
  const content = useRef<HTMLElement>(null);
  const article = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigated = useRef(false);
  const rememberFocus = () => { returnFocus.current = document.activeElement as HTMLElement; };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (navigated.current) (article.current || content.current)?.focus({ preventScroll: true });
    else returnFocus.current?.focus({ preventScroll: true });
    navigated.current = false;
  };
  const slug = new URLSearchParams(location.split('#')[0]).get('doc') || 'overview';
  const page = documentation.pages.find(item => item.slug === slug);
  const headings = useMemo(() => documentHeadings(page?.markdown || ''), [page]);
  const results = useMemo(() => searchDocuments(documentation.pages, query), [query]);
  const primary = documentation.pages.filter(item => item.group);
  const groups = [...new Set(primary.map(item => item.group))];
  const currentIndex = primary.findIndex(item => item.slug === slug);
  const home = slug === 'overview';
  const activeTab = ['architecture', 'nodes', 'mcp', 'configuration', 'testing'].includes(slug) ? 'development' : ['updates', 'development-log', 'maintenance'].includes(slug) ? 'maintenance' : slug;

  useEffect(() => {
    const update = () => { setLocation(window.location.search + window.location.hash); setMobileOpen(false); };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!searchOpen) rememberFocus(); setSearchOpen(open => !open); }
    };
    window.addEventListener('popstate', update); window.addEventListener('hashchange', update); window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('popstate', update); window.removeEventListener('hashchange', update); window.removeEventListener('keydown', shortcut); };
  }, [searchOpen]);
  useEffect(() => {
    document.title = `${page?.title || uiText('未找到文档')} · OAKEgde Studio Docs`;
    let hash = '';
    try { hash = decodeURIComponent(window.location.hash.slice(1)); } catch { /* Invalid fragments do not prevent reading. */ }
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
    else { content.current?.scrollTo?.({ top: 0 }); article.current?.focus({ preventScroll: true }); }
  }, [location, page]);

  const navigate = (href: string) => {
    navigated.current = searchOpen || mobileOpen;
    history.pushState({}, '', href);
    setLocation(window.location.search + window.location.hash); setMobileOpen(false); setSearchOpen(false);
  };
  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); navigate(href.startsWith('#') ? docHref(slug, href) : href);
  };
  const link = (to: string, title: ReactNode, className = '') => <a key={to} className={className} href={docHref(to)} onClick={event => follow(event, docHref(to))}>{title}</a>;
  const toggleTheme = () => setDark(value => { try { localStorage.setItem('oakegde-docs-theme', value ? 'light' : 'dark'); } catch { /* Reading remains available without storage. */ } return !value; });
  const navigation = <>{groups.map(group => <section key={group} className="docs-nav-group"><h2 className="type-label">{uiText(group)}</h2>{primary.filter(item => item.group === group).map(item => <a key={item.slug} href={docHref(item.slug)} aria-current={slug === item.slug ? 'page' : undefined} onClick={event => follow(event, docHref(item.slug))}>{item.title}</a>)}</section>)}<div className="docs-sidebar-foot type-caption"><span>OAKEgde Studio</span><span>{documentation.version}</span></div></>;
  const updates = updateSummaries(documentation.pages.find(item => item.slug === 'updates')?.markdown || '').slice(0, 3);

  return <div className="docs-site" data-theme={dark ? 'dark' : 'light'}>
    <a className="docs-skip" href="#docs-main">{uiText('跳到正文')}</a>
    <header className="docs-header">
      <a href="/" className="docs-brand" aria-label="OAKEgde Studio"><img src="/favicon-figma-110-147-compact-48.png" alt="" /><span>OAKEgde <span className="docs-brand-sub">Docs</span></span></a>
      <nav aria-label={uiText('站点导航')} className="docs-top-nav"><a href="/">{uiText('首页')}</a>{link('overview', uiText('文档'), 'is-selected')}{link('updates', uiText('更新'))}{link('maintenance', uiText('资源'))}</nav>
      <div className="docs-header-actions"><button aria-label={uiText('搜索文档')} className="docs-search-trigger type-label" onClick={() => { rememberFocus(); setSearchOpen(true); }}><span>{uiText('搜索文档')}</span><kbd>⌘ K</kbd><Search size={16} /></button><a href="/" className="docs-open-studio type-label">{uiText('打开 Studio')}<ArrowUpRight size={15} /></a><button className="docs-icon-button" aria-label={uiText(dark ? '切换到浅色' : '切换到深色')} onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div>
    </header>
    <div className="docs-subheader"><button className="docs-mobile-menu docs-icon-button" aria-label={uiText('打开文档目录')} onClick={() => { rememberFocus(); setMobileOpen(true); }}><Menu size={19} /></button><nav aria-label={uiText('文档分类')}>{tabs.map(([id, title]) => <a key={id} href={docHref(id)} aria-current={activeTab === id ? 'page' : undefined} onClick={event => follow(event, docHref(id))}>{uiText(title)}</a>)}</nav></div>
    <div className="docs-layout"><aside className="docs-sidebar"><nav aria-label={uiText('文档目录')}>{navigation}</nav></aside>
      <main id="docs-main" ref={content} className="docs-main" tabIndex={-1}>
        {home ? <div className="docs-overview">
          <section className="docs-hero"><div className="docs-hero-copy"><div className="docs-eyebrow type-caption">OAKEgde Studio / {uiText('开发者文档')}</div><h1>{uiText('概览')}</h1><p>{uiText('从一个想法开始，构建可运行的座舱体验。了解工作台，连接模型与工具，让每一步开发都有据可循。')}</p><div className="docs-hero-actions">{link('quickstart', <>{uiText('快速入门')}<ArrowRight size={16} /></>, 'docs-primary')}{link('development', <>{uiText('探索开发指南')}<ArrowRight size={16} /></>, 'docs-text-link')}</div></div><figure className="docs-product-figure"><img src="/docs/studio-preview.jpg" alt={uiText('OAKEgde Studio 工作台，展示 MCP 工具、节点画布与场景共创面板')} /><figcaption className="type-caption">{uiText('编排 · 仿真 · 体验验证')}<span>OAKEgde Studio</span></figcaption></figure></section>
          <section className="docs-updates"><div className="docs-section-heading"><h2>{uiText('最近更新')}</h2>{link('updates', <>{uiText('查看所有更新')}<ArrowRight size={16} /></>, 'docs-text-link type-label')}</div><div className="docs-update-list">{updates.map(update => <article key={update.id} className="docs-update-entry"><time className="docs-update-date type-label" dateTime={update.date}>{update.date}</time><div className="docs-update-copy"><h3><a href={docHref('updates', `#${update.id}`)} onClick={event => follow(event, docHref('updates', `#${update.id}`))}>{update.title}<ArrowUpRight size={17} /></a></h3><p className="docs-update-status type-caption">{update.status}</p><ul>{update.items.map(item => <li key={item}><Markdown components={{ p: ({ children }) => <>{children}</> }}>{item}</Markdown></li>)}</ul></div></article>)}</div>{link('development-log', <>{uiText('查看详细开发记录')}<ArrowRight size={16}/></>, 'docs-text-link type-label')}</section>
          <section className="docs-start"><div className="docs-section-heading"><h2>{uiText('开始构建')}</h2></div><div className="docs-start-grid">{Object.entries(descriptions).map(([id, description]) => link(id, <><BookOpen size={21} /><h3>{primary.find(item => item.slug === id)?.title}</h3><p>{uiText(description)}</p><ArrowUpRight size={18} /></>, 'docs-start-item'))}</div></section>
          <footer className="docs-footer type-caption"><span>OAKEgde Studio</span><span>{uiText('与产品一起，持续更新。')}</span>{link('maintenance', uiText('文档维护'))}</footer>
        </div> : page ? <div className="docs-reading-layout"><article ref={article} tabIndex={-1} className="docs-article"><div className="docs-breadcrumb type-caption">{link('overview', uiText('文档'))}<ChevronRight size={13}/><span>{page.title}</span></div><div className="docs-prose"><Markdown remarkPlugins={[remarkGfm]} components={{
          h1: ({ children, node }) => <h1 id={headings.find(item => item.line === node?.position?.start.line)?.id}>{children}</h1>,
          h2: ({ children, node }) => <h2 id={headings.find(item => item.line === node?.position?.start.line)?.id}>{children}</h2>,
          h3: ({ children, node }) => <h3 id={headings.find(item => item.line === node?.position?.start.line)?.id}>{children}</h3>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => <div className="docs-table-scroll" tabIndex={0}><table>{children}</table></div>,
          img: ({ alt }) => <span className="type-caption">{alt}</span>,
          a: ({ href = '', children }) => {
            const destination = resolveDocLink(href, page.source, documentation.pages);
            if (destination.reference) return <button className="docs-reference-link" onClick={() => { rememberFocus(); setReference(destination.reference!); }}>{children}<FileText size={12}/></button>;
            const external = /^https?:\/\//i.test(destination.href);
            return <a href={destination.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} onClick={external || destination.href.startsWith('mailto:') ? undefined : event => follow(event, destination.href)}>{children}</a>;
          },
        }}>{page.markdown}</Markdown></div><nav aria-label={uiText('相邻章节')} className="docs-pagination">{currentIndex > 0 ? link(primary[currentIndex - 1].slug, <><ArrowLeft size={17}/><div><span className="type-caption">{uiText('上一篇')}</span><strong>{primary[currentIndex - 1].title}</strong></div></>) : <span/>}{currentIndex >= 0 && currentIndex < primary.length - 1 && link(primary[currentIndex + 1].slug, <><div><span className="type-caption">{uiText('下一篇')}</span><strong>{primary[currentIndex + 1].title}</strong></div><ArrowRight size={17}/></>)}</nav></article><aside className="docs-toc"><p className="type-label">{uiText('本页内容')}</p><nav>{headings.filter(item => item.level === 2).map(item => <a key={item.id} href={docHref(slug, `#${item.id}`)} onClick={event => follow(event, docHref(slug, `#${item.id}`))}>{item.title}</a>)}</nav></aside></div> : <section className="docs-not-found"><h1>{uiText('未找到文档')}</h1><p>{uiText('这个章节可能已移动，请从目录选择或搜索文档。')}</p>{link('overview', uiText('返回文档首页'), 'docs-primary')}</section>}
      </main>
    </div>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent onCloseAutoFocus={restoreFocus} data-theme={dark ? 'dark' : 'light'} className="docs-dialog docs-search-dialog" onOpenAutoFocus={event => { event.preventDefault(); searchInput.current?.focus(); }}><DialogTitle className="type-panel">{uiText('搜索文档')}</DialogTitle><DialogDescription className="type-caption">{uiText('搜索标题、正文与代码示例。')}</DialogDescription><label className="docs-search-field"><Search size={19}/><input ref={searchInput} value={query} onChange={event => setQuery(event.target.value)} placeholder={uiText('搜索，例如：MCP、自动保存、API')} aria-label={uiText('搜索文档内容')}/>{query && <button aria-label={uiText('清空搜索')} onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={16}/></button>}</label><div className="docs-search-results" aria-live="polite">{!query.trim() ? <p className="type-body">{uiText('输入关键词，查找你需要的内容。')}</p> : results.length ? results.map(result => <a key={result.page.slug} href={docHref(result.page.slug)} onClick={event => follow(event, docHref(result.page.slug))}><FileText size={18}/><div><strong>{result.page.title}</strong><p>{result.excerpt}</p></div><ArrowUpRight size={15}/></a>) : <p className="type-body">{uiText('没有找到相关文档，试试其他关键词。')}</p>}</div><div className="docs-search-hint type-caption">{uiText('Tab 选择结果 · Enter 打开 · Esc 关闭')}</div></DialogContent></Dialog>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}><DialogContent onCloseAutoFocus={restoreFocus} data-theme={dark ? 'dark' : 'light'} className="docs-dialog docs-mobile-dialog"><DialogTitle>{uiText('文档目录')}</DialogTitle><DialogDescription className="type-caption">OAKEgde Studio Docs</DialogDescription><nav>{navigation}</nav></DialogContent></Dialog>
    <Dialog open={Boolean(reference)} onOpenChange={open => { if (!open) setReference(''); }}><DialogContent onCloseAutoFocus={restoreFocus} data-theme={dark ? 'dark' : 'light'} className="docs-dialog"><DialogTitle>{uiText('仓库参考文件')}</DialogTitle><DialogDescription>{uiText('此引用位于项目源码仓库，可按下面的相对路径查阅。')}</DialogDescription><CodeBlock><code>{reference}</code></CodeBlock><p className="type-caption">{uiText('网页仅收录已登记的文档，不开放任意文件访问。')}</p></DialogContent></Dialog>
  </div>;
}
