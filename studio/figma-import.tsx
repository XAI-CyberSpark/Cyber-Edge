import React from 'react';
import {createRoot} from 'react-dom/client';
import './src/index.css';
import './src/styles/typography.css';
import './src/styles/icon-motion.css';
// Isolated rendering fixture: never read/write the user's browser drafts or POST to the backend.
const memory = new Map<string,string>([['cyber-edge-theme','light']]);
const local = {getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,String(v)),removeItem:(k:string)=>memory.delete(k),clear:()=>memory.clear(),key:(i:number)=>[...memory.keys()][i]??null,get length(){return memory.size}};
Object.defineProperty(window,'localStorage',{value:local});
// Retain only this isolated preview's WebGL frame for the Figma asset export.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type: any, options: any) {
  return originalGetContext.call(this, type, /webgl/.test(type) ? {...options, preserveDrawingBuffer: true} : options);
} as typeof originalGetContext;
const realFetch=window.fetch.bind(window);
window.fetch=async(input:any,init:any={})=>{
 const url=String(input); const method=(init.method||'GET').toUpperCase();
 if(url.includes('/v1/')&&method!=='GET') return Response.json({detail:'Design preview is read-only'},{status:403});
 if(url.includes('/v1/executions/'))return Response.json({phase:'empty',revision:0});
 return realFetch(input,init);
};
const view=new URLSearchParams(location.search).get('view')||'workspace';
const [{AppProvider},{WorkspacePage},{IconNav},{WorkspacePanelLayer},{createChildSafetyScenarioSpec,buildChildSafetyTemplate}]=await Promise.all([import('./src/context/AppContext'),import('./src/components/pages/WorkspacePage'),import('./src/components/layout/IconNav'),import('./src/components/layout/NavigationPanel'),import('./src/data/childSafetyScenario')]);
const template=buildChildSafetyTemplate(createChildSafetyScenarioSpec());
const project={...template,id:'figma-preview',file_name:'figma-preview-read-only.json',name:'儿童关怀 · 设计示例',meta:{...template.meta,chat_messages:[{id:'user',role:'user',timestamp:Date.now()-106000,content:'请检查后排儿童状态，发现风险时提醒，并展示后排画面。'},{id:'assistant',role:'assistant',timestamp:Date.now(),content:'已整理儿童乘车关怀的节点流程。\n\n### 场景说明\n通过座舱画面识别儿童状态，区分正常、风险与无法判断三种结果。风险时提醒并展示同一路视频画面。\n\n### 节点流程\n1. 接收座舱画面\n2. 识别儿童状态\n3. 校验结果与置信度\n4. 分支提示与画面展示',execution:{startedAt:Date.now()-106000,durationMs:106000,status:'completed',operations:[]}}]}};
const noop=()=>{};
createRoot(document.getElementById('root')!).render(<AppProvider><div className="flex h-screen w-screen bg-background text-foreground overflow-hidden"><IconNav active={null} onNavigate={noop}/><WorkspacePanelLayer><WorkspacePage initialProject={project} projectName={project.name} workspaceMode={view==='hmi'?'simulate':view==='deploy'?'deploy':'edit'} onWorkspaceModeChange={noop} modelLibraryOpen={view==='models'} mcpLibraryOpen={view==='mcp'} sidebarOpen={view==='components'} projectLibraryOpen={view==='projects'} sceneLibraryOpen={view==='scenes'} diagnosticPanel={view==='runs'?'runs':view==='devices'?'devices':undefined}/></WorkspacePanelLayer></div></AppProvider>);
