import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { TextureLoader, Texture } from 'three';
// Geometry-only test loader. No texture requests or model scripts are executed.
export async function loadModelForTest(path) {
 globalThis.self ??= globalThis;
 const original = TextureLoader.prototype.load;
 TextureLoader.prototype.load = function(_url, done) {const texture=new Texture();queueMicrotask(()=>done?.(texture));return texture;};
 try {const bytes=await readFile(path);return await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
 finally {TextureLoader.prototype.load=original;}
}
