import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root,'node_modules/.tmp/video-replay.test.mjs');
await mkdir(path.dirname(out), {recursive:true});
try {
 await build({entryPoints:[root+'/tests/video-replay.test.ts'],bundle:true,platform:'node',format:'esm',outfile:out,packages:'external',tsconfig:root+'/tsconfig.app.json',define:{'import.meta.env.VITE_API_URL':'""'}});
 const r=spawnSync(process.execPath,['--test',out],{stdio:'inherit'});process.exitCode=r.status ?? 1;
} finally {await rm(out,{force:true});}
