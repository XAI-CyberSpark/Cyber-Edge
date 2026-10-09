# 文本分类与可读性规范

维护日期：2026-09-26｜状态：dev.47 已实施的文字角色规范｜依据：用户要求信息密度易读，检查所有文本，同等区域、同等作用的文字大小一致。

本文件是字号与文字角色的主依据，替代 DESIGN_TOKENS 中 dev.42 的局部字号现状，以及 NODE_DESIGN 中 dev.44 的14/12/11字号。系统字体、首页像素品牌、HMI纯黑、节点尺寸与已保存坐标继续沿用。

## 1. 先分类，再选字号

同一角色在同一界面作用域内使用同一字号、行高和标题字重。不能因内容较长、面板较窄、卡片较多而减小字号。颜色表达重要性、状态和可交互性，不随意产生新字号。

以下为根字号16px、画布缩放100%时的 CSS 像素；实现使用rem和无单位行高，允许浏览器缩放。

| 文字角色 | class | 字号 / 行高 | 常规字重 | 用途 |
| --- | --- | --- | --- | --- |
| 页面标题 | type-page | 24 / 32 | 600 | 独立页面的主标题 |
| 面板/弹窗标题 | type-panel | 18 / 26 | 600 | 工作台、场景共创、组件库面板及弹窗标题 |
| 区块标题 | type-section | 16 / 24 | 600 | 设置分组、详情章节、聊天二级标题 |
| 条目/节点标题 | type-item-title | 16 / 24 | 600 | 项目、模型、MCP、节点业务名称 |
| 正文 | type-body | 14 / 22 | 400 | 描述、聊天内容、表单值、空状态和错误说明 |
| 控件标签 | type-label | 14 / 20 | 500 | 按钮、分类导航、字段名、下拉选项 |
| 辅助说明 | type-caption | 12 / 18 | 400 | 时间、来源、次要元信息、字段帮助 |
| 标签/徽标 | type-tag | 12 / 18 | 500 | 状态、类别、数量徽标；区别于控件标签 |
| 代码/日志 | type-code | 13 / 20 | 400 | 表达式、原始数据、代码和日志；系统等宽 |
| 指标值 | type-metric | 24 / 32 | 600 | 需要突出读取的数值，单位另用辅助说明 |
| HMI 标题 | type-hmi-title | 20 / 28 | 600 | 座舱界面的主要标题 |
| HMI 正文 | type-hmi-body | 16 / 26 | 400 | 座舱可读消息与内容 |
| HMI 操作标签 | type-hmi-label | 14 / 22 | 500 | 座舱操作文字 |
| HMI 辅助说明 | type-hmi-caption | 12 / 18 | 400 | 座舱次要状态与单位 |

正文和辅助文字允许局部强调，不把整段正文加粗。提示、错误、空状态按用途归入正文/辅助说明，不以状态另创字号。placeholder沿用输入文字尺寸；aria-label、alt和原生title属于无障碍或系统提示文本，没有独立网页字号。

## 2. 各区域的文字归类

| 区域 | 标题 | 正文/控件 | 辅助/标签 |
| --- | --- | --- | --- |
| 登录、首页、项目管理 | 登录panel；项目item-title；品牌独立 | body说明，label输入与操作 | caption日期、帮助；tag状态 |
| 工作台导航与面板 | panel标题、section分组 | label导航/字段/操作，body说明 | caption统计/注释，tag徽标 |
| 组件库、模型和MCP | item-title名称，section详情分组 | body简介，label搜索/筛选/操作 | caption来源/版本，tag类型/能力 |
| 场景共创 | panel面板，section内容章节 | body对话/输入，label模型选择 | caption元信息；code原始输出 |
| 节点画布 | item-title业务标题 | body描述/输出，label字段 | caption类别/提示，code表达式/日志 |
| 场景/模型/技能选择与部署向导 | panel弹窗，section分组，item-title条目 | body内容，label表单与步骤操作 | caption帮助/时间，tag状态 |
| 运行记录、属性、设备、监控 | panel与section | body值与说明，label筛选 | caption时间/来源，code日志，metric主要指标 |
| HMI、助手、后排内容 | hmi-title | hmi-body内容，hmi-label操作 | hmi-caption状态；显示数字独立规格 |
| 通用UI组件 | Dialog/Sheet=panel，Card=item-title，Toast=section | Button/Input/Select/Tabs=label，Textarea/描述=body | Badge=tag，Tooltip=caption |

分类覆盖当前 `studio/src` 的 TSX/CSS（包括仍保留的旧组件）。数据数组、服务端返回文字和用户输入通过对应动态展示槽继承角色，不按每一条内容建立重复样式。

## 3. 密度与布局

- 普通界面可见文字下限12px；正文14px。优先减少重复说明、分组、换行、折叠或滚动，不以8–11px容纳更多信息。
- 同类卡片共享列宽、内边距、文字角色与最小高度。模型/MCP保留双列和260px最小高度，随内容增高，标签区允许换行；此项替代旧固定260px高度，避免放大后裁切。不同内容行不承诺所有卡片绝对同高。
- 标题可省略时提供可访问的完整名称；正文自然换行。错误、确认条件和关键业务含义不能仅靠截断保留。
- 控件高度应能容纳文字行高和上下内边距；窄屏优先重排。不能以响应式断点偷偷减小同作用文字。
- 画布节点字体以100%缩放计。ReactFlow整体缩放会一起缩小节点；阅读细节需放大画布。保持已保存节点位置，不为排版自动移动。
- 深浅主题使用同一文字尺度；对比度、选中态和焦点可见性仍需分别检查。本轮不是全站无障碍认证。

## 4. 有意保留的独立规格

- 首页品牌：Press Start 2P、原Shuffle动效；14–36px响应式品牌尺寸，不作为普通正文样例。
- HMI时钟20–25px、温度24–32px、主要温度显示46px：属于仪表显示数字，独立变量；单位与辅助信息按HMI角色。
- `SpatialScene.tsx` 中3D仪表/路牌/地面标识使用 `SCENE_TEXT` 语义常量；数值为场景物理单位，不是CSS像素。同种路面标识/实体标签共享常量。本轮未改变3D物体比例，也未重新验收全部相机角度。
- 地图故事板文字使用 `MAP_LABEL_SIZE=5` SVG坐标单位，在260px高视口约13px；比旧4单位更易读，实际值受容器缩放影响。
- Shuffle复制运行时计算字号实现动画，使用inherit的文字继承上层；图片/视频/模型纹理中烘焙的文字不由CSS控制。

## 5. 实现入口与后续 AI 修改规则

唯一通用尺度：[typography.css](<../../studio/src/styles/typography.css)。TSX用 `.type-*`，局部CSS用 `var(--text-角色-size/line/weight)`；node-card变量引用通用角色。`cn(>)`已扩展tailwind-merge的font-size组，让语义字号互相覆盖，同时保留文字颜色。

后续每次修改文字：先确定区域与角色，再复用类/变量；不要直接添加 `text-[11px]`、`text-sm` 或字号内联值。需要新角色时，先说明已有角色为何不够，再同步本文件和变量。不要靠全局匹配class子串覆盖字号。

源文件清单：[TYPOGRAPHY_INVENTORY.json](TYPOGRAPHY_INVENTORY.json)，包含文件/行号、文本或动态槽、角色、CSS选择器与类上下文。清单记录源码继承关系；局部CSS可能覆盖继承角色，最终字号须以浏览器computed style确认，不能把静态清单当成所有界面都已实测。

在studio运行 `node scripts/audit-typography.mjs --write` 重新生成清单并检查裸字号；不带`--write`只检查。脚本覆盖TSX/CSS，排除vendor；不解析任意运行时拼接或图片内文字，不代替视觉检查。

本轮验证与限制见 [dev.47验收](releases/2.8.0-dev.47/ACCEPTANCE.md)。

## dev.52 Figma HMI组件的局部角色映射

组件原稿为2×画布，`hmi-widget-canvas`整体0.5显示。源字体24→caption12，28/30→label14，32→body16，40→hmi-title20，48→metric24；56→局部日历大数字28，64→导航距离32。两个展示例外通过局部变量--hfw-widget-heading-size/--hfw-widget-distance-size声明，不用于普通正文。所有同角色新增控件复用type-hmi-*。

卡片名称/状态说明为caption；分类/按钮/媒体来源为label；曲目名/事件名为body；图库日期与月名为title；距离和大日期数字为专用展示。日推标题为label，与媒体入口标签一致。源画布的图层类hfw-*对应CSS角色变量，静态清单的classContext可追到定义；使用系统字体时月名与短标签保持单行，长媒体名称按原设计裁剪。图像中内嵌地图文字与图标不作为可编辑UI字体。

## dev.84 信息分层补充（2026-10-03）

保存对话展开入口使用label，真实消息时间和历史边界说明使用caption；条件完整表达式使用code，节点展开入口使用label。未新增字号，窄窗口通过整面板呈现解决遮挡。清单已更新为140文件、2295条，0违规；浏览器抽样见[dev.84验收](releases/2.8.0-dev.84/ACCEPTANCE.md)，不代替全站验收。


## dev.85 轮次与操作记录（2026-10-05）

场景共创居中的轮次开始时间、回复用时、状态和操作记录统一使用caption（12/18），正文仍body（14/22）。不以窄栏缩小字号；长操作文字自然换行，未知历史用时不生成。 实现与未验证范围见[dev.85验收](releases/2.8.0-dev.85/ACCEPTANCE.md)。

同轮智能时间修正：开始时间按时间段分隔：首条有效用户消息、与上一用户消息跨本地日历日、或距离上一条回复结束超过1小时才显示居中标签；连续对话不逐轮重复。今天仅时分，过去1–7天为星期几加时分，更早同年为月日星期加时分，跨年补年份；悬停查看完整日期。日期标签每分钟及窗口恢复焦点/可见时更新。 此项替代dev.85初版“每条用户消息均显示时间”；回复用时与操作记录仍按每条回复独立保留。

## 文档阅读页（dev.92，2026-10-05）

`/docs`是独立长文阅读界面，用户提供Codex参考图为本轮依据；系统正文字体保持。作用域仅限`.docs-site`与`.docs-dialog`：概览主标题`--text-doc-display-size`为44–64px，文章/区块标题`--text-doc-title-size`40px，章节`--text-doc-heading-size`24px，导读`--text-doc-lead-size`18px，正文`--text-doc-body-size`16px/1.85。导航/表格复用14px，代码13px，元信息12px。手机文章主标题复用24px；不为窄屏缩小正文。此阅读角色不推广到画布、节点或工作台。实现见`studio/src/components/pages/developer-docs.css`，本轮验收见[dev.92](releases/2.8.0-dev.92/ACCEPTANCE.md)。

## dev.94目录与用户气泡（2026-10-05）

搜索/筛选保持label，统计/分页/拖入安装提示保持caption，聊天正文保持body；没有新增裸字号。清单更新为148文件、2443条、0违规，真实布局验证见[dev.94验收](releases/2.8.0-dev.94/ACCEPTANCE.md)。

2026-10-06 dev.94第14项补充：组件库前三行复用CatalogToolbar的label/caption；最新清单148文件2432条、0违规。移除底部重复统计，没有新增裸字号。
