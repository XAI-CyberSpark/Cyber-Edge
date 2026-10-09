import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { prepareCarRig, disposeCarRig, readCarRig, type CarRig } from '../src/domain/carRig';
import { beforeParts } from './fixtures/su7-parts-before';
import su7 from '../public/models/su7/rig.json';
import concept from './fixtures/car-concept.rig.json';
import { VehicleWorld } from '../src/domain/vehicleWorld';
import { loadModelForTest } from '../scripts/load-model-for-test.mjs';

const digest=(data: Uint8Array)=>crypto.createHash('sha256').update(data).digest('hex');
function geometryHash(g: THREE.BufferGeometry){return Object.entries(g.attributes).map(([n,a])=>[n,a.itemSize,a.count,digest(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))]).concat(g.index ? [['index',g.index.count,digest(new Uint8Array(g.index.array.buffer))]] as any : []);}
function material(m: THREE.Material){const x=m as THREE.MeshStandardMaterial;return {name:x.name,color:x.color.toArray(),opacity:x.opacity,transparent:x.transparent,side:x.side,metalness:x.metalness,roughness:x.roughness,aoMap:!!x.aoMap,clip:x.clippingPlanes?.map(p=>[...p.normal.toArray(),p.constant])??null};}
const su7Path=process.env.SU7_PATH!;const conceptPath=process.env.CONCEPT_PATH!;
assert.equal(digest(fs.readFileSync(su7Path)),su7.modelSha256);
const {scene}=await loadModelForTest(su7Path);
const original=beforeParts(scene);
const prepared=prepareCarRig(scene,readCarRig(su7));
assert.deepEqual(prepared.missing,[]);assert.deepEqual(prepared.missingBodyMaterials,[]);
assert.equal(prepared.parts.length,original.length);
for(let i=0;i<original.length;i++){
 const a=original[i],b=prepared.parts[i];
 assert.deepEqual([b.door,b.window],[a.door,a.window],`part ${i} binding`);
 assert.deepEqual(geometryHash(b.geometry),geometryHash(a.geometry),`part ${i} geometry`);
 assert.deepEqual(material(b.material),material(a.material),`part ${i} material`);
}
for (const key of ['fl','fr','rl','rr'] as const) {
 assert.equal(prepared.doors[key],true);
 assert.equal(prepared.windows[key],true);
 const left=key.endsWith('l'),front=key.startsWith('f');
 assert.deepEqual(su7.doors[key].pivot,[left?.87:-.87,.65,front?.96:-.18]);
 assert.deepEqual(su7.doors[key].hotspot,[left?.13:-.13,.2,front?-.92:-.82]);
 assert.equal(su7.doors[key].axis,'y');
 assert.equal(su7.doors[key].angle,(left?-1:1)*1.05);
 assert.deepEqual(su7.windows[key].travel,[0,-.48,0]);
 for(const value of [0,50,100,0]) assert.equal((su7.windows[key].travel[1]*value/100)||0,(-value/100*.48)||0);
}
console.log(`PASS SU7: all selectors hit; ${original.length} parts match dev.97 geometry/material/bindings; 4 doors/windows, 0/50/100/restore`);
assert.equal(digest(fs.readFileSync(conceptPath)),concept.modelSha256);
const car=await loadModelForTest(conceptPath);const two=prepareCarRig(car.scene,readCarRig(concept));
assert.deepEqual(two.missing,[]);assert.deepEqual(two.missingBodyMaterials,[]);
assert.equal(two.doors.fl,true);assert.equal(two.doors.fr,true);assert.equal(two.windows.fl,true);assert.equal(two.windows.fr,true);
assert.ok(!two.doors.rl&&!two.doors.rr&&!two.windows.rl&&!two.windows.rr);
assert.ok(two.parts.every(p=>p.door!=='rl'&&p.door!=='rr'&&p.window!=='rl'&&p.window!=='rr'));
assert.equal(two.lights.headlights,true);assert.equal(two.lights.taillights,true);assert.equal(two.lights.turnLeft,false);assert.equal(two.trunk,true);
console.log('PASS CarConcept: two doors/windows only; absent rear parts omitted; lights/trunk resolve');
const incomplete=structuredClone(concept) as CarRig;
incomplete.doors.fl!.selectors.push({node:'missing-part'});
incomplete.windows.fl!.selectors=[{node:'missing-glass'}];
const missing=prepareCarRig(car.scene,incomplete);
assert.equal(missing.doors.fl,false);assert.equal(missing.windows.fl,false);
assert.ok(missing.parts.every(p=>p.door!=='fl'&&p.window!=='fl'));
assert.equal(missing.missing.length,2);
const world = new VehicleWorld();
await world.moveWindows({rl:100,rr:50},'manual',0);
assert.deepEqual(world.getSnapshot().car.windows,{fl:0,fr:0,rl:100,rr:50});
const before=JSON.stringify(world.getSnapshot());
prepareCarRig(car.scene,incomplete).parts.forEach(p=>{p.geometry.dispose();p.material.dispose();});
assert.equal(JSON.stringify(world.getSnapshot()),before);
assert.throws(()=>readCarRig({...su7,version:7}));
const bad=structuredClone(su7);bad.doors.fl.pivot=[0,0];assert.throws(()=>readCarRig(bad));
console.log('PASS missing declarations and unmatched nodes: static geometry; no VehicleWorld mutation');
original.forEach(p=>{p.geometry.dispose();p.material.dispose();});[prepared,two,missing].forEach(disposeCarRig);
