import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules/.tmp/component-library-dom.mjs');
await mkdir(path.dirname(out), { recursive: true });
await build({ entryPoints: [root + '/tests/component-library.dom.tsx'], bundle: true, platform: 'node', format: 'esm', outfile: out, packages: 'external', tsconfig: root + '/tsconfig.app.json', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_URL': '""' }, plugins: [{ name: 'isolate-unrelated-services', setup(b) {
  b.onResolve({ filter: /^@xyflow\/react$/ }, () => ({ path: 'flow', namespace: 'mock' }));
  b.onResolve({ filter: /^@\/context\/AppContext$/ }, () => ({ path: 'context', namespace: 'mock' }));
  b.onResolve({ filter: /^@\/components\/wizards\/SkillLibrary$/ }, () => ({ path: 'skills', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: a.path === 'flow' ? 'export const Position={Left:"left",Right:"right"};export const Handle=({type})=><span data-test-handle={type}/>;' : a.path === 'context' ? 'export const useApp=()=>({t:key=>key});' : 'export const SkillLibrary=()=>null;', loader: 'tsx', resolveDir: root }));
} }] });
const bootstrap = `import {JSDOM} from '${pathToFileURL(path.join(root, 'node_modules/jsdom/lib/api.js')).href}';const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});for(const key of ['window','document','navigator','HTMLElement','Element','Node','NodeFilter','CustomEvent','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','DocumentFragment','Event','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;`;
const result = spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(bootstrap).toString('base64'), out], { stdio: 'inherit' });
await rm(out, { force: true });
process.exitCode = result.status ?? 1;
