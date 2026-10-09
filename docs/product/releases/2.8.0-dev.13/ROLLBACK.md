# 回滚

修改前文件保存在 `.demo-runtime/versions/before-feishu-dev13/files/`，SHA-256清单在同目录 `manifest.json`。仅覆盖清单内文件即可恢复本轮前状态；恢复前对照当前差异，保护后续编辑。新增 `studio/src/domain/modelCatalog.ts` 及本轮测试/文档需单独处理。此为文件备份，不是 Git 提交快照；不要重置整个仓库，不恢复/删除用户项目、模型、车模。`data-before.json` 仅用于核对数据未变。

备份还包括 studio/package.json 与 package-lock.json。新增测试文件为 studio/tests/feishu-refinements.dom.tsx、studio/scripts/test-feishu-refinements.mjs；仅在确认无后续修改时随本轮回滚处理。
