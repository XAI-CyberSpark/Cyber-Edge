import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'i18n/en.json')));
const chinese = /[\u3400-\u9fff]/u;
const missing = new Set(), raw = [];
function requireCopy(value, source) {
  const key = value.trim();
  if (chinese.test(key) && !dictionary[key]) missing.add(`${source}: ${key}`);
}
function templateKey(node) {
  return node.head.text + node.templateSpans.map((span, i) => `{${i}}${span.literal.text}`).join('');
}
function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.tsx?$/.test(file)) continue;
    const source = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), 99, true, file.endsWith('tsx') ? 4 : 3);
    const relative = path.relative(root, p);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'uiText') {
        const value = node.arguments[0];
        if (value && ts.isStringLiteralLike(value)) requireCopy(value.text, relative);
        if (value && ts.isTemplateExpression(value)) requireCopy(templateKey(value), relative);
      }
      if (ts.isJsxText(node) && chinese.test(node.text)) raw.push([relative, source.getLineAndCharacterOfPosition(node.pos).line + 1, node.text.trim()]);
      // Rendered inline templates were missed by the old JSX-text-only audit.
      if (ts.isTemplateExpression(node) && chinese.test(templateKey(node))) {
        let parent = node.parent, translated = false;
        while (parent && !ts.isJsxExpression(parent) && !ts.isArrowFunction(parent) && !ts.isFunctionLike(parent)) {
          if (ts.isCallExpression(parent) && parent.expression.getText(source) === 'uiText') translated = true;
          parent = parent.parent;
        }
        if (parent && ts.isJsxExpression(parent) && !ts.isJsxAttribute(parent.parent) && !translated) raw.push([relative, source.getLineAndCharacterOfPosition(node.pos).line + 1, templateKey(node)]);
      }
      // Hook-generated errors are runtime system copy, even though JSX receives a variable.
      if (['hooks/useVoiceInput.ts', 'hooks/useHmiSpeech.ts'].includes(relative) && ts.isStringLiteralLike(node)) requireCopy(node.text, relative);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
walk(root);
for (const name of ['nodeCapabilities', 'carControlCatalog', 'hmiControls']) {
  function check(value) {
    if (typeof value === 'string') requireCopy(value, `data/${name}.json`);
    else if (value && typeof value === 'object') Object.values(value).forEach(check);
  }
  check(JSON.parse(fs.readFileSync(path.join(root, `data/${name}.json`))));
}
console.log('Missing', missing.size, [...missing]);
console.log('Raw JSX / rendered templates', raw);
if (missing.size || raw.length) process.exitCode = 1;
