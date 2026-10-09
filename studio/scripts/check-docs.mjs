import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const repository = path.resolve(import.meta.dirname, '../..');
const pluginFile = 'studio/scripts/developer-docs-plugin.ts';
const parser = unified().use(remarkParse).use(remarkGfm);
// Import the actual site's implementation in memory; never write/transpile site files.
const headingSource = fs.readFileSync(path.join(repository, 'studio/src/domain/developerDocs.ts'), 'utf8');
const compiled = ts.transpileModule(headingSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { documentHeadings } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function visit(node, fn) {
  fn(node);
  for (const child of node.children || []) visit(child, fn);
}

// DeveloperDocsPage assigns IDs only to rendered h1/h2/h3, by source line.
export function renderedAnchors(markdown) {
  const headings = documentHeadings(markdown);
  const ids = new Set();
  visit(parser.parse(markdown), node => {
    if (node.type !== 'heading' || node.depth > 3) return;
    const heading = headings.find(item => item.line === node.position.start.line);
    if (heading) ids.add(heading.id);
  });
  return ids;
}

// Static AST inspection, not eval/import of the plugin. Unsupported manifest changes fail closed.
export function readManifest(source) {
  const ast = ts.createSourceFile(pluginFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const unwrap = node => {
    while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression;
    return node;
  };
  const lists = new Map();
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && ['entries', 'supplemental'].includes(declaration.name.text)) {
        lists.set(declaration.name.text, unwrap(declaration.initializer));
      }
    }
  }
  if (ast.parseDiagnostics.length) throw new Error('plugin TypeScript 无法解析');
  const files = [];
  for (const name of ['entries', 'supplemental']) {
    const list = lists.get(name);
    if (!list || !ts.isArrayLiteralExpression(list)) throw new Error(`${name} 必须是静态数组，无法可靠读取清单`);
    for (const element of list.elements) {
      let file = unwrap(element);
      if (name === 'entries') {
        if (!ts.isArrayLiteralExpression(file) || file.elements.length !== 4) throw new Error('entries 必须是四项静态元组');
        file = unwrap(file.elements[3]);
      }
      if (!ts.isStringLiteral(file)) throw new Error(`${name} 文件路径必须是字符串字面量`);
      files.push({ file: file.text, line: ast.getLineAndCharacterOfPosition(file.getStart(ast)).line + 1 });
    }
  }
  return files;
}

function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

// Literal repository paths, including fenced/indented code. No wildcard expansion or placeholder exemption.
function repositoryPaths(markdown, tree) {
  const chars = markdown.split('');
  const mask = (start, end) => { for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' '; };
  visit(tree, node => {
    // Destinations use Markdown-relative resolution below. Avoid counting them again as root-relative prose paths.
    if (['link', 'image', 'definition', 'linkReference', 'imageReference'].includes(node.type)) {
      mask(node.position.start.offset, node.position.end.offset);
    }
  });
  for (const match of markdown.matchAll(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"'`]+/gi)) mask(match.index, match.index + match[0].length);
  // Diagram/HTML line breaks delimit paths too; placeholders such as <version> remain literal.
  for (const match of markdown.matchAll(/<br\s*\/?>/gi)) mask(match.index, match.index + match[0].length);
  for (const match of markdown.matchAll(/(\.[A-Za-z0-9]{1,12})([\p{Script=Han}]+)(?=(?:scripts|backend|studio|docs)\/)/gu)) {
    mask(match.index + match[1].length, match.index + match[0].length);
  }
  const visible = chars.join('');
  const found = [];
  // Spaces are allowed inside single/double quotes; backticks can contain whole commands.
  const regex = /(?<![A-Za-z0-9_/.:@-])(?:scripts|backend|studio|docs)\/[^\s`"'，。；：！？、（）|),;!]+/gu;
  for (const match of visible.matchAll(regex)) {
    let value = match[0];
    const quote = visible[match.index - 1];
    if (['"', "'"].includes(quote)) {
      const end = visible.indexOf(quote, match.index);
      if (end >= 0 && !visible.slice(match.index, end).includes('\n') && visible.slice(match.index, end) === markdown.slice(match.index, end)) value = visible.slice(match.index, end);
    } else {
      value = value.replace(/[;,!\]}]+$/, '').replace(/(?<!\.)\.$/, '');
    }
    // Unseparated Chinese prose after an ASCII extension is not part of that extension.
    value = value.replace(/(\.[a-zA-Z0-9]{1,12})(?=[\p{Script=Han}])[^/]*$/u, '$1');
    // Source-location suffixes are not part of the filename.
    value = value.replace(/:\d+(?::\d+)?$/, '').replace(/#L\d+(?:-L\d+)?$/, '');
    found.push({ value, line: markdown.slice(0, match.index).split('\n').length });
  }
  return found;
}

export function checkDocs(root = repository) {
  root = path.resolve(root);
  const issues = [];
  const seen = new Set();
  const add = (severity, file, line, code, message) => {
    const issue = { severity, file, line, code, message };
    const key = JSON.stringify(issue);
    if (!seen.has(key)) { seen.add(key); issues.push(issue); }
  };
  let manifest;
  try { manifest = readManifest(fs.readFileSync(path.join(root, pluginFile), 'utf8')); }
  catch (error) {
    add('error', pluginFile, 1, 'MANIFEST', error.message);
    return { files: [], issues, brands: { OAKEgde: 0, OAKEdge: 0 } };
  }
  for (const entry of manifest) {
    if (!isFile(path.resolve(root, entry.file))) add('error', pluginFile, entry.line, 'MANIFEST_FILE', `清单文件不存在或不是文件：${entry.file}`);
  }
  const files = [...new Set([...manifest.map(entry => entry.file), 'README.md', 'CONTEXT.md', 'AGENTS.md'])].sort();
  const anchors = new Map();
  const brandPages = [];
  const brands = { OAKEgde: 0, OAKEdge: 0 };
  for (const file of files) {
    const absolute = path.resolve(root, file);
    if (!isFile(absolute)) {
      if (!manifest.some(entry => entry.file === file)) add('error', file, 1, 'SCOPE_FILE', '范围文件不存在或不是文件');
      continue;
    }
    const markdown = fs.readFileSync(absolute, 'utf8');
    const tree = parser.parse(markdown);
    const definitions = new Map();
    visit(tree, node => { if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node); });
    const checkLink = (href, line) => {
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return;
      let target, fragment;
      try {
        const hash = href.indexOf('#');
        const beforeHash = hash < 0 ? href : href.slice(0, hash);
        const pathname = decodeURIComponent(beforeHash.split('?')[0]);
        fragment = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1));
        target = pathname ? path.resolve(pathname.startsWith('/') ? root : path.dirname(absolute), pathname.replace(/^\//, '')) : absolute;
      } catch {
        add('error', file, line, 'LINK_ENCODING', `链接编码无效：${href}`); return;
      }
      const display = path.relative(root, target).split(path.sep).join('/');
      if (!fs.existsSync(target)) { add('error', file, line, 'LINK_TARGET', `链接目标不存在：${href} → ${display}`); return; }
      if (fragment) {
        if (!/\.(md|markdown)$/i.test(target) || !isFile(target)) {
          add('error', file, line, 'ANCHOR_TARGET', `无法按网页规则验证非 Markdown 锚点：${href}`); return;
        }
        if (!anchors.has(target)) anchors.set(target, renderedAnchors(fs.readFileSync(target, 'utf8')));
        if (!anchors.get(target).has(fragment)) add('error', file, line, 'ANCHOR', `锚点不存在：${href} → ${display}#${fragment}`);
      }
    };
    visit(tree, node => {
      if (['link', 'image', 'definition'].includes(node.type)) checkLink(node.url, node.position.start.line);
      if (['linkReference', 'imageReference'].includes(node.type)) {
        const definition = definitions.get(node.identifier);
        if (definition) checkLink(definition.url, node.position.start.line);
      }
    });
    for (const item of repositoryPaths(markdown, tree)) {
      if (!fs.existsSync(path.resolve(root, item.value))) add('error', file, item.line, 'REPO_PATH', `仓库路径不存在：${item.value}`);
    }
    // Opening means before the first section heading, at most 40 physical lines; code is not metadata.
    const section = tree.children.find(node => node.type === 'heading' && node.depth >= 2);
    const limit = Math.min(40, section ? section.position.start.line - 1 : 40);
    const opening = [];
    let previousLine = 0;
    const collectOpening = node => {
      if (node.position?.start.line > limit || ['code', 'inlineCode', 'html'].includes(node.type)) return;
      if (node.type === 'text') {
        if (node.position.start.line > previousLine) opening.push('\n');
        opening.push(node.value.split('\n').slice(0, limit - node.position.start.line + 1).join('\n'));
        previousLine = node.position.end.line;
      }
      for (const child of node.children || []) collectOpening(child);
    };
    collectOpening(tree);
    const metadata = opening.join('');
    if (!/(?:文档)?状态[ \t]*[:：][ \t]*[^\s，。；|｜]/u.test(metadata)) add('warning', file, 1, 'STATUS', '开头缺少可识别的“状态：…”（首节前，最多40行）');
    if (!/维护日期[ \t]*[:：][ \t]*\d{4}[-/]\d{1,2}[-/]\d{1,2}/u.test(metadata)) add('warning', file, 1, 'DATE', '开头缺少可识别的“维护日期：YYYY-MM-DD”（首节前，最多40行）');
    const counts = Object.fromEntries(Object.keys(brands).map(name => [name, [...markdown.matchAll(new RegExp(name, 'g'))].length]));
    for (const name of Object.keys(brands)) brands[name] += counts[name];
    brandPages.push({ file, counts, line: markdown.slice(0, markdown.indexOf('OAKEdge')).split('\n').length });
  }
  if (brands.OAKEgde && brands.OAKEdge) {
    for (const page of brandPages.filter(page => page.counts.OAKEdge)) add('warning', page.file, page.line, 'PRODUCT_NAME', `检查范围内两种产品名并存；本页 OAKEgde=${page.counts.OAKEgde}，OAKEdge=${page.counts.OAKEdge}（仅统计）`);
  }
  issues.sort((a, b) => a.file.localeCompare(b.file, 'en') || a.line - b.line || a.code.localeCompare(b.code, 'en'));
  return { files, issues, brands };
}

export function formatReport(result) {
  const errors = result.issues.filter(issue => issue.severity === 'error');
  const warnings = result.issues.filter(issue => issue.severity === 'warning');
  const lines = ['文档检查报告', `范围：${result.files.length} 页（plugin entries + supplemental，以及 README.md、CONTEXT.md、AGENTS.md；去重）`,
    `结果：错误 ${errors.length}，警告 ${warnings.length}`, `产品名统计：OAKEgde=${result.brands.OAKEgde}，OAKEdge=${result.brands.OAKEdge}`, ''];
  for (const [title, list] of [['错误', errors], ['警告', warnings]]) {
    lines.push(`${title}（${list.length}）`);
    let current;
    if (!list.length) lines.push('无');
    for (const issue of list) {
      if (current !== issue.file) { current = issue.file; lines.push(`\n${current}`); }
      lines.push(`  ${issue.file}:${issue.line} [${issue.code}] ${issue.message}`);
    }
    lines.push('');
  }
  lines.push('按文件统计（包含无问题文件）');
  for (const file of [...new Set([...result.files, ...result.issues.map(issue => issue.file)])].sort()) {
    lines.push(`${file}：错误 ${errors.filter(issue => issue.file === file).length}，警告 ${warnings.filter(issue => issue.file === file).length}`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = process.argv[2] === '--root' && process.argv[3] ? process.argv[3] : repository;
    if (process.argv.length > 2 && (process.argv[2] !== '--root' || process.argv.length !== 4)) throw new Error('用法：node scripts/check-docs.mjs [--root 仓库目录]');
    const result = checkDocs(root);
    process.stdout.write(formatReport(result));
    process.exitCode = result.issues.some(issue => issue.severity === 'error') ? 1 : 0;
  } catch (error) {
    process.stderr.write(`错误\n  studio/scripts/check-docs.mjs:1 [CHECKER] ${error.message}\n`);
    process.exitCode = 1;
  }
}
