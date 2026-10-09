# 验收记录

2026-10-06｜开发工作区局部通过，未提交、未发布，日常 5175 未更新。

## 复现与修改

1920×1000 浏览器中 HMI 为 (56,112,1494,888)，原弹窗 (490,55,940,890)、命中原生 `:modal`，菜单 justify-content 为 center。修改后弹窗 (323,176,960,760)，中心与 HMI 一致，脱离浏览器全局 modal；遮罩严格等于 HMI 边界，菜单为 flex-start，11 个项目文字起点一致。

原生 dialog 改为受控 open 的局部非模态面板，只禁用 HMI 背景交互，外部工作台保留交互；Escape、关闭、局部遮罩恢复入口焦点，外部已取得焦点时不抢焦点。分类与内容独立滚动，切换分类重置内容滚动。类别固定图标槽，保留既定图像资产，补齐驾驶/空调/车窗图标；标题与标签复用 HMI 字体角色。

## 验证

- `node studio/scripts/test-hmi-chrome.mjs`：8 组通过，含10个设置类别、共享状态、全局 showModal 禁用回归和关闭/焦点。
- `node studio/scripts/test-hmi-controls.mjs`：6 项通过，包含图执行共享状态、非法控制拒绝及前后端注册表一致。
- `cd studio && npm run build`：TypeScript 与 Vite 通过；现有大包和 Browserslist 陈旧提示不影响构建。
- `node scripts/audit-typography.mjs --write`：0 违规。
- 隔离 Chrome 与只读设计 fixture：1920×1000、1280×800 及 480px HMI 容器；日/夜模式、坐标包含与居中、文字对齐、无横向溢出、独立滚动、Escape 焦点和遮罩关闭通过。
- 证据：[桌面日间](../../../../outputs/design-dev97/desktop-light.png)、[桌面夜间](../../../../outputs/design-dev97/desktop-night.png)、[紧凑窗口](../../../../outputs/design-dev97/compact.png)、[窄 HMI](../../../../outputs/design-dev97/narrow.png)、[度量](../../../../outputs/design-dev97/metrics.json)。截图测试仅运行隔离示例，不修改用户项目。

- 全仓文档检查未通过：既有链接解析、历史缺失路径及未识别 studio 工作目录等问题仍存在；本轮新增链接均另行校验，未扩大修复范围。

## 范围与限制

内置浏览器工具因旧目录 symlink 配置无法启动，改用独立 Chrome 调试协议检查。未验证实车、真实模型或更新 Figma；本轮不修改 SU7 模型。日常 5175 固定副本没有热更新，需按既有流程在编排结束、保存完成后更新，开发通过不等于日常已部署。
