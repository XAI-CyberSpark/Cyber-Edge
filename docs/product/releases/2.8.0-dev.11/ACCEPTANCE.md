# 验收记录

- 前端构建：通过，日志 `.demo-runtime/versions/minimal-black-dev11/build.log`。保留已有大包体积提示，本轮没有改变打包方案。
- `npm run test:hmi`：33 项全部通过，日志同目录 `tests.log`。
- 浏览器：839×765 和 1440×900 下车模完整可见，标题、状态和底栏没有遮挡；已恢复默认视口。
- 助手：折叠/展开正常，原有问答和确认执行逻辑保留；本轮未重测真实模型回复质量。
- 控制：温度 22→23→22；四窗打开到 100%，再恢复关闭；导航入口正常；设置模拟曲目后首页出现媒体信息，停止后消失。
- 数据：既有项目、模型与车模资源未修改；验收使用临时未保存工作流。

## 回滚

修改前原文件在 `.demo-runtime/versions/before-minimal-black-dev11/files/`，对应 SHA-256 在 `manifest.json`；本轮完成快照在 `.demo-runtime/versions/minimal-black-dev11/files/`。

如需恢复外观，只恢复三个文件：`studio/src/components/core/CockpitHmi.tsx`、`studio/src/components/core/cockpit-hmi.css`、`studio/src/components/spatial/HmiCarStage.tsx`。恢复前备份当时文件并比对本轮完成快照，若后续已有修改，先合并，避免覆盖。不要整库重置。版本元数据应记录回滚事实，不覆盖其后追加的历史。恢复后重启前端。

本轮是 2.8.0-dev.11 本地开发快照，未发布、未创建 Git commit/tag。

## 水面倒影补充验收

- 生产构建通过；日志 `.demo-runtime/versions/dev11-water-reflection/build.log`，保留原有大包体积提示。
- 浏览器实测：车模与低亮度倒影完整显示，地面融入黑色背景；着色器控制台无错误。水面为实时反射加程序波纹，非流体物理仿真。本轮未做帧率基准测试，反射使用 512 分辨率。
- 改动前车模组件与助手类型文件保留在 `.demo-runtime/versions/before-dev11-reflection/`；完成文件备份在 `.demo-runtime/versions/dev11-water-reflection/`。后续回滚前需比对文件以保留新改动。
- 补充仍归属 dev.11，未提交、未发布；未改车模资源、项目数据及模型。
