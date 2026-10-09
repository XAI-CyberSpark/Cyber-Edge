import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'node_modules/.tmp/scenario-benchmark.test.mjs');
await mkdir(path.dirname(out),{recursive:true});
try {
 await build({entryPoints:[path.join(root,'tests/scenario-benchmark.test.ts')],bundle:true,platform:'node',format:'esm',outfile:out,tsconfig:path.join(root,'tsconfig.app.json'),define:{'import.meta.env.VITE_API_URL':'""'}});
 const result=spawnSync(process.execPath,['--test',out],{stdio:'inherit'});process.exitCode=result.status??1;
}finally{await rm(out,{force:true});}
