# 任务

- [x] 取得官方 main 快照；12 个核心源码原样保留，记录 SHA-256 和 MIT 许可。
- [x] 适配 React SVG 渲染，保留遮罩、粒子/轨道层次与原 viewBox。
- [x] 独立预览、双配色同步、播放控制、减少动态效果偏好与后台清理。
- [x] 独立样式与滚动；按需加载入口。
- [x] 7 组专项检查、TypeScript/Vite 构建及 HTTP 检查。
- [ ] 实际浏览器视觉、滚动、焦点与流畅度验收：工具策略校验阻塞。
- [x] 用户明确授权以浅色形象直接替换 HMI 左侧四角星（不等同于最终视觉验收）。
- [x] 替换实际 HMI 形象，连接文字请求、执行、主动通知/警示状态。

实现：studio/src/components/avatar/、components/pages/AvatarPreviewPage.tsx、avatar-preview.css、vendor/bloub/。
测试：node studio/scripts/test-avatar-preview.mjs。

补充实现：HmiAssistantAvatar.tsx、CockpitAssistant.tsx、cockpit-assistant.css。5 组集成 DOM 检查、34 项仿真回归和构建通过。实际浏览器已检查指定位置、展开、输入、错误后恢复待机。真实模型回复当前失败，详见 ACCEPTANCE。
