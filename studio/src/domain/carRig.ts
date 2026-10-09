import * as THREE from 'three';
import type { WindowKey } from './vehicleWorld';

export type Vec3 = [number, number, number];
export type PartSelector = { node: string; descendants?: boolean; components?: number[] };
export type PartBinding = { selectors: PartSelector[] };
export type DoorBinding = PartBinding & { pivot: Vec3; axis: 'x' | 'y' | 'z'; angle: number; hotspot: Vec3; side: 'left' | 'right' };
export type WindowBinding = PartBinding & { travel: Vec3; clippingPlane?: [number, number, number, number] };
export type CarRig = {
  version: 1;
  id: string;
  model: string;
  modelSha256: string;
  source: { url: string; author: string; license: string; licenseUrl?: string; notes?: string };
  environment?: string;
  rotationY: number;
  componentPrecision: number;
  splitNodes?: string[];
  doors: Partial<Record<WindowKey, DoorBinding>>;
  windows: Partial<Record<WindowKey, WindowBinding>>;
  lights: Partial<Record<'headlights' | 'taillights' | 'turnLeft' | 'turnRight', PartBinding | null>>;
  trunk?: PartBinding | null;
  bodyColorMaterials: string[];
  appearance?: { nodes?: string[]; materials?: string[]; color?: string; opacity?: number; metalness?: number; roughness?: number; doubleSided?: boolean; removeAO?: boolean }[];
  unsupported?: Record<string, string>;
};
// Validate JSON once at the asset boundary; missing optional parts are valid.
export function readCarRig(value: unknown): CarRig {
  const rig = value as CarRig;
  const vector = (v: unknown, length = 3) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);
  if (!rig || rig.version !== 1 || !rig.id || !rig.model || !rig.source?.license || !Number.isFinite(rig.rotationY)
    || !Number.isInteger(rig.componentPrecision) || rig.componentPrecision < 0 || rig.componentPrecision > 8
    || !rig.doors || !rig.windows || !rig.lights || !Array.isArray(rig.bodyColorMaterials)) throw new Error('Invalid car rig');
  const bindings = [...Object.values(rig.doors), ...Object.values(rig.windows), ...Object.values(rig.lights), rig.trunk];
  for (const b of bindings) {
    if (!b) continue;
    if (!Array.isArray(b.selectors) || !b.selectors.length || b.selectors.some(s => !s.node || (s.components && (!s.components.length || s.components.some(c => !Number.isInteger(c) || c < 0))))) throw new Error('Invalid rig selector');
  }
  for (const [key,b] of Object.entries(rig.doors)) if (!['fl','fr','rl','rr'].includes(key) || !vector(b.pivot) || !vector(b.hotspot) || !['x','y','z'].includes(b.axis) || !Number.isFinite(b.angle) || !['left','right'].includes(b.side)) throw new Error('Invalid door binding');
  for (const [key,b] of Object.entries(rig.windows)) if (!['fl','fr','rl','rr'].includes(key) || !vector(b.travel) || (b.clippingPlane && !vector(b.clippingPlane,4))) throw new Error('Invalid window binding');
  return rig;
}

export type RigPart = { geometry: THREE.BufferGeometry; material: THREE.Material; door?: WindowKey; window?: WindowKey };

// Stable first-triangle order. Component indices are bound to the model hash in rig.json.
export function connectedTriangles(geometry: THREE.BufferGeometry, precision: number): number[][] {
  const positions = geometry.getAttribute('position');
  const parent = Array.from({ length: positions.count }, (_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const join = (a: number, b: number) => { parent[root(a)] = root(b); };
  const seen = new Map<string, number>();
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => v.toFixed(precision)).join(',');
    const previous = seen.get(key);
    if (previous !== undefined) join(i, previous); else seen.set(key, i);
  }
  for (let i = 0; i < positions.count; i += 3) { join(i, i + 1); join(i, i + 2); }
  const components = new Map<number, number[]>();
  for (let i = 0; i < positions.count; i += 3) {
    const id = root(i);
    if (!components.has(id)) components.set(id, []);
    components.get(id)!.push(i / 3);
  }
  return [...components.values()];
}

function sliceGeometry(geometry: THREE.BufferGeometry, triangles: number[]) {
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values: number[] = [];
    for (const triangle of triangles) for (let vertex = 0; vertex < 3; vertex++) {
      for (let component = 0; component < attribute.itemSize; component++) values.push(attribute.getComponent(triangle * 3 + vertex, component));
    }
    result.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
  }
  return result;
}

function matches(object: THREE.Object3D, selector: PartSelector, component?: number) {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.name === selector.node) return selector.components === undefined || (component !== undefined && selector.components.includes(component));
    if (!selector.descendants) break;
    node = node.parent;
  }
  return false;
}

export function prepareCarRig(scene: THREE.Object3D, rig: CarRig) {
  scene.updateMatrixWorld(true);
  const parts: RigPart[] = [];
  const hits = new Map<PartSelector, number>();
  const bindings = [ ...Object.values(rig.doors), ...Object.values(rig.windows), ...Object.values(rig.lights), rig.trunk ];
  for (const binding of bindings) for (const selector of binding?.selectors ?? []) hits.set(selector, 0);
  const bodyMaterials = new Set<string>();
  const rotation = new THREE.Matrix4().makeRotationY(rig.rotationY);
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry: THREE.BufferGeometry = object.geometry.clone();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new Float32Array(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.getComponent(i, c);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    geometry.applyMatrix4(rotation.clone().multiply(object.matrixWorld));
    const sources: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sources.map(source => {
      const material = source.clone() as THREE.MeshStandardMaterial;
      if (rig.bodyColorMaterials.includes(source.name)) bodyMaterials.add(source.name);
      for (const override of rig.appearance ?? []) {
        if (!override.nodes?.includes(object.name) && !override.materials?.includes(material.name)) continue;
        if (override.color) material.color.set(override.color);
        if (override.opacity !== undefined) { material.transparent = true; material.opacity = override.opacity; }
        if (override.metalness !== undefined) material.metalness = override.metalness;
        if (override.roughness !== undefined) material.roughness = override.roughness;
        if (override.doubleSided) material.side = THREE.DoubleSide;
        if (override.removeAO) material.aoMap = null;
      }
      return material;
    });
    const split = rig.splitNodes?.includes(object.name) || [...hits.keys()].some(s => s.components && matches(object, { ...s, components: undefined }));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const components = split ? connectedTriangles(flat, rig.componentPrecision) : [Array.from({ length: flat.getAttribute('position').count / 3 }, (_, i) => i)];
    const buckets = new Map<string, { triangles: number[]; door?: WindowKey; window?: WindowKey; material: number }>();
    for (let i = 0; i < components.length; i++) {
      const selectors = [...hits.keys()].filter(s => matches(object, s, split ? i : undefined));
      selectors.forEach(s => hits.set(s, hits.get(s)! + 1));
      const find = (table: CarRig['doors'] | CarRig['windows']) => (Object.entries(table).find(([, b]) => b.selectors.some((s: PartSelector) => selectors.includes(s)))?.[0]) as WindowKey | undefined;
      const door = find(rig.doors), window = find(rig.windows);
      for (const triangle of components[i]) {
        const material = geometry.groups.find(g => triangle * 3 >= g.start && triangle * 3 < g.start + g.count)?.materialIndex ?? 0;
        const key = `${door ?? 'fixed'}:${window ?? ''}:${material}`;
        if (!buckets.has(key)) buckets.set(key, { triangles: [], door, window, material });
        buckets.get(key)!.triangles.push(triangle);
      }
    }
    // Keep draw order and original indexed geometry for untouched single-material meshes.
    const order = ['fixed', 'fl', 'fr', 'rl', 'rr'];
    const sorted = [...buckets.values()].sort((a, b) => order.indexOf(a.door ?? 'fixed') - order.indexOf(b.door ?? 'fixed'));
    for (const bucket of sorted) {
      const material = materials[bucket.material].clone();
      const panel = !split && buckets.size === 1 ? geometry.clone() : sliceGeometry(flat, bucket.triangles);
      if (bucket.door) {
        const pivot = rig.doors[bucket.door]!.pivot;
        panel.translate(-pivot[0], -pivot[1], -pivot[2]);
        material.side = THREE.DoubleSide;
      }
      const clip = bucket.window && rig.windows[bucket.window]?.clippingPlane;
      if (clip) material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(clip[0], clip[1], clip[2]), clip[3])];
      parts.push({ geometry: panel, material, door: bucket.door, window: bucket.window });
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose(); materials.forEach(m => m.dispose());
  });
  const supports = (binding?: PartBinding | null) => !!binding?.selectors.length && binding.selectors.every(s => (hits.get(s) ?? 0) >= (s.components?.length ?? 1));
  // Missing/incomplete declarations are static geometry, never partial or phantom controls.
  const doors = Object.fromEntries(Object.entries(rig.doors).map(([k,b]) => [k, supports(b)])) as Partial<Record<WindowKey, boolean>>;
  const windows = Object.fromEntries(Object.entries(rig.windows).map(([k,b]) => [k, supports(b)])) as Partial<Record<WindowKey, boolean>>;
  for (const part of parts) {
    if (part.door && !doors[part.door]) { const p=rig.doors[part.door]!.pivot;part.geometry.translate(...p);part.door=undefined; }
    if (part.window && !windows[part.window]) {part.window=undefined;part.material.clippingPlanes=null;}
  }
  return { parts, doors, windows, lights: Object.fromEntries(Object.entries(rig.lights).map(([k,b])=>[k,supports(b)])), trunk:supports(rig.trunk),
    missing: [...hits].filter(([s,n])=>n < (s.components?.length ?? 1)).map(([s])=>s), missingBodyMaterials: rig.bodyColorMaterials.filter(n=>!bodyMaterials.has(n)) };
}

export function disposeCarRig(prepared: ReturnType<typeof prepareCarRig>) {
  prepared.parts.forEach(part => { part.geometry.dispose(); part.material.dispose(); });
}
