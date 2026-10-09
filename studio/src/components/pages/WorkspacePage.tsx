import { uiText, useUiLanguage  } from '@/i18n';
import { ProjectAutosave, projectContent, persistentGraph, recoveredProjects, type SaveState } from '@/domain/projectAutosave';
import { SimulationChatProvider } from '@/components/core/SimulationChatSession';
import { rehearseScenario } from '@/domain/scenarioRehearsal';
import { canApplyScenario, canInspectScenario, describeScenarioBuild, type ScenarioBuildReport } from '@/domain/scenarioBuild';
import { AppIcon } from '@/components/ui/AppIcon';
import '@/components/layout/left-panel.css';
import './workspace-layout.css';
import { ProjectConfirmDialog } from '@/components/ui/ProjectConfirmDialog';
import { buildRainComfortScenario } from '@/data/rainComfortScenario';
import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { FlowCanvas, type FlowCanvasRef } from '@/components/core/FlowCanvas';
import { ChatPanel, type Message } from '@/components/layout/ChatPanel';
import { MapStoryboardPanel, type MapStoryboard } from '@/components/layout/MapStoryboardPanel';
import { ProjectLibraryPanel } from '@/components/layout/ProjectLibraryPanel';
import { type VehicleSimulatorRef } from '@/components/core/VehicleSimulator';
import { apiUrl } from '@/lib/api';
import type { RuntimeRunResult } from '@/domain/runtime';
import { MessageSquareText, PlayCircle, Rocket } from 'lucide-react';
import type { Edge, Node } from '@xyflow/react';
import {
  buildChildSafetyTemplate,
  createChildSafetyScenarioSpec,
  type ChildSafetyScenarioSpec,
} from '@/data/childSafetyScenario';

export interface WorkflowProject {
  id?: string;
  name: string;
  file_name?: string;
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
  meta?: Record<string, any>;
  updated_at?: number;
}

interface WorkflowValidation {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface WorkflowTest {
  name: string;
  passed: boolean;
  details: string;
}

interface WorkflowGenerateResponse {
  build_report?: ScenarioBuildReport;
  project_name: string;
  project: WorkflowProject;
  documentation_markdown: string;
  validation: WorkflowValidation;
  tests: WorkflowTest[];
  provider?: {
    base_url?: string;
    model?: string;
    mode?: string;
  };
  used_live_model?: boolean;
  map_storyboard?: MapStoryboard | null;
  documentation_file?: string | null;
  chat_reply?: string | null;
}

const MAX_HISTORY_MESSAGES = 8;
const MAX_DOC_PREVIEW_LENGTH = 420;
const createWorkflowId = () => `workflow_${crypto.randomUUID()}`;

export type WorkspaceMode = 'edit' | 'simulate' | 'deploy';

const workspaceModes: Array<{
  id: WorkspaceMode;
  label: string;
  description: string;
  icon: typeof MessageSquareText;
}> = [
  { id: 'edit', label: '编排', description: '定义场景、编辑流程与确认方案', icon: MessageSquareText },
  { id: 'simulate', label: '仿真', description: '回放场景与执行效果', icon: PlayCircle },
  { id: 'deploy', label: '部署', description: '选择设备并生成运行包', icon: Rocket },
];

interface WorkflowTabState {
  id: string;
  title: string;
  fileName?: string;
  projectId?: string;
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
  meta?: Record<string, any>;
  mapStoryboard?: MapStoryboard | null;
  messages: Message[];
  chatOpen: boolean;
  dirty: boolean;
  updatedAt?: number;
  autosavePaused?: boolean;
}

function isRouteBasedWorkflow(workflow: WorkflowTabState) {
  const latestUserRequest = [...workflow.messages]
    .reverse()
    .find((message) => message.role === 'user')?.content || '';
  const text = `${workflow.meta?.goal || ''} ${latestUserRequest}`.toLowerCase();
  return /(导航|路线|巡航|高速|接送|泊车|车道|route|navigation|cruise|parking|lane)/.test(text);
}

function WorkspaceModeBar({
  mode,
  onChange,
}: {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
}) {
  useUiLanguage();
  return (
    <div className="workspace-mode-bar h-16 shrink-0 border-b workspace-divider bg-card px-4 flex items-center justify-center">
      <div role="group" aria-label={uiText("工作区模式")} className="workspace-mode-switch flex items-center gap-1 rounded-xl bg-secondary/70 p-1 shrink-0">
        {workspaceModes.map((item) => {
          const Icon = item.icon;
          const active = item.id === mode;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 type-label  transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              }`}
              title={uiText(item.description)}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{uiText(item.label)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function applyProjectToCanvas(ref: FlowCanvasRef, project: WorkflowProject, arrange = false) {
  ref.replaceWorkflow({
    nodes: project.nodes as Node[],
    edges: project.edges as Edge[],
  }, { arrange });
}

function buildConversationHistory(messages: Message[], latestUserPrompt: string) {
  return [
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: 'user' as const, content: latestUserPrompt },
  ].slice(-MAX_HISTORY_MESSAGES);
}

function buildCurrentProjectPayload(workflow: WorkflowTabState, ref: FlowCanvasRef | null): WorkflowProject | undefined {
  if (!ref) {
    return undefined;
  }

  const nodes = ref.getNodes();
  const edges = ref.getEdges();
  if (!nodes.length && !edges.length && !workflow.meta?.pending_scenario_build) {
    return undefined;
  }

  return {
    id: workflow.projectId || workflow.id,
    name: workflow.title || 'Workspace',
    file_name: workflow.fileName,
    nodes: nodes as Array<Record<string, any>>,
    edges: edges as Array<Record<string, any>>,
    meta: { ...(workflow.meta || {}), pending_scenario_build: workflow.meta?.pending_scenario_build ? {
      build_report: workflow.meta.pending_scenario_build.build_report,
      candidate: { nodes: workflow.meta.pending_scenario_build.project?.nodes, edges: workflow.meta.pending_scenario_build.project?.edges },
    } : undefined, source: 'workspace_chat' },
    updated_at: Date.now() / 1000,
  };
}

function summarizeResult(result: WorkflowGenerateResponse) {
  if (result.build_report) return describeScenarioBuild(result.build_report);
  const passedTests = (result.tests || []).filter((test) => test.passed).length;
  const totalTests = (result.tests || []).length;
  const summaryLines = [
    uiText("已根据你的需求生成工作流「{0}」。", [result.project_name]),
    uiText("节点数：{0}，连线数：{1}。", [result.project?.nodes?.length || 0, result.project?.edges?.length || 0]),
    result.map_storyboard?.subtitle_cues?.length ? uiText("剧情字幕：{0} 段。", [result.map_storyboard.subtitle_cues.length]) : undefined,
    result.validation?.passed ? uiText("结构与配置检查：通过；业务行为尚未测试。") : uiText("校验结果：失败。{0}", [(result.validation?.errors || []).join('；')]),
    totalTests ? uiText("生成检查：{0}/{1} 通过（非场景运行测试）。", [passedTests, totalTests]) : undefined,
    ...(result.validation?.warnings || []).map(warning => uiText("提示：{0}", [warning])),
    result.used_live_model === false ? uiText("编排模式：本地模板（未配置远程模型）。") : undefined,
    result.provider?.model ? uiText("模型：{0}", [result.provider.model]) : undefined,
    result.provider?.base_url ? uiText("接口：{0}", [result.provider.base_url]) : undefined,
    result.documentation_file ? uiText("文档文件：{0}", [result.documentation_file]) : undefined,
  ].filter(Boolean);

  const docPreview = (result.documentation_markdown || '').trim().slice(0, MAX_DOC_PREVIEW_LENGTH);
  if (docPreview) {
    summaryLines.push('', uiText("文档预览："), docPreview);
  }

  return summaryLines.join('\n');
}

function getNodesByType(nodes: Node[]) {
  const groups: Record<string, string[]> = {};
  for (const node of nodes) {
    const type = String(node.type || 'unknown');
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(node.id);
  }
  return groups;
}

function pickPlaybackNodeIds(
  nodes: Node[],
  currentSegment?: MapStoryboard['segments'][number] | null,
  currentEvent?: MapStoryboard['events'][number] | null,
) {
  const groups = getNodesByType(nodes);
  const text = `${currentSegment?.label || ''} ${currentSegment?.narrative || ''} ${currentEvent?.label || ''} ${currentEvent?.message || ''}`;
  const ids = new Set<string>();

  const add = (type: string) => {
    for (const id of groups[type] || []) {
      ids.add(id);
    }
  };

  if (!currentSegment && !currentEvent) {
    return [];
  }

  add('input');
  add('llm');

  if (text.includes('出发') || text.includes('depart')) {
    add('memory');
    add('input');
    add('llm');
  }

  if (text.includes('高架') || text.includes('匝道') || currentSegment?.road_type === 'elevated') {
    add('logic');
    add('tool');
  }

  if (text.includes('学校') || text.includes('接') || text.includes('pickup')) {
    add('tool');
    add('car_control');
    add('output');
  }

  if (text.includes('回家') || text.includes('返程') || text.includes('return')) {
    add('tool');
    add('output');
  }

  if (ids.size === 0) {
    add('tool');
  }

  return Array.from(ids);
}

function createBlankWorkflow(title?: string): WorkflowTabState {
  return {
    id: createWorkflowId(),
    title: title || 'Untitled Workflow',
    nodes: [],
    edges: [],
    meta: { created: Date.now() },
    mapStoryboard: null,
    messages: [],
    chatOpen: true,
    dirty: false,
  };
}

function workflowFromProject(project?: WorkflowProject, title?: string): WorkflowTabState {
  return {
    ...createBlankWorkflow(project?.name || title),
    projectId: project?.id,
    fileName: project?.file_name,
    updatedAt: project?.updated_at,
    nodes: project?.nodes || [],
    edges: project?.edges || [],
    meta: project?.meta || {},
    messages: Array.isArray(project?.meta?.chat_messages) ? project.meta.chat_messages.map((message: Message) =>
      message.execution?.status === 'running' || message.isStreaming
        ? { ...message, isStreaming: false, execution: message.execution ? { ...message.execution, status: 'interrupted', durationMs: undefined, finishedAt: undefined } : undefined }
        : message) : [],
    mapStoryboard: (project?.meta?.map_storyboard as MapStoryboard | undefined) || null,
    dirty: !!project && (!project.file_name || !!project.meta?.chat_messages?.some((message: Message) => message.isStreaming || message.execution?.status === 'running')),
  };
}

function workflowProject(workflow: WorkflowTabState): WorkflowProject {
  return {
    id: workflow.projectId || workflow.id,
    file_name: workflow.fileName || `${workflow.projectId || workflow.id}.json`,
    name: workflow.title,
    nodes: workflow.nodes, edges: workflow.edges, updated_at: workflow.updatedAt,
    meta: { ...workflow.meta, chat_messages: workflow.messages, map_storyboard: workflow.mapStoryboard || null },
  };
}

interface WorkspacePageProps {
  projectName: string;
  initialProject?: WorkflowProject;
  visible?: boolean;
  projectActionsDisabled?: boolean;
  onSavingChange?: (saving: boolean) => void;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onGoHome?: () => void;
  projectLibraryOpen?: boolean;
  onProjectLibraryClose?: () => void;
  onProjectLibraryToggle?: () => void;
  mcpLibraryOpen?: boolean;
  onMcpLibraryClose?: () => void;
  modelLibraryOpen?: boolean;
  onModelLibraryClose?: () => void;
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
  sceneLibraryOpen?: boolean;
  onSceneLibraryClose?: () => void;
  diagnosticPanel?: "runs" | "devices";
  onDiagnosticClose?: () => void;
}

export interface WorkspacePageRef { newProject: () => void; saveProject: () => Promise<void>; openProject: (project: WorkflowProject) => void; goHome: () => void; projectDeleted: (id: string) => void; }

export const WorkspacePage = forwardRef<WorkspacePageRef, WorkspacePageProps>(function WorkspacePage({
  projectName,
  initialProject,
  visible = true,
  projectActionsDisabled = false,
  onSavingChange,
  workspaceMode,
  onWorkspaceModeChange,
  onGoHome,
  projectLibraryOpen,
  onProjectLibraryClose,
  onProjectLibraryToggle,
  mcpLibraryOpen,
  onMcpLibraryClose,
  modelLibraryOpen,
  onModelLibraryClose,
  sidebarOpen,
  onSidebarClose,
  sceneLibraryOpen,
  onSceneLibraryClose,
  diagnosticPanel,
  onDiagnosticClose,
}: WorkspacePageProps, ref) {
  useUiLanguage();
  const flowCanvasRef = useRef<FlowCanvasRef>(null);
  const simulatorRef = useRef<VehicleSimulatorRef>(null);
  const initialWorkflowsRef = useRef<WorkflowTabState[] | null>(null);
  if (!initialWorkflowsRef.current) {
    const recovered = recoveredProjects().map(({ key, project }) => ({ ...workflowFromProject(project), id: key, dirty: true }));
    initialWorkflowsRef.current = recovered.length ? recovered : [workflowFromProject(initialProject, projectName)];
  }
  const pendingRequestsRef = useRef(new Set<string>());
  const cancelRequestsRef = useRef(new Map<string, () => void>());
  const [templateChoice, setTemplateChoice] = useState<{
    workflowId: string; name: string; template: Pick<WorkflowProject, 'nodes' | 'edges' | 'meta'>;
  } | null>(null);
  const [pendingWorkflowIds, setPendingWorkflowIds] = useState<Set<string>>(() => new Set());
  const [projectNotice, setProjectNotice] = useState('');
  const [workflows, setWorkflows] = useState<WorkflowTabState[]>(() => initialWorkflowsRef.current!);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(() => initialWorkflowsRef.current![0].id);

  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const autosaveRef = useRef<ProjectAutosave | null>(null);
  if (!autosaveRef.current) autosaveRef.current = new ProjectAutosave((key, state, saved, content) => {
    setSaveStates(previous => ({ ...previous, [key]: state }));
    if (state.status === 'error') setProjectNotice(state.recovery ? '自动保存失败，已保留本机恢复副本，稍后将重试。' : '保存失败，无法建立恢复副本，请勿关闭页面。');
    if (state.status === 'conflict') setProjectNotice('项目在其他页面已更改，自动保存已暂停；当前内容已保留，请使用保存另存副本。');
    if (saved) setWorkflows(previous => previous.map(workflow => workflow.id !== key ? workflow : ({
      ...workflow, fileName: saved.file_name, projectId: saved.id, updatedAt: saved.updated_at,
      dirty: projectContent(workflowProject(workflow)) !== content,
    })));
  });
  const autosave = autosaveRef.current;
  useLayoutEffect(() => {
    autosave.resume();
    const retry = () => { for (const workflow of workflowsRef.current) void autosave.flush(workflow.id); };
    window.addEventListener('online', retry);
    const flushHidden = () => { if (document.visibilityState === 'hidden') retry(); };
    document.addEventListener('visibilitychange', flushHidden);
    return () => { autosave.dispose(); window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', flushHidden); };
  }, [autosave]);
  useLayoutEffect(() => {
    for (const workflow of workflows) {
      if (workflow.autosavePaused) continue;
      const project = workflowProject(workflow);
      if (!workflow.dirty && workflow.fileName) autosave.seed(workflow.id, project);
      if (workflow.fileName || workflow.messages.length || workflow.nodes.length || workflow.edges.length) autosave.enqueue(workflow.id, project);
    }
  }, [workflows, autosave]);
  useEffect(() => { onSavingChange?.(Object.values(saveStates).some(state => state.status === 'saving')); }, [saveStates, onSavingChange]);

  useEffect(() => {
    setWorkflows((prev) => {
      if (prev.length > 0) {
        return prev;
      }
      return [createBlankWorkflow(projectName || 'Untitled Workflow')];
    });
  }, [projectName]);

  const activeWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === activeWorkflowId) || workflows[0],
    [activeWorkflowId, workflows],
  );

  const isLoading = !!activeWorkflow && pendingWorkflowIds.has(activeWorkflow.id);

  const activeIdRef = useRef(activeWorkflowId);
  activeIdRef.current = activeWorkflowId;
  useEffect(() => {
    if (!projectNotice) return;
    const timer = window.setTimeout(() => setProjectNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [projectNotice]);

  const snapshotActiveWorkflow = useCallback(() => {
    if (!activeWorkflow || !flowCanvasRef.current) {
      return activeWorkflow;
    }

    const { nodes, edges } = persistentGraph(flowCanvasRef.current.getNodes(), flowCanvasRef.current.getEdges());
    const snapshot: WorkflowTabState = {
      ...activeWorkflow,
      nodes,
      edges,
      dirty: activeWorkflow.dirty || JSON.stringify({ nodes, edges }) !== JSON.stringify({ nodes: activeWorkflow.nodes, edges: activeWorkflow.edges }),
    };

    setWorkflows((prev) => prev.map((workflow) => (workflow.id === activeWorkflow.id ? snapshot : workflow)));
    return snapshot;
  }, [activeWorkflow]);

  const updateWorkflow = useCallback((workflowId: string, updater: (workflow: WorkflowTabState) => WorkflowTabState) => {
    setWorkflows((prev) => prev.map((workflow) => (workflow.id === workflowId ? updater(workflow) : workflow)));
  }, []);

  const loadSceneTemplate = (workflowId: string, template: Pick<WorkflowProject, 'nodes' | 'edges' | 'meta'>, name: string) => {
    if (activeIdRef.current !== workflowId) return;
    // Invalidate the request before replacing any graph or metadata.
    cancelRequestsRef.current.get(workflowId)?.();
    const spec = template.meta?.scenario_spec as ChildSafetyScenarioSpec | undefined;
    const meta = { ...template.meta, ...(spec ? { scenario_spec: { ...spec, status: 'applied' } } : {}) };
    flowCanvasRef.current?.replaceWorkflow({ nodes: template.nodes as Node[], edges: template.edges as Edge[] }, { fitView: true });
    updateWorkflow(workflowId, workflow => ({
      ...workflow, nodes: template.nodes, edges: template.edges, mapStoryboard: null,
      meta: { created: workflow.meta?.created, authoring_provider: workflow.meta?.authoring_provider,
        authoring_model: workflow.meta?.authoring_model, authoring_reasoning: workflow.meta?.authoring_reasoning, ...meta },
      dirty: true,
    }));
    setTemplateChoice(null);
    onSceneLibraryClose?.();
    onWorkspaceModeChange('edit');
    setProjectNotice(uiText('已载入「{0}」模板', [uiText(name)]));
  };

  const requestSceneTemplate = (template: Pick<WorkflowProject, 'nodes' | 'edges' | 'meta'>, name: string) => {
    if (!activeWorkflow) return;
    const canvas = flowCanvasRef.current;
    const hasProjectContext = activeWorkflow.messages.length > 0 || !!activeWorkflow.fileName || !!activeWorkflow.projectId || !!activeWorkflow.mapStoryboard;
    if (!canvas || pendingRequestsRef.current.has(activeWorkflow.id) || hasProjectContext || canvas.getNodes().length || canvas.getEdges().length) {
      setTemplateChoice({ workflowId: activeWorkflow.id, template, name });
    } else loadSceneTemplate(activeWorkflow.id, template, name);
  };

  useEffect(() => { setTemplateChoice(null); }, [activeWorkflowId]);

  const handleGraphChange = useCallback((workflowId: string, nodes: Array<Record<string, any>>, edges: Array<Record<string, any>>) => {
    updateWorkflow(workflowId, workflow => JSON.stringify({ nodes: workflow.nodes, edges: workflow.edges }) === JSON.stringify({ nodes, edges })
      ? workflow : { ...workflow, nodes, edges, dirty: true });
  }, [updateWorkflow]);

  const createWorkflowTab = useCallback((project?: WorkflowProject) => {
    snapshotActiveWorkflow();

    const nextWorkflow = workflowFromProject(project);

    setWorkflows((prev) => [...prev, nextWorkflow]);
    setActiveWorkflowId(nextWorkflow.id);
  }, [snapshotActiveWorkflow]);

  const newProject = useCallback(() => {
    createWorkflowTab();
    onWorkspaceModeChange('edit');
    onProjectLibraryClose?.();
    onSidebarClose?.();
    onSceneLibraryClose?.();
    onDiagnosticClose?.();
  }, [createWorkflowTab, onWorkspaceModeChange, onProjectLibraryClose, onSidebarClose, onSceneLibraryClose, onDiagnosticClose]);

  const switchWorkflow = useCallback((workflowId: string) => {
    if (workflowId === activeWorkflowId) {
      return;
    }
    snapshotActiveWorkflow();
    setActiveWorkflowId(workflowId);
  }, [activeWorkflowId, snapshotActiveWorkflow]);

  const removeWorkflowTab = useCallback((workflowId: string) => {
    setWorkflows(prev => {
      const filtered = prev.filter(workflow => workflow.id !== workflowId);
      if (!filtered.length) {
        const blank = createBlankWorkflow('Untitled Workflow');
        setActiveWorkflowId(blank.id);
        return [blank];
      }
      if (workflowId === activeWorkflowId) setActiveWorkflowId(filtered[0].id);
      return filtered;
    });
  }, [activeWorkflowId]);

  const persistWorkflow = useCallback(async (snapshot: WorkflowTabState) => {
    if (snapshot.autosavePaused) return false;
    autosave.enqueue(snapshot.id, workflowProject(snapshot));
    return autosave.flush(snapshot.id);
  }, [autosave]);

  const closeWorkflow = useCallback(async (workflowId: string) => {
    const target = workflowId === activeWorkflowId ? snapshotActiveWorkflow() : workflowsRef.current.find(workflow => workflow.id === workflowId);
    if (!target) return;
    if (pendingRequestsRef.current.has(workflowId)) {
      await persistWorkflow(target);
      setProjectNotice('编排仍在进行，进度会自动保存；可切换其他项目继续工作。');
      return;
    }
    if (!target.dirty || await persistWorkflow(target)) removeWorkflowTab(workflowId);
    else setProjectNotice('尚未保存成功，项目已保持打开，请重试或另存副本。');
  }, [activeWorkflowId, snapshotActiveWorkflow, persistWorkflow, removeWorkflowTab]);

  const saveWorkflow = useCallback(async () => {
    const snapshot = snapshotActiveWorkflow();
    if (!snapshot) return;
    if (snapshot.autosavePaused || saveStates[snapshot.id]?.status === 'conflict') {
      const copy = { ...snapshot, title: `${snapshot.title} · ${uiText('副本')}`, projectId: createWorkflowId(), fileName: undefined, updatedAt: undefined, autosavePaused: false, dirty: true };
      autosave.forget(snapshot.id);
      updateWorkflow(snapshot.id, () => copy);
      if (await persistWorkflow(copy)) setProjectNotice(`已保存「${copy.title}」。`);
      return;
    }
    if (await persistWorkflow(snapshot)) setProjectNotice(`已保存「${snapshot.title}」。`);
  }, [snapshotActiveWorkflow, persistWorkflow, autosave, updateWorkflow, saveStates]);



  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (visible && !document.querySelector('[data-project-dialog]') && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveWorkflow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveWorkflow, visible]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeWorkflow || pendingRequestsRef.current.has(activeWorkflow.id)) {
      return;
    }

    const startedAt = Date.now();
    const startedClock = performance.now();
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: startedAt,
    };
    // [MODIFIED] 不再拦截特定场景走前端模板，全部走后端 orchestration 生成真实节点
    const conversationHistory = buildConversationHistory(activeWorkflow.messages, content);
    const currentWorkflow = snapshotActiveWorkflow() || activeWorkflow;
    const currentProject = buildCurrentProjectPayload(currentWorkflow, flowCanvasRef.current);

    // Keep public execution events separate from the final reply.
    const thinkingMsgId = crypto.randomUUID();
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      role: 'assistant',
      content: '',
      timestamp: startedAt,
      isStreaming: true,
      execution: { startedAt, status: 'running', operations: [{ timestamp: startedAt, content: '正在发送请求…' }] },
    };

    updateWorkflow(activeWorkflow.id, (workflow) => ({
      ...workflow,
      title: workflow.title === 'Untitled Workflow' && !workflow.messages.length ? content.replace(/\s+/g, ' ').trim().slice(0, 32) || workflow.title : workflow.title,
      messages: [...workflow.messages, userMsg, thinkingMsg],
      dirty: true,
    }));
    pendingRequestsRef.current.add(activeWorkflow.id);
    setPendingWorkflowIds(new Set(pendingRequestsRef.current));

    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelRequest = () => {
      controller.abort();
      void reader?.cancel().catch(() => {});
      updateWorkflow(activeWorkflow.id, workflow => ({ ...workflow, dirty: true,
        messages: workflow.messages.map(message => message.id === thinkingMsgId && message.execution
          ? { ...message, content: '已停止本次编排并切换为模板。', isStreaming: false,
            execution: { ...message.execution, status: 'interrupted', finishedAt: Date.now(), durationMs: Math.max(0, performance.now() - startedClock) } }
          : message),
      }));
      cancelRequestsRef.current.delete(activeWorkflow.id);
      pendingRequestsRef.current.delete(activeWorkflow.id);
      setPendingWorkflowIds(new Set(pendingRequestsRef.current));
    };
    cancelRequestsRef.current.set(activeWorkflow.id, cancelRequest);

    let executionStatus: 'completed' | 'failed' | 'interrupted' = 'completed';
    const recordOperation = (content: string) => {
      if (controller.signal.aborted) return;
      const timestamp = Date.now();
      updateWorkflow(activeWorkflow.id, workflow => ({
        ...workflow,
        messages: workflow.messages.map(message => {
          if (message.id !== thinkingMsgId || !message.execution || message.execution.operations.at(-1)?.content === content) return message;
          return { ...message, execution: { ...message.execution, operations: [...message.execution.operations, { timestamp, content }] } };
        }),
      }));
    };
    try {
      const response = await fetch(apiUrl('/v1/orchestration/generate-stream'), {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: content,
          provider_id: currentWorkflow.meta?.authoring_provider || 'minimax',
          model: currentWorkflow.meta?.authoring_model || undefined,
          reasoning: currentWorkflow.meta?.authoring_reasoning || undefined,
          project_name: currentWorkflow.fileName ? currentWorkflow.title : undefined,
          current_project: currentProject,
          save_on_success: false,
          overwrite: false,
          conversation_history: conversationHistory,
        }),
      });

      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return; }
      if (!response.ok) {
        const errText = await response.text().catch(() => 'AI 编排接口调用失败');
        throw new Error(errText);
      }

      reader = response.body?.getReader();
      if (!reader) throw new Error('无法建立流式连接');

      const decoder = new TextDecoder();
      let finalResult: WorkflowGenerateResponse | null = null;
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (currentEventType === 'thinking') {
                if (typeof data.content === 'string' && data.content.trim()) recordOperation(data.content.trim());
              } else if (currentEventType === 'result') {
                finalResult = data as WorkflowGenerateResponse;
              } else if (currentEventType === 'error') {
                throw new Error(data.message || '编排失败');
              }
              // reset event type after processing
              currentEventType = '';
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }

      // Rehearse compiled text experiences with the real engine and isolated state.
      // Device/model workflows are never automatically executed here.
      if (finalResult?.build_report && canApplyScenario(finalResult)) {
        recordOperation('正在检查本地场景试运行…');
        const rehearsal = await rehearseScenario(finalResult.project);
        if (controller.signal.aborted) return;
        recordOperation(rehearsal.status === 'failed' ? '本地场景试运行未通过' : rehearsal.status === 'passed' ? '本地场景试运行通过' : '当前场景不支持本地自动试运行，已跳过');
        finalResult.build_report.rehearsal = rehearsal;
        if (rehearsal.status === 'failed') {
          finalResult.build_report.can_apply = false;
          finalResult.build_report.status = 'needs_changes';
          finalResult.build_report.issues.push(rehearsal.issue || '自动试运行失败');
          finalResult.validation.passed = false;
        }
        finalResult.project.meta = { ...(finalResult.project.meta || {}), build_report: finalResult.build_report };
      }
      // Stream complete - process final result
      if (finalResult) {
        if (finalResult.chat_reply) {
          // 对话回复
          updateWorkflow(activeWorkflow.id, (workflow) => ({
            ...workflow,
            messages: workflow.messages.map((m) =>
              m.id === thinkingMsgId
                ? { ...m, content: finalResult!.chat_reply!, isStreaming: false }
                : m
            ),
            dirty: true,
          }));
        } else {
          // 生成只更新草稿；由用户在仿真页明确发起运行。
          const runtimeRun: RuntimeRunResult | null = null;
          const showDraft = canInspectScenario(finalResult, currentWorkflow.nodes.filter(node => !node.data?.designOnly).length);
          const displayCandidate = canApplyScenario(finalResult) || showDraft;
          if (showDraft && finalResult.build_report) finalResult.build_report.draft_displayed = true;
          if (displayCandidate && flowCanvasRef.current && activeIdRef.current === activeWorkflow.id) {
            applyProjectToCanvas(flowCanvasRef.current, finalResult.project, true);

          }

          const summaryContent = summarizeResult(finalResult);
          // Streaming updates are transient progress only. The completed chat message
          // should contain the reviewable orchestration result, never model reasoning.
          const finalContent = finalResult.build_report ? summaryContent : `${summaryContent}\n\n${canApplyScenario(finalResult) ? "请到仿真页发起测试。" : "结果未应用，当前画布已保留。"}`;

          if (!displayCandidate) {
            const candidate = finalResult;
            updateWorkflow(activeWorkflow.id, (workflow) => ({
              ...workflow,
              meta: { ...(workflow.meta || {}), pending_scenario_build: candidate },
              messages: workflow.messages.map(m => m.id === thinkingMsgId ? { ...m, content: finalContent, isStreaming: false } : m),
              dirty: true,
            }));
            return;
          }
          updateWorkflow(activeWorkflow.id, (workflow) => ({
            ...workflow,
            title: workflow.fileName ? workflow.title : (finalResult!.project_name || workflow.title),
            projectId: workflow.projectId,
            fileName: workflow.fileName,
            nodes: finalResult!.project?.nodes || workflow.nodes,
            edges: finalResult!.project?.edges || workflow.edges,
            meta: {
              ...(workflow.meta || {}),
              ...(finalResult!.project?.meta || {}),
              pending_scenario_build: undefined,
              map_storyboard: finalResult!.map_storyboard || workflow.mapStoryboard || null,
              runtime_runs: runtimeRun
                ? [...(((workflow.meta?.runtime_runs as RuntimeRunResult[] | undefined) || []).slice(-4)), runtimeRun]
                : (workflow.meta?.runtime_runs || []),
            },
            mapStoryboard: finalResult!.map_storyboard || workflow.mapStoryboard || null,
            messages: workflow.messages.map((m) =>
              m.id === thinkingMsgId
                ? { ...m, content: finalContent, isStreaming: false }
                : m
            ),
            dirty: true,
          }));
          if (activeIdRef.current === activeWorkflow.id) onWorkspaceModeChange('edit');
        }
      } else {
        executionStatus = 'interrupted';
        // No terminal result: do not present a progress event as the final answer.
        updateWorkflow(activeWorkflow.id, (workflow) => ({
          ...workflow,
          messages: workflow.messages.map((m) =>
            m.id === thinkingMsgId
              ? { ...m, content: '连接已结束，但未收到完整结果，请重试。', isStreaming: false }
              : m
          ),
        }));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      executionStatus = 'failed';
      const errorContent = `AI 编排失败：${error instanceof Error ? error.message : '未知错误'}`;
      updateWorkflow(activeWorkflow.id, (workflow) => ({
        ...workflow,
        messages: workflow.messages.map((m) =>
          m.id === thinkingMsgId
            ? { ...m, content: errorContent, isStreaming: false }
            : m
        ),
      }));
    } finally {
      if (!controller.signal.aborted) {
        cancelRequestsRef.current.delete(activeWorkflow.id);
        const finishedAt = Date.now();
        const durationMs = Math.max(0, performance.now() - startedClock);
        updateWorkflow(activeWorkflow.id, workflow => ({
          ...workflow,
          dirty: true,
          messages: workflow.messages.map(message => message.id === thinkingMsgId && message.execution
            ? { ...message, isStreaming: false, execution: { ...message.execution, finishedAt, durationMs, status: executionStatus } }
            : message),
        }));
        pendingRequestsRef.current.delete(activeWorkflow.id);
        setPendingWorkflowIds(new Set(pendingRequestsRef.current));
      }
    }
  }, [activeWorkflow, onWorkspaceModeChange, snapshotActiveWorkflow, updateWorkflow]);

  const toggleChatOpen = useCallback((open: boolean) => {
    if (!activeWorkflow) {
      return;
    }
    updateWorkflow(activeWorkflow.id, (workflow) => ({ ...workflow, chatOpen: open }));
  }, [activeWorkflow, updateWorkflow]);

  const openProjectFromLibrary = useCallback((project: WorkflowProject) => {
    const existing = workflows.find(workflow => (project.file_name && workflow.fileName === project.file_name) || (project.id && workflow.projectId === project.id));
    if (existing) switchWorkflow(existing.id);
    else createWorkflowTab(project);
    onWorkspaceModeChange('edit');
    onProjectLibraryClose?.();
  }, [workflows, switchWorkflow, createWorkflowTab, onWorkspaceModeChange, onProjectLibraryClose]);

  const goHome = useCallback(() => {
    snapshotActiveWorkflow();
    onGoHome?.();
  }, [snapshotActiveWorkflow, onGoHome]);
  const projectDeleted = useCallback((projectId: string) => {
    snapshotActiveWorkflow();
    for (const workflow of workflowsRef.current) if (workflow.projectId === projectId || workflow.fileName === `${projectId}.json`) autosave.forget(workflow.id);
    setWorkflows(current => current.map(workflow =>
      workflow.projectId === projectId || workflow.fileName === `${projectId}.json`
        ? { ...workflow, projectId: undefined, fileName: undefined, updatedAt: undefined, autosavePaused: true, dirty: true }
        : workflow));
    setProjectNotice('项目文件已删除，已打开的内容保留为未保存副本。');
  }, [snapshotActiveWorkflow, autosave]);
  useImperativeHandle(ref, () => ({ newProject, saveProject: saveWorkflow, openProject: openProjectFromLibrary, goHome, projectDeleted }), [newProject, saveWorkflow, openProjectFromLibrary, goHome, projectDeleted]);

  const handleStoryboardActiveChange = useCallback((payload: {
    currentSegment?: MapStoryboard['segments'][number] | null;
    currentEvent?: MapStoryboard['events'][number] | null;
  }) => {
    const ref = flowCanvasRef.current;
    if (!ref) {
      return;
    }
    const nodeIds = pickPlaybackNodeIds(ref.getNodes(), payload.currentSegment, payload.currentEvent);
    ref.highlightNodes(nodeIds);
  }, []);

  const workflowTabs = workflows.map((workflow) => ({
    id: workflow.id,
    title: workflow.title,
    dirty: workflow.dirty,
  }));
  const isSimulationMode = workspaceMode === 'simulate';
  const isDeployMode = workspaceMode === 'deploy';
  const showRouteStoryboard = !!activeWorkflow?.mapStoryboard && !!activeWorkflow && isRouteBasedWorkflow(activeWorkflow);
  const [runHistories, setRunHistories] = useState<Record<string, RuntimeRunResult[]>>({});
  const replacingWhileRunning = !!templateChoice && pendingWorkflowIds.has(templateChoice.workflowId);
  const replacementNodeCount = flowCanvasRef.current?.getNodes().length || 0;
  const showChatPanel = !!activeWorkflow && activeWorkflow.chatOpen && workspaceMode === 'edit';

  return (
    <SimulationChatProvider workflowIds={workflows.map(workflow => workflow.id)}>
    <div className="workspace-page flex-1 flex h-full flex-col overflow-hidden relative">
      {projectNotice && <div role="status" className="absolute bottom-4 left-4 z-50 rounded-lg border border-border bg-popover px-4 py-2 type-body text-foreground shadow-lg">{uiText(projectNotice)}</div>}
      <ProjectConfirmDialog
        open={!!templateChoice}
        confirmVariant="primary"
        title={replacingWhileRunning ? '要停止当前编排并使用模板吗？' : uiText('使用「{0}」模板？', [uiText(templateChoice?.name || '')])}
        description={replacingWhileRunning
          ? uiText('「{0}」正在编排。使用「{1}」将停止本次编排，并替换当前画布；已有聊天记录会保留。', [activeWorkflow?.title || '', uiText(templateChoice?.name || '')])
          : replacementNodeCount > 0
            ? uiText('模板将替换当前画布中的 {0} 个节点。项目名称和聊天记录会保留。', [replacementNodeCount])
            : uiText('模板将在当前项目中载入新的场景流程。项目名称和聊天记录会保留。')}
        cancelLabel={replacingWhileRunning ? '继续当前编排' : '取消'}
        confirmLabel={replacingWhileRunning ? '停止并使用模板' : replacementNodeCount > 0 ? '替换画布' : '使用模板'}
        onCancel={() => setTemplateChoice(null)}
        onConfirm={() => { if (templateChoice) loadSceneTemplate(templateChoice.workflowId, templateChoice.template, templateChoice.name); }}
      />
      <WorkspaceModeBar
        mode={workspaceMode}
        onChange={onWorkspaceModeChange}
      />
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <ProjectLibraryPanel
          open={!!projectLibraryOpen}
          onClose={onProjectLibraryClose || (() => {})}
          onOpenProject={openProjectFromLibrary}
          onProjectDeleted={projectDeleted}
          projectActionsDisabled={projectActionsDisabled}
        />

        <div className="flex-1 relative min-w-0">
          {activeWorkflow && (
            <FlowCanvas
              key={activeWorkflow.id}
              ref={flowCanvasRef}
              onGraphChange={handleGraphChange}
              simulatorRef={simulatorRef}
              hideHeader
              projectName={activeWorkflow.title}
              projectFileName={activeWorkflow.fileName}
              initialProject={{
                id: activeWorkflow.projectId,
                name: activeWorkflow.title,
                file_name: activeWorkflow.fileName,
                nodes: activeWorkflow.nodes,
                edges: activeWorkflow.edges,
                meta: activeWorkflow.meta,
              }}
              workflowTabs={workflowTabs}
              activeWorkflowId={activeWorkflow.id}
              onSwitchWorkflow={switchWorkflow}
              onCreateWorkflow={newProject}
              onCreateChildWorkflow={() => { createWorkflowTab({ name: '儿童关怀', ...buildChildSafetyTemplate(createChildSafetyScenarioSpec()) }); onWorkspaceModeChange('simulate'); }}
              onCreateRainWorkflow={() => { createWorkflowTab(buildRainComfortScenario()); onWorkspaceModeChange('simulate'); }}
              onCloseWorkflow={closeWorkflow}
              onSaveWorkflow={() => void saveWorkflow()}
              onOpenProjectLibrary={onProjectLibraryToggle}
              projectLibraryOpen={!!projectLibraryOpen}
              onProjectLibraryClose={onProjectLibraryClose}
              mcpLibraryOpen={mcpLibraryOpen}
              onMcpLibraryClose={onMcpLibraryClose}
              modelLibraryOpen={modelLibraryOpen}
              onModelLibraryClose={onModelLibraryClose}
              sidebarOpen={sidebarOpen}
              onSidebarClose={onSidebarClose}
              sceneLibraryOpen={sceneLibraryOpen}
              onSceneLibraryClose={onSceneLibraryClose}
              runHistory={runHistories[activeWorkflow.id] || []}
              onRunRecorded={result => setRunHistories(old => ({ ...old, [activeWorkflow.id]: [result, ...(old[activeWorkflow.id] || [])].slice(0, 20) }))}
              diagnosticPanel={diagnosticPanel}
              onDiagnosticClose={onDiagnosticClose}
              simulatorOpen={isSimulationMode}
              deploymentOpen={isDeployMode}
              onDeploymentOpenChange={(open) => {
                if (!open) onWorkspaceModeChange('edit');
              }}
              onTemplateLoaded={requestSceneTemplate}
              onGoHome={goHome}
            />
          )}
        </div>

        {activeWorkflow && workspaceMode === 'edit' && (
          <button
            onClick={() => toggleChatOpen(!activeWorkflow.chatOpen)}
            className="workspace-chat-toggle absolute right-3 z-20 w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={uiText(activeWorkflow.chatOpen ? uiText("收起对话面板") : uiText("展开对话面板"))}
            aria-label={uiText(activeWorkflow.chatOpen ? uiText("收起对话面板") : uiText("展开对话面板"))}
            aria-expanded={activeWorkflow.chatOpen}
          >
            <AppIcon name={activeWorkflow.chatOpen ? 'panel-right-close' : 'panel-right-open'} size={16} />
          </button>
        )}

        {showChatPanel && (
          <div className="workspace-chat-panel shrink-0 relative border-l workspace-divider bg-card flex flex-col">
            <div className="flex-1 min-h-0 min-w-0">
              <ChatPanel
                key={activeWorkflow.id}
                providerId={activeWorkflow.meta?.authoring_provider || 'minimax'}
                model={activeWorkflow.meta?.authoring_model}
                reasoning={activeWorkflow.meta?.authoring_reasoning}
                onModelChange={(providerId, model, reasoning) => updateWorkflow(activeWorkflow.id, workflow => ({
                  ...workflow, meta: { ...(workflow.meta || {}), authoring_provider: providerId, authoring_model: model, authoring_reasoning: reasoning }, dirty: true,
                }))}
                messages={activeWorkflow.messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}

        {isSimulationMode && showRouteStoryboard && activeWorkflow && (
          <div className="w-[360px] shrink-0 border-l workspace-divider bg-card min-w-0">
            <MapStoryboardPanel
              storyboard={activeWorkflow.mapStoryboard}
              isLoading={isLoading}
              onActiveChange={handleStoryboardActiveChange}
            />
          </div>
        )}


      </div>
    </div>
    </SimulationChatProvider>
  );
});
