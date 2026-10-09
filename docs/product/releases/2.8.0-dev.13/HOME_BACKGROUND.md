# 首页背景补充：Prism

日期：2026-09-15。当前开发版 2.8.0-dev.13，未提交、未发布；本项为首页背景试用调整，不改写本版其他任务的验收结论。

## 需求与完成事项

用户选择 React Bits Prism 替代上一轮 Topography。仅替换首页装饰背景，保留项目卡片、搜索、刷新、删除及返回工作台功能。首页使用官方 TypeScript/CSS 组件与 OGL 1.0.11，保留上游许可证。

来源：https://reactbits.dev/backgrounds/prism
源码：https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/Prism

采用官方示例的 rotate、scale=3.6、timeScale=0.5、noise=0；height=3.5、baseWidth=5.5、glow=1 等沿用组件默认值。明暗主题跟随现有设置。背景不接收指针事件；不可见时暂停，离开首页释放 WebGL 上下文；系统减少动态效果时显示静态帧。WebGL 不可用时保留首页底色和项目操作。

实现：studio/src/components/backgrounds/Prism.tsx、Prism.css、Prism.LICENSE.md；studio/src/components/pages/HomePage.tsx。Topography 已不被首页引用，原组件暂留。

## 验证

- npm run build：TypeScript 与生产构建通过。已有大包与 Browserslist 数据旧提示仍存在。
- node scripts/test-project-navigation.mjs：20 组通过，使用隔离 DOM 和模拟 API，没有操作用户真实项目；不代表 WebGL 视觉验收。
- http://127.0.0.1:5175/：HTTP 200。
- 实际浏览器画面：待用户试用。浏览器工具因管理员策略校验不可用而拒绝访问，未绕过限制，未声称完成视觉验收。

## 局部回退

.demo-runtime/versions/before-prism-dev13/HomePage.tsx 与 manifest.json 只备份此次切换前的首页文件（Topography 状态），不是完整仓库快照。恢复前对比首页是否有后续改动。更早的 before-topography-dev13 为范围不同的备份，不得整体覆盖当前 dev.13 文档或其他任务修改。OGL 依赖由上一轮背景接入安装；本轮没有重置 Git 或更改用户项目、模型与 HMI。

## 首页卡片玻璃样式（2026-09-15 试用补充）

需求：参照用户提供的 React Bits 截图，将首页新建与已有项目卡片改为深色半透明磨砂玻璃、细白边框、柔白标题和中性灰辅助文字。实现位于 home-project-cards.css 与 HomePage.tsx，限定首页作用域；保留原卡片尺寸、布局、项目行为，提供浅色主题、键盘焦点与减少动态效果适配。无新增依赖。

完成检查：npm run build（含 TypeScript）通过；与局部备份逐行对比确认仅 CSS 引入与卡片样式类修改。未新增业务测试，也未将上轮 DOM 测试记为本轮测试。浏览器管理员策略校验失败，实际透明度、亮区文字对比度、悬停和响应式画面仍待验收；参见根目录 design-qa.md。备份 .demo-runtime/versions/before-home-glass-dev13/ 仅含修改前 HomePage.tsx 和校验清单，恢复前须比对后续编辑。

### 搜索与工具行补充

搜索框复用项目卡片的半透明底色、18px 背景模糊、细边框与白灰文字，并保留可见键盘焦点。返回工作台按钮移至工具行末尾，通过自动左外边距与同容器内卡片网格右边缘对齐；刷新图标留在左侧。npm run build（含类型检查）通过；浏览器策略阻塞尚未解决，实际视觉仍待验收。局部备份：.demo-runtime/versions/before-home-search-glass-dev13/，仅包含修改前 HomePage.tsx 和 home-project-cards.css。
