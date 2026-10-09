import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'node_modules/.tmp/node-deletion.mjs');
await mkdir(path.dirname(out),{recursive:true});
try {
 await build({entryPoints:[path.join(root,'tests/node-deletion.dom.tsx')],bundle:true,platform:'node',format:'esm',outfile:out,packages:'external',tsconfig:path.join(root,'tsconfig.app.json'),loader:{'.css':'empty'},define:{'import.meta.env.VITE_API_URL':'""'},plugins:[{name:'isolate-canvas',setup(b){
 b.onResolve({filter:/\.css$/},()=>({path:'empty-css',namespace:'stub'}));
 b.onResolve({filter:/^@\/context\/AppContext$/},()=>({path:'context',namespace:'stub'}));
 b.onResolve({filter:/^(?:@\/components\/|\.\/)/},a=>{
   if(a.importer.endsWith('FlowCanvas.tsx') && !a.path.endsWith('NodeContextMenu')) return {path:a.path.split('/').at(-1),namespace:'stub'};
 });
 b.onResolve({filter:/^@xyflow\/react$/},a=>a.namespace==='stub'?undefined:{path:'xyflow',namespace:'stub'});
 b.onLoad({filter:/.*/,namespace:'stub'},a=>{
   let contents;
   if(a.path==='empty-css') contents='';
   else if(a.path==='xyflow') contents=`import React from 'react';export {useNodesState,useEdgesState,addEdge,MarkerType,BackgroundVariant} from '@xyflow/react';export const Background=()=>null;export const ReactFlowProvider=({children})=>children;export function ReactFlow(p){globalThis.flow=p;return <div data-testid="flow">{p.nodes.map(n=><button key={n.id} data-node={n.id} onClick={e=>p.onNodeClick(e,n)} onContextMenu={e=>p.onNodeContextMenu(e,n)}>{n.id}</button>)}<div data-testid="pane" onContextMenu={p.onPaneContextMenu}/>{p.children}</div>}`;
   else if(a.path==='context') contents=`export const useApp=()=>({language:'zh',theme:'light'});`;
   else if(a.path==='RearVideo') contents=`export const RearVideoProvider=({children})=>children;export const useRearVideo=()=>({});`;
   else if(a.path==='FlowNodes') contents=`export const FlowCapabilityNode=()=>null;export const StageNode=()=>null;export const withFlowPorts=(c)=>c;`;
   else if(a.path==='IONode') contents=`export const InputNode=()=>null;export const OutputNode=()=>null;`;
   else if(a.path==='PropertyPanel') contents=`export function PropertyPanel(p){globalThis.property=p;return null}`;
   else if(a.path==='SimulationInputPanel') contents=`export const SimulationInputSurface=()=>null;`;
   else if(a.path==='button') contents=`export const Button=({children})=>children;`;
   else if(a.path==='select') contents=`export const Select=()=>null,SelectContent=()=>null,SelectItem=()=>null,SelectTrigger=()=>null,SelectValue=()=>null;`;
   else contents=`export const ${a.path}=()=>null;export default ${a.path};`;
   return {contents,loader:'tsx',resolveDir:root};
 });
 }}]});
 process.exitCode=spawnSync(process.execPath,[out],{stdio:'inherit'}).status??1;
} finally {await rm(out,{force:true});}
