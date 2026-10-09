# 工程开发指南

目的：从需求定位代码，按现有分层完成改动并同步契约。状态：当前开发约定与源码导航。维护日期：2026-10-05。主依据：[AGENTS](../../AGENTS.md)、[产品流程](../product/PRODUCT_WORKFLOW.md)、源码和领域规范。返回[开发者文档](README.md)与[项目主文档](../README.md)。

## 源码地图

| 位置 | 主要职责 | 何时阅读 |
| --- | --- | --- |
| [studio/src/App.tsx](../../studio/src/App.tsx) | 网页入口组合 | 路由或顶层页面问题 |
| [components/pages](../../studio/src/components/pages/) | 首页、工作区等页面 | 页面流程与项目切换 |
| [components/layout](../../studio/src/components/layout/) | 聊天、资源库、属性面板 | 面板交互与布局 |
| [components/nodes](../../studio/src/components/nodes/) | 节点展示 | 节点外观与交互 |
| [context/AppContext.tsx](../../studio/src/context/AppContext.tsx) | 共享应用状态 | 项目与跨区域状态 |
| [domain](../../studio/src/domain/) | 契约、会话、保存、仿真等逻辑 | 与界面解耦的规则 |
| [utils/GraphEngine.ts](../../studio/src/utils/GraphEngine.ts) | 图执行 | 节点如何实际运行 |
| [lib/api.ts](../../studio/src/lib/api.ts) | API 地址 | 环境地址与请求路径 |
| [backend/main_host_lite.py](../../backend/main_host_lite.py) | 本机轻量入口及部分路由 | 本地实际可用接口 |
| [backend/main.py](../../backend/main.py) | 完整后端入口 | 完整服务部署差异 |
| [backend/app/api](../../backend/app/api/) | 路由与请求边界 | 请求解析、状态码 |
| [backend/app/schemas](../../backend/app/schemas/) | Pydantic 数据契约 | 字段、类型、约束 |
| [backend/app/services](../../backend/app/services/) | 业务实现 | 保存、编排、模型、MCP |
| [backend/app/agents](../../backend/app/agents/) | Hermes worker 与提示契约 | 对话入口及构图工具 |

## 开始一次改动

先读主文档和当前迭代，检查 Git 差异，再把任务写成可检查的结果。例如“在模型列表搜索后保留供应商分组”，应同时说明无结果、清空搜索、切换供应商时的预期。单纯写“优化模型列表”不足以指导验收。

清晰独立的产品迭代按[版本规则](../product/VERSIONING.md)登记；同轮补修沿用原编号。使用[迭代模板](../product/ITERATION_TEMPLATE.md)记录需求、任务和结果。不要按聊天消息数递增版本，也不要改写组件依赖版本来配合产品编号。

## 修改网页

1. 找到页面与直接依赖的状态逻辑，确认加载、空状态、失败、取消和恢复路径。
2. 优先复用已有组件与领域函数。纯数据规则放在现有 `domain` 层，避免 UI 与执行器各自实现一遍规则。
3. 接口地址复用 `apiUrl()`；开发代理见 [vite.config.ts](../../studio/vite.config.ts)。
4. 涉及视觉时先读[设计规范](../product/DESIGN_GUIDELINES.md)、[Apple 技能约定](../product/APPLE_DESIGN_SKILLS.md)及[设计参数](../product/DESIGN_TOKENS.md)受影响部分。局部修改不扩大成整站改版。
5. 文字先按[文字规范](../product/TYPOGRAPHY.md)选择 `type-*` 或 `--text-*` 角色。固定界面英文按既有[本地化目录](../../studio/src/i18n/)维护；用户内容和外部资料保留原文。
6. 更新相关回归，实际操作页面，再记录结果。涉及布局要检查常用桌面尺寸与窄屏，不用构建通过代替视觉验收。

节点视觉继续遵守 [NODE_DESIGN](../product/NODE_DESIGN.md)，复用 `node-card.css` 变量和显式 header。推荐间距不能覆盖已经保存的画布坐标。

## 修改后端接口

先确定请求、响应、错误和副作用，再修改 Schema 与服务逻辑。检查接口在完整入口和 host-lite 中是否都存在；项目 API 在两种入口的挂载方式不同，不能只改一个路径就声称本机与完整后端同时生效。

新增字段时同时检查前端类型、保存恢复、旧数据缺省、模型工具契约及测试。移除字段或改变语义时记录兼容性与迁移，更新 [API 文档](../api/01_OpenAPI_Guide.md)。项目和执行快照的版本检查不得因“方便重试”而绕过。

请求取消、超时、进程退出和迟到响应都属于接口行为。尤其在项目切换后，旧请求不得把结果应用到新项目。回归应重现真实故障路径，不仅断言函数被调用。

## 扩展节点能力

当前节点扩展需要修改仓库源码，不是上传一个文件就能热加载的公共插件 SDK。先区分需要的是新能力，还是现有节点的一份新配置。生日、自拍等业务场景应使用通用图与配置表达。

节点能力注册表的唯一编辑来源是 [backend/app/services/node_capabilities.json](../../backend/app/services/node_capabilities.json)。前端 JSON 是生成副本：

```bash
backend/.venv_macos/bin/python scripts/sync_node_capabilities.py
backend/.venv_macos/bin/python scripts/sync_node_capabilities.py --check
```

新增能力需沿链路检查：注册字段和运行边界 → 前后端校验 → 图执行器 → 节点展示与属性编辑 → 编排能力目录 → 正常、异常、取消和保存恢复用例。单纯在注册表加一个名字不会自动实现执行行为。

前端校验入口是 [nodeCapabilities.ts](../../studio/src/domain/nodeCapabilities.ts) 与 [flowContract.ts](../../studio/src/domain/flowContract.ts)。同时检查后端编排/试跑是否使用相同契约。对 MCP 工具优先复用既有 `tool` 节点和服务端登记，详见[配置与接入](CONFIGURATION.md)。

## 修改模型和编排

模型服务商配置由后端管理，思考参数按 `model_reasoning.py` 的能力判定传入实际请求。不要仅增加界面选项却不传到 bounded、Hermes 和内容核验路径。

Hermes 的运行时固定到已验证 SDK 修订，扩展逻辑放本仓库宿主与 worker；直接修改 SDK 会触发干净版本校验失败。改变构图工具时应同步输入契约、工具清单、提示约定和失败诊断。架构方向变化按现有约定先确认，常规实现按已确认范围推进。

## 收尾标准

完成相关测试与真实页面检查后，记录实际通过、跳过、失败和未验证范围，更新领域文档及迭代验收。检查差异没有混入其他人的工作，不自动提交或发布。构建产物、本机运行、公网部署、正式发布分别说明。

## 画布节点删除与撤销（dev.91）

[FlowCanvas](../../studio/src/components/core/FlowCanvas.tsx)通过[NodeContextMenu](../../studio/src/components/core/NodeContextMenu.tsx)触发[规范图删除/恢复](../../studio/src/domain/nodeDeletion.ts)。必须对canonical nodes/edges操作，折叠stage的displayedGraph包含代理数据，不能存为撤销副本。删除/撤销沿用onGraphChange后台保存。替换、清空、切换图要清除局部撤销记录，运行/恢复中禁用；不要用WorkflowLayoutControls的坐标整理撤销替代删除撤销。验证边界见[dev.91](../product/releases/2.8.0-dev.91/ACCEPTANCE.md)。

## 资源目录拖拽（dev.94）

模型/MCP共享CatalogChrome，旧组件库搜索grid-column只能作用于.cl-filters，避免现代工具栏搜索跨列。MCP的McpDragItem承载整卡拖拽、多工具状态及Alt+Enter，模型卡片沿用原生载荷；详情不再有独立添加按钮。运行禁用与未接入边界必须同等保护鼠标和键盘入口。

NavigationPanel在815px及以下隔离被覆盖画布；拖拽处理器直接改变cl-dragging时，MutationObserver同步inert，不能只依赖React className依赖项。拖拽结束和卸载必须恢复状态。验证见[dev.94](../product/releases/2.8.0-dev.94/ACCEPTANCE.md)。

## 需求员交付检查（dev.95）

`AuthoringSession.validate_brief`只读验证需求ID、用户原话来源及已登记规格不变；需求员交付和主管正式登记共同调用，避免无效成果先标delivered再重新委派。专业角色接收带role的完整讨论；助手建议不自动成为用户批准，原source_quote仅用户来源的约束保持。验收见[dev.95](../product/releases/2.8.0-dev.95/ACCEPTANCE.md)。

2026-10-06 dev.94第14项：Sidebar的组件分支同样复用CatalogToolbar；搜索/来源仍使用原query/origin状态，filtered.length作为第三行数量，加载时显示加载状态。底部重复统计已移除，分组与详情逻辑保持；后续前三行修改应在共享组件范围验证三种库。

## 编排字段说明（dev.98，2026-10-06）

编排工具通过 `node_capability_service.authoring_catalog` 返回规范 `node_capabilities.json` 的深拷贝，不再临时补充另一份 fields。节点字段由 `common_fields` 和对应节点 `fields` 共同声明；`joinMode` 的说明只在通用字段出现一次。元数据包括 type、enum（开放值域为 null）、required、example；条件必填写 required_when，兼容字段写 deprecated/replacement。明确禁止的旧键不存在合法值，enum=[]、example=null 表示省略，并提供 replacement_example。`validation=node` 表示仍由既有专项校验处理，防止元数据补全改变绑定值或条件必填语义；已有通用枚举/数值验证保持。

HMI注册ID与约束副本通过回归测试对照 hmi_controls.json；更新时同步目录再运行 `python3 scripts/sync_node_capabilities.py` 生成 Studio 副本。测试扫描三个校验器的顶层data读取（含循环、成员判断及嵌套node.data），手工所有权表记录字段对应节点；新的静态读取必须补映射/声明，未知动态键立即失败。嵌套对象语义仍由各专项校验器负责，不声称覆盖所有运行器字段。

已保存项目存在logic.type=if，因此仅兼容读取；新图推荐logic_type，显式值优先，错误标出实际值与data.logic_type。patch删除节点（改ID为删旧增新）后返回warnings，含code、requirement_id、missing_node_ids；同patch显式修正coverage后不产生失效引用警告，不自动更改覆盖表。


## 车模部件对照（dev.99）

当前车型由 [activeCarRig.ts](../../studio/src/data/activeCarRig.ts)导入public下的rig.json，HmiCarStage不再识别特定车型名称。字段、坐标与缺失行为以[HMI主依据](../product/HMI_INTEGRATION.md#车模描述与通用适配dev99)为准；资产调查见[候选报告](../product/CAR_ASSET_REVIEW.md)。更新模型应先固定来源/许可和SHA，再检查Three.js实际节点名，填写部件和运动参数并运行实物测试。不要依靠材质名推断四窗，也不要合并需要独立控制的部件。

SU7仍为默认；缺失部件仅静态显示/无动画，不影响VehicleWorld。当前动画只覆盖门与窗；灯、后备箱绑定能力不等于已经有执行器。测试夹具与候选研究文件不放入public交付目录。开发5173与日常5175继续独立。

## 目录生成patch参数Schema（dev.100，2026-10-06）

新增节点字段时同步声明type、enum、数组items和bindable，不手写第二份set_data字段映射。node_data_schema.py通过NodeEdit的json_schema_extra投影目录；同名契约冲突仅描述；原类型或单字段引用对象使用anyOf。inline_schema只展开字符串形式的Schema引用，不能把properties内名为$ref的字段当作引用。Schema生成不做返回参数拆包或宿主自动填值。修改后运行test_patch_data_schema和目录相关测试，执行副本同步脚本。

固定SDK的Schema清洗会改写$ref属性名，anyOf分支逆向映射尚未处理；不要为通过生成测试自行修改SDK或加入兼容。实际请求结果及边界见[dev.100验收](../product/releases/2.8.0-dev.100/ACCEPTANCE.md)。

## 试跑反馈与Hermes入口（dev.101，2026-10-07）

HMI枚举的enum_source=hmi_controls由node_data_schema读取，更新注册项后运行scripts/sync_node_capabilities.py；--check同时检查物化枚举与前端副本。test_plan_control_errors是计划初始控件校验主入口，登记、inspect和直接执行共用，不依赖真实动作才发现非法ID。

scenarioExecution从真实会话生成waiting_nodes；execution_feedback格式化等待条件及两种修法。AuthoringSession对测试修订的例外见NODE_CONTRACTS dev.101，不允许解除全部锁定、删断言或重置预算。

hermes_tool_arguments在共用session工具入口恢复精确单字段字符串_ref对象。session.invoke仅接收恢复后的参数，并把reference_restorations记入本调用trace；最终hermes元数据累计。不是SDK补丁、任意XML解析器或item兼容层。固定SDK复现步骤见[验收报告](../product/releases/2.8.0-dev.101/ACCEPTANCE.md)。


## dev.102：预算与工具参数边界（2026-10-08）

用户授权共享编排预算40次/720秒、宿主780秒，Vite编排代理810秒；网页编排fetch没有定时提前取消。worker临时profile中custom/anthropic请求与停滞期限同步720秒，仍受整体deadline约束。入口3轮、子角色4轮、委派8次及图执行150秒/三次、核验45秒/最多两次维持各自边界，不把这些局部预算误当成整轮期限。

剩余编排调用≤3、当前revision检查通过且有未试跑有效计划时，宿主可执行完整trial；内容核验不可用只重试核验一次。启动需预留245秒宿主时间，不足明确跳过；不生成测试或修改图。host_finalized只说明触发来源，能否应用仍由runtime_verified、can_apply与原证据门槛决定；host_trial_model_calls/review_calls独立计数。未通过沿用incomplete_result。报告保留finalization原因、失败阶段和原证据。

工具入口先做既有单字段_ref还原，再按生成Schema处理item/$text单键包裹；只接受明确的数组/标量类型及无损转换，未知字段/类型冲突/多键对象不拆。顶层只允许完整通过patch Schema的item对象。每次变换的路径与前后值写入diagnostics.normalization_details，normalizations与normalizations_by_provider汇总。多类型controlValue若允许字符串，则保留字符串，不推测控件语义；后续HMI校验仍可能拒绝字符串数字。

测试计划Schema自动来自ExecutionPlan类型目录，case/step均禁止多余字段；错误附具体路径及正确层级示例，不自动搬字段。SDK和共享依赖不修改。完整回归与真实结果见[dev.102验收](../product/releases/2.8.0-dev.102/ACCEPTANCE.md)。


## 测试输入契约的维护（dev.105）

`studio/src/domain/inputContract.ts`是JSON入口解析与字段校验主实现，GraphEngine及testPlanPreflight共用；后端`test_plan_preflight.py`通过`studio/scripts/inspect-test-plan.mjs`只读桥接同一实现，不维护第二套Python类型转换。计划提交先检查后锁定，inspect按当前图重新检查，trial在副作用前检查。Node/esbuild不可用时返回明确的检查不可用错误；原trial的Node缺失仍报告not_supported。

`contractErrors.ts`携带错误类别/码，FlowSessions与GraphEngine保留到事件和失败证据；后端`execution_diagnostics`生成结构化反馈，`execution_feedback`生成精简文字。新增`contract_diagnostics`与原工具参数归一化`diagnostics`分开，不能相互覆盖。改变输入或推断规则时同时更新[节点契约](../product/NODE_CONTRACTS.md)、前后端回归、能力目录及brief/test_plan说明。


dev.106（2026-10-09）：断言路径/类型预检共用TS目录推导；修订权限与截断恢复见[节点契约](../product/NODE_CONTRACTS.md#dev106断言前置契约与受限恢复2026-10-09)，测试依赖隔离及命令见[测试说明](TESTING.md#dev106-隔离测试依赖)。本轮验证状态以[验收](../product/releases/2.8.0-dev.106/ACCEPTANCE.md)为准。

输出/连接契约主依据为backend/app/services/node_capabilities.json的connection_contract；通过scripts/sync_node_capabilities.py同步Studio副本。前后端connection_contract/connectionContract沿相同规则诊断，新增规则须两侧回归。patch返回诊断不回滚有效事务，inspect阻止错误图执行。核验编号属于宿主生成数据，模型不能覆盖其原值；提交门槛与草稿保留分开。见[dev.107](../product/releases/2.8.0-dev.107/ACCEPTANCE.md)。
