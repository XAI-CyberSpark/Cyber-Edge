import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=await mkdtemp(path.join(tmpdir(),'oakegde-flow-')),out=path.join(dir,'test.mjs');
try{await build({entryPoints:[path.join(root,'tests/general-flow.test.ts')],bundle:true,platform:'node',format:'esm',outfile:out,tsconfig:path.join(root,'tsconfig.app.json'),define:{'import.meta.env.VITE_API_URL':'""'}});process.exitCode=spawnSync(process.execPath,['--test',out],{stdio:'inherit'}).status??1;}finally{await rm(dir,{recursive:true,force:true});}
