# 本轮恢复范围

修改前备份：.demo-runtime/versions/before-bloub-preview-dev15/，仅含 studio/src/main.tsx 与 6 份版本/导航文档。不是完整项目快照。

恢复前检查最新差异，防止覆盖其他窗口或后续编辑：优先只撤销 main.tsx 的 preview=avatar 分支和相关导入。无后续入口修改时才使用备份替换。

新增文件：components/avatar/、components/pages/AvatarPreviewPage.tsx、avatar-preview.css、vendor/bloub/、tests/avatar-preview.dom.tsx、scripts/test-avatar-preview.mjs（均在 studio/）。如需移除，先查引用并归档。文档按当前最新状态修订，不盲目整文件恢复。

未修改 App、现有 HMI、模型、SU7、后端或项目文件。不使用 Git reset，不删除既有快照。

## HMI 接入补充的回滚

本次修改前备份位于 .demo-runtime/versions/before-bloub-hmi-integration-dev15/，含 CockpitAssistant.tsx、cockpit-assistant.css 和相关文档；不是完整快照。先比对后续变更，再仅撤销头像 import、avatarState、原图标 JSX 和 ca-orb 样式。新增 HmiAssistantAvatar.tsx、hmi-assistant-avatar.dom.tsx、test-hmi-assistant-avatar.mjs 在查引用后可归档。不要全仓恢复或覆盖其他窗口改动。
