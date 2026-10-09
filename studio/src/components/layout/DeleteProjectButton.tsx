import { uiText, useUiLanguage } from '@/i18n';
import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ProjectConfirmDialog } from '@/components/ui/ProjectConfirmDialog';
import { deleteProjectFile, type ProjectSummary } from '@/lib/projectFiles';

export function DeleteProjectButton({ project, disabled, onDeleted }: { project: ProjectSummary; disabled?: boolean; onDeleted: (project: ProjectSummary) => void }) {
  useUiLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const remove = async () => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await deleteProjectFile(project.id);
      setOpen(false);
      onDeleted(project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败，请重试。');
    } finally { lock.current = false; setBusy(false); }
  };
  return <>
    <button type="button" disabled={disabled || busy} aria-label={uiText("删除项目「{0}」", [project.name])} title={uiText("删除项目")} onClick={() => { setError(''); setOpen(true); }} className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Trash2 size={15} />
    </button>
    <ProjectConfirmDialog open={open} title={uiText("删除「{0}」？", [project.name])} description={uiText("将删除本地保存的项目文件，此操作无法撤销。已打开的内容会保留为未保存副本。")} confirmLabel="删除项目" busy={busy} error={error} onCancel={() => setOpen(false)} onConfirm={() => void remove()} />
  </>;
}
