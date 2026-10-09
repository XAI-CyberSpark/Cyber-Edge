import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=await mkdtemp(path.join(tmpdir(),'oakegde-execution-test-'));
try{
 const names=process.argv.slice(2).length?process.argv.slice(2):['scenario-execution.test'];
 const files=[];
 for(const name of names){const out=path.join(dir,name+'.mjs');files.push(out);await build({entryPoints:[path.join(root,'tests',name+'.ts')],bundle:true,platform:'node',format:'esm',outfile:out,tsconfig:path.join(root,'tsconfig.app.json'),define:{'import.meta.env.VITE_API_URL':'""'}});}
 process.exitCode=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',cwd:root}).status??1;
}finally{await rm(dir,{recursive:true,force:true});}
