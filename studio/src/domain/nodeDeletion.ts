import type { Edge, Node } from '@xyflow/react';

export interface DeletedNodes { nodes: Node[]; edges: Edge[] }

export function nodeDeletion(nodes: Node[], edges: Edge[], nodeId: string) {
  const removed = new Set([nodeId]);
  // Include descendants even when the stage is collapsed in the displayed graph.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of nodes) {
      if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) {
        removed.add(node.id);
        expanded = true;
      }
    }
  }
  const deleted = nodes.filter(node => removed.has(node.id));
  if (!deleted.length || deleted.some(node => node.deletable === false)) return null;
  return {
    nodes: nodes.filter(node => !removed.has(node.id)),
    edges: edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target)),
    undo: { nodes: deleted, edges: edges.filter(edge => removed.has(edge.source) || removed.has(edge.target)) },
  };
}

export function restoreDeletedNodes(nodes: Node[], edges: Edge[], deleted: DeletedNodes) {
  const ids = new Set(nodes.map(node => node.id));
  const restoredIds = new Set([...ids, ...deleted.nodes.map(node => node.id)]);
  // Never overwrite a new node with the same ID, or restore orphaned children/edges.
  if (deleted.nodes.some(node => ids.has(node.id) || (node.parentId && !restoredIds.has(node.parentId)))) return null;
  if (deleted.edges.some(edge => !restoredIds.has(edge.source) || !restoredIds.has(edge.target) || edges.some(current => current.id === edge.id))) return null;
  const restored = [...nodes];
  for (const node of deleted.nodes) {
    const childIndex = restored.findIndex(current => current.parentId === node.id);
    if (childIndex < 0) restored.push(node); else restored.splice(childIndex, 0, node);
  }
  return { nodes: restored, edges: [...edges, ...deleted.edges] };
}
