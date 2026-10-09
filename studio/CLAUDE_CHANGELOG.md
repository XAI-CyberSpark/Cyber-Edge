# CLAUDE_CHANGELOG

## 2026-06-22 — 场景库独立面板 + 组件库模板 Tab 移除

### 改动

**`src/components/layout/SceneLibraryPanel.tsx`** — 新建
- 独立的场景库浮层面板，包含全部 12 个场景模板数据和卡片 UI
- 按分类展示：Smart Cockpit / Security Demos / Perception / Interaction / General
- 样式与组件库浮层一致（absolute, z-30, w-72, shadow-xl, animate-in）
- `loadTemplate()` 将模板 JSON 存入 localStorage 并 reload 页面

**`src/App.tsx`**
- 新增 `sceneLibraryOpen` state
- `handleNavigate` 中 library section 切换场景库面板（互斥：同时关闭组件库）
- `onSidebarToggle` 打开组件库时关闭场景库

**`src/components/pages/WorkspacePage.tsx`**
- 透传 `sceneLibraryOpen` / `onSceneLibraryClose` 给 FlowCanvas

**`src/components/core/FlowCanvas.tsx`**
- 新增 props：`sceneLibraryOpen`, `onSceneLibraryClose`
- 在 Sidebar 旁条件渲染 `<SceneLibraryPanel />`

**`src/components/layout/Sidebar.tsx`**
- 移除 `loadTemplate()` 函数（~200 行）
- TabsList 从 grid-cols-4 改为 grid-cols-3，删除 templates TabsTrigger
- 删除整个 `<TabsContent value="templates">` 区块（~125 行）
- 清理未使用的 icon imports（Accessibility, Wind, Camera as CameraIcon）

**`src/components/layout/IconNav.tsx`**
- library navItem 图标从 `LayoutGrid` 改为 `Layers`（与顶部"组件库"按钮区分）

---

## 2026-06-22 — 组件库改为悬浮面板 + 导航栏添加 Logo

### 改动

**`src/components/layout/IconNav.tsx`**
- 顶部添加品牌 Logo（`/logo.png`，32×32px）
- 新增"组件库"按钮（`LayoutGrid` 图标），点击时 toggle 悬浮面板
- 新增 props：`sidebarOpen`、`onSidebarToggle`

**`src/App.tsx`**
- 新增 `sidebarOpen` state（默认 false），传递给 IconNav 和 WorkspacePage
- IconNav 获得 toggle 回调，WorkspacePage 获得 close 回调

**`src/components/pages/WorkspacePage.tsx`**
- 接收 `sidebarOpen`/`onSidebarClose` props，透传给 FlowCanvas

**`src/components/core/FlowCanvas.tsx`**
- Props 新增 `sidebarOpen?: boolean`、`onSidebarClose?: () => void`
- 移除内部 `isSidebarOpen` state 和 header 中的 toggle 按钮
- Sidebar 从 flex 布局内的常驻面板改为 absolute 定位的悬浮 overlay
  - `z-30`，`w-72`，`shadow-xl`，`animate-in slide-in-from-left`
  - 顶部标题栏 + 关闭按钮

**`public/logo.png`**
- 新增品牌 Logo 文件（黑色四角星图标）

---

## 2026-06-22 — 3D 仿真环境升级为真实城市道路场景

### 改动

**`src/components/spatial/SpatialScene.tsx`**
- Environment preset 从 `warehouse` 改为 `city`，启用 `background={true}` 显示城市 HDRI 天空盒
- 移除 `scene.background` 手动设置（由 HDRI 控制背景）
- 重写 `RoadEnvironment` 组件：
  - 14m×120m 深灰色沥青路面
  - 白色虚线中心线 + 黄色实线边线 + 车道分隔线
  - 两侧人行道（凸起平台 + 路缘石）
  - 两侧随机高度建筑群（带窗户光效）
  - 行道树（圆柱树干 + 球形树冠）
  - 路灯（带 PointLight）
- 相机外部视角从 `[5,3,8]` 调整为 `[6,3.5,10]`
- 雾效距离扩大以适配更大的场景

---

## 2026-06-22 — 替换 3D 车模为 Porsche Taycan Turbo S（纯电动车）

### 改动

**`public/car-concept.glb`**
- 替换为 Porsche Taycan Turbo S 模型（9.5MB）
- 来源：GitHub Adarsh-Saripaka/AxisDriveWorks-3d--ModelViewer
- Taycan 是保时捷旗下纯电动轿车，适配智能座舱 HMI 仿真场景

**`src/components/spatial/SpatialScene.tsx`**
- label 更新为 'Porsche Taycan Turbo S'
- scale 从 1 改为 0.001（模型原始单位为毫米，需转换为米）

---

## 2026-06-21 — 移除 3D 仿真底部 HUD 面板，控制集成到侧边栏

### 改动

**`src/components/core/VehicleSimulator.tsx`**
- 移除 fullScreen 模式下底部 HUD overlay（ENVIRONMENT / DRIVER / COCKPIT 三张卡片）
- 同时移除 Logistics（Drone）和 Manufacturing（Robot）模式的 HUD 卡片
- 3D 仿真区域现在只显示纯净的场景画面

**`src/components/layout/Sidebar.tsx`**
- 在"环境"tab 中新增 Driver State 区块（表情切换 + 心率模拟）
- 新增 Cockpit 区块（车窗开关 + AC 控制）
- 场景切换按钮移除 emoji 前缀，保持简洁

---

## 2026-06-20 — 回退：恢复左侧组件库侧边栏

### 改动

**`src/components/core/FlowCanvas.tsx`**
- 回退顶部下拉面板方案，恢复原始左侧可折叠侧边栏布局
- 恢复 Sidebar 组件引用和 import
- 恢复 `isSidebarOpen` 状态（默认 true，控制侧边栏展开/收起）
- 恢复 `simConfig` / `setSimConfig` 状态
- 移除 `DraggableNodeChip` 内联组件
- 移除下拉面板相关 JSX 和 overlay 遮罩

### 原因

下拉面板方案视觉效果不佳，回退至验证过的侧边栏布局

---

## 2026-06-20 — 修复 LLM API：切换模型为 claude-sonnet-4-6

### 改动

**`src/api/llm.ts`**
- 模型从 `gpt-4o-mini` 改为 `claude-sonnet-4-6`
- 原因：API key 所属分组（claude--kiro）无 GPT 模型渠道，导致 503 错误
- API 地址和 key 不变

---

## 2026-06-20 — 布局重构：垂直分割面板（上下排列）

### 概述

将工作区的节点画布与 3D 仿真环境从水平并列（左右）改为垂直堆叠（上下），中间加入可拖拽分割条，用户可自由调节两个面板的高度比例。

### 新增文件

**`src/components/ui/ResizableSplitter.tsx`**
- 可复用的分割面板组件，支持 vertical/horizontal 两种方向
- 鼠标拖拽调节比例，默认 50/50，可配置 min/max 约束
- `collapsed` prop：折叠模式下只显示 topChild，隐藏分割条和 bottomChild
- 全局 mousemove/mouseup 事件监听，避免拖拽时鼠标逸出导致卡死

### 修改文件

**`src/components/core/FlowCanvas.tsx`**
- 布局从水平（VehicleSimulator 左 45% + Workbench 右 flex-1）改为垂直（Workbench 上 + VehicleSimulator 下）
- 引入 ResizableSplitter 包裹两个面板，`collapsed={!isSimulatorOpen}` 控制折叠
- 修复 Babel 解析器兼容性问题：`forwardRef<A, B>(...)` 泛型语法改为命名函数声明
- 修复 JSX 结构错误：移除残留的三元表达式，改由 ResizableSplitter 的 collapsed prop 统一控制

### 技术细节

- Vite 使用 `@vitejs/plugin-react`（Babel），不支持 `forwardRef<A, B>(...)` 泛型写法
- 解决方案：`forwardRef(function Name(props: Props, ref: Ref<T>) {...})`
- TypeScript `tsc --noEmit` 始终通过，问题仅存在于 Babel 转换层

---

## 2026-06-20 — 架构重构：场景工程平台（两阶段 UX）

### 概述

将 OAKEgde Studio 从"拖拽节点编排工具"重构为"场景工程平台"，引入两阶段交互模式：
- **Phase 1（首页）**：全屏对话式入口，用户通过自然语言描述场景需求
- **Phase 2（工作区）**：Flow 画布 + 右侧对话面板，支持持续迭代

### 新增文件

**`src/components/pages/HomePage.tsx`**
- 全屏首页组件，包含居中对话输入区域
- 提供快捷模板卡片（高速巡航、泊车等场景）
- 支持回车/按钮提交，触发场景生成并切换至工作区

**`src/components/pages/WorkspacePage.tsx`**
- 工作区页面，组合 FlowCanvas + ChatPanel
- 集成 LLM 流式调用，进入时自动基于初始 prompt 生成响应
- 支持对话面板展开/收起

**`src/components/layout/IconNav.tsx`**
- 窄边栏图标导航（56px），替代原有顶部 Header 导航
- 6 个分区：首页、Flow、模拟、组件库、安全、部署
- 底部设置入口，顶部 Logo

**`src/components/layout/ChatPanel.tsx`**
- 右侧对话面板（380px），流式消息展示
- 支持用户/助手双色气泡、流式光标、自动滚动
- textarea 自适应高度，Shift+Enter 换行

**`src/api/llm.ts`**
- LLM API 服务层，OpenAI 兼容格式
- SSE 流式解析，支持 `onChunk` 回调逐 token 推送
- 错误处理与超时控制

### 修改文件

**`src/App.tsx`**
- 重写为两阶段路由：`home` ↔ `workspace`
- 引入 IconNav 作为全局侧边导航
- 管理 phase/activeNav/currentPrompt 状态

**`src/components/core/FlowCanvas.tsx`**
- 新增 `hideHeader?: boolean` prop 到 FlowCanvasProps 接口
- 组件内部条件渲染：当 `hideHeader` 为 true 时隐藏内置 Header 栏
- 避免与新 IconNav 导航产生视觉冲突

### 设计理念

- 对话优先：降低编排门槛，让非技术用户也能通过自然语言描述场景
- 渐进式披露：首页极简，工作区按需展示复杂功能
- 持续迭代：右侧对话面板支持在画布上下文中持续调整方案
- LLM 原生：流式响应提供即时反馈，提升交互体验

---

## 2026-06-19 — UI 风格重构：ChatGPT 风格化

### 改动内容

**`src/index.css`**
- 重写 CSS 变量色板：从纯黑白（`0 0% 0%` / `0 0% 100%`）改为 ChatGPT 风格的柔和配色
  - 浅色模式：白底 + 深灰文字 + 绿色主色调 + 灰蓝辅助色
  - 深色模式：深灰底（`220 9% 12%`）+ 浅灰文字 + 同系绿色主色调
- 优化 ReactFlow 连线样式：降低对比度，使用 `muted-foreground` 代替纯前景色
- 新增全局字体 `Inter / Söhne` 系列
- 新增自定义滚动条样式
- `--radius` 从 `0.5rem` 改为 `0.75rem`（更圆润）

**`src/components/core/FlowCanvas.tsx`**
- Header 栏：移除霓虹渐变发光效果，改为干净的 `bg-card` + 细边框
- Logo：移除 `shadow-[0_0_15px...]` 光晕，改为实色 `bg-primary` 圆角方块
- Tab 栏：统一为单一主色调下划线指示器，移除彩虹多色
- 侧边栏/模拟器面板：`bg-background` → `bg-card`，过渡时间 300ms → 200ms
- Chat Overlay：移除 `backdrop-blur-md` + `shadow-2xl`，改为轻量 `shadow-lg` + `bg-card/95`
- 聊天气泡：用户消息使用 `bg-primary`，Agent 消息使用 `bg-secondary`，移除蓝色半透明背景
- 输入工具栏：移除 `shadow-xl`，改为 `shadow-sm` + `bg-card`
- 底部时间线：高度 12 → 10，背景 `bg-card`，文字颜色统一用 `muted-foreground`
- Deploy / Models 按钮：移除霓虹 glow，改为标准 `variant="outline"`

### 设计理念
参照 ChatGPT 网页版风格：
- 低对比度、柔和的灰色系
- 无霓虹/发光/渐变装饰
- 清晰的层级区分（background → card → secondary）
- 圆润的圆角 + 轻量阴影
- 简洁的排版，减少 uppercase/tracking-widest 等工业风元素
