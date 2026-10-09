import { uiLocale  } from '@/i18n';
import { uiText, useUiLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { FileJson, Clock, HardDrive, FolderOpen, RefreshCw } from 'lucide-react';
import { NavigationPanel } from './NavigationPanel';
import { DeleteProjectButton } from './DeleteProjectButton';
import { listProjectFiles, loadProjectFile, type ProjectSummary } from '@/lib/projectFiles';
import type { WorkflowProject } from '@/components/pages/WorkspacePage';

interface ProjectLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onProjectDeleted?: (id: string) => void;
  projectActionsDisabled?: boolean;
  onOpenProject: (project: WorkflowProject) => void;
}

export function ProjectLibraryPanel({ open, onClose, onOpenProject, onProjectDeleted, projectActionsDisabled }: ProjectLibraryPanelProps) {
  useUiLanguage();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openingRef = useRef(false);
  const requestVersion = useRef(0);

  const fetchProjects = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const data = await listProjectFiles();
      if (version === requestVersion.current) setProjects(data);
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : '无法加载项目列表，请重试。');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { setOpening(false); openingRef.current = false; void fetchProjects(); }
    return () => { requestVersion.current++; };
  }, [open]);

  const handleOpen = async (projectId: string) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setError('');
    const version = requestVersion.current;
    try {
      const project = await loadProjectFile(projectId);
      if (version !== requestVersion.current) return;
      onOpenProject(project);
      onClose();
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : '无法打开项目，请重试。');
    } finally {
      if (version === requestVersion.current) { setOpening(false); openingRef.current = false; }
    }
  };

  const deleted = (project: ProjectSummary) => {
    setProjects(current => current.filter(item => item.id !== project.id));
    onProjectDeleted?.(project.id);
    setNotice(`已删除「${project.name}」。`);
  };

  if (!open) {
    return null;
  }

  return (
    <NavigationPanel id="projects" title={uiText("项目库")} icon={FolderOpen} onClose={onClose}
      actions={<button type="button" aria-label={uiText("刷新项目列表")} title={uiText("刷新项目列表")} disabled={loading || opening} onClick={() => void fetchProjects()}><RefreshCw size={18} className={loading ? 'animate-spin' : undefined} /></button>}>
      <div className="navigation-panel-scroll">
        <div className="navigation-card-grid">
          {notice && <p role="status" className="p-2 type-body text-muted-foreground">{uiText(notice)}</p>}
          {error && <p role="alert" className="type-body text-red-500 p-2">{uiText(error)}</p>}
          {opening && <p role="status" className="type-body text-muted-foreground p-2">{uiText("正在打开项目…")}</p>}
          {projects.map((project) => (
            <div key={project.id} className="navigation-project-card">
            <button
              disabled={opening || loading}
              onClick={() => void handleOpen(project.id)}
              className="w-full text-left p-3 pr-10 rounded-lg border border-border bg-background hover:bg-accent/60 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center shrink-0">
                  <FileJson className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="type-item-title  text-foreground truncate">{project.name}</div>
                  <div className="type-code text-muted-foreground font-mono truncate">
                    {uiText(project.file_name || `${project.id}.json`)}
                  </div>
                  <div className="mt-2 flex items-center gap-3 type-caption text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {uiText(new Date(project.updated_at * 1000).toLocaleDateString(uiLocale()))}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {uiText(Math.max(1, Math.round(project.size / 1024)))} KB
                    </span>
                  </div>
                </div>
              </div>
            </button>
            <DeleteProjectButton project={project} disabled={loading || opening || projectActionsDisabled} onDeleted={deleted} />
            </div>
          ))}

          {!loading && !error && projects.length === 0 && (
            <div className="navigation-empty text-center type-body text-muted-foreground py-8">
              {uiText("暂无已保存项目")}</div>
          )}

          {loading && (
            <div className="navigation-empty text-center type-body text-muted-foreground py-8">
              {uiText("正在加载项目列表...")}</div>
          )}
        </div>
      </div>


    </NavigationPanel>
  );
}
