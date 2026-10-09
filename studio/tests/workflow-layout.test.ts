import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Edge, Node } from '@xyflow/react';
import { layoutWorkflow, nodeLayoutSize } from '../src/domain/workflowLayout';
const node = (id: string, type = 'llm', width = 280, height = 180): Node => ({ id, type, position: { x: 0, y: 0 }, measured: { width, height }, data: { prompt: 'unchanged', designOnly: true } });
const edge = (source: string, target: string, sourceHandle?: string): Edge => ({ id: source + target, source, target, sourceHandle });
function noOverlap(nodes: Node[]) {
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const n = nodes[a], m = nodes[b], ns = nodeLayoutSize(n), ms = nodeLayoutSize(m);
    assert.ok(n.position.x + ns.width <= m.position.x || m.position.x + ms.width <= n.position.x || n.position.y + ns.height <= m.position.y || m.position.y + ms.height <= n.position.y, `${n.id} overlaps ${m.id}`);
  }
}
test('selfie diamond: measured wide/tall cards separated, main path aligned, failure below', () => {
  const nodes = [node('input', 'input', 240, 116), node('vision'), node('if', 'logic', 280, 116), node('light', 'car_control', 360, 470), node('pose', 'output'), node('fallback', 'fallback')];
  const edges = [edge('input', 'vision'), edge('vision', 'if'), edge('vision', 'fallback', 'error'), edge('if', 'light', 'true'), edge('if', 'fallback', 'false'), edge('light', 'pose')];
  const before = JSON.stringify({ nodes, edges }), result = layoutWorkflow(nodes, edges);
  noOverlap(result);
  assert.equal(result[0].position.y, result[4].position.y);
  assert.ok(result[5].position.y >= result[3].position.y + 470 + 48);
  assert.ok(result[4].position.x >= result[3].position.x + 360 + 80);
  assert.equal(JSON.stringify({ nodes, edges }), before);
  result.forEach((item, i) => assert.deepEqual({ ...item, position: nodes[i].position }, nodes[i]));
  assert.deepEqual(layoutWorkflow(result, edges), result);
});
test('cycles, disconnected nodes and dangling edges stay finite and do not overlap', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => node(id));
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a'), edge('e', 'e'), edge('absent', 'd')];
  const result = layoutWorkflow(nodes, edges); noOverlap(result);
  result.forEach(n => assert.ok(Number.isFinite(n.position.x) && Number.isFinite(n.position.y)));
});
test('parallel branches, merges, and a taller second measurement all have clearance', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => node(id));
  const edges = [edge('a', 'b'), edge('a', 'c'), edge('a', 'd'), edge('b', 'e'), edge('c', 'e'), edge('d', 'e')];
  noOverlap(layoutWorkflow(nodes, edges));
  nodes[1].measured = { width: 490, height: 700 };
  noOverlap(layoutWorkflow(nodes, edges));
});
test('hidden nodes and grouped child coordinates remain untouched', () => {
  const hidden = { ...node('hidden'), hidden: true }, child = { ...node('child'), parentId: 'group' };
  const result = layoutWorkflow([node('group'), hidden, child], []);
  assert.equal(result[1], hidden); assert.equal(result[2], child);
  assert.deepEqual(layoutWorkflow([], []), []);
});
