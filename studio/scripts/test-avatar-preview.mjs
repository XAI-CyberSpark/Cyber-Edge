import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'node_modules/.tmp/avatar-preview.dom.mjs');
await mkdir(path.dirname(out),{recursive:true});
try {
 await build({entryPoints:[root+'/tests/avatar-preview.dom.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:root+'/tsconfig.app.json',loader:{'.css':'empty'}});
 const result=spawnSync(process.execPath,[out],{stdio:'inherit',cwd:root});process.exitCode=result.status??1;
} finally {await rm(out,{force:true});}
