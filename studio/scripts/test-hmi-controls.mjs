import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'.hmi-test-output/controls.mjs');await mkdir(path.dirname(out),{recursive:true});
try {
  await build({entryPoints:[root+'/tests/hmi-controls.test.ts'],outfile:out,bundle:true,platform:'node',format:'esm',tsconfig:root+'/tsconfig.app.json',define:{'import.meta.env.VITE_API_URL':'""'}});
  const result=spawnSync(process.execPath,['--test',out],{cwd:root,stdio:'inherit'});process.exitCode=result.status??1;
}finally{await rm(path.dirname(out),{recursive:true,force:true});}
