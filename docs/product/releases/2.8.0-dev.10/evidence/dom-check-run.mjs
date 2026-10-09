import {build} from '/Users/sherry/../Shared/sherry/CyberEdge/studio/node_modules/esbuild/lib/main.js';
import {spawnSync} from 'node:child_process';
import {rm} from 'node:fs/promises';
const root='/Users/Shared/sherry/CyberEdge/studio';const outfile=root+'/node_modules/.tmp/cockpit-dom.mjs';
await build({entryPoints:['/private/tmp/cyberedge-dev10-dom-entry.tsx'],bundle:true,platform:'node',format:'esm',outfile,packages:'external',nodePaths:[root+'/node_modules'],tsconfig:root+'/tsconfig.app.json',loader:{'.css':'empty'},define:{'import.meta.env.VITE_API_URL':'""'}});
const result=spawnSync(process.execPath,[outfile],{stdio:'inherit'});await rm(outfile);process.exitCode=result.status||0;
