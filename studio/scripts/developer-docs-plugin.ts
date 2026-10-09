import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// Explicit publication list: never expose arbitrary repository or runtime files.
const entries = [
  ['overview', '概览', '开始使用', 'docs/developer/README.md'],
  ['quickstart', '快速入门', '开始使用', 'docs/developer/QUICKSTART.md'],
  ['concepts', '核心概念', '开始使用', 'docs/developer/CONCEPTS.md'],
  ['development', '工程开发', '开发指南', 'docs/developer/DEVELOPMENT.md'],
  ['configuration', '配置与接入', '开发指南', 'docs/developer/CONFIGURATION.md'],
  ['api', 'API 参考', '开发指南', 'docs/api/01_OpenAPI_Guide.md'],
  ['testing', '测试与排障', '开发指南', 'docs/developer/TESTING.md'],
  ['architecture', '系统架构', '深入了解', 'docs/architecture/02_Current_Implementation_Architecture.md'],
  ['nodes', '节点与执行契约', '深入了解', 'docs/product/NODE_CONTRACTS.md'],
  ['mcp', 'MCP 工具接入', '深入了解', 'docs/product/MCP_RUNTIME.md'],
  ['maintenance', '共同维护', '资源', 'docs/developer/MAINTENANCE.md'],
  ['updates', '产品更新', '资源', 'docs/developer/UPDATES.md'],
  ['development-log', '详细开发记录', '', 'CHANGELOG.md'],
] as const;
const supplemental = [
  'docs/product/DESIGN_GUIDELINES.md', 'docs/product/DESIGN_TOKENS.md', 'docs/product/TYPOGRAPHY.md',
  'docs/product/NODE_DESIGN.md', 'docs/product/APPLE_DESIGN_SKILLS.md', 'docs/product/PRODUCT_WORKFLOW.md',
  'docs/product/VERSIONING.md', 'docs/product/ITERATION_TEMPLATE.md',
  'docs/devops/05_macOS_Local.md', 'docs/devops/04_Web_Studio_Production_Deployment.md',
  'docs/architecture/03_Target_Architecture.md',
];

export function developerDocsPlugin(): Plugin {
  const id = '\0virtual:developer-docs';
  const root = path.resolve(import.meta.dirname, '../..');
  const sources = [...entries.map(entry => entry[3]), ...supplemental, 'VERSION'];
  return {
    name: 'oakegde-developer-docs',
    resolveId(source) { if (source === 'virtual:developer-docs') return id; },
    load(source) {
      if (source !== id) return;
      sources.forEach(file => this.addWatchFile(path.join(root, file)));
      const pages: Array<{ slug: string; title: string; group: string; source: string; markdown: string }> = entries.map(([slug, title, group, file]) => ({
        slug, title, group, source: file, markdown: fs.readFileSync(path.join(root, file), 'utf8'),
      }));
      supplemental.forEach((file, index) => {
        const markdown = fs.readFileSync(path.join(root, file), 'utf8');
        pages.push({ slug: `reference-${index}`, title: markdown.match(/^# (.+)$/m)?.[1] || file,
          group: '', source: file, markdown });
      });
      return `export default ${JSON.stringify({ pages, version: fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim() })};`;
    },
    handleHotUpdate(context) {
      if (!sources.some(file => path.join(root, file) === context.file)) return;
      const module = context.server.moduleGraph.getModuleById(id);
      if (module) context.server.moduleGraph.invalidateModule(module);
      context.server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
