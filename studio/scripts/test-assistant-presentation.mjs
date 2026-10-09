import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'node_modules', '.tmp');
await mkdir(folder, { recursive: true });
const outfile = path.join(folder, 'assistant-presentation.test.mjs');
try {
  await build({ absWorkingDir: root, entryPoints: [path.join(root, 'tests/assistant-presentation.test.ts')], bundle: true, platform: 'node', format: 'esm', outfile, tsconfig: path.join(root, 'tsconfig.app.json'), define: { 'import.meta.env.VITE_API_URL': '""' } });
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(outfile, { force: true }); }
