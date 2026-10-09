import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'node_modules/.tmp/car-rig.test.mjs');
await mkdir(path.dirname(out),{recursive:true});
try{
 await build({entryPoints:[root+'/tests/car-rig.test.ts'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:root+'/tsconfig.app.json'});
 const result=spawnSync(process.execPath,[out],{stdio:'inherit',env:{...process.env,SU7_PATH:root+'/public/models/su7/sm_car.glb',CONCEPT_PATH:root+'/../outputs/carconcept-audit-2026-10-06/CarConcept.glb'}});process.exitCode=result.status??1;
}finally{await rm(out,{force:true});}
