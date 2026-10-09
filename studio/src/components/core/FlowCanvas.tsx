import { NodeContextMenu, type NodeMenuPosition } from './NodeContextMenu';
import { nodeDeletion, restoreDeletedNodes, type DeletedNodes } from '@/domain/nodeDeletion';
import { persistentGraph } from '@/domain/projectAutosave';
import { uiLocale  } from '@/i18n';
import { uiText, useUiLanguage } from '@/i18n';
import {durableTurn, executionKey, executionStorage, restoreDurableSnapshot} from '@/domain/durableFlow';
import {stageView} from '@/domain/stageView';
import {isGeneralFlow} from '@/domain/flowSession';
import {FlowCapabilityNode,StageNode,withFlowPorts} from '@/components/nodes/FlowNodes';
import { WorkflowLayoutControls } from './WorkflowLayoutControls';
import { InteractionNode } from '@/components/nodes/InteractionNode';
import { sessionsForProject } from '@/domain/scenarioSession';
import { NavigationPanel } from '@/components/layout/NavigationPanel';
import { LayoutGrid, Brain } from 'lucide-react';
import { AppIcon } from '@/components/ui/AppIcon';
import { validateGraph } from '@/domain/nodeCapabilities';
import { RearVideoProvider, useRearVideo } from './RearVideo';
import type { ReplayFrame } from '@/domain/videoReplay';
import { VideoDisplayNode } from '@/components/nodes/VideoDisplayNode';
import { SimulationInputSurface } from './SimulationInputPanel';
import { useCallback, useRef, useState, useImperativeHandle, forwardRef, useEffect, type Ref } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  MarkerType,
  type Connection,
  type NodeChange,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { LLMNode } from '@/components/nodes/LLMNode';
import { ToolNode } from '@/components/nodes/ToolNode';
import { MemoryNode } from '@/components/nodes/MemoryNode';
import { DataNode } from '@/components/nodes/DataNode';
import { LogicNode } from '@/components/nodes/LogicNode';
import { InputNode, OutputNode } from '@/components/nodes/IONode';
import { SystemInputNode } from '@/components/nodes/SystemInputNode';
import CarControlNode from '@/components/nodes/CarControlNode';
import OpenClawNode from '@/components/nodes/OpenClawNode';
import { RecognitionNode } from '@/components/nodes/RecognitionNode';
import { FallbackNode } from '@/components/nodes/FallbackNode';
import { CockpitAlertNode } from '@/components/nodes/CockpitAlertNode';
import { RiskMonitorNode } from '@/components/nodes/RiskMonitorNode';
import { EventLogNode } from '@/components/nodes/EventLogNode';
import { PropertyPanel } from '@/components/layout/PropertyPanel';
import { Button } from '@/components/ui/button';
import { Network, Activity, Cpu, Share, FileJson, Server, Monitor, Globe, Save, FolderOpen, Plus, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { VehicleSimulator, type VehicleSimulatorRef } from './VehicleSimulator';
import { DeploymentWizard } from '@/components/wizards/DeploymentWizard';
import { Sidebar } from '@/components/layout/Sidebar';
import { SceneLibraryPanel } from '@/components/layout/SceneLibraryPanel';
import { DiagnosticPanel } from '@/components/layout/DiagnosticPanel';
import { ModelRegistry } from '@/components/wizards/ModelRegistry';
import { GraphEngine, type GraphCallbacks } from '@/utils/GraphEngine';
import type { RuntimeRunResult } from '@/domain/runtime';
import { apiUrl } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define custom node types
const baseNodeTypes = {
  wait: FlowCapabilityNode, state: FlowCapabilityNode, stage: StageNode,
  interaction: InteractionNode,
  llm: LLMNode,
  tool: ToolNode,
  memory: MemoryNode,
  data: DataNode,
  logic: LogicNode,
  input: InputNode,
  output: OutputNode,
  systemInput: SystemInputNode,
  car_control: CarControlNode,
  openclaw: OpenClawNode,
  recognition: RecognitionNode,
  fallback: FallbackNode,
  cockpit_alert: CockpitAlertNode,
  risk_monitor: RiskMonitorNode,
  event_log: EventLogNode,
  video_display: VideoDisplayNode,
};

const nodeTypes=Object.fromEntries(Object.entries(baseNodeTypes).map(([type,component])=>[type,type==='stage'?component:withFlowPorts(component,type)]));

let id = 0;
const getId = () => `dndnode_${id++}`;

// Opening a workflow centers it at its designed size, regardless of node count.
const initialCanvasView = { padding: 0.18, minZoom: 1, maxZoom: 1 };

const defaultEdgeOptions = {
  animated: true,
  style: { strokeWidth: 2, stroke: 'currentColor', strokeOpacity: 1 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: 'currentColor',
  },
};

export interface CanvasNodeSpec {
  id?: string;
  type: string;
  label: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}

export interface CanvasEdgeSpec {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export type FlowCanvasRef = {
  updateNodeStatus: (nodeId: string, status: 'idle' | 'running' | 'success' | 'error', output?: string) => void;
  highlightNodes: (nodeIds: string[]) => void;
  getNodes: () => Node[];
  getEdges: () => Edge[];
  runPipeline: (input?: string | { type: 'image'; content: string; text?: string }) => Promise<RuntimeRunResult>;
  runWorkflow: (input: string | { type: 'image'; content: string; text?: string }, project: { nodes: Node[]; edges: Edge[] }) => Promise<RuntimeRunResult>;
  replaceWorkflow: (project: { nodes: Node[]; edges: Edge[] }, options?: { arrange?: boolean; fitView?: boolean }) => void;
  addNode: (spec: CanvasNodeSpec) => string;
  addEdge: (spec: CanvasEdgeSpec) => void;
  clearCanvas: () => void;
};

interface WorkflowCanvasProject {
  id?: string;
  name: string;
  file_name?: string;
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
  meta?: Record<string, any>;
}

interface WorkflowCanvasTab {
  id: string;
  title: string;
  dirty: boolean;
}

export const FlowCanvas = forwardRef<FlowCanvasRef, FlowCanvasProps>((props, ref) =>  { useUiLanguage(); return ((
  <ReactFlowProvider>
    <RearVideoProvider sessionKey={props.activeWorkflowId}><FlowCanvasInternal ref={ref} {...props} /></RearVideoProvider>
  </ReactFlowProvider>
)); });

FlowCanvas.displayName = 'FlowCanvas';

interface FlowCanvasProps {
    simulatorRef: React.RefObject<VehicleSimulatorRef | null>;
    initialProject?: WorkflowCanvasProject;
    projectFileName?: string;
    workflowTabs?: WorkflowCanvasTab[];
    activeWorkflowId?: string;
    onSwitchWorkflow?: (workflowId: string) => void;
    onCreateWorkflow?: () => void;
    onCreateRainWorkflow?: () => void;
    onCreateChildWorkflow?: () => void;
    onCloseWorkflow?: (workflowId: string) => void;
    onSaveWorkflow?: () => void;
    onOpenProjectLibrary?: () => void;
    projectLibraryOpen?: boolean;
    onProjectLibraryClose?: () => void;
    hideHeader?: boolean;
  mcpLibraryOpen?: boolean;
  onMcpLibraryClose?: () => void;
  modelLibraryOpen?: boolean;
  onModelLibraryClose?: () => void;
  sidebarOpen?: boolean;
    onSidebarClose?: () => void;
    sceneLibraryOpen?: boolean;
    onSceneLibraryClose?: () => void;
    runHistory?: RuntimeRunResult[];
    onRunRecorded?: (result: RuntimeRunResult) => void;
    diagnosticPanel?: "runs" | "devices";
    onDiagnosticClose?: () => void;
    simulatorOpen?: boolean;
    onSimulatorToggle?: () => void;
    deploymentOpen?: boolean;
    onDeploymentOpenChange?: (open: boolean) => void;
    onGraphChange?: (workflowId: string, nodes: Array<Record<string, any>>, edges: Array<Record<string, any>>) => void;
    onTemplateLoaded?: (template: { nodes: Node[]; edges: Edge[]; meta?: Record<string, unknown> }, name: string) => void;
    onGoHome?: () => void;
    projectName?: string;
}

interface LogEntry {
    id: string;
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'success';
    source: 'system' | 'agent' | 'vehicle' | 'user';
    message: string;
}

const FlowCanvasInternal = forwardRef(function FlowCanvasInternal({
  simulatorRef,
  initialProject,
  projectFileName,
  workflowTabs = [],
  activeWorkflowId,
  onSwitchWorkflow,
  onCreateWorkflow,
  onCreateRainWorkflow,
  onCreateChildWorkflow,
  onCloseWorkflow,
  onSaveWorkflow,
  onOpenProjectLibrary,
  hideHeader,
  mcpLibraryOpen,
  onMcpLibraryClose,
  modelLibraryOpen,
  onModelLibraryClose,
  sidebarOpen,
  onSidebarClose,
  sceneLibraryOpen,
  onSceneLibraryClose,
  runHistory = [],
  onRunRecorded,
  diagnosticPanel,
  onDiagnosticClose,
  simulatorOpen: simulatorOpenProp,
  onSimulatorToggle,
  deploymentOpen,
  onDeploymentOpenChange,
  onTemplateLoaded,
  onGraphChange,
  projectName,
}: FlowCanvasProps, ref: Ref<FlowCanvasRef>) {
  useUiLanguage();
  const rearVideo = useRearVideo();
  const { language, setLanguage, theme, toggleTheme } = useApp();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [layoutRequest, setLayoutRequest] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>((initialProject?.nodes || []) as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>((initialProject?.edges || []) as Edge[]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  const canvasSurface = useRef<HTMLDivElement>(null);
  const [nodeMenu, setNodeMenu] = useState<NodeMenuPosition | null>(null);
  const [deletedNodes, setDeletedNodes] = useState<DeletedNodes | null>(null);

  // UI State
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [executing, setIsRunning] = useState(false);
  const savedExecutionProject=projectFileName || initialProject?.file_name || initialProject?.id;
  const supportsDurableExecution=!!savedExecutionProject&&isGeneralFlow((initialProject?.nodes||[]) as Node[])&&!initialProject?.nodes.some(n=>n.type==='interaction');
  const [restoringExecution,setRestoringExecution]=useState(supportsDurableExecution);
  const isRunning=executing||restoringExecution;
  const closeNodeMenu = () => { setNodeMenu(null); canvasSurface.current?.focus({ preventScroll: true }); };
  const restoredDeletion = deletedNodes ? restoreDeletedNodes(nodes, edges, deletedNodes) : null;
  const undoNodeDeletion = () => {
    if (isRunning || !restoredDeletion) return;
    setNodes(restoredDeletion.nodes);
    setEdges(restoredDeletion.edges);
    setDeletedNodes(null);
    closeNodeMenu();
  };
  const deleteContextNode = () => {
    if (isRunning || !nodeMenu?.nodeId) return;
    const result = nodeDeletion(nodes, edges, nodeMenu.nodeId);
    if (!result) return;
    setNodes(result.nodes);
    setEdges(result.edges);
    setDeletedNodes(result.undo);
    if (selectedNode && result.undo.nodes.some(node => node.id === selectedNode.id)) {
      setSelectedNode(null);
      setIsPanelOpen(false);
    }
    closeNodeMenu();
  };
  useEffect(() => { setNodeMenu(null); setDeletedNodes(null); }, [activeWorkflowId]);
  const durableCursor=useRef<{revision?:number}>({});
  const activeExecution=useRef<AbortController|null>(null);
  useEffect(()=>()=>activeExecution.current?.abort(new Error('页面已切换，本次执行已停止。')),[]);
  const [isDeployWizardOpen, setIsDeployWizardOpen] = useState(false);
  const [isModelRegistryOpen, setIsModelRegistryOpen] = useState(false);
  const isDeploymentWizardVisible = deploymentOpen ?? isDeployWizardOpen;
  const handleDeploymentOpenChange = (open: boolean) => {
    if (deploymentOpen === undefined) {
      setIsDeployWizardOpen(open);
    }
    onDeploymentOpenChange?.(open);
  };

  // Kernel State
  // Engineering Telemetry
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);

  // Helper to add logs
  const addLog = (level: LogEntry['level'], source: LogEntry['source'], message: string) => {
      setSystemLogs(prev => [
          {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toLocaleTimeString(uiLocale()),
              level,
              source,
              message
          },
          ...prev.slice(0, 99) // Keep last 100 logs
      ]);
  };

  // Chat History
  const [chatHistory] = useState<{id: string, type: 'user'|'agent', content: string}[]>([
        { id: '0', type: 'agent', content: 'CyberClaw OS initialized. Ready for engineering tasks.' }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
  }, [chatHistory]);

  const [isSimulatorOpenInternal, setIsSimulatorOpenInternal] = useState(true);
  const isSimulatorOpen = simulatorOpenProp !== undefined ? simulatorOpenProp : isSimulatorOpenInternal;
  useEffect(() => { setNodeMenu(null); }, [isSimulatorOpen]);
  const setIsSimulatorOpen = onSimulatorToggle || (() => setIsSimulatorOpenInternal(prev => !prev));

  // Lifted Simulation Config State
  const [simConfig] = useState({
    industryMode: 'automotive' as 'automotive' | 'logistics' | 'manufacturing',
    cameraView: 'exterior' as 'exterior' | 'interior',
    quality: 'high' as 'low' | 'high',
  });

  const lastPublishedGraph = useRef('');
  useEffect(() => {
    if (!activeWorkflowId || !onGraphChange) return;
    const graph = persistentGraph(nodes, edges);
    const content = JSON.stringify(graph);
    if (lastPublishedGraph.current === content) return;
    lastPublishedGraph.current = content;
    onGraphChange(activeWorkflowId, graph.nodes, graph.edges);
  }, [nodes, edges, activeWorkflowId, onGraphChange]);

  // Load workflow content on mount / tab switch
  useEffect(() => {
    setNodes((initialProject?.nodes || []) as Node[]);
    setEdges((initialProject?.edges || []) as Edge[]);
    setSelectedNode(null);
    setIsPanelOpen(false);
    setInputVal("");
    addLog('info', 'system', 'OAKEgde Studio initialized');
    addLog('success', 'system', 'Connected to Simulator Engine');
  }, [setNodes, setEdges]);

  const [targetDevice, setTargetDevice] = useState<string>("local");
  const [devices, setDevices] = useState<{id: string, name: string, ip: string, status: string}[]>([]);

  // Load devices on mount
  useEffect(() => {
      const fetchDevices = async () => {
          try {
              const res = await fetch(apiUrl('/v1/edge/devices'));
              if (res.ok) {
                  const data = await res.json();
                  setDevices(data.devices || []);
              }
          } catch (e) {
              // Silent fail for demo
          }
      };
      fetchDevices();
      const interval = setInterval(fetchDevices, 5000);
      return () => clearInterval(interval);
  }, []);

  const executionLock = useRef(false);
  const anonymousSessionId = useRef(crypto.randomUUID());
  useEffect(()=>{
    let disposed=false;
    durableCursor.current={};
    if(!supportsDurableExecution){setRestoringExecution(false);return;}
    setRestoringExecution(true);
    void (async()=>{
      const key=await executionKey(savedExecutionProject!);
      const record=await executionStorage(key).read();
      if(disposed)return;
      const simulator=simulatorRef.current;
      if(!simulator)throw Error('仿真状态尚未连接。');
      if(record.phase==='running')throw Error('上轮执行仍在运行或已中断；核对动作结果后使用重新开始。');
      if(record.payload){
        const sessions=sessionsForProject(activeWorkflowId || anonymousSessionId.current);
        restoreDurableSnapshot(record.payload,initialProject!.nodes as Node[],initialProject!.edges as Edge[],sessions,value=>simulator.prepareExecutionState(value));
        const checkpoint=sessions.flow.snapshot();
        if(checkpoint)setNodes(nds=>nds.map(n=>({...n,data:{...n.data,status:checkpoint.nodes[n.id]==='failed'?'error':['success','waiting'].includes(checkpoint.nodes[n.id])?'success':'idle',output:checkpoint.outputs[n.id]??null}})));
      }
      durableCursor.current.revision=record.revision;
    })().catch(error=>{
      if(!disposed){addLog('error','system',error.message);simulatorRef.current?.updateState('hmi','message',error.message);}
    }).finally(()=>{if(!disposed)setRestoringExecution(false);});
    return()=>{disposed=true;};
  },[savedExecutionProject,supportsDurableExecution]);
  // Graph Execution Engine
  const runPipelineInternal = async (
    inputOverride?: string | { type: 'image'; content: string; text?: string; replay?: ReplayFrame },
    graphOverride?: { nodes: Node[]; edges: Edge[] },
    simulationModel?: string,
    signal?: AbortSignal,
  ): Promise<RuntimeRunResult> => {
        signal?.throwIfAborted();
        if (restoringExecution) throw new Error('正在恢复执行进度，请稍候。');
        if (executionLock.current) throw new Error('工作流正在运行');
        const controller=new AbortController();activeExecution.current=controller;
        signal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
        const executionSimulator=simulatorRef.current;
        executionLock.current = true;
        setIsRunning(true);
        const input = inputOverride || inputVal;
        const executionNodes = graphOverride?.nodes || nodes;
        const executionEdges = graphOverride?.edges || edges;
        let activationCounter = 0;

        // Reset all statuses
        setNodes(executionNodes.map(n => ({
            ...n,
            data: {
                ...n.data,
                status: 'idle',
                output: undefined,
                trace: undefined,
                activationIndex: undefined,
                effectivePrompt: undefined,
                basePrompt: undefined,
                structuredPrompt: undefined,
                promptMode: undefined,
                allowedActions: undefined
            }
        })));
        if (graphOverride) {
            setEdges(executionEdges);
        }

        const callbacks: GraphCallbacks = {
            showRearVideo: (config, signal) => { if (!rearVideo) throw new Error('后排视频未连接'); return rearVideo.show(config, signal); },
            updateNodeStatus: (nodeId, status, output, trace, details) => {
                setNodes((nds) => nds.map(n => {
                    if (n.id === nodeId) {
                        const activationIndex = status === 'running'
                            ? ++activationCounter
                            : n.data.activationIndex;
                        return { 
                            ...n, 
                            data: { 
                                ...n.data, 
                                status, 
                                activationIndex,
                                ...(output !== undefined ? { output } : {}),
                                ...(trace !== undefined ? { trace } : {}),
                                ...(details !== undefined ? details : {})
                            } 
                        };
                    }
                    return n;
                }));
            },
            updateKernel: () => {},
            updateMemory: () => {},
            updateSafety: () => {},
            updateMiddleware: () => {},
            log: addLog,
            getSimulatorState: () => executionSimulator?.getState(),
            executeHmiControl: (request) => {
                if (!executionSimulator) throw new Error('HMI 仿真未连接');
                return executionSimulator.executeHmiControl(request);
            },
            executeAmbientLight: (request) => {
                if (!executionSimulator) throw new Error('HMI 仿真未连接');
                return executionSimulator.executeAmbientLight(request);
            },
            restoreAmbientLight: () => {
                if (!executionSimulator) throw new Error('HMI 仿真未连接');
                return executionSimulator.restoreAmbientLight();
            },
            executeWindowTargets: async (targets) => {
                if (!executionSimulator) throw new Error('仿真车辆未连接');
                return executionSimulator.executeWindowTargets(targets);
            },
            executeWindowAction: async (action) => {
                if (!executionSimulator) throw new Error('仿真车辆未连接');
                return executionSimulator.executeWindowAction(action);
            },
            updateSimulatorState: (category, key, value) => {
                if (!executionSimulator) throw new Error('HMI 仿真未连接');
                executionSimulator.updateState(category as any, key, value);
            }
        };

        try {
            const inferenceNodes = simulationModel ? executionNodes.map(n => n.type === 'llm' ? { ...n, data: { ...n.data, model: simulationModel, maxTokens: Math.max(Number(n.data.maxTokens) || 0, 512) } } : n) : executionNodes;
            const sessions=sessionsForProject(activeWorkflowId || anonymousSessionId.current);
            const engine = new GraphEngine(inferenceNodes, executionEdges, callbacks, sessions);
            const savedProject=projectFileName || initialProject?.file_name || initialProject?.id;
            const durable=isGeneralFlow(inferenceNodes)&&!inferenceNodes.some(n=>n.type==='interaction')&&!!savedProject;
            const simulator=executionSimulator;
            if(durable&&!simulator)throw Error('仿真状态未连接，无法恢复执行进度。');
            const result = durable ? await durableTurn({
                storage:executionStorage(await executionKey(savedProject!)),cursor:durableCursor.current,nodes:inferenceNodes,edges:executionEdges,sessions,input,signal,
                snapshotSimulator:()=>simulator!.exportExecutionState(),prepareSimulator:value=>simulator!.prepareExecutionState(value),
                run:runSignal=>engine.run(input,{useCameraFrame:inputOverride===undefined,signal:runSignal}),
            }) : await engine.run(input, { useCameraFrame: inputOverride === undefined, signal });
            onRunRecorded?.(result);
            return result;
        } finally {
            activeExecution.current=null;
            executionLock.current = false;
            setIsRunning(false);
        }
  };


  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateNodeStatus: (nodeId: string, status: 'idle' | 'running' | 'success' | 'error', output?: string) => {
      setNodes((nds) => 
        nds.map((node) => {
          if (node.id === nodeId) {
            // Merge existing data with new status and output
            const newData: any = { ...node.data, status };
            if (output) {
                newData.output = output;
            }
            
            const updatedNode = { ...node, data: newData };
            
            if (selectedNode && selectedNode.id === nodeId) {
                 setSelectedNode(updatedNode);
            }
            return updatedNode;
          }
          return node;
        })
      );
    },
    highlightNodes: (nodeIds: string[]) => {
      const activeIds = new Set(nodeIds);
      setNodes((nds) =>
        nds.map((node) => {
          const isActive = activeIds.has(node.id);
          const nextStatus = isActive ? 'running' : 'idle';
          if ((node.data as any)?.status === nextStatus) {
            return node;
          }
          return {
            ...node,
            data: {
              ...(node.data || {}),
              status: nextStatus,
            },
          };
        }),
      );
    },
    getNodes: () => nodes,
    getEdges: () => edges,
    runPipeline: (input?: string | { type: 'image'; content: string; text?: string }) => {
        if (typeof input === 'string') {
            setInputVal(input);
        }
        return runPipelineInternal(input);
    },
    runWorkflow: (input, project) => {
      if (typeof input === 'string') {
        setInputVal(input);
      }
      return runPipelineInternal(input, project);
    },
    replaceWorkflow: (project, options) => {
      setNodeMenu(null);
      setDeletedNodes(null);
      setLayoutRevision(value => value + 1);
      setLayoutRequest(options?.arrange ? 1 : 0);
      setNodes(project.nodes.map((node) => ({
        ...node,
        data: { ...(node.data || {}), status: 'idle' },
      })));
      setEdges(project.edges);
      setSelectedNode(null);
      setIsPanelOpen(false);
      if (options?.fitView) window.setTimeout(() => reactFlowInstance?.fitView(initialCanvasView), 0);
    },
    addNode: (spec: CanvasNodeSpec) => {
      const nodeId = spec.id || getId();
      const newNode: Node = {
        id: nodeId,
        type: spec.type,
        position: spec.position || { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 },
        data: { label: spec.label, status: 'idle', ...spec.data },
      };
      setNodes((nds) => nds.concat(newNode));
      return nodeId;
    },
    addEdge: (spec: CanvasEdgeSpec) => {
      const newEdge = {
        id: `edge_${spec.source}_${spec.target}`,
        source: spec.source,
        target: spec.target,
        sourceHandle: spec.sourceHandle || null,
        targetHandle: spec.targetHandle || null,
        type: 'smoothstep',
      };
      setEdges((eds) => addEdge<Edge>(newEdge, eds));
    },
    clearCanvas: () => {
      setNodeMenu(null);
      setDeletedNodes(null);
      setLayoutRevision(value => value + 1);
      setLayoutRequest(0);
      setNodes([]);
      setEdges([]);
    },
  }));
  
  const onCanonicalNodesChange=(changes:NodeChange<Node>[])=>{
    const removed=new Set(changes.filter(c=>c.type==='remove').map(c=>c.id));
    if (removed.size && isRunning) return;
    if (removed.size) {
      setDeletedNodes(null);
      setNodeMenu(null);
    }
    if(removed.size){let changed=true;while(changed){changed=false;for(const n of nodes)if(n.parentId&&removed.has(n.parentId)&&!removed.has(n.id)){removed.add(n.id);changed=true;}}
      if (selectedNode && removed.has(selectedNode.id)) { setSelectedNode(null); setIsPanelOpen(false); }
      const reported=new Set(changes.filter(c=>c.type==='remove').map(c=>c.id));
      changes=[...changes,...[...removed].filter(id=>!reported.has(id)).map(id=>({type:'remove' as const,id}))];
      setEdges(old=>old.filter(e=>!removed.has(e.source)&&!removed.has(e.target)));
    }
    onNodesChange(changes);
  };
  const displayedGraph=stageView(nodes,edges,id=>setNodes(old=>old.map(n=>n.id===id?{...n,data:{...n.data,collapsed:!n.data.collapsed}}:n)));

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (isRunning || !reactFlowWrapper.current || !reactFlowInstance) {
        return;
      }

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');
      const rawData = event.dataTransfer.getData('application/reactflow-data');
      
      let data = { label, status: 'idle' };
      if (rawData) {
        try {
          const parsed = JSON.parse(rawData);
          data = { ...data, ...parsed };
        } catch (e) {
          console.error("Failed to parse node data", e);
        }
      }

      // check if the dropped element is valid
      if (!type || !Object.hasOwn(nodeTypes, type)) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `dndnode_${crypto.randomUUID()}`,
        type,
        position,
        data: data,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, isRunning],
  );

  const addLibraryNode = useCallback((spec: { type: string; label: string; data?: Record<string, unknown> }) => {
    if (isRunning || !reactFlowInstance || !Object.hasOwn(nodeTypes, spec.type)) return;
    const existing = reactFlowInstance.getNodes();
    const position = existing.length ? {
      x: Math.max(...existing.map(node => node.position.x + (node.measured?.width || node.width || 280))) + 80,
      y: Math.min(...existing.map(node => node.position.y)),
    } : { x: 160, y: 120 };
    const newNode: Node = { id:`library_${crypto.randomUUID()}`, type:spec.type, position, selected:true, data:{...spec.data,label:spec.label,status:'idle'} };
    setNodes(current => [...current.map(node => ({...node,selected:false})),newNode]);
    setSelectedNode(null);
    setIsPanelOpen(false);
    if (isSimulatorOpen) setIsSimulatorOpen();
    onSidebarClose?.();
    window.setTimeout(() => {
      void reactFlowInstance.setCenter(position.x + 140, position.y + 90, { zoom:1, duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200 });
    },0);
  }, [isRunning,reactFlowInstance,setNodes,isSimulatorOpen,setIsSimulatorOpen,onSidebarClose]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setIsPanelOpen(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setIsPanelOpen(false);
  }, []);

  const onNodeUpdate = useCallback((id: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          // Update selected node as well to reflect changes immediately in panel if needed
          const updatedNode = { ...node, data: { ...node.data, ...newData } };
          if (selectedNode && selectedNode.id === id) {
             setSelectedNode(updatedNode);
          }
          return updatedNode;
        }
        return node;
      })
    );
  }, [setNodes, selectedNode]);

  return (
    <div className="relative flex flex-col h-full w-full bg-background" ref={reactFlowWrapper}>
        {/* OAKEgde Studio Header */}
        {!hideHeader && <div className="h-12 border-b workspace-divider bg-card flex items-center px-4 justify-between shrink-0 z-20">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 rounded-md transition-colors ${isSimulatorOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setIsSimulatorOpen()}
                        title="Toggle Simulator"
                    >
                        <Monitor className="w-4 h-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                        <Network className="text-primary-foreground w-4 h-4" />
                    </div>
                    <div>
                        <h1 className="type-panel  text-foreground ">OAKEgde Studio</h1>
                        <span className="type-caption text-muted-foreground">Studio v2.8</span>
                    </div>
                </div>

                <div className="h-5 w-[1px] bg-border mx-1"></div>

                {/* Project Controls */}
                <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="New Project" onClick={onCreateWorkflow}>
                        <Plus className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Open Project" onClick={onOpenProjectLibrary}>
                        <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Save Project" onClick={onSaveWorkflow}>
                        <Save className="w-4 h-4" />
                    </Button>
                </div>

                <div className="h-5 w-[1px] bg-border mx-1"></div>

                <div className="flex items-center gap-3 type-label">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Activity className="w-3 h-3 text-green-500" />
                        <span>Normal</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Cpu className="w-3 h-3" />
                        <span>NPU 12%</span>
                    </div>
                </div>
            </div>

            {/* Global Controls */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 type-label text-muted-foreground hover:text-foreground"
                    onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                >
                    <Globe className="w-3.5 h-3.5 mr-1" />
                    {uiText(language === 'zh' ? 'EN' : uiText("中"))}
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={toggleTheme}
                    title={uiText(theme === 'dark' ? 'Switch to Light' : 'Switch to Dark')}
                >
                    <AppIcon name={theme === 'dark' ? 'sun' : 'moon'} className="w-3.5 h-3.5" />
                </Button>

                <div className="h-5 w-[1px] bg-border mx-1"></div>

                <Select value={targetDevice} onValueChange={(val) => {
                    if (val === 'new_device') {
                        setIsDeployWizardOpen(true);
                        setTargetDevice('new_device');
                    } else {
                        setTargetDevice(val);
                    }
                }}>
                    <SelectTrigger className="w-36 h-7 type-label bg-secondary border-border text-foreground">
                        <div className="flex items-center gap-2">
                            <Server className="w-3 h-3 text-muted-foreground" />
                            <SelectValue placeholder="Target Device" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="local">Local Simulation</SelectItem>
                        <SelectItem value="new_device" className="text-primary font-medium border-t border-border mt-1 pt-1">
                            + Provision New Device
                        </SelectItem>
                        {devices.map(dev => (
                            <SelectItem key={dev.id} value={dev.id}>{dev.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button size="sm" variant="outline" className="h-7 type-label" onClick={() => handleDeploymentOpenChange(true)}>
                    <Share className="w-3.5 h-3.5 mr-1.5" />
                    Deploy
                </Button>

                <Button size="sm" variant="outline" className="h-7 type-label" onClick={() => setIsModelRegistryOpen(true)}>
                    <FileJson className="w-3.5 h-3.5 mr-1.5" />
                    Models
                </Button>
            </div>
        </div>}

            {/* Floating Sidebar Overlay */}
            {sidebarOpen && (
              <NavigationPanel id="components" title={uiText("组件库")} icon={LayoutGrid} onClose={onSidebarClose || (() => {})} className="component-library-panel">
                <Sidebar compact={false} onAddToCanvas={addLibraryNode} addDisabledReason={isRunning ? '流程运行中，请结束后再添加。' : !reactFlowInstance ? '画布正在准备，请稍候。' : undefined} />
              </NavigationPanel>
            )}

        {modelLibraryOpen && (
          <NavigationPanel id="models" title={uiText("模型库")} icon={Brain} onClose={onModelLibraryClose || (() => {})} className="component-library-panel model-library-panel">
            <Sidebar view="models" onAddToCanvas={addLibraryNode} addDisabledReason={isRunning ? '流程运行中，请结束后再添加。' : !reactFlowInstance ? '画布正在准备，请稍候。' : undefined} />
          </NavigationPanel>
        )}

        {mcpLibraryOpen && (
          <NavigationPanel id="mcp" title={uiText("MCP 服务")} icon={Network} onClose={onMcpLibraryClose || (() => {})} className="component-library-panel mcp-library-panel">
            <Sidebar view="mcp" onAddToCanvas={spec => { addLibraryNode(spec); onMcpLibraryClose?.(); }} addDisabledReason={isRunning ? uiText("运行中暂不能添加节点") : undefined} />
          </NavigationPanel>
        )}

        {/* Workflow Tab Bar */}
        <div className="workspace-project-bar border-b workspace-divider bg-card flex items-center justify-between px-2 shrink-0 z-20">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto pr-2">
            {workflowTabs.map((workflow) => {
              const isActive = workflow.id === activeWorkflowId;
              return (
                <button
                  key={workflow.id}
                  onClick={() => onSwitchWorkflow?.(workflow.id)}
                  className={`group flex items-center gap-1.5 px-3 h-7 rounded-md type-label  border transition-colors shrink-0 ${
                    isActive
                      ? 'bg-accent text-foreground border-border'
                      : 'bg-background text-muted-foreground border-transparent hover:bg-accent/60 hover:text-foreground'
                  }`}
                >
                  <span className="max-w-[180px] truncate">{uiText(workflow.title)}</span>
                  {workflow.dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title={uiText("未保存")} />}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseWorkflow?.(workflow.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        onCloseWorkflow?.(workflow.id);
                      }
                    }}
                    className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/80"
                    title={uiText("关闭 Workflow")}
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
            <button onClick={onCreateWorkflow} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0" title={uiText("新建工作流")}>
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Main Content Area */}
        <div className="flex-1 relative overflow-hidden flex">
            {/* Floating Scene Library Overlay */}
            <SceneLibraryPanel
              open={!!sceneLibraryOpen}
              onClose={onSceneLibraryClose || (() => {})}
              onLoadTemplate={(template, name) => onTemplateLoaded?.(template, name)}
            />

            {/* Floating Monitor Panel */}
            {diagnosticPanel && <DiagnosticPanel kind={diagnosticPanel} onClose={onDiagnosticClose || (() => {})} runs={runHistory} running={isRunning} projectName={projectName} logs={systemLogs} /> }

            {/* Keep both surfaces mounted so changing stage preserves the graph and vehicle state. */}
            <div className="flex-1 min-w-0 h-full overflow-hidden">
              <div ref={canvasSurface} tabIndex={-1} onKeyDown={event => {
                if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
                if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z' && restoredDeletion && !isRunning) {
                  event.preventDefault(); event.stopPropagation(); undoNodeDeletion();
                }
              }} data-testid="workflow-surface" className="h-full bg-background overflow-hidden relative" style={{ display: isSimulatorOpen ? 'none' : undefined }}>
                             <ReactFlow
                                nodes={displayedGraph.nodes}
                                edges={displayedGraph.edges}
                                onNodesChange={onCanonicalNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                onInit={setReactFlowInstance}
                                onDrop={onDrop}
                                onDragOver={onDragOver}
                                onNodeContextMenu={(event, node) => {
                                  event.preventDefault();
                                  setNodeMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
                                }}
                                onPaneContextMenu={event => {
                                  if (!restoredDeletion) return;
                                  event.preventDefault();
                                  setNodeMenu({ x: event.clientX, y: event.clientY });
                                }}
                                onMoveStart={() => setNodeMenu(null)}
                                onBeforeDelete={async () => !isRunning}
                                onNodeClick={onNodeClick}
                                onPaneClick={onPaneClick}
                                nodeTypes={nodeTypes}
                                defaultEdgeOptions={defaultEdgeOptions}
                                fitView
                                fitViewOptions={initialCanvasView}
                                minZoom={0.1}
                                className="bg-background"
                            >
                                <WorkflowLayoutControls canonicalNodes={nodes} canonicalEdges={edges} updateNodes={setNodes} key={layoutRevision} request={layoutRequest} disabled={isRunning} />
                                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--canvas-dot))" bgColor="hsl(var(--canvas-background))" />
                            </ReactFlow>
                {nodeMenu && !isSimulatorOpen && <NodeContextMenu position={nodeMenu}
                  grouped={nodes.some(node => node.id === nodeMenu.nodeId && node.type === 'stage')}
                  disabled={isRunning || (!!nodeMenu.nodeId && !nodeDeletion(nodes, edges, nodeMenu.nodeId))}
                  canUndo={!!restoredDeletion} onDelete={deleteContextNode} onUndo={undoNodeDeletion} onClose={closeNodeMenu} />}
              </div>
              <div data-testid="simulation-surface" className="h-full bg-card relative overflow-hidden flex flex-col" style={{ display: isSimulatorOpen ? undefined : 'none' }}>
                    <VehicleSimulator
                      active={isSimulatorOpen}
                      ref={simulatorRef}
                      fullScreen={true}
                      simConfig={simConfig}
                      onRun={() => runPipelineInternal()}
                      onCreateRain={onCreateRainWorkflow} onCreateChild={onCreateChildWorkflow}
                      running={isRunning}
                      workflowName={projectName}
                    />
              </div>
            </div>
            <SimulationInputSurface visible={isSimulatorOpen} generalFlow={isGeneralFlow(nodes)} flowEvents={nodes.filter(n=>n.data.eventName).map(n=>({id:n.id,label:String(n.data.label||n.data.eventName),name:String(n.data.eventName)}))} sessionKey={activeWorkflowId} samples={nodes.find(n => n.type === 'input')?.data.simulationSamples as any} key={activeWorkflowId} running={isRunning} workflowName={projectName} issues={validateGraph(nodes, edges)} onInspectNode={id => { const node = nodes.find(n => n.id === id); if (node) { setSelectedNode(node); setIsPanelOpen(true); } }} requiresImage={nodes.some(n => n.data.promptProfile === 'child_care' || n.data.resultSource === 'vision')} supportsVideoReplay={nodes.some(n => n.type === 'video_display')} onRun={async (input, signal) => {
              if (!nodes.length) throw new Error('当前工作流为空，请先在编排页配置输入、处理与输出节点。');
              return runPipelineInternal(input, undefined, undefined, signal);
            }} />
        </div>

      {/* Property Panel (Overlay) */}
      <PropertyPanel
        open={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        selectedNode={selectedNode}
        onUpdate={onNodeUpdate}
      />
      
      <DeploymentWizard 
        open={isDeploymentWizardVisible}
        onOpenChange={handleDeploymentOpenChange}
        targetDevice={targetDevice}
        currentProjectName={projectName}
        currentProjectFileName={projectFileName}
      />
      
      <ModelRegistry 
        open={isModelRegistryOpen}
        onOpenChange={setIsModelRegistryOpen}
      />
    </div>
  );
});

FlowCanvasInternal.displayName = 'FlowCanvasInternal';
