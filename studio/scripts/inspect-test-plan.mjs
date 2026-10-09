// Read-only bridge: backend uses the same input validator and static analysis as Studio.
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const bundle=await build({tsconfig:fileURLToPath(new URL('../tsconfig.app.json',import.meta.url)),absWorkingDir:fileURLToPath(new URL('..',import.meta.url)),entryPoints:[fileURLToPath(new URL('../src/domain/testPlanPreflight.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {inspectTestPlan}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const {project,plan}=JSON.parse(readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(inspectTestPlan(project,plan)));
