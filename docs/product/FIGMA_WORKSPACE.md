# OAKEgde Studio Figma 协作基线

维护日期：2026-10-05｜状态：主要界面已导入；SU7 静态素材待补｜主依据：用户要求建立专用 Figma 文件并导入当前前端、开发工作区 dev.92–93 源码与实际网页采集。此项为设计协作资产，不变更当前产品版本或日常运行副本。

[Figma 专用文件](https://www.figma.com/design/j2UreD9xQMXUEP6nFSYhzp?node-id=39-2) · [机器可读页面与组件映射](FIGMA_WORKSPACE.json)

## 如何共同修改

1. 在“02 首页”至“06 部署”的画板中编辑。全局调整使用“00 设计规范”中的变量/文字样式，以及“01 共享组件”的主组件。
2. 修改后复制对应 Frame 的链接，说明要落地的改动。一次明确一个页面或一组共享规则，避免同时改变布局与业务行为。
3. Codex 读取该 Frame，比较最新源码，再修改网页并检查实际渲染。源代码和 Figma 均有变化时先比较，不整页覆盖。
4. 验证通过后更新这里的映射与范围。当前没有后台自动同步、自动回写代码或持续监控。此 JSON 是协作索引，不是已发布的 Figma Code Connect 配置。

## 已导入范围

| 页面 | 画板 | 对应实现 |
| --- | --- | --- |
| 设计规范 | 15:2 | index.css / typography.css / node-card.css |
| 共享组件总览 | 56:494 | 导航、聊天、节点、按钮、项目卡片与 HMI 控件 |
| 首页 | 39:2 | HomePage.tsx |
| 编排与对话 | 40:2 | WorkspacePage.tsx / FlowCanvas.tsx / ChatPanel.tsx |
| 模型库 | 47:2 | AIModelCatalog.tsx |
| MCP 服务 | 47:1257 | McpCatalogPanel.tsx |
| 组件库 | 47:2292 | Sidebar.tsx |
| 项目库 | 47:2858 | ProjectLibraryPanel.tsx |
| 场景库 | 47:3540 | SceneLibraryPanel.tsx |
| 运行记录 | 47:4168 | MonitorPanel.tsx |
| 设备连接 | 47:4700 | MonitorPanel.tsx |
| HMI 仿真 | 50:2 | CockpitHmi.tsx / SimulationInputPanel.tsx / hmi-tesla |
| 部署向导 | 53:2 | DeploymentWizard.tsx |

画板尺寸为本次采集的 1920×992。11 个主要界面/状态均已建立可编辑结构；HMI 的车辆画面尚未验收。节点连接和布局保留采集位置，部分节点位于可视区域之外，与采集时的平移/缩放状态一致；不是全部节点类型及全部隐藏弹窗的完整状态库。运行记录使用空态，不生成实际运行结果。

## 设计资产

- 102 个变量：颜色原始值、Light/Dark 语义颜色、间距、圆角与字号。
- 14 种文字角色，区分页面、面板、标题、正文、标签、注释、代码与 HMI 文本。
- 35 个组件家族（含 1 个按钮变体集、8 个按钮变体）；页面使用共享实例，文本、图标、卡片、连线均可编辑。
- 系统中文字体使用 Figma 可用的 Noto Sans SC；代码字体使用 Roboto Mono；首页像素标题保留 Press Start 2P。与网页的 macOS 系统字体存在字形差异。
- 首页 Prism 和品牌图像为离散静态素材。Figma 不运行 WebGL、真实模型、工作流或设备。
- 少数带透明度的填充保留源码数值，避免采集变量绑定把半透明底色渲染为实色；这些填充不宣称已完整主题绑定。
- “98 原始采集参考（保留）”保留原始采集内容。自动审批拒绝删除源参考，因此没有删除；正式编辑以整理后的页面为准。

## 验证与待补

已通过 Figma 截图检查：首页长标题截断、节点文字/图标、浅色组件底色、Dock 72px 与选中态、资源与诊断面板、部署表单固定布局、规范页的深浅色样本。结构读回确认存在文字、组件实例、向量和样式。此验收只验证设计资产，不替代网站功能回归或移动端验收。

待补：HMI 初次采集未得到 SU7 WebGL 像素。已准备保留绘图缓冲区的隔离预览，单独素材采集 ID 为 `7b709444-23bc-46c9-9d95-160f017ecce9`，状态 pending。预览 HTML、TSX 和 GLB 均 HTTP 200；Codex 打开预览返回 queued，需要前台预览执行。不能把这一项写为完成；Figma 画板旁已标注。完成后只替换 HMI/Cockpit 内的车模素材层，并更新本文件/JSON状态，无需重建控件。

## 隔离采集入口

开发预览：`http://127.0.0.1:5173/figma-import.html?view=workspace`。支持 workspace/models/mcp/components/projects/scenes/hmi/deploy/runs/devices。源文件 `studio/figma-import.html` 与 `studio/figma-import.tsx`，使用内存存储和示例场景，并拦截预览的非 GET v1 请求，避免保存或执行真实项目。首页只在带 `figmacapture=` 的 hash 时加载采集脚本；普通入口不加载。采集工具要求保留脚本以支持用户手动再次采集。

本次未修改日常5175运行副本、用户项目或数据库；未触发真实模型/设备执行。未自动部署、提交或发布。源项目已有并行修改保持。
