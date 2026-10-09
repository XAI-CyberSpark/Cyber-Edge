import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'node_modules/.tmp/hmi-chrome.dom.mjs');
await mkdir(path.dirname(out),{recursive:true});
try {
 await build({entryPoints:[root+'/tests/hmi-chrome.dom.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:root+'/tsconfig.app.json',loader:{'.css':'empty'},plugins:[{name:'isolate-center',setup(b){
  b.onResolve({filter:/HmiCarStage$/},()=>({path:'HmiCarStage',namespace:'mock'}));
  b.onResolve({filter:/CockpitAssistant$/},()=>({path:'CockpitAssistant',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:`import React from 'react';export const ${a.path}=()=> <div data-testid="${a.path==='HmiCarStage'?'preserved-car':'preserved-assistant'}"/>;`,loader:'tsx',resolveDir:root}));
 }}]});
 const r=spawnSync(process.execPath,[out],{stdio:'inherit'});process.exitCode=r.status??1;
} finally {await rm(out,{force:true});}
