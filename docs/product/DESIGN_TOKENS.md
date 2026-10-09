# OAKEgde Studio 前端设计参数与组件基线

状态：源码提取基线；不是全站视觉验收｜维护日期：2026-10-05｜提取版本：2.8.0-dev.41 未提交工作区｜文档迭代：dev.42

适用范围：现有 OAKEgde Studio 首页、工作台、导航面板、画布、共创聊天及 HMI。用途：为后续 AI 修改提供可定位的参数、组件入口和例外；不新增视觉方案。

[返回项目主文档](<../README.md) · [设计约定与修改规则](DESIGN_GUIDELINES.md>)

## 1. 使用方式与证据边界

- 本文记录读取时的 CSS、TSX 和主题配置；“现有实现”不表示用户已逐项认可，也不表示浏览器所有状态均已通过检查。
- 全局 token、局部变量、组件尺寸分别记录；不能把一个组件的数值推广到整站。用户最新明确要求优先；发现规范与代码冲突时报告差异，在此次请求范围内处理。
- CSS 的实际表现受选择器优先级、加载顺序、容器尺寸和交互状态共同决定。本文已核对下文列出的覆盖链；改样式时仍须核对目标 DOM 和 computed style。
- rem 换算示例按浏览器默认根字号 16px；保留源码单位以支持用户缩放。dev.42原提取未改界面；dev.47已增加共享字号token并迁移，字号以[文字规范](TYPOGRAPHY.md)为准。

## 2. 三个视觉范围

| 范围 | 现有语言 | 应复用的入口 |
| --- | --- | --- |
| 首页 | Prism 背景、玻璃项目卡片、Logo、渐变像素标题与 Shuffle | [HomePage](../../studio/src/components/pages/HomePage.tsx)、[首页样式](../../studio/src/components/pages/home-project-cards.css) |
| 工作台 | 低饱和语义色、实色面板、细边框、紧凑工具界面 | [主题](../../studio/src/index.css)、[主题映射](../../studio/tailwind.config.js)、[工作台](../../studio/src/components/pages/WorkspacePage.tsx) |
| HMI | 中性黑灰、白色信息、局部状态色、既有车模/Figma 资产/Bloub | [CockpitHmi](<../../studio/src/components/core/CockpitHmi.tsx)、[HMI 基础](../../studio/src/components/core/cockpit-hmi.css)、[细化](../../studio/src/components/core/hmi-refinements.css>) |

首页玻璃效果与像素字不扩散到工作台；HMI 不自动跟随工作台浅色主题。单个局部需求不构成换字体、换配色或整体布局调整的依据。

## 3. 全局颜色 token

浅色表面（dev.88，2026-10-05）：用户要求去掉工作台灰底，`background`、`canvas-background`、`card`、`popover`、`secondary`、`muted`统一为`0 0% 100%`。文字、边框、画布点阵和紫色状态继续使用各自语义token；深色主题与独立HMI主题保持。首页玻璃不支持模糊时也回退到白色基底。下表浅色值已同步；实屏验收限制见dev.88。

模板确认（dev.87同轮补充，2026-10-05）：ProjectConfirmDialog的primary变体使用`bg-primary text-primary-foreground hover:bg-primary/90`，由模板载入/替换入口显式选择；删除与放弃修改仍使用原警示样式。仅适用于此共享弹窗，不扩展为全局按钮改版。

源：[index.css](<../../studio/src/index.css) 的 `:root` / `.dark`；[tailwind.config.js](../../studio/tailwind.config.js>) 映射到 `bg-background`、`text-foreground` 等类。源码存 HSL，下面 HEX 是四舍五入后的阅读值；实现继续引用变量，不复制 HEX 替代 token。

| 变量 | 用途 | 浅色近似 HEX | 深色近似 HEX |
| --- | --- | --- | --- |
| `--background` | 应用底色 | `#ffffff` | `#1e1e1f` |
| `--foreground` | 主文字 | `#546276` | `#cbd5e1` |
| `--card` | 工作台面板/卡片 | `#ffffff` | `#171718` |
| `--popover` | 弹出层 | `#ffffff` | `#252528` |
| `--primary` | 主操作/选中/焦点强调（dev.54蓝紫色） | `#5d4fd8` | `#a197f7` |
| `--primary-foreground` | 主色上的文字 | `#ffffff` | `#171718` |
| `--secondary` | 次级表面 | `#ffffff` | `#28282b` |
| `--muted` | 弱化表面 | `#ffffff` | `#28282b` |
| `--muted-foreground` | 次要文字/占位 | `#657387` | `#98a6ba` |
| `--accent` | 悬停/强调表面 | `#efedfc` | `#2e2a4b` |
| `--destructive` | 危险状态 | `#bd5151` | `#edabab` |
| `--destructive-foreground` | 危险色上的文字 | `#ffffff` | `#171718` |
| `--border` | 边框/分隔线 | `#d6dce2` | `#3b3b42` |
| `--input` | 输入边框 | `#d6dce2` | `#44444b` |
| `--ring` | 焦点环 | `#5d4fd8` | `#a197f7` |
| `--chart-1` | 图表分类色，非通用状态语义 | `#478f14` | `#a4dfae` |
| `--chart-2` | 图表分类色，非通用状态语义 | `#4d6b89` | `#8fc7ff` |
| `--chart-3` | 图表分类色，非通用状态语义 | `#7667a8` | `#d2ccff` |
| `--chart-4` | 图表分类色，非通用状态语义 | `#9a692c` | `#eecfa0` |
| `--chart-5` | 图表分类色，非通用状态语义 | `#bd5151` | `#edabab` |
| `--card-foreground` | 卡片文字 | `#546276` | `#cbd5e1` |
| `--popover-foreground` | 弹出层文字 | `#546276` | `#cbd5e1` |
| `--secondary-foreground` | 次级表面文字 | `#546276` | `#cbd5e1` |
| `--accent-foreground` | 强调表面文字 | `#546276` | `#cbd5e1` |

使用示例：`background: hsl(var(--card))`、`color: hsl(var(--muted-foreground))`、`border-color: hsl(var(--border) / .65)`。

Tailwind 的 `blue`、`green`、`red`、`purple` 等色阶被项目重定义为低饱和色，不是默认 Tailwind 原色。已有 `red-500` 与 `destructive` 并非同一数值；新增普通主操作、表面、正文优先使用语义变量，状态色沿用对应组件，不凭名称推定颜色。当前没有全局 `--success` / `--warning` token。

### 局部配色与材质

| 范围 | 当前参数 | 边界 |
| --- | --- | --- |
| 首页玻璃浅色 | 底色 `rgb(255 255 255 / 62%)`，hover 74%，描边白色 58%→82% | 仅 `.home-project-card` / `.home-search-field` |
| 首页玻璃深色 | 底色 `rgb(23 23 24 / 48%)`，hover `rgb(40 40 43 / 58%)`；描边白色 12%→24% | 字体本身不降低整体 opacity |
| 首页模糊 | `blur(18px) saturate(110%)`；不支持模糊时回退 94% 不透明表面 | 保留 `@supports` 回退 |
| 首页标题 | `#c8e2c6 → #b4e6ed → #6f9af8` | 仅品牌像素标题 |
| HMI 基础 | 背景 `#050505`；文字 `--ink: #e8e8e8`；次要 `--muted: #929292` | “纯黑”是既有方向，当前实际底色并非全部 `#000` |
| HMI 细化 | `--hmi-surface: #101010`、`--hmi-raised: #1c1c1c`、`--hmi-hairline: #ffffff1c`、`--hmi-secondary: #aaa` | 作用域 `.cockpit-hmi.cockpit-minimal` |
| HMI 顶栏/Dock | 顶栏 `#000`；细化后的 Dock `#080808e6` | 不用首页玻璃参数覆盖 |

## 4. 字体与字号

全局系统字体与代码字体分别为 `--font-studio` / `--font-code`（定义见 index.css）。系统字体顺序：`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif`。等宽顺序：`ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace`。

dev.47已建立统一语义字号；完整分类、例外与密度规则见[TYPOGRAPHY](TYPOGRAPHY.md)，源码清单见[TYPOGRAPHY_INVENTORY](TYPOGRAPHY_INVENTORY.json)。此项替代dev.42的局部8–16px现状表。

| 角色 | 字号 / 行高 | 实现 |
| --- | --- | --- |
| 页面 / 面板标题 | 24/32；18/26 | typography.css page/panel |
| 区块 / 条目 / 节点标题 | 16/24，600 | section/item-title |
| 正文 / 控件标签 | 14/22；14/20 | body/label |
| 辅助 / 标签 | 12/18 | caption/tag |
| 代码 / 指标 | 13/20；24/32 | code/metric |
| HMI 标题 / 正文 / 标签 / 辅助 | 20/28；16/26；14/22；12/18 | hmi-* |

首页像素品牌、HMI仪表数字、SVG与3D场景文字为有意例外，不能推广为普通UI字号。

## 5. 布局、间距与圆角

### 页面与导航

| 对象 | 当前几何 | 适用说明 |
| --- | --- | --- |
| 应用根 | `h-screen w-screen`；根页面 overflow hidden | 长内容在内部容器滚动 |
| 左导航 | 56px 宽；按钮 40×40px；常规导航图标 20px | IconNav.tsx |
| 工作台模式栏 | 64px 高；模式组在主工作区顶栏水平居中，无左侧标题 | WorkspacePage.tsx；dev.55 用户编排页参考图 |
| 导航浮层 | `33.333333vw`，最大 100% 可用区域，全高 | NavigationPanel + navigation-panel.css；从左导航右侧展开，保留底层实例 |
| 组件库浮层 | `max(360px, 33.333333vw)`，最大 100% 可用区域 | 360px 是下限目标，空间不足时仍由 max-width 约束 |
| 导航面板头 | 72px 高；横向 padding 24px；标题/操作 gap 16px | 窄容器有 16px padding 覆盖 |
| 导航内容 | 常规 padding 24px、网格 gap 16px | 窄容器改 16px / 12px，不是全站覆盖 |
| 右侧共创聊天 | 380px 宽、不可收缩 | WorkspacePage.tsx；尚无完整手机重排规格 |
| 路线故事板 | 360px 宽、不可收缩 | 仅满足显示条件的仿真模式 |
| 首页搜索 / 项目区 | 最大宽度 42rem / 48rem；项目卡 padding 20px、最小高 140px、gap 16px | 首页专用 |

“面板三分之一”代码用 `vw`（整个浏览器视口），不是减去左导航后的剩余宽度再除三。不要在局部需求里改成另一种计算。

### 目录、聊天与画布

| 对象 | 当前几何 | 作用域 |
| --- | --- | --- |
| 模型 / MCP 卡片 | 两列 `repeat(2,minmax(0,1fr))`；最小高 260px、内容自适应；gap 12px；圆角 12px | `.cl-library` 的 `--catalog-card-height/gap/radius`；两个目录一致 |
| 目录滚动容器 | `scrollbar-gutter: stable` | 保证少量搜索结果与长目录卡片宽度稳定 |
| 组件分类栏 | 常规 132px；容器 ≤460px 时 108px；≤340px 时 88px | `.cl-library.cl-compact` 保持左侧分类，覆盖早期上下排列规则 |
| 分类/名称点击区 | 最小高 44px；分类图标 14px | 紧凑列表；窄容器隐藏数量，更窄时隐藏常规分类图标 |
| 分类溢出 | 单行；实测溢出后末尾 16px mask 渐隐 | CategoryLabel.tsx；不裁数字和图标，不对短名称一律渐隐 |
| 共创聊天 | `--chat-gutter:20px`；消息间距24px；用户最大宽88%；助手宽100% | 用户右侧中性气泡，助手左侧无底色，无头像 |
| 最新共创输入框 | 上层文本、下层模型/操作；padding12px、gap12px、圆角20px | chat-panel.css 末尾 CE-22 覆盖较早横排样式 |
| 共创发送按钮 | 32×32px、圆形 | CE-22 覆盖前段44×44px/圆角12px；44px不是当前发送按钮尺寸 |
| 自适应文本框 | 最小高24px、最高 `min(160px,25vh)` | 不为内容增高整个页面；保留输入清空收回逻辑 |
| 通用节点 | 宽280px、padding16px、圆角16px；输入节点宽240px | node-card.css；不是目录卡片尺寸 |
| 节点图标/连接点 | 图标容器32×32px/圆角10px；连接点10×10px | 保留业务标题、状态与句柄交互 |

### 圆角和空间的复用边界

- 全局 `--radius: .75rem`；Tailwind `rounded-lg` 引用此值，`rounded-md` 减2px、`rounded-sm` 减4px，默认根字号下约12/10/8px。
- `rounded-xl` / `rounded-2xl` 仍是 Tailwind 现有默认值（.75rem / 1rem），并不随 `--radius` 同步。现状里 `rounded-xl` 与 `rounded-lg` 数值可能相同；不要据名字推断更大。
- 实际常见间距有4/6/8/12/16/20/24px；这是观察到的数值，尚未建立 `--space-*` 全局变量。优先复用组件或所在模块的现有间距，不能擅自把全部20px改成16px以“统一”。

## 6. 公共组件入口

以下路径均相对 `studio/src/components/`；表内为组件默认，页面覆盖需另查。不是每个界面都已使用公共组件。

| 控件 | 复用入口 | 当前默认与行为 |
| --- | --- | --- |
| 按钮 | [ui/button.tsx](../../studio/src/components/ui/button.tsx) | default/destructive/outline/secondary/ghost/link；高36px，小32px，大40px，icon36px；默认圆角md；禁用opacity .5、focus ring |
| 单行输入 | [ui/input.tsx](../../studio/src/components/ui/input.tsx) | 高36px，padding-x12px，圆角md，语义边框、占位与focus ring |
| 卡片 | [ui/card.tsx](../../studio/src/components/ui/card.tsx) | 圆角xl、语义card背景、边框和shadow；Header/Content/Footer padding24px；不是260px目录卡片 |
| 标签 | [ui/badge.tsx](../../studio/src/components/ui/badge.tsx) | default/secondary/destructive/outline；12px、500、圆角md、padding10px×2px |
| 普通弹窗 | [ui/dialog.tsx](../../studio/src/components/ui/dialog.tsx) | Radix；max-w-lg、padding24px、gap16px；复用Title/Description等语义 |
| 项目确认弹窗 | [ProjectConfirmDialog](../../studio/src/components/ui/ProjectConfirmDialog.tsx) | 专门处理取消初始焦点、关闭焦点恢复、busy保护；不要以新手写弹层替代 |
| 导航浮层 | [NavigationPanel](../../studio/src/components/layout/NavigationPanel.tsx) | 共用外壳、标题、关闭和内容容器；保留状态与当前打开/关闭语义 |
| 图标 | [AppIcon](../../studio/src/components/ui/AppIcon.tsx) / 现有 Lucide | 使用现有入口与图标名称；HMI用既定Figma图片图标，Bloub不替换成通用图标 |

需要组件差异时先看既有 variant；新增变体限制在本次语义，不为一处需求修改所有按钮/卡片。不要仅因文件同名就复制历史 outputs 副本覆盖主工程。

## 7. HMI 的特殊布局与样式顺序

车控浮层（dev.97，2026-10-06）：`.hmi-panel-layer` 在 HMI 内 absolute/inset:0，局部遮罩 #0008，桌面留白24px、容器≤640px为12px。车控宽960px、高上限760px，同时不超过局部可用空间；非浏览器顶层 modal。分类栏224px，HMI≤760px时184px、≤520px时144px；24px图标槽，文字左对齐，菜单最小44px，关闭44×44px。分类与设置独立滚动，切换分类从顶部开始。字体继续使用 hmi-title/label/caption。以HMI容器尺寸触发断点，不按整个浏览器宽度推断。桌面深浅模式、1280窗口和480px HMI实测通过；[验收](releases/2.8.0-dev.97/ACCEPTANCE.md)。

[CockpitHmi.tsx](../../studio/src/components/core/CockpitHmi.tsx) 依次引入 `cockpit-hmi.css → hmi-chrome.css → hmi-refinements.css → assistant-figma.css`。前三层的通用助手外观不能代替末层 Figma 助手定义。

- 顶栏基础68px；细化层容器≤1000px时改100px高、padding-top56px。Dock最终细化高72px；Dock内容最小宽808px，窄容器横向滚动，不硬压图标。
- HMI主要状态/操作图标命中区44×44px，Dock按钮圆角14px；不把这套触控尺寸机械应用到全部桌面紧凑工具栏。
- 助手展开采用本地 `panel-backdrop.svg`，其外层透明、无通用圆角/阴影；位置/尺寸用cqw和clamp，需连同 `assistant-figma.css` 的容器覆盖一起检查。不要依据前层20px圆角表面重做助手。
- HMI助手是麦克风入口，场景测试聊天允许文字和图片；两者输入约定不同。声音、回复、视频、车控状态应来自真实事件。
- 保留Figma指定范围、车模、Bloub轮廓及其实际状态驱动；不自动替换资产或扩展Figma同步范围。

## 8. 图标、动效与反馈

源：[icon-motion.css](../../studio/src/styles/icon-motion.css)、navigation-panel.css、chat-panel.css、hmi-refinements.css。

| 对象 | 当前节奏 | 约束 |
| --- | --- | --- |
| 通用图标 | `--icon-response:220ms`、`--icon-spring:linear(...)`；hover1.1、focus1.08、active .9/80ms | hover限支持精细指针的设备；禁用/`data-icon-motion="off"`不响应 |
| 导航浮层 | 180ms，`cubic-bezier(.2,.8,.2,1)`，-8px进入 | 减少动态效果时移除动画 |
| 首页玻璃hover | 背景/边框/阴影180ms ease | 保留原Prism与Shuffle，不追加无目的循环装饰 |
| HMI按压 | scale .97、opacity .8；70ms；常规transform180ms | 减少动态效果保留直接状态反馈 |
| 共创边框 / 节点 | 150ms | 减少动态效果关闭transition |

`prefers-reduced-motion`、键盘焦点和disabled行为须随组件保留；不能用动画表示未完成的推理/车控/播放已经成功。加载、空结果、失败、取消与重试应分别呈现。

## 9. 响应式现状与未定义项

| 范围 | 已有策略 | 本轮证据范围 |
| --- | --- | --- |
| 首页 | 项目卡2列；1024px起4列；最近入口区最多两行，溢出末格查看更多 | 源码提取，无本轮浏览器验证 |
| 导航 | 视口≤700px与navigation容器≤600/300px的padding/grid调整 | 容器查询与视口查询不能互换 |
| 紧凑组件库 | 分类维持左侧；容器460/400/340px分段调整分类、数量、工具栏 | 后段 `.cl-compact` 覆盖早期横向分类规则 |
| 模型/MCP卡片 | 维持双列；共享尺寸和稳定滚动条 | dev.41历史实测覆盖1280/1440桌面；本轮未复测手机卡片 |
| HMI | cqw/clamp、容器查询、Dock横向滚动 | 不是已完成手机端重设计的证明 |
| 工作台右侧区域 | 共创380px、故事板360px固定宽 | 全工作台手机端如何重排尚未定义；局部改动不得自行猜测 |

后续真正修改视觉时，至少检查用户目标尺寸和受影响容器断点两侧；涉及主题则检查浅/深色，涉及文本则检查长标题、中文、空结果与溢出，涉及交互则检查键盘焦点、关闭恢复、disabled及减少动态效果。测试数量随实际变更决定。

## 10. 已识别的差异与待收敛项

| 差异 | 证据 | 后续处理边界 |
| --- | --- | --- |
| “纯黑”文字约定与实际色值有差异 | HMI根#050505、顶栏#000、Dock#080808e6 | 本轮只记录；若要求全#000需单独限定范围 |
| 尺寸有多个合法作用域 | Button36px、发送32px、HMI44px、画布控制34px | 不设一个数值覆盖所有场景；文档明确用途 |
| 圆角未全部token化 | --radius映射仅lg/md/sm；节点16、输入框20等局部值 | 后续统一变量是独立实施任务，先保留已选视觉 |
| 样式历史覆盖较多 | 输入44→32；分类上下排列→左右排列；助手普通表面→Figma资产 | 修改前追踪最终选择器；不继续盲目往文件尾叠全局补丁 |
| 旧面板样式仍存在 | left-panel头56px；NavigationPanel头72px；面板标题统一18px | 旧样式仍有用途；新增导航用NavigationPanel，不能未查引用就删除旧层 |
| 危险色仍有差异 | destructive、red色阶、局部HEX并存；普通UI字号已统一 | 尚未做整站对比度/可读性验收，不能把源码存在当成设计通过 |
| 移动端规格不完整 | 固定右栏、HMI宽Dock、目录双列 | 仅记录已实现策略，不承诺整站手机适配 |

本轮完成文档提取和链接/源码参数核对；没有修改样式、组件、业务数据或运行状态，没有进行浏览器截图验收。未来若把这些差异收敛为新设计，应在本规范记录明确替代范围与对应验收。

## 11. dev.44 节点局部token与共创更新

用户已要求建立统一节点规范，具体参数及例外转由[NODE_DESIGN](NODE_DESIGN.md)维护。`node-card.css`现在用`--node-*`控制宽度280/240、间距4/8/12/16、圆角16/8/10、图标32/20、端口10；dev.47将字号接入全局角色16/14/12，代码13px，见[文字规范](TYPOGRAPHY.md)。

共创欢迎标题20px/1.5、X图标32px、建议胶囊最小34px高/圆角18px；底部加号28×32px、发送32px。画布`--canvas-background`浅220 25% 97%、深240 2% 12%；`--canvas-dot`浅215 28% 87%、深215 12% 25%。ReactFlow点阵gap16/size1。浅/深色实际页面和模拟节点验证见[dev.44验收](releases/2.8.0-dev.44/ACCEPTANCE.md)，不覆盖历史模块的验收限制。

## dev.45 HMI车模光照

HmiCarStage的相机相对灯组：主聚光位置[-4.8,3.2,4]、日/夜强度110/85、角度.65、penumbra1、颜色#c9e6f4；顶部补光25/18；轮廓方向光1.2、侧面补光.7。仍只有主聚光投射1024阴影，不新增阴影贴图。物理单位沿用现有Three场景，不是全站颜色token。

`.cockpit-minimal .cockpit-car::after`使用以5%/52%为中心、62%×54%椭圆的局部冷色径向渐变，screen混合、pointer-events:none，无循环动画。主光作用于真实3D材质，渐变只作舞台氛围；现有反射地面实现保持。

### dev.45同轮修正：背部蓝光

前述左侧伪元素已移除。StudioBackdrop为车后36×18平面（位置[0,8.965,-2.9]），底色#030609/亮部#437c9f，高斯渐隐；随相机方位调整；背景仅主相机layer 1可见，不进入水面反射相机。后方主光[-3.8,4.5,-4]，日/夜145/110；前补光75/55；轮廓方向光2.2、侧补光.45。水面反射强度/波纹参数未改变。按用户最新要求移除底边smoothstep，恢复清晰交界；移除水面上方ContactShadows，防止遮挡倒影。水面y=-.035保持。1280×720实际HMI重新进入后倒影可见。

### dev.47 画布初始比例

FlowCanvas统一initialCanvasView：padding .18、minZoom/maxZoom均为1；打开与模板加载按100%居中。overviewCanvasView用于查看全部：padding .18、minZoom .1、maxZoom 1。手动缩放范围10%至ReactFlow默认200%，节点几何不变。

最新车模位置：LowerVehicleFraming使用原车模包围盒的8个角点投影，按其屏幕高度×.2设置相机垂直viewOffset；随窗口与相机更新，模型比例/角度不变，倒影及门窗热点同步。


## dev.48 局部补充

氛围灯反馈：ambient-light.css，纯黑面板内动态色带代表共享 lights 状态，颜色由执行结果决定；左24px/底94px、宽最多370px、最大高42%可滚动，窄HMI左12px/底84px。文字复用 --text-hmi-* 角色；动态色带尊重 prefers-reduced-motion。仅该反馈组件适用，不推广为全局布局。

## dev.49 目录导航补充

用户确认模型和MCP使用独立导航；所有导航抽屉与共创聊天共享默认380px宽度，窄屏受可用宽度限制，取代旧三分之一宽度。组件采用能力大类→功能分组→具体能力；MCP按用户截图采用单列横向卡片，16px内边距与圆角、12px间距、40px图标区。保留搜索、分类、分页、导入加号、真实元数据和调用未接入状态。截图中的许可证、调用量、收藏量因当前接口未提供而不展示。

### dev.50 画布整理

布局参数集中于`studio/src/domain/workflowLayout.ts`：列间80、行间48、外围32px；尺寸优先ReactFlow.measured。新增整理/撤销按钮复用canvas-control-island，无新增字体或主题变量。打开旧图保持100%与保存坐标；主动整理或新生成整理后fitView最多100%。


## HMI Tesla 页面补充（dev.52，2026-09-26）

当前用户参考为 XFdfIyBpoCVa4ZTfNGBpvB，覆盖原HMI页面布局约定；SU7模型与水面/背光保持。设置布局为38.46%导航+内容双栏；760px以下侧栏160px，520px以下分类换行。纸面#fff、内容#efefef、控件轨道#ddd、文字#141414；夜间设置面板使用局部语义变量。选择控件为50px圆角，点击按钮通常44px以上；Dock按2026-09-27用户截图反馈收紧为72px（上下8px、内容56px），温度采用横向「− 数值 +」，每个操作命中区至少44×44px；温度复用原语义字号。局部按钮选择器优先于cockpit通用按钮样式，窄容器横向滚动而不堆高底栏。沿用系统字体与type-hmi-title/body/label/caption，字号不随页面缩小。SVG保留根尺寸，以容器与transform缩放原始画布；本地manifest保留来源和hash。组件与节点契约见HMI_INTEGRATION。媒体页窄屏6列变3列，设置页滚动而非压缩文字；本次不宣称全工作台手机适配。

## dev.53 首页品牌插图

首页使用 opensparx-retro-computer.png 透明图片；宽 clamp(64px,9vw,104px)，1:1容器，contain，间距 clamp(12px,2vw,20px)，359px以下上下居中。无dark:invert；不影响其他OpenSparX图标。

### dev.54 主题与项目密度补充

主色/焦点HSL浅246 64% 58%、深246 85% 78%；强调表面浅246 75% 96%、深246 28% 23%。模式栏选中使用primary/primary-foreground。首页最多两行，桌面溢出显示6个最近项目、窄屏2个；新建和查看更多占首末格。全部项目对话框最大宽48rem/高85vh，内部滚动。

同轮补充：左上角项目菜单使用RetroComputerLogo共享电脑插图，40×40px适配56px导航栏；首页维持64–104px。两处复用同一原始白色屏幕Logo图层。

首页项目卡片图标：文件夹/删除统一18px、2px线宽，左右同内距（桌面20px、窄屏16px），顶边对齐；删除点击区域32px。


### dev.55 项目栏与共创栏高度

项目标签栏与场景共创标题栏统一53px（原共创59px缩短约10%），使用 workspace-layout.css 中共享变量；两边内容垂直居中，32px收起按钮top为10.5px。顶部模式栏仍为64px。

2026-09-27 dev.55同轮补充：按用户要求将项目栏与场景共创栏从53px再缩短约10%至48px，此值替代上一轮53px；共享高度和内容居中保持，32px收起按钮顶部偏移自动为8px。

## HMI 交互与验证（dev.67，2026-09-27）

右侧 SimulationRunReport 复用 type-label 与现有正文/辅助文字角色。HMI 播报反馈使用 hmi-caption。HMI 容器小于1000px且视频/提示同时出现时左右分配宽度，小于640px采用12px外边距；不作为全局间距规范。1280×720已检查，小手机未完整验收。 依据与验证见 [dev.67验收](releases/2.8.0-dev.67/ACCEPTANCE.md)。

### 模型库来源行对齐（dev.68 补充，2026-09-27）

高通来源行与上方来源/筛选行共用16px水平内边距、36px右侧按钮列和8px列间距；刷新图标16px，与筛选一致，只显示图标，保留同步无障碍名称与加载禁用。该尺寸仅适用于模型库。

测试输入操作按钮（dev.69补充）：发送与运行中取消共用 primary 紫色背景、primary-foreground 前景；悬停背景透明度85%，禁用保持原有40%透明度。

语言切换入口（dev.69补充）：IconNav底部主题按钮上方，40×40px命中区、16px Languages 图标，复用导航文字色/悬停色与键盘焦点。中英文切换使用既有 AppContext，用户内容不做自动翻译。


## 中英文界面补充（2026-09-27 / dev.70）

语言入口保留导航栏40px区域/16px图标，位于主题按钮上方；英文使用相同文字角色和组件尺寸，标题/建议允许换行，保留项目和外部内容原文。语言持久化与文案边界见[LOCALIZATION](LOCALIZATION.md)。窄抽屉与1440×900编排页已抽样查看；不是全站所有断点的视觉验收。


### MCP 搜索工具栏 · dev.71（2026-09-27）

MCP局部搜索工具栏保持单行，gap 8px；搜索框flex:1 1 0、min-width:0、高36px；紫色导入加号固定36×36px且不收缩。窄屏不再把搜索框设为100%独占一行，非空搜索的清空按钮保持同排。仅覆盖MCP，其他目录布局保持。默认1280px及390px视口实测通过。

## 浏览器标签页图标（dev.81，2026-10-03）

网站标签页图标采用用户指定 Figma 110:147 的黑色圆角底与白色四角标志；16/32/48px 直接导出，保留比例、留白和透明圆角，新增多尺寸 ICO 兼容。原 logo.png 保留其他引用。 原稿794×794，节点110:147；入口studio/index.html，资源及校验见studio/public/favicon-source.json。后续修改不得用普通文本X替代；网页内Logo按各自原规范执行。

### favicon光学尺寸补充（dev.81）

用户实屏反馈原版favicon偏小发虚；专用紧凑版将原图层等比放大25%并重新居中，收紧留白，保留四角轮廓和黑底圆角。Figma原节点未修改，临时导出图层已删除。16/32/48px重新直接导出，更新PNG文件名及ICO缓存标识。 固定794px画布/150px圆角，图层900×900、偏移(-60,-52)；只适用于favicon，替代直接保留原留白的约定。

## dev.84 局部补充（2026-10-03）

- 保存对话summary复用label，消息时间与说明复用caption；沿用聊天20px边界，没有新增字号。
- 条件节点复用ce-node-prompt disclosure、node空间变量和13/20代码角色；完整条件最大160px内部滚动，右侧为现有分支标签保留空间。
- 导航面板max-width:815px时width:100%，边界由56px导航＋380px资源＋380px聊天推导；underlay保持挂载，隐藏并inert，拖拽时恢复。桌面仍380px。
- 以上为本轮实现参数；[验收](releases/2.8.0-dev.84/ACCEPTANCE.md)记录1280/720/360px抽样及未验证范围。


## dev.85 轮次与操作记录（2026-10-05）

ChatPanel轮次时间居中，距用户消息16px；ReplyActivity与正文间距16px，summary最小高度44px、箭头14px，操作行间距12px/图标文字8px；均采用现有语义色。日期、用时与操作使用caption 12/18；正文仍body 14/22。 实现与未验证范围见[dev.85验收](releases/2.8.0-dev.85/ACCEPTANCE.md)。

同轮智能时间修正：开始时间按时间段分隔：首条有效用户消息、与上一用户消息跨本地日历日、或距离上一条回复结束超过1小时才显示居中标签；连续对话不逐轮重复。今天仅时分，过去1–7天为星期几加时分，更早同年为月日星期加时分，跨年补年份；悬停查看完整日期。日期标签每分钟及窗口恢复焦点/可见时更新。 此项替代dev.85初版“每条用户消息均显示时间”；回复用时与操作记录仍按每条回复独立保留。


## dev.86 局部参数（2026-10-05）

组件详情标题使用 minmax(0,1fr)/44px 网格，返回图标16px、命中区44×44px，顶部 margin -9px 使图标中心对应首行26px行高。说明占整行，保留原字体角色。共创标题 Sparkles 16px、间距8px、text-primary；撤销 dev.84 历史总折叠样式。沿用20px聊天边界与智能时间/用时样式；实屏仍待验收。

## dev.87 确认弹窗（2026-10-05）

模板替换复用 ProjectConfirmDialog 的 card/border/foreground、rounded-2xl、padding24px、max-w-md；标题type-panel、描述type-body、按钮type-label。操作区低于sm断点纵排，sm起横排靠右，避免“继续当前编排 / 停止并使用模板”挤出窄屏。该共享组件原有关闭/删除回归通过；1280×800与360×780模板弹窗已实屏检查，详见[dev.87](releases/2.8.0-dev.87/ACCEPTANCE.md)。

### 模型菜单与资源面板（dev.88，2026-10-05）

- 共创模型菜单宽320px、最大宽度为视口减24px；复用语义字体，供应商分组、搜索、选中和能力设置各有明确角色。思考选项来自后端能力清单，不能把所有强度套给所有模型。
- 资源面板删除通用说明后，只有标题的头部高56px；带实际项目上下文的头部仍沿用原规则。
- `.cl-search`整行包含图标与输入，内边距4px 10px、圆角8px；焦点环设在外层`:focus-within`，内部输入不再出现第二个窄框。原紧凑面板高度规则保留。

目录共用外框（dev.88第9项）：CatalogToolbar左右/顶部16px，搜索整行最小40px、行距8px，筛选36px，统计行最小48px；添加及分页图标点击区36px。搜索/筛选复用label字号，统计/分页复用caption字号；分页外边距8px 16px。两库卡片列表左右均16px，卡片内部尺寸不由该外框覆盖。

工作区分隔线（dev.88第10项）：新增`--divider`，浅色`220 15% 94%`（约#edeff2），深色保持原边界色`240 5.60% 24.51%`。工作台模式栏、项目栏、左右工作区边缘、资源面板标题和目录分页使用1px divider；输入框、卡片、焦点仍使用原border/ring。不能全局调淡所有边框。

### MCP详情局部参数（dev.90，2026-10-05）

沿用380px导航面板及窄屏可用宽度；详情独立滚动、长文本换行。详情标题panel，章节section，正文body，参数名code，状态tag，辅助信息caption。章节上下20px、参数组间16px，安装状态4×8px内边距/6px圆角，主操作最小44px。仅作用于`.cl-mcp-detail/.cl-mcp-section/.cl-mcp-add`，不推广全局。1280×900与360×800实屏通过；[证据](releases/2.8.0-dev.90/ACCEPTANCE.md)。

第10项复测修正：分区线类使用index.css中的显式`.workspace-divider`，不依赖新增Tailwind主题色在常驻开发服务中重新生成。验证必须检查实际服务响应含颜色规则及组件类名，仅发现divider变量不算生效证据。

2026-10-05 用户截图复测微调：浅色工作区分隔线再向白色淡化20%，divider从`220 15% 94%`改为`220 15% 95.2%`（白色距离6%降至4.8%）。只改浅色divider，控件border/ring、节点边框和深色主题保持。

最新浅色divider（2026-10-05再次微调）：`220 15% 95.44%`，在95.2%的基础上再向白色淡化5%。

MCP同轮多工具补充：选择器沿用label角色、语义背景/边框/焦点环，最小44px、内边距8px、圆角8px。工具参数独占详情一行，无嵌套双分隔线；Time的calendar-management展示为日历管理，不扩展筛选范围。1280×900/360×800验证及证据见dev.90验收。

## 文档网页局部参数（dev.92，2026-10-05）

依据：用户Codex文档截图与本轮实现；状态：本机实屏核对，待用户审阅。范围仅`/docs`，不修改原工作台。入口`studio/src/components/pages/DeveloperDocsPage.tsx`与同目录`developer-docs.css`。

桌面首层顶栏64px、分类栏48px、侧栏224px；概览最大1000px、左右各48px余量；首屏图文42%/52%、间隔6%，图框520×480px（1918px视口），淡紫`#eeedf8`，圆角24px。浅色背景`#fff`、正文`#242424`、辅助`#696969`、边线`#ebebeb`；文档专属深色背景`#171717`。1180px收起页内目录，960px首屏上下排列，760px启用移动目录。长代码和表格局部横滚，页面无横向溢出。文字遵循[阅读角色](TYPOGRAPHY.md#文档阅读页dev922026-10-05)。参数不是全局设计令牌。证据见[本轮验收](releases/2.8.0-dev.92/ACCEPTANCE.md)。

dev.92同轮更新条目：概览汇总使用日期172px列与自适应内容列；内容复用14px正文、18px主题标题、12px状态，条目间12px、行高1.85，标题加粗；960px及以下改为单列。汇总标题可进入对应日期锚点，详细历史使用独立链接。

## 目录与聊天补修（dev.94，2026-10-05）

沿用CatalogChrome原有16px边缘、8px行距、36px筛选和48px统计行。旧grid-column规则收窄到`.cl-filters .cl-search`，不覆盖共享工具栏。MCP工具选择与状态占完整卡片网格行，不增加可见添加按钮。

仅`.co-chat-user`使用最大宽88%、浅色`hsl(var(--foreground)/.08)`、深色`hsl(var(--secondary))`；沿用16px圆角和16px横/12px纵内距。不是全局secondary改色。1280/720/360px及深浅主题检查见[dev.94验收](releases/2.8.0-dev.94/ACCEPTANCE.md)。

2026-10-06第14项补充：组件库接入同一CatalogToolbar，沿用16px边缘、8px行距、36px筛选、48px统计行及label/caption字号；不另写覆盖CSS。1280×720三库搜索42px（含实际边框/输入行高）、筛选36px、统计48px，边界一致；360×720组件面板无横向溢出。见[dev.94补充验收](releases/2.8.0-dev.94/ACCEPTANCE.md)。
