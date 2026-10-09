import {build} from 'esbuild';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw Error('Output path required');
await build({entryPoints:[resolve(root,'scripts/scenario-execution.ts')],bundle:true,platform:'node',format:'esm',outfile:process.argv[2],tsconfig:resolve(root,'tsconfig.app.json'),define:{'import.meta.env.VITE_API_URL':'""'}});
