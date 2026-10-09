# HMI桌面组件

状态：dev.52已实施，本机检查；非真实服务验收。维护：2026-09-26。
主依据：[用户指定Figma](https://www.figma.com/design/9FMine79oMFlnP2eQVXjg3/?node-id=1-19694)、[设计规范](DESIGN_GUIDELINES.md)、[文字规范](TYPOGRAPHY.md)。

## 目录与入口

仿真 → 应用中心 → 桌面组件查看全部。应用中心新增图库/日程；导航与音乐主入口现为Tesla页面；旧卡片继续在桌面组件入口按类别查看。每个卡片保留data-figma-node便于溯源。

| 类别 | 组件 | Figma节点 |
| --- | --- | --- |
| 导航 | 地图导航、车道指引、快捷入口、转向提示 | 1:19697、1:19749、1:19904、1:19950 |
| 音乐 | 播放器、每日30首、有声书、MV、媒体来源 | 1:19852、1:20054、1:19889、1:19897、1:20071 |
| 图库 | 大卡、横卡 | 1:19846、1:19968 |
| 日程 | 日程卡、月历 | 1:19974、1:19996 |

实现：[目录与契约](../../studio/src/components/hmi-widgets/catalog.ts)、[交互组件](../../studio/src/components/hmi-widgets/HmiWidgetLibrary.tsx)、[原稿图层](../../studio/src/components/hmi-widgets/FigmaWidgetArtwork.tsx)。图层原坐标仅存在于卡片内部，外层使用响应式网格。黑色HMI车模与助手未整体替换成参考板背景。

56个SVG/PNG原始素材位于 `studio/public/hmi/widget-kit`，校验值/根尺寸/来源在 [manifest](../../studio/public/hmi/widget-kit/manifest.json)。9个PNG、47个SVG；设计素材包含遮罩，不能只数img标签。代码只引用本地路径；未修改SVG字节或覆盖其根宽高。来源板背景不属于组件，不加载。系统字体及既有HMI文字角色优先；尺寸见DESIGN_TOKENS。

## 当前交互与扩展契约

`CockpitHmi`新增可选widgetData和widgetAdapter，不要求现有调用方修改。宿主也可直接复用HmiWidgetLibrary。HMI_WIDGET_CATALOG是组件注册表；HMI_WIDGET_CAPABILITIES列出待接服务。

- HmiWidgetData：目的地/路名/距离；曲名/艺人/播放/收藏/来源/封面URL；图库图片URL/日期；日程日期/标题/时段/月名/日期文字。只覆盖声明的显示字段，地图、车道、进度、日期高亮仍是设计图层。
- HmiWidgetAction：设置目的地、地点/收藏/加油查询、播放暂停、收藏、媒体来源、打开照片、打开日程。
- HmiWidgetAdapter.execute(action,{signal})返回applied或unavailable及可见反馈。Promise抛错展示失败；执行中阻止重复操作，可取消；关闭组件时abort，迟到响应不覆盖当前反馈。适配器必须遵循signal，不能取消后仍提交外部动作。
- 有适配器时，以宿主widgetData回传状态为准，不执行本地模拟回调；宿主负责鉴权、服务映射和数据刷新。
- 无适配器时，目的地/媒体通过现有update('hmi',...)联动仿真；收藏与来源仅存在于当前组件实例，关闭后重置。查询入口反馈待接入；不会伪造查询结果或音频播放。

当前交付是可复用界面及接口，不自动注册成工作流节点，不连接真实地图、个人图库、日历、在线音乐或设备。后续接通真实服务需单独实现权限、数据适配、错误处理并验收。日期和静态进度不能当作当前时间或实时播放信息。

## 验证

`cd studio && node scripts/test-hmi-widgets.mjs`覆盖模拟回调、筛选、适配器成功/失败/不可用、取消及迟到响应、卸载abort。`node scripts/audit-typography.mjs --write`维护文字清单。实际页面与构建结果见 [dev.52验收](releases/2.8.0-dev.52/ACCEPTANCE.md)。
