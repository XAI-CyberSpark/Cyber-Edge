import { uiText, useUiLanguage } from '@/i18n';
import type {Node,Edge} from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlButton, Controls, useNodes, useNodesInitialized, useReactFlow } from '@xyflow/react';
import { Network, Undo2 } from 'lucide-react';
import { layoutWorkflow } from '@/domain/workflowLayout';

interface Props { request:number; disabled:boolean; canonicalNodes:Node[]; canonicalEdges:Edge[]; updateNodes:(nodes:Node[])=>void }
type PositionSnapshot = Map<string, { x: number; y: number }>;

export function WorkflowLayoutControls({ request, disabled, canonicalNodes, canonicalEdges, updateNodes }: Props) {
  useUiLanguage();
  const flow = useReactFlow();
  const nodes = useNodes();
  const initialized = useNodesInitialized();
  const consumed = useRef(0);
  const [previous, setPrevious] = useState<PositionSnapshot | null>(null);
  const frames = useRef<number[]>([]);
  const cancelFrames = useCallback(() => {
    frames.current.forEach(cancelAnimationFrame);
    frames.current = [];
  }, []);
  useEffect(() => cancelFrames, [cancelFrames]);

  const arrange = useCallback(() => {
    if (disabled || !initialized) return;
    const measured=new Map(flow.getNodes().map(n=>[n.id,n.measured]));
    const current = canonicalNodes.map(n=>({...n,measured:measured.get(n.id)||n.measured}));
    setPrevious(new Map(current.map(node => [node.id, { ...node.position }])));
    updateNodes(layoutWorkflow(current, canonicalEdges));
    cancelFrames();
    frames.current.push(requestAnimationFrame(() => {
      frames.current.push(requestAnimationFrame(() => {
        void flow.fitView({ padding: 0.18, minZoom: 0.1, maxZoom: 1,
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200 });
      }));
    }));
  }, [disabled, initialized, flow, cancelFrames, canonicalNodes, canonicalEdges, updateNodes]);

  // Explicit request only for freshly generated graphs. Loading a project,
  // resizing a node, dragging, and switching tabs do not trigger a rearrange.
  useEffect(() => {
    if (request === consumed.current || disabled || !initialized || !nodes.length) return;
    const frame = requestAnimationFrame(() => {
      consumed.current = request;
      arrange();
    });
    return () => cancelAnimationFrame(frame);
  }, [request, disabled, initialized, nodes, arrange]);

  const canUndo = previous && canonicalNodes.length === previous.size && canonicalNodes.every(node => previous.has(node.id));
  const undo = () => {
    if (!canUndo || disabled) return;
    cancelFrames();
    updateNodes(canonicalNodes.map(node => ({ ...node, position: { ...previous!.get(node.id)! } })));
    setPrevious(null);
  };
  return (
    <Controls className="canvas-control-island" aria-label={uiText("画布控制")} fitViewOptions={{ padding: 0.18, minZoom: 0.1, maxZoom: 1 }}>
      <ControlButton title={uiText("整理节点：按流程排列")} aria-label={uiText("整理节点")} disabled={disabled || !initialized || !nodes.length} onClick={arrange}>
        <Network />
      </ControlButton>
      <ControlButton title={uiText("撤销上次整理")} aria-label={uiText("撤销整理")} disabled={disabled || !canUndo} onClick={undo}>
        <Undo2 />
      </ControlButton>
    </Controls>
  );
}
