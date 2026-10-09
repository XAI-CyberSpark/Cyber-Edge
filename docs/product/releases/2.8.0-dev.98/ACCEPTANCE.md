# dev.98 字段一致性与真实复跑验收

维护日期：2026-10-06。状态：本轮契约改动验收完成；真实场景仍不可应用。未提交工作区，未发布，未更新5175。主依据：[需求](PRD.md)、[任务](TASKS.md)、本次真实 SSE 和回归日志。仓库外证据目录：`/var/folders/hd/dc08m0b10yj0nxdlyk_y2d100000gn/T/oakegde-catalog-d9j9edrb`。

## 先失败的证据与缺口

新建 `backend/tests/test_capability_field_consistency.py`，修改实现前运行6项：1通过、4失败、1错误。缺失49处字段声明；已声明15个字段还缺类型、枚举/开放域、required或example；另复现编排视图与规范目录不一致、错误定位不足及patch无warnings。

完整字段缺口（共同字段只计一次）：

```text
common_fields.designOnly
common_fields.displayDelayMs
common_fields.eventBudget
common_fields.executionBudget
common_fields.flowVersion
common_fields.joinMode
common_fields.label
input.fields.inputFormat
input.fields.outputFields
input.fields.aliases
systemInput.fields.aliases
llm.fields.prompt
llm.fields.promptTemplate
llm.fields.outputFields
interaction.fields.plan
logic.fields.logic_type
logic.fields.type
logic.fields.condition
logic.fields.script
tool.fields.tool_id
tool.fields.tool
car_control.fields.executionMode
car_control.fields.action
car_control.fields.module
car_control.fields.signalKey
car_control.fields.function
car_control.fields.device_type
car_control.fields.area
car_control.fields.targetStatus
car_control.fields.parameter
car_control.fields.light_color
car_control.fields.light_brightness
car_control.fields.light_reason
car_control.fields.pose_tips
car_control.fields.valueField
car_control.fields.controlOperation
car_control.fields.controlId
car_control.fields.controlValue
car_control.fields.level
recognition.fields.resultSource
wait.fields.repeat
wait.fields.maxIterations
wait.fields.match
wait.fields.answers
wait.fields.hintInputs
wait.fields.aliases
wait.fields.storeAs
state.fields.values
state.fields.increments
```

已有元数据缺口：systemInput.inputType；llm.model/temperature/maxTokens/outputFormat/jsonRepairAttempts；recognition.threshold/confidence；memory.type/window；fallback.responseText；video_display.source/streamUrl；wait.eventName/inputType。修复后目录含16个通用字段与76个节点专属字段，其中6个旧键明确禁止，示例null表示省略，并提供合法替代对象，不宣称这些旧键可以执行。

回归用AST提取三个校验器的顶层data读取，包括直接get、索引、成员判断、literal循环和嵌套node.data；明确节点所有权表约束对应fields，新字段须映射和声明，未知动态读取直接失败。目录驱动的循环逐项校验元数据。该测试不声称枚举穷尽所有外部服务或覆盖其他模块内部嵌套契约。HMI ID及范围/options另与真实注册表精确比较。

## 改动文件与行为

| 文件 | 本轮差异 |
| --- | --- |
| backend/app/services/node_capabilities.json | 补齐fields；通用joinMode只声明一次；字段含类型、枚举或null、required、example，条件必填和旧键替代单独声明 |
| backend/app/services/node_capability_service.py | authoring_catalog只复制规范目录；保留原专项校验，避免元数据导致绑定语义变化；logic错误带节点、实际值和路径 |
| backend/app/services/flow_contract.py | 汇合错误带data.joinMode实际值及普通入边ID；重复等待返回边继续排除 |
| backend/app/services/scenario_builder.py | 需求引用错误列具体不存在的节点ID；空覆盖列明确为空 |
| backend/app/services/authoring_session.py | patch删除或删旧增新后返回受影响requirement_id和missing_node_ids，不改覆盖表 |
| studio/src/data/nodeCapabilities.json | 由规范JSON生成的同步副本 |
| studio/src/domain/nodeCapabilities.ts | 仅字段元数据类型及专项校验标识适配；无视觉/布局变更 |
| backend/tests/test_capability_field_consistency.py | 7项一致性、示例、注册表、错误与覆盖引用回归 |

另更新VERSION、CHANGELOG、CONTEXT、主文档、NODE_CONTRACTS、开发/测试章节及本迭代三份文档。`hmi_control_contract.py`本轮只读取和测试，没有修改。仓库原有大量改动保留，以上清单按本轮开始时文件副本计算，不按混合工作区Git差异冒充本轮改动。

旧项目兼容依据：开发项目 `儿童关怀.json` 的 logic_risk_check 和 `selfie-hmi-mock-dev48.json` 的 selfie_gate 保存了type=if而没有logic_type。保留兼容读取，不改这些文件；显式logic_type优先，新图只推荐logic_type=if/filter，type在目录标记deprecated。条件condition与旧script兼容也明确标注。

## 回归验证

- 先失败日志：`/var/folders/hd/dc08m0b10yj0nxdlyk_y2d100000gn/T/oakegde-catalog-d9j9edrb/oakegde-consistency-red.txt`。
- 后端：`cd backend && .venv_macos/bin/python -m unittest tests.test_capability_field_consistency tests.test_authoring_contract_feedback tests.test_authoring_session tests.test_node_capabilities tests.test_dynamic_hmi_bindings tests.test_general_flow tests.test_repeated_flow`：**79项通过**。包含新增7项，合法配置不被元数据补全误拒绝，HMI绑定/重复等待继续通过。
- `python3 scripts/sync_node_capabilities.py --check`：通过。
- `cd studio && npx tsc -b`：通过。
- `node scripts/test-node-capabilities-dom.mjs`：7项通过。
- `node scripts/test-general-flow.mjs`：13项通过。
- `git diff --check`：通过。
- 全库文档检查仍报告41项错误、24项警告，涉及既有路径/Markdown链接及元信息。新增段落的两处脚本相对路径已修正；开发说明无错误，新迭代链接单独检查通过。未扩展修复既有文档，完整输出保存在仓库外docs-check.txt。
- 未执行前端视觉修改或重新发布；不以这些离线测试证明真实编排已恢复。

## 同一请求真实模型比较

请求MiniMax-M3、provider_id=minimax、agent_mode=single、10条完整对话、prompt=重新编排、save_on_success=false，来自上一轮保存的原始请求，未重新拼装项目历史。规范化请求SHA256仍为`139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37`。仅向开发8000请求一次，进入构建而非discussion。真实能力查询返回了本轮common_fields和logic_type声明，证明worker使用了新目录。

| 指标 | 上一轮dev.96 | 本轮dev.98 |
| --- | ---: | ---: |
| 总耗时 | 411.471秒 | 340.974秒 |
| 节点/连线 | 28/28 | 21/27 |
| patch调用 | 14 | 11 |
| patch拒绝 | 6（42.9%） | 4（36.4%） |
| 全部工具拒绝 | 9 | 5 |
| 最终具体配置错误 | 10 | 5 |
| 含未提交提示的最终issues | 11 | 6 |
| 完成调用预算 | 24/24 | 24/24 |
| build_report.status | needs_changes | needs_changes |
| can_apply | false | false |
| 实际图执行 | not_run | not_run |

本轮工具用途：capabilities 1、read_graph 4、brief 2、patch 11、inspect 4、test_plan 1、trial 1。**trial被结构校验挡住，未执行图，也未进行内容核验；不能说“试跑通过”。** 没有最终submit。停止时依旧耗尽24次调用。

本轮4次patch拒绝分别为：顶层多余item/id/source/target/sourceHandle；顶层多余item/eventName/interrupt/name/type；同一连线同时删除与写入；remove_data_keys错误地放在顶层。另一工具拒绝为brief引用未逐字匹配用户原文。节点data契约错误通常由inspect/trial返回，不等同于patch被拒绝，两项计数分开。

真实调用也验证了覆盖警告：删除rear_door_event和seat_sensor_event后，patch返回requirement_id=child_board_detection以及这两个旧ID；后续显式patch更新了coverage，最终不再有该引用错误。前一次inspect报告三个joinMode缺口及入边ID，后续图补齐，最终无汇合错误；最终所有logic均未报告非法模式。

### 本轮剩余错误与边界

1. user_input.data.aliases保存成`{"item":["接小孩放学","去接孩子"]}`对象，契约要求字符串数组。
2. set_child_lock、set_rear_ac、set_seat_heat、set_seat_vent 的controlValue分别保存成`<$ref>state.…</$ref>`字符串；契约是JSON布尔/数字或单字段引用对象，例如`{"$ref":"state.child_lock_on"}`。字符串不能当成typed binding。
3. 以上5个具体错误未修完，附加“智能体未完成最终提交”提示，can_apply=false。

从最终图和工具结果能够证实宿主拿到/保存了错误结构；仅凭这些证据不能进一步断言是模型原始输出错误还是SDK工具参数转换所致。本轮没有继续调查转换链，也没有添加XML/item兼容猜测或自动修复。

这次目录/定位改动后，旧的logic/join/失效节点引用错误在最终结果中消失、patch拒绝6→4，但单次模型实验有随机性，节点图也不同，不能据此证明稳定成功或所有业务需求完整。真实导航等缺能力仍未实现，场景仍没有通过运行验证。

## 数据和环境保护

开始/结束比对开发项目文件及orchestration配置共5份SHA256，全部相同（详见protection-check.json）；请求save_on_success=false。未修改默认模式或预算、未改编排架构，未操作或重启5175。诊断脚本、SSE、比较JSON和本轮源文件diff均在仓库外，无Git提交。

## 参数变形后续诊断（2026-10-06，只诊断）

维护日期：2026-10-06。状态：两组真实实验与离线检查完成；aliases已定位到API返回之前，上一轮XML引用未在本轮复现，仍未定案。只诊断，无兼容修复。归入dev.98后续证据；当前产品登记保持并行dev.99，未提交、未发布。

## 已确认结论及不能确认的部分

- MiniMax的aliases.item在服务返回的原始tool_call arguments字符串中已存在；Hermes解析前就已变形。本次5次patch都有这个包裹；SDK/Hermes与OAKEgde工具入口、authoring_session原样接收，不能归咎于我们的patch合并代码。
- MiniMax配置直连https://api.minimaxi.com/v1，没有本项目配置的第三方转发网关。客户端只能定位到MiniMax服务端输出边界，不能把服务内部的模型生成与tool-call序列化/转换强行拆开。没有服务端原始生成日志，不宣称“确定是模型本体、不是服务端转换”。
- Anthropic使用已配置claude-sonnet-5，经https://www.fucheers.top/v1。首次请求被自动审批阻止，用户明确允许向这个网关发送同一份历史后，只实际执行一次对照实验。它的aliases为正常数组，$ref为JSON对象；10次patch没有item包裹和<$ref>字符串。
- 上一轮四个HMI controlValue的XML形式<$ref>…</$ref>本轮没有再出现：MiniMax本次用固定布尔/数值，没有发出任何$ref；Anthropic传递了正常引用对象。不能用本次aliases证据代替上一轮$ref的首发证据。离线正反例也没有发现当前解析链把引用对象变成XML，但这不等于取得了上一轮原始API响应。

## 采集范围与关联

只向开发8000的/v1/orchestration/generate-stream请求。使用原样保存的MiniMax-M3 single请求，10条对话、prompt=重新编排、save_on_success=false。请求SHA256为139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37。Anthropic仅替换provider_id与model，哈希为34adccdf965b3c51d8e2e6d0c75c734b0c0d18ddf9d69b63b2e47d31a07303ee。没有改预算、模型思考参数、默认模式或项目内容。

临时入口只加入hermes_worker，按完整请求哈希匹配；运行期观察HTTP响应、SDK/Hermes入口及AuthoringSession。Hermes安装目录没有写入修改，版本验证照常执行。日志在仓库外，权限600；不记录请求头、密钥、原始请求正文或模型思考文本，已知密钥在日志编码时再次屏蔽。

- A：HTTP响应解码后、OpenAI/Anthropic SDK与Hermes消费前，记录原始function.arguments字符串及其JSON token；Anthropic原生协议没有arguments字符串，记录tool_use.input对象对应的原始JSON片段。
- 补充A_adapter/B_parsed：进入Hermes _parse_tool_call前后，区分SDK转换与json.loads。
- B：registry.dispatch即将传入OAKEgde工具handler的实际args。
- C_invoke/C_patch：AuthoringSession.invoke收到的args，以及Pydantic校验后patch函数收到的参数。这样可以单独看宿主的Schema默认值/类型转换。
- 关联键：真实tool_call_id和HTTP response序号。Hermes的probe/执行会重复解析，所以B_parsed数量不当成模型调用次数。所有15次patch的set_data子树在A→B→C保持一致；C_patch添加结构默认值、坐标整数转浮点等单列比较，未误判为字段变形。

## 原始片段对比

以下API列是从原始arguments/input JSON按路径提取的原文字段片段，未把模型意图补写成合法格式。B、C列为实际对象重新序列化的显示，比较的是类型和值。

### MiniMax：aliases已经被包成对象

调用call_01a11194ea6b7672bf7873d8；路径upsert_nodes[0].set_data.aliases；节点trigger_in。此patch实际成功应用到隔离候选图，未保存项目。

| 位置 | 内容 |
| --- | --- |
| A：API原始arguments中的aliases值 | `{"item":["接小孩放学","去接孩子","接娃"]}` |
| B：OAKEgde工具handler | `{"item":["接小孩放学","去接孩子","接娃"]}` |
| C：AuthoringSession.invoke | `{"item":["接小孩放学","去接孩子","接娃"]}` |
| C：AuthoringSession.patch | `{"item":["接小孩放学","去接孩子","接娃"]}` |

应为数组，但本轮只记录，不解包、不修复。第一次及后续尝试均在A就有同一包裹，宿主没有制造item键。

### Anthropic：aliases保持数组，引用保持对象

aliases调用toolu_bdrk_01UDAQjS5Z4GN244GAPm7f7b，路径upsert_nodes[0].set_data.aliases。

| 位置 | aliases |
| --- | --- |
| A：原始tool_use.input片段 | `["接小孩放学"]` |
| B：handler | `["接小孩放学"]` |
| C：invoke与patch | `["接小孩放学"]` |

引用调用toolu_bdrk_01SRK3y4QbPTn2EazJQ7Kcyq，路径upsert_nodes[5].set_data.values.school_name。

| 位置 | 引用对象 |
| --- | --- |
| A：原始tool_use.input片段 | `{"$ref":"state.school_name"}` |
| B：handler | `{"$ref":"state.school_name"}` |
| C：invoke与patch | `{"$ref":"state.school_name"}` |

这一例验证JSON对象未变成XML，不代表它的业务数据来源、运行时值或场景逻辑已经正确。

## 实验结果

| 项目 | MiniMax-M3 / 官方API | claude-sonnet-5 / fucheers网关 |
| --- | ---: | ---: |
| 总耗时 | 252.685秒 | 536.270秒 |
| 节点/连线 | 27/30 | 25/26 |
| 实际patch调用 | 5 | 10 |
| API原文含item包裹的patch | 5 | 0 |
| API原文含XML形式<$ref>的patch | 0 | 0 |
| set_data在A→B→C中被改写 | 0 | 0 |
| build_report.status | needs_input | needs_changes |
| can_apply | false | false |

MiniMax最终保留aliases错误、模型文字/JSON输出驱动动作的契约错误及它提出的待确认项。Anthropic最终仍有模型输出驱动动作和覆盖表不完整问题。任务不要求成功，本轮不继续修这些错误；也不把换服务商未复现误称为所有模型都可靠。

### Hermes确实有其他类型转换，但不是本次item来源

Anthropic一次brief（toolu_bdrk_01QAAT9uWMgUYy83x7qGBaz8）的requirements在A/B_parsed是JSON编码字符串，B_handler变为数组。来源是SDK model_tools.py:888调用tools/arg_coercion.py的coerce_tool_args，按已声明的array/object类型解析JSON字符串。该转换没有增加item对象或构造<$ref>；本次所有patch的set_data均未改变。不能写成“Hermes完全不改参数”。

宿主C_patch的差异只涉及GraphPatch/NodeEdit默认字段、连线默认type及坐标数值类型，set_data不变。patch合并使用copy.deepcopy(edit.set_data)，没有XML编码步骤。

## 离线检查与源码依据

使用固定Hermes运行时Python3.14，通过OpenAI ChatCompletion解析、Hermes _parse_tool_arguments、真实注册Schema的coerce_tool_args、AuthoringSession.invoke和patch，测试6种输入：aliases数组、aliases.item对象、controlValue的$ref对象、XML引用字符串、布尔值和数值。**6项均保持原类型和值**。错误XML没有被自动修成对象，合法对象也没有被转成XML。最初用开发Python3.12加载Hermes的3.14二进制依赖失败，改用实际运行时后通过；不把环境失败当成解析失败。

源码定位：

- backend/app/services/authoring_session.py:64：set_data仅声明为dict，生成的参数Schema是type=object、additionalProperties=true，内部aliases/引用没有独立类型约束。
- 同文件:501：工具参数模型校验；:301：节点data深拷贝合并；没有item/XML重写。
- 固定Hermes agent/tool_executor.py:168：_parse_tool_arguments对arguments执行json.loads，非JSON对象拒绝。
- 固定Hermes model_tools.py:888、tools/arg_coercion.py:20、94：Schema引导的类型转换；无properties的开放对象不继续推断内部字段类型。

## 建议，等待用户决定，尚未实施

A（建议优先）：从现有统一能力契约给工具参数set_data中的已知列表及引用字段提供真正的JSON Schema。aliases声明array/items:string；可引用值明确允许对应字面量或只有$ref:string的对象，引用对象限制额外键。保留按节点类型和局部patch的合法配置，不按具体场景加规则。当前能力目录是工具返回的说明信息，不等于oakegde_patch_graph请求的嵌套参数Schema约束；这两者不能混淆。不要因此全局猜测/解包item，也不要把任意XML字符串执行成引用。

B：若服务端仍不能稳定产生带$ref的对象，另行设计独立绑定参数，字段路径与引用路径分别为字符串，由宿主显式构造引用对象。优点是绕开开放对象和特殊键生成；代价是新增工具参数及冲突规则，需要用户确认。不是本轮实现内容。

目前没有证据支持修改Hermes JSON解析器或我们的patch合并逻辑。针对上一轮XML形式引用的确切首发点仍缺该次原始响应；后续如需定案，可在另行确定的定向复现或服务端原始日志中继续取证，不能把“倾向上游”写成已证实。

## 清理与保护

临时hermes_worker入口已移除，11份诊断前后保护文件（worker、相关服务、目录、引擎配置和全部开发项目）SHA256完全一致；固定Hermes SDK git status为空。不重启或操作5175，不改架构、默认模式或预算，不创建提交。本轮不增加产品编号。

按用户要求，采集完成后删除本轮原始API/分层/SSE日志、请求副本及临时脚本/诊断profile，仅保留本报告必要片段、EVIDENCE.json摘要与保护哈希。原始日志删除后无法从摘要重建完整响应，这是有意的数据清理。
