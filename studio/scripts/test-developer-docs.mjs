import { build } from 'esbuild';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'node_modules/.tmp/developer-docs-test.mjs');
await mkdir(path.dirname(out), { recursive: true });
const compiled = await build({ entryPoints: [root + '/scripts/developer-docs-plugin.ts'], bundle: true, platform: 'node', format: 'esm', write: false, define: { 'import.meta.dirname': JSON.stringify(root + '/scripts') } });
const { developerDocsPlugin } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const docsModule = developerDocsPlugin().load.call({ addWatchFile() {} }, '\0virtual:developer-docs');
await build({ entryPoints: [root + '/tests/developer-docs.dom.tsx'], bundle: true, platform: 'node', format: 'esm', outfile: out, packages: 'external', tsconfig: root + '/tsconfig.app.json', loader: { '.css': 'empty' }, plugins: [{ name: 'actual-docs', setup(b) {
 b.onResolve({ filter: /^virtual:developer-docs$/ }, () => ({ path: 'docs', namespace: 'docs' }));
 b.onLoad({ filter: /.*/, namespace: 'docs' }, () => ({ contents: docsModule, loader: 'js' }));
} }] });
const bootstrap = `import {JSDOM} from '${pathToFileURL(root + '/node_modules/jsdom/lib/api.js').href}';const d=new JSDOM('<div id="root"></div>',{url:'http://localhost/docs'});for(const key of ['window','document','navigator','history','localStorage','HTMLElement','Element','Node','NodeFilter','CustomEvent','HTMLInputElement','DocumentFragment','Event','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='window'?d.window:d.window[key],configurable:true});HTMLElement.prototype.scrollTo=function(){};HTMLElement.prototype.scrollIntoView=function(){};globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;`;
try { const result = spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(bootstrap).toString('base64'), out], { stdio: 'inherit' }); process.exitCode = result.status ?? 1; }
finally { await rm(out, { force: true }); }
