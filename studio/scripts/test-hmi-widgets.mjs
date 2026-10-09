import path from 'node:path';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('node_modules/.tmp', {recursive:true});
const outfile=path.resolve('node_modules/.tmp/hmi-widgets.test.mjs');
try {
  await build({absWorkingDir:process.cwd(),entryPoints:['tests/hmi-widgets.test.tsx'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},jsx:'automatic'});
  const r=spawnSync(process.execPath,['--test',outfile],{stdio:'inherit'});process.exitCode=r.status ?? 1;
} finally { await rm(outfile,{force:true}); }
