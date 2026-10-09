import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(join(tmpdir(),'oakegde-benchmark-'));
try{
 const out=join(dir,'runtime.mjs');
 await build({entryPoints:[join(root,'scripts/scenario-benchmark-runtime.ts')],bundle:true,platform:'node',format:'esm',outfile:out,tsconfig:join(root,'tsconfig.app.json'),define:{'import.meta.env.VITE_API_URL':'""'}});
 const result=spawnSync(process.execPath,[out,...process.argv.slice(2)],{encoding:'utf8',timeout:15000,maxBuffer:1000000});
 if(result.error)throw result.error;
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
}finally{await rm(dir,{recursive:true,force:true});}
