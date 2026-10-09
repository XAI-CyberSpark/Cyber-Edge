# OAKEgde Studio 规范化执行记录

日期：2026-09-11。已完成文档与冗余文件整理；未改业务逻辑。

## 清理结果

删除 8 个文件：根目录空 package-lock.json、studio 的 react.svg 与 vite.svg、desktop/app/frontend 下 5 个历史生成文件。

桌面资源由 prepare-resources.mjs 重新生成，正常 start/pack/dist 流程先执行构建。直接跳过构建运行 Electron 不再有旧的前端副本。

新增产品开发流程、迭代模板、文档导航；更新根 README 与 .gitignore。历史架构、旧启动配置在导航中标记适用范围，原文件保留。

## 备份与恢复

逐文件备份目录：C:\Users\Lenovo\Documents\Codex\2026-09-11\d-oakegde\outputs\oakegde-standardization\cleanup-backup

原文件 SHA256 与变更后 SHA256 记录于同级 restore-manifest.json；同级 restore.ps1 用于恢复。恢复前脚本会检查文件是否被后续修改，发现冲突时停止。

## 验证边界

备份哈希已逐项校验。原有 9 个已修改文件的哈希在整理前后一致。保留用户项目、隧道工具、Git 与既有备份。文档链接和 Git 差异另行检查。

本次未运行前后端、模型或真实设备测试；未验证历史交付能力。
补充检查：新建与重写文档的相对链接全部存在；git diff --check 通过。Git 差异包含用户原有修改，未提交任何变更。
