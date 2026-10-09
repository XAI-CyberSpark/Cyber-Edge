import { uiText, uiLocale, useUiLanguage  } from '@/i18n';
import { RetroComputerLogo } from '@/components/ui/RetroComputerLogo';
import './home-project-cards.css';
import Shuffle from '@/components/text/Shuffle';

const brandGradient: [string, string, string] = ['#c8e2c6', '#b4e6ed', '#6f9af8'];
import Prism from '@/components/backgrounds/Prism';
import { useApp } from '@/context/AppContext';
import { useEffect, useRef, useState } from 'react';
import { Plus, Search, FolderOpen, ArrowRight } from 'lucide-react';

import { listProjectFiles, loadProjectFile, type ProjectSummary } from '@/lib/projectFiles';
import { DeleteProjectButton } from '@/components/layout/DeleteProjectButton';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { WorkflowProject } from './WorkspacePage';

interface HomePageProps {
  onOpenProject: (project?: WorkflowProject) => void;
  onResume?: () => void;
  onProjectDeleted?: (id: string) => void;
  projectActionsDisabled?: boolean;
}

export function HomePage({ onOpenProject, onResume, onProjectDeleted, projectActionsDisabled }: HomePageProps) {
  useUiLanguage();
  const { theme } = useApp();
  const [search, setSearch] = useState('');
  const [allProjectsOpen, setAllProjectsOpen] = useState(false);
  const [columns, setColumns] = useState(() => window.innerWidth >= 1024 ? 4 : 2);
  useEffect(() => {
    const resize = () => setColumns(window.innerWidth >= 1024 ? 4 : 2);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const homeSearch = useRef<HTMLInputElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const openingRef = useRef(false);
  const refresh = async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try { const data = await listProjectFiles(); if (version === requestVersion.current) setProjects(data); }
    catch (cause) { if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : '无法加载项目列表。'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  };
  useEffect(() => { void refresh(); return () => { requestVersion.current++; }; }, []);
  const open = async (id: string) => {
    if (openingRef.current) return;
    openingRef.current = true; setOpening(true); setError('');
    const version = requestVersion.current;
    try { const project = await loadProjectFile(id); if (version === requestVersion.current) onOpenProject(project); }
    catch (cause) { if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : '无法打开项目。'); }
    finally { if (version === requestVersion.current) { openingRef.current = false; setOpening(false); } }
  };
  const deleted = (project: ProjectSummary) => {
    setProjects(current => current.filter(item => item.id !== project.id));
    onProjectDeleted?.(project.id);
  };
  const filtered = [...projects].sort((a, b) => b.updated_at - a.updated_at)
    .filter(project => project.name.toLowerCase().includes(search.trim().toLowerCase()));
  const hasMore = filtered.length + 1 > columns * 2;
  const recent = filtered.slice(0, columns * 2 - (hasMore ? 2 : 1));

  const renderProjectCard = (project: ProjectSummary) => (
            <div key={project.id} className="home-project-tile relative min-w-0">
            <button
              onClick={() => void open(project.id)}
              disabled={opening || loading}
              className="home-project-card group relative w-full h-full flex flex-col justify-between p-5 rounded-xl min-h-[140px] text-left"
            >
              <div className="home-project-card__header">
                <FolderOpen aria-hidden="true" size={18} className="home-project-card__icon" />

              </div>
              <div className="mt-auto">
                <div className="home-project-card__title  type-item-title">{project.name}</div>
                <div className="home-project-card__meta type-caption mt-2">{uiText(new Date(project.updated_at * 1000).toLocaleString(uiLocale()))}</div>
              </div>
            </button>
            <DeleteProjectButton project={project} disabled={loading || opening || projectActionsDisabled} onDeleted={deleted} />
            </div>

  );

  return (
    <div className="relative isolate flex-1 min-w-0 overflow-hidden bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 opacity-25">
        <Prism animationType="rotate" noise={0} scale={3.6} timeScale={0.5} lightMode={theme === 'light'} suspendWhenOffscreen />
      </div>
      <div className="relative z-10 flex h-full flex-col items-center overflow-y-auto px-6 py-10">
      <div className="my-auto flex w-full flex-col items-center">
      <div className="home-brand-lockup mb-10 flex items-center justify-center">
        <RetroComputerLogo className="home-brand-computer" />
        <Shuffle tag="h1" text="OAKEgde Studio" className="home-brand-title home-brand-title--pixel" gradientColors={brandGradient} rootMargin="0px" animationMode="wave" duration={0.65} stagger={0.018} ease="sine.inOut" />
      </div>

      <div className="max-w-2xl w-full mb-8">
        <div className="home-search-field relative rounded-lg">
          <Search aria-hidden="true" className="home-search-field__icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            ref={homeSearch}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={uiText("搜索并打开项目")}
            aria-label={uiText("搜索项目")}
            className="home-search-field__input w-full h-10 pl-10 pr-4 rounded-lg border-0 bg-transparent type-label focus:outline-none"
          />
        </div>
      </div>

      <div className="max-w-3xl w-full">
        {(loading || opening || onResume) && <div className="mb-4 flex items-center gap-3 type-body">
          {(loading || opening) && <span role="status" className="text-muted-foreground">{uiText(opening ? uiText("正在打开项目…") : uiText("正在加载项目…"))}</span>}
          {onResume && <button className="ml-auto shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-2 hover:bg-accent" onClick={onResume}>{uiText("返回工作台")}</button>}
        </div>}
        {error && <p role="alert" className="mb-4 type-body text-red-500">{uiText(error)}</p>}
        {!loading && !error && !filtered.length && <p className="mb-4 type-body text-muted-foreground">{uiText(search ? uiText("没有匹配的项目") : uiText("暂无已保存项目"))}</p>}
        <div className="home-recent-grid grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* New Project Card */}
          <button
            onClick={() => onOpenProject()}
            disabled={opening}
            className="home-project-card home-project-card--new group flex flex-col justify-between p-5 rounded-xl min-h-[140px]"
          >
            <Plus className="home-project-card__icon w-6 h-6" />
            <div className="mt-auto">
              <div className="home-project-card__title  type-item-title">{uiText("新建项目")}</div>
              <div className="home-project-card__meta type-caption mt-1">{uiText("创建新的编排工作流")}</div>
            </div>
          </button>

          {/* Existing Projects */}
          {recent.map(renderProjectCard)}
          {hasMore && <button ref={moreButton} type="button" onClick={() => setAllProjectsOpen(true)} className="home-project-card home-project-card--more flex flex-col justify-between p-5 rounded-xl min-h-[140px] text-left">
            <ArrowRight className="home-project-card__icon w-6 h-6" />
            <div className="mt-auto"><div className="home-project-card__title type-item-title">{uiText("查看更多")}</div><div className="home-project-card__meta type-caption mt-1">{uiText("共 {0} 个项目", [filtered.length])}</div></div>
          </button>}
        </div>
      </div>
      </div>
      </div>
      <Dialog open={allProjectsOpen} onOpenChange={setAllProjectsOpen}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); (moreButton.current || homeSearch.current)?.focus(); }} className="home-all-projects flex flex-col w-[calc(100%-32px)] max-w-3xl max-h-[85vh]">
          <div className="pr-8"><DialogTitle>{uiText("全部项目")}</DialogTitle><DialogDescription>{uiText("按最近更新时间排序，选择项目继续编辑。")}</DialogDescription></div>
          <input aria-label={uiText("搜索全部项目")} placeholder={uiText("搜索项目")} value={search} onChange={e => setSearch(e.target.value)} className="type-label rounded-lg border border-input bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {error && <p role="alert" className="type-body text-destructive">{uiText(error)}</p>}
          <div className="min-h-0 overflow-y-auto p-1">
            {filtered.length ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{filtered.map(renderProjectCard)}</div> : <p className="type-body text-muted-foreground">{uiText("没有匹配的项目")}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}