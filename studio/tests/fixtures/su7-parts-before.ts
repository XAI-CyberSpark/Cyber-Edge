// Frozen dev.97 geometry preparation used only for regression comparison.
import * as THREE from "three";
import type {WindowKey} from "../../src/domain/vehicleWorld";
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

const DOOR_KEYS: WindowKey[] = ['fl', 'fr', 'rl', 'rr'];
const DOOR_NAMES = { fl: '左前门', fr: '右前门', rl: '左后门', rr: '右后门' };
const doorHinge = (key: WindowKey): [number, number, number] => [key.endsWith('l') ? .87 : -.87, .65, key.startsWith('f') ? .96 : -.18];


export function beforeParts(scene: THREE.Object3D) {
    scene.updateMatrixWorld(true);
    const meshes: { geometry: THREE.BufferGeometry; material: THREE.Material; door?: WindowKey; window?: WindowKey }[] = [];
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry: THREE.BufferGeometry = object.geometry.clone();
      // Quantized integer attributes must be decoded before baking world transforms.
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const values = new Float32Array(attribute.count * attribute.itemSize);
        for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.getComponent(i, c);
        geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
      }
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(object.matrixWorld));
      const source = Array.isArray(object.material) ? object.material[0] : object.material;
      const material = source.clone() as THREE.MeshStandardMaterial;
      if (material.name === 'Car_body') { material.aoMap = null; material.color.set('#79aaa7'); material.metalness = .65; material.roughness = .3; }
      const glazing = object.name === 'Glass';
      const candidate = glazing || ['Car_body', 'M_body_smoothblack'].includes(material.name) || ['interior', 'interior011'].includes(object.name);
      if (!candidate) { meshes.push({ geometry, material }); return; }
      if (glazing) { material.color.set('#243e48'); material.transparent = true; material.opacity = .75; material.side = THREE.DoubleSide; }
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      const positions = flat.getAttribute('position');
      const buckets: Record<string, number[]> = { fixed: [], fl: [], fr: [], rl: [], rr: [] };
      const parent = Array.from({ length: positions.count }, (_, i) => i);
      const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
      const join = (a: number, b: number) => { parent[root(a)] = root(b); };
      const seen = new Map<string, number>();
      for (let i = 0; i < positions.count; i++) {
        const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => v.toFixed(4)).join(',');
        const previous = seen.get(key);
        if (previous !== undefined) join(i, previous); else seen.set(key, i);
      }
      for (let i = 0; i < positions.count; i += 3) { join(i, i + 1); join(i, i + 2); }
      const components = new Map<number, { box: THREE.Box3; triangles: number[] }>();
      for (let i = 0; i < positions.count; i += 3) {
        const id = root(i);
        if (!components.has(id)) components.set(id, { box: new THREE.Box3(), triangles: [] });
        const component = components.get(id)!;
        component.triangles.push(i / 3);
        for (let v = 0; v < 3; v++) component.box.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, i + v));
      }
      for (const { box, triangles } of components.values()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const sameSide = box.min.x * box.max.x > 0;
        const glassDoor = glazing && sameSide && Math.abs(center.x) > .6 && size.z > .6;
        const bodyDoor = !glazing && sameSide && Math.min(Math.abs(box.min.x), Math.abs(box.max.x)) > .72 && box.min.z > -1.4 && box.max.z < 1.01 && box.min.y > .26 && box.max.y < 1.1;
        const side = glassDoor || bodyDoor || (object.name.startsWith('Object_31006') && sameSide);
        const key = side ? `${center.z > -.3 ? 'f' : 'r'}${center.x > 0 ? 'l' : 'r'}` : 'fixed';
        buckets[key].push(...triangles);
      }
      for (const [key, triangles] of Object.entries(buckets)) {
        if (!triangles.length) continue;
        const paneMaterial = material.clone();
        if (key !== 'fixed' && glazing) paneMaterial.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -.98)];
        const door = key === 'fixed' ? undefined : key as WindowKey;
        const panel = sliceGeometry(flat, triangles);
        if (door) { const pivot = doorHinge(door); panel.translate(-pivot[0], -pivot[1], -pivot[2]); paneMaterial.side = THREE.DoubleSide; }
        meshes.push({ geometry: panel, material: paneMaterial, door, window: glazing ? door : undefined });
      }
      if (flat !== geometry) flat.dispose();
      geometry.dispose(); material.dispose();
    });
    return meshes;

}
