# 验收

2026-10-05｜2.8.0-dev.94｜本机开发验收通过，待用户审阅；未提交、未发布。

## 已完成

- 第11承接第9：修复旧`.cl-search`跨列规则误作用于CatalogToolbar，模型搜索和加号恢复同排；两库搜索、筛选、数量/来源、列表边缘一致。MCP查询上限说明置于分页操作上方，页大小/页码底线对齐；保留两类卡片内部差异。
- 第12：MCP整张卡片可直接拖入；移除模型详情和MCP的独立添加按钮。工具选择、参数说明、安装状态、运行中禁用及无配方不可拖入保持；Alt+Enter为不新增按钮的键盘等效操作。
- 窄窗口拖拽曾复现失败：DOM的cl-dragging变化未解除画布inert。NavigationPanel现观察class变化，拖拽时解除、结束后恢复；同一原生拖拽已成功生成节点。
- 第13：用户消息右侧中性圆角气泡，浅色采用foreground/8%，深色secondary；最大宽88%，16px圆角、16/12px内距。助手无底色，文字角色、时间和消息内容保持。
- 飞书原文第11–13项逐项标记紫色删除线，回读revision405/406/407；所有图片属性与顺序一致，原文未重写。

## 自动检查

| 检查 | 实际结果 |
| --- | --- |
| `node studio/scripts/test-component-library.mjs` | 9组通过，含原生class变更与inert回归、模型导入未接入不可拖入 |
| `node studio/scripts/test-mcp-library.mjs` | 7组通过，含整卡拖拽、多工具载荷、无配方/运行禁用 |
| `node studio/scripts/test-qualcomm-catalog.mjs` | 5组通过，含拖拽、键盘等效操作及详情无独立添加按钮 |
| `node studio/scripts/test-chat-composer.mjs` | 7组通过，时间与既有聊天行为保持 |
| `cd studio && node scripts/audit-typography.mjs --write` | 148文件、2443条、0违规 |
| `cd studio && node scripts/audit-localization.mjs` | Missing 0，Raw为空 |
| `cd studio && npm run build` | TypeScript和Vite通过；保留已有caniuse-lite过期及大chunk提示 |

## 浏览器证据

在开发5173的专用临时验收页使用真实FlowCanvas、ChatPanel、Sidebar和WorkspacePanelLayer，目录来自既有后端只读GET；阻止非GET、隔离项目/编排列表，未打开或保存用户项目。不是完整产品流程验收。

- 1280×720：两库搜索行y72–114、筛选y122–158、数量/来源y158–206、第一张卡片y206；共同左边缘x72，分页操作y676–712。模型保留来源刷新，MCP保留查询上限说明。
- 1280×720：原生拖入MCP Fetch、模型OpenSparX成功新增节点；720×720修复后同类MCP拖拽由0节点变1节点。
- 360×720：两库完整显示搜索加号和分页，document.scrollWidth均360，无整页横向溢出；仅检查鼠标/桌面浏览器模拟窄视口，未宣称触屏设备验证。
- 浅色气泡计算背景rgba(84,98,118,.08)，深色rgb(40,40,43)，右侧可辨；未缩小文字或更改全局白底。

截图：[模型浅色](../../../../outputs/design-dev94/model-light.jpg)、[MCP浅色](../../../../outputs/design-dev94/mcp-light.jpg)、[模型深色](../../../../outputs/design-dev94/model-dark.jpg)、[模型360](../../../../outputs/design-dev94/model-360.jpg)、[MCP360](../../../../outputs/design-dev94/mcp-360.jpg)、[MCP720](../../../../outputs/design-dev94/mcp-720.jpg)。临时验收源码保留在outputs/design-dev94/fixture.tsx及fixture.html，原开发根目录入口已移除。

## 状态与限制

仅开发源码和开发构建更新；日常5175固定副本与数据保持dev.93，未prepare或重启。未提交，当前产品编号不是可恢复Git快照。未运行模型、MCP安装/执行、后端全套或真实设备测试，本轮不改这些机制。未更改第1–10项已划线内容，未改用户保存的画布坐标。

## 第14项同轮补充（2026-10-06）

新增需求来源revision446：组件库、模型库、MCP前三行以模型库为准。组件库改用现有CatalogToolbar，无新增布局组件或裸字号；搜索与加号同排、来源筛选第二行、数量/来源第三行，移除底部重复统计。组件库增加与其他库一致的清空搜索操作；功能分组/详情/导入和可执行边界保持。

实际验证：

- `test-component-library.mjs`9组通过，涵盖层级展开、拖拽、详情、导入、绑定、搜索、未接入及窄屏状态。
- 排版审计148文件2432条、0违规；本地化Missing0、Raw为空。
- 1280×720专用页面：组件/模型/MCP的搜索行均x72–419、y72–114；筛选行y122–158；统计行y158–206。高度42/36/48，三者完全一致，见[尺寸记录](../../../../outputs/design-dev94/req14/metrics.json)。
- 浏览器内置来源+“用户输入”搜索显示1项，清空恢复；加号打开真实导入弹窗，取消关闭，未上传或保存。
- 360×720浅色/深色组件面板无横向溢出，整页scrollWidth=360。保留各库不同筛选能力，不新增无功能图标。
- 专用页仅Sidebar/NavigationPanel和只读目录GET，阻止非GET，未读取或编辑用户项目，未调用模型或MCP执行。临时入口移除，源码留档outputs/design-dev94/req14/fixture.*。

截图：[组件1280](../../../../outputs/design-dev94/req14/components-1280.jpg)、[模型1280](../../../../outputs/design-dev94/req14/models-1280.jpg)、[MCP1280](../../../../outputs/design-dev94/req14/mcp-1280.jpg)、[组件360](../../../../outputs/design-dev94/req14/components-360.jpg)、[深色360](../../../../outputs/design-dev94/req14/components-dark-360.jpg)。

最终`npm run build`通过，4767模块；既有caniuse-lite过期与大chunk提示保留。飞书第14项紫色删除线回读revision447，原文及全部图片属性/顺序保留。仅开发5173更新；本轮不触碰日常5175，不改变并行dev.95后台验收状态。未提交、未发布。
