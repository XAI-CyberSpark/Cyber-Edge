import type { Edge, Node } from '@xyflow/react';

// Canvas pixels, matching NODE_DESIGN. Dimensions come from ReactFlow after render.
export const WORKFLOW_LAYOUT = { columnGap: 80, rowGap: 48, margin: 32 };
const snap = (value: number) => Math.ceil(value / 8) * 8;
const positive = (...values: (number | undefined)[]) => values.find(value => Number.isFinite(value) && value! > 0)!;
export function nodeLayoutSize(node: Node) {
  return {
    width: positive(node.type==='stage'?Number(node.style?.width):undefined, node.measured?.width, node.width, node.initialWidth, node.type === 'input' ? 240 : 280),
    height: positive(node.type==='stage'?Number(node.style?.height):undefined, node.measured?.height, node.height, node.initialHeight, 200),
  };
}

/** Only positions change. Back edges are retained; saved graphs are never implicitly laid out. */
function layoutFlat(nodes: Node[], edges: Edge[]): Node[] {
  const visible = nodes.filter(node => !node.hidden && !node.parentId);
  if (!visible.length) return nodes;
  const ids = new Set(visible.map(node => node.id));
  const rootId=(id:string)=>{const seen=new Set<string>();let n=nodes.find(n=>n.id===id);while(n?.parentId&&!seen.has(n.id)){seen.add(n.id);n=nodes.find(x=>x.id===n!.parentId);}return n?.id||id;};
  const links = edges.map(e=>({...e,source:rootId(e.source),target:rootId(e.target)})).filter(edge => !edge.hidden && ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target);
  const remaining = new Set(ids);
  const ranks = new Map<string, number>();
  const secondary = new Map<string, boolean>();
  const order: Node[] = [];
  // Longest-path layers. If only cycles remain, choose a stable entry and leave
  // its incoming links as back edges, without removing them from the workflow.
  while (remaining.size) {
    const node = visible.find(item => remaining.has(item.id) && !links.some(edge => edge.target === item.id && remaining.has(edge.source)))
      || visible.find(item => remaining.has(item.id))!;
    const incoming = links.filter(edge => edge.target === node.id && ranks.has(edge.source));
    ranks.set(node.id, incoming.length ? Math.max(...incoming.map(edge => ranks.get(edge.source)! + 1)) : 0);
    secondary.set(node.id, node.type === 'fallback' || (incoming.length > 0 && incoming.every(edge =>
      secondary.get(edge.source) || /^(false|no|error|failure|fail|timeout)$/i.test(edge.sourceHandle || '')
    )));
    remaining.delete(node.id);
    order.push(node);
  }
  const columns: Node[][] = [];
  for (const node of order) (columns[ranks.get(node.id)!] ||= []).push(node);
  const mainBottom = Math.max(...columns.map(column => WORKFLOW_LAYOUT.margin + column
    .filter(node => !secondary.get(node.id))
    .reduce((height, node) => height + snap(nodeLayoutSize(node).height) + WORKFLOW_LAYOUT.rowGap, 0)));
  const positions = new Map<string, Node['position']>();
  let x = WORKFLOW_LAYOUT.margin;
  for (const column of columns) {
    for (const isSecondary of [false, true]) {
      let y = isSecondary ? mainBottom : WORKFLOW_LAYOUT.margin;
      for (const node of column.filter(item => secondary.get(item.id) === isSecondary)) {
        // ReactFlow positions may use a non-top-left origin.
        const { width, height } = nodeLayoutSize(node);
        positions.set(node.id, { x: x + width * (node.origin?.[0] || 0), y: y + height * (node.origin?.[1] || 0) });
        y += snap(height) + WORKFLOW_LAYOUT.rowGap;
      }
    }
    x += snap(Math.max(...column.map(node => nodeLayoutSize(node).width))) + WORKFLOW_LAYOUT.columnGap;
  }
  return nodes.map(node => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node);
}

/** Explicit layout also arranges real children, retaining the canonical hierarchy. */
export function layoutWorkflow(nodes:Node[],edges:Edge[]):Node[]{
 let result=nodes;
 const depth=(node:Node)=>{let value=0;const seen=new Set<string>();while(node.parentId&&!seen.has(node.id)){seen.add(node.id);const parent=nodes.find(n=>n.id===node.parentId);if(!parent)break;node=parent;value++;}return value;};
 const groups=nodes.filter(n=>n.type==='stage').sort((a,b)=>depth(b)-depth(a));
 for(const group of groups){
  const children=result.filter(n=>n.parentId===group.id);if(!children.length)continue;
  const ids=new Set(children.map(n=>n.id));
  const laidOut=layoutFlat(children.map(n=>({...n,parentId:undefined})),edges.filter(e=>ids.has(e.source)&&ids.has(e.target)));
  const positions=new Map(laidOut.map(n=>[n.id,{x:n.position.x,y:n.position.y+64}]));
  const width=Math.max(...laidOut.map(n=>n.position.x+nodeLayoutSize(n).width))+32;
  const height=Math.max(...laidOut.map(n=>n.position.y+64+nodeLayoutSize(n).height))+32;
  result=result.map(n=>n.id===group.id?{...n,style:{...n.style,width,height}}:positions.has(n.id)?{...n,position:positions.get(n.id)!}:n);
 }
 return layoutFlat(result,edges);
}
