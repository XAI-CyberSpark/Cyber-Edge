# 验收

2.8.0-dev.28 / 2026-09-24。开发版，未提交未发布；待用户体验验收。

## 实现与环境

主站：`/Users/Shared/sherry/OAKEgde Studio/studio`，本地 Vite `http://localhost:5175/`，React 19.2.0，morphicons 1.7.1，lucide 与 lucide-react 均为 0.577.0。

统一 AppIcon 保持 SVG 挂载，通过名称更新真实状态；系统减少动态效果下直接切换图形，并在偏好变更或标签页隐藏时结束进行中的变形。原 Lucide / Figma HMI 图标的交互缩放使用 CSS individual scale，不覆盖原有旋转和定位，不改 Bloub、照片、车模和图表。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| `npm run build`（tsc -b + vite build） | 通过 |
| `node scripts/test-icon-motion.mjs` | 4组通过：真实 SVG 路径中间态与反向连续、减少动态效果、标签/忙碌状态、隐藏/偏好变化/卸载清理 |
| `node scripts/test-site-access.mjs` | 4组通过 |
| `node scripts/test-project-navigation.mjs` | 20组通过 |
| `node scripts/test-hmi-assistant-avatar.mjs` | 7组通过，保留语音生命周期、车控确认与 Bloub |
| `node scripts/test-hmi-chrome.mjs` | 5组通过 |
| `node scripts/test-video-replay.mjs` | 19项通过 |
| `node scripts/test-component-library.mjs` | 4组通过 |

首次 HMI 回归暴露图标后台仍有调度，已修正并重新通过。构建仍有已有大包和 Browserslist 数据提示；本轮不进行打包拆分或无关依赖升级。

## 浏览器检查

- 真实主站验证密钥后打开已有儿童关怀项目；未保存、删除或改写项目数据。
- 桌面 1440×900：主题日夜往返、对话面板展开/收起往返成功，图标 data-app-icon 与真实状态同步；面板图标布局尺寸16px，悬停 scale=1.1。
- 仿真 HMI：锁车/解锁往返成功，按钮 aria-pressed 同步，最终恢复锁车；Bloub、Figma Dock、车模和纯黑布局保留。
- 禁用除雾图标仍为 disabled，缩放为 none。
- 窄屏 720×900：页面宽度与 scrollWidth 都为720，无页面级横向溢出；固定右侧仿真面板仍挤压 HMI，Dock 内容需横向滚动，这是现有响应式布局限制，本轮未重排。
- 安装新依赖期间 Vite 热更新曾出现旧 React 预构建缓存错误；页面重新加载后完成以上验证，12:30 UTC 后无新浏览器 error 记录。已有打开页面建议刷新一次。
- 已恢复浏览器默认视口、深色主题、锁车状态，回到编排。

真人麦克风、真实模型精度、实车与 Windows 包未在本轮验证。播放/暂停接入现有动画预览控制；未给仅模拟曲目状态的音乐面板新增虚构播放器。

## 恢复

修改前文件保留在 `/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/icon-motion/before`；范围清单见同目录 `manifest.json`（依赖备份另含 package.json/package-lock.json）。恢复时仅应用本轮文件差异，并先检查是否有后续修改；依赖需按对应锁文件重新安装。不把未提交工作区描述为 Git 版本快照。
