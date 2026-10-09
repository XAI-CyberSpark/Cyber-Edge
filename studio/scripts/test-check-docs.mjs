import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkDocs, readManifest, renderedAnchors, formatReport } from './check-docs.mjs';

const header = '# OAKEgde 示例\n\n状态：测试。维护日期：2026-10-06。\n\n';
const script = path.join(import.meta.dirname, 'check-docs.mjs');
const roots = [];
function fixture(run) {
  const root = fs.mkdtempSync('/tmp/oakegde-docs-check-test-');
  roots.push(root);
  const write = (file, text = '') => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
  write('studio/scripts/developer-docs-plugin.ts', "const entries = [['one','One','Start','docs/one.md']] as const;\nconst supplemental = ['docs/two.md'];");
  for (const file of ['docs/one.md', 'docs/two.md', 'README.md', 'CONTEXT.md', 'AGENTS.md']) write(file, header);
  try { return run({ root, write }); } finally { fs.rmSync(root, { recursive: true, force: true }); assert.equal(fs.existsSync(root), false); }
}
const errors = result => result.issues.filter(issue => issue.severity === 'error');

test('static manifest preserves source lines; comments and unrelated arrays are not scope', () => {
  const rows = readManifest("// 'docs/no.md'\nconst other=['docs/no.md'];\nconst entries=[['id','Title','Group','docs/a.md']] as const;\nconst supplemental = ['docs/b.md'];");
  assert.deepEqual(rows, [{ file: 'docs/a.md', line: 3 }, { file: 'docs/b.md', line: 4 }]);
  assert.throws(() => readManifest('const entries = getFiles(); const supplemental=[];'), /静态数组/);
});

test('real renderer anchors: Chinese, punctuation, duplicates, inline markup and non-rendered headings', () => {
  const markdown = '# Start\n## 中文，标题！\n## 中文，标题！\n### **Bold** `code`\n#### No ID\n```md\n## In code\n```\n    ## Indented code\n> ## Quote heading\n<div>\n## HTML block\n</div>\n';
  assert.deepEqual([...renderedAnchors(markdown)], ['start', '中文标题', '中文标题-1', 'bold-code']);
});

test('valid inline/reference/image links, encoded spaces/Chinese, queries and local fragments', () => fixture(({root, write}) => {
  write('docs/two.md', header + '## 中文，标题！\n## 中文，标题！\n');
  write('docs/space name.md', header);
  write('docs/pic.png', 'image fixture');
  write('docs/one.md', header + '[inline](two.md?view=1#中文标题) [repeat](two.md#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98-1)\n[space](<space name.md>) [encoded](space%20name.md)\n![image](pic.png) [ref][target]\n[target]: two.md#中文标题 "Title"\n[self](#oakegde-示例)\n[web](https://example.com/docs/not-local.md#absent) [mail](mailto:a@example.com)\n');
  assert.deepEqual(checkDocs(root).issues, []);
}));

test('broken files and anchors point to their source lines; linked documents outside scope are checked', () => fixture(({root, write}) => {
  write('docs/outside.md', header + '## Exists\n#### Deep\n```\n## Fake\n```\n');
  write('docs/one.md', header + '[missing](missing.md)\n[bad anchor](outside.md#absent)\n[deep](outside.md#deep)\n[code](outside.md#fake)\n');
  const result = checkDocs(root);
  assert.deepEqual(errors(result).map(i => [i.code, i.line]), [['LINK_TARGET',5], ['ANCHOR',6], ['ANCHOR',7], ['ANCHOR',8]]);
  assert.equal(result.files.includes('docs/outside.md'), false);
}));

test('reference definitions and images report missing targets without treating links as root prose paths', () => fixture(({root, write}) => {
  write('docs/one.md', header + '![image](absent.png)\n[reference][ref]\n\n[ref]: two.md#missing\n');
  const result = checkDocs(root);
  assert.deepEqual(errors(result).map(i => [i.code, i.line]), [['LINK_TARGET',5], ['ANCHOR',6], ['ANCHOR',8]]);
}));

test('invalid URL encoding and non-Markdown fragments fail rather than silently pass', () => fixture(({root, write}) => {
  write('backend/main.py', 'pass');
  write('docs/one.md', header + '[encoding](two.md#%ZZ)\n[source](../backend/main.py#L1)\n');
  assert.deepEqual(errors(checkDocs(root)).map(i => i.code), ['LINK_ENCODING','ANCHOR_TARGET']);
}));

test('repository paths in body, inline/fenced/indented code and quoted filenames are validated', () => fixture(({root, write}) => {
  for (const file of ['scripts/ok.py','backend/main.py','studio/file name.ts','docs/good.md']) write(file);
  write('docs/one.md', header + 'scripts/ok.py，`backend/main.py` and `"studio/file name.ts"`。\n```sh\npython scripts/missing.py\ncat "studio/missing space.ts"\n```\n\n    docs/absent.md\n\n见backend/missing.py\n');
  const result = errors(checkDocs(root));
  assert.deepEqual(result.map(i => i.line), [7,8,11,13]);
  assert.ok(result.every(i => i.code === 'REPO_PATH'));
  assert.match(result[1].message, /studio\/missing space.ts$/);
}));

test('literal placeholders, wildcards and generated paths remain errors; external URLs are not repo paths', () => fixture(({root, write}) => {
  write('docs/one.md', header + '`docs/releases/<version>/PRD.md`\n`scripts/*.py`\n`backend/generated.json`\nhttps://example.com/?path=docs/external.md\n');
  assert.equal(errors(checkDocs(root)).length, 3);
}));

test('links in code are examples, but repository path literals inside code are still checked', () => fixture(({root,write}) => {
  write('docs/one.md', header + '```md\n[example](missing.md#no)\n[repo example](docs/missing.md)\n```\n');
  const result = errors(checkDocs(root));
  assert.equal(result.length, 1);
  assert.equal(result[0].code, 'REPO_PATH');
  assert.equal(result[0].line, 7);
}));

test('missing manifest file still permits checks on other pages', () => fixture(({root,write}) => {
  fs.unlinkSync(path.join(root,'docs/two.md'));
  write('README.md', header + '[broken](missing.md)');
  const result = errors(checkDocs(root));
  assert.ok(result.some(i => i.code === 'MANIFEST_FILE' && i.line === 2));
  assert.ok(result.some(i => i.file === 'README.md' && i.code === 'LINK_TARGET'));
}));

test('metadata absence is warning only; later headings and code do not count as opening metadata', () => fixture(({root,write}) => {
  write('docs/one.md', '# Test\n\n```\n状态：测试。维护日期：2026-10-06。\n```\n\n## Later\n状态：测试。维护日期：2026-10-06。\n');
  const result = checkDocs(root);
  assert.equal(errors(result).length, 0);
  assert.deepEqual(result.issues.map(i => i.code).sort(), ['DATE','STATUS']);
}));

test('mixed spelling counted across scope without changing source bytes', () => fixture(({root,write}) => {
  write('docs/one.md', header + 'OAKEdge OAKEdge');
  const before = fs.readFileSync(path.join(root,'docs/one.md'));
  const result = checkDocs(root);
  assert.deepEqual(result.brands, {OAKEgde:5, OAKEdge:2});
  assert.equal(result.issues.filter(i => i.code === 'PRODUCT_NAME').length, 1);
  assert.deepEqual(fs.readFileSync(path.join(root,'docs/one.md')), before);
}));

test('CLI returns zero for warnings and nonzero for errors; stable grouped report includes every file', () => fixture(({root,write}) => {
  write('docs/one.md', '# No metadata\n');
  let run = spawnSync(process.execPath, [script, '--root', root], {encoding:'utf8',cwd:'/tmp'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/错误 0，警告 2/);
  write('docs/one.md', '# No metadata\n[broken](no.md)\n');
  run = spawnSync(process.execPath, [script, '--root', root], {encoding:'utf8'});
  assert.equal(run.status,1);
  assert.equal(run.stdout,formatReport(checkDocs(root)));
  assert.match(run.stdout,/docs\/one.md:2 \[LINK_TARGET\]/);
  assert.match(run.stdout,/AGENTS.md：错误 0，警告 0/);
}));

test('command arguments, adjacent Chinese punctuation and diagram breaks are not filename text', () => fixture(({root,write}) => {
  for (const file of ['scripts/run.py', 'backend/python', 'studio/file.ts', 'docs/end.md']) write(file);
  write('docs/one.md', header + '`scripts/run.py prepare`\n`backend/python scripts/run.py`\n路径docs/end.md）\nstudio/file.ts误拼接描述\n```mermaid\nnode["backend/*.json<br/>backend/*.sqlite3"]\n```\n');
  const result = errors(checkDocs(root));
  assert.deepEqual(result.map(i => i.message).sort(), ['仓库路径不存在：backend/*.json', '仓库路径不存在：backend/*.sqlite3'].sort());
}));

test('metadata after line 40 in a long opening paragraph remains missing', () => fixture(({root,write}) => {
  write('docs/one.md', '# Title\n\n' + 'opening\n'.repeat(40) + '状态：测试。维护日期：2026-10-06。\n');
  assert.deepEqual(checkDocs(root).issues.map(i => i.code).sort(), ['DATE', 'STATUS']);
}));

test('bold metadata labels are recognized without joining separate physical lines', () => fixture(({root,write}) => {
  write('docs/one.md', '# Title\n\n**状态**：测试。**维护日期**：2026-10-06。\n');
  assert.deepEqual(checkDocs(root).issues, []);
  write('docs/one.md', '# Title\n\n状态\n：测试\n维护日期\n：2026-10-06\n');
  assert.deepEqual(checkDocs(root).issues.map(i => i.code).sort(), ['DATE', 'STATUS']);
}));

test('Chinese conjunction between two repository paths preserves both references', () => fixture(({root,write}) => {
  write('backend/first.py');
  write('docs/one.md', header + 'backend/first.py与docs/missing.md\n');
  assert.deepEqual(errors(checkDocs(root)).map(i => [i.line, i.message]), [[5, '仓库路径不存在：docs/missing.md']]);
}));

test('temporary sample directories from all tests have been removed', () => {
  assert.ok(roots.length >= 10);
  for (const root of roots) assert.equal(fs.existsSync(root), false, root);
});
