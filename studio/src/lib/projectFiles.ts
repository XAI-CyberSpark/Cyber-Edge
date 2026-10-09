import { apiUrl } from './api';
import type { WorkflowProject } from '@/components/pages/WorkspacePage';

export interface ProjectSummary {
  id: string;
  name: string;
  file_name?: string;
  updated_at: number;
  size: number;
}

export async function listProjectFiles(): Promise<ProjectSummary[]> {
  const response = await fetch(apiUrl('/v1/projects/'));
  if (!response.ok) throw new Error(`无法加载项目列表（${response.status}），请重试。`);
  const data = await response.json();
  if (!Array.isArray(data) || data.some(project => !project || typeof project.id !== 'string' || typeof project.name !== 'string')) {
    throw new Error('项目列表格式无效，请重试。');
  }
  return data;
}

export async function loadProjectFile(projectId: string): Promise<WorkflowProject> {
  const response = await fetch(apiUrl(`/v1/projects/${encodeURIComponent(projectId)}`));
  if (!response.ok) throw new Error(response.status === 404 ? '项目已不存在，请刷新项目列表。' : `无法打开项目（${response.status}），请重试。`);
  const data = await response.json();
  if (!data || typeof data.name !== 'string' || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('项目内容格式无效，未替换当前工作区。');
  }
  return { ...data, id: projectId, file_name: data.file_name || `${projectId}.json` };
}

export async function deleteProjectFile(projectId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/projects/${encodeURIComponent(projectId)}`), { method: 'DELETE' });
  if (!response.ok) throw new Error(`删除失败（${response.status}），项目列表已保留，请重试。`);
  const result = await response.json();
  if (result?.status !== 'success') throw new Error('删除结果未确认，请刷新列表后重试。');
}
