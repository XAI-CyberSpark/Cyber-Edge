import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=root+'/node_modules/.tmp/project-autosave.test.mjs';
await mkdir(root+'/node_modules/.tmp',{recursive:true});
await build({entryPoints:[root+'/tests/project-autosave.test.ts'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:root+'/tsconfig.app.json',define:{'import.meta.env.VITE_API_URL':'""'}});
const result=spawnSync(process.execPath,[out],{stdio:'inherit'});await rm(out,{force:true});process.exitCode=result.status??1;
