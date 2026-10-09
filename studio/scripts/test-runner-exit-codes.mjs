import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const runners = ['component-library', 'diagnostics', 'feishu-refinements', 'mcp-library',
  'node-capabilities-dom', 'project-navigation', 'qualcomm-catalog', 'scenario-generation',
  'scenario-session-dom'];
const temp = await mkdtemp(path.join(os.tmpdir(), 'oakegde-runner-exit-'));
let checks = 0;
try {
  await mkdir(path.join(temp, 'scripts'));
  // Run each original runner, isolate bundling, and redirect only its test child
  // to a real process with a controlled exit outcome.
  const preload = path.join(temp, 'inject.mjs');
  await writeFile(preload, `
import {registerHooks, syncBuiltinESMExports} from 'node:module';
import childProcess from 'node:child_process';
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'esbuild') return {url: 'data:text/javascript,export async function build() {}', shortCircuit: true};
  return next(specifier, context);
}});
const original = childProcess.spawnSync;
childProcess.spawnSync = () => {
  const outcome = process.env.OAKEGDE_TEST_CHILD_OUTCOME;
  if (outcome === 'missing') return original('/oakegde-nonexistent-test-executable', []);
  return original(process.execPath, ['-e', outcome === 'signal'
    ? 'process.kill(process.pid, "SIGTERM")' : 'process.exit(' + outcome + ')']);
};
syncBuiltinESMExports();
`);
  for (const runner of runners) {
    const target = path.join(temp, 'scripts', `test-${runner}.mjs`);
    await copyFile(path.join(scripts, `test-${runner}.mjs`), target);
    for (const outcome of ['0', '7', 'signal', 'missing']) {
      const result = spawnSync(process.execPath, ['--import', preload, target], {
        encoding: 'utf8', env: {...process.env, OAKEGDE_TEST_CHILD_OUTCOME: outcome},
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, outcome === '0' ? 0 : outcome === '7' ? 7 : 1,
        `${runner}: ${outcome}\n${result.stderr}`);
      checks++;
    }
    console.log(`PASS ${runner}: success, nonzero, signal, startup failure`);
  }
} finally {
  await rm(temp, {recursive: true, force: true});
}
console.log(`${checks} runner exit checks passed; no DOM suites or project data executed.`);
