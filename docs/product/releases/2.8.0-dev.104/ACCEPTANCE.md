# dev.104 验收：契约前置检查与模型/复杂度对照

维护日期：2026-10-09。状态：本轮两处修复、自动验证与六次真实实验完成；整体可靠性未达标，未提交、未发布，不更新5175。主依据：[需求](PRD.md)、[任务](TASKS.md)、[精简证据与完整错误](EVIDENCE.json)、[测试结果](TESTS.txt)。

## 结论

可应用 **1/6**：C-MiniMax **1/2**、C-Claude **0/2**、D-Claude **0/2**。六次均进入构建，没有discussion，因此未追加默认值回复。

按用户给出的归因标准，应先看同服务商对照：Claude的C也不能过，落在“C不过，优先定位框架/流程”这一支。两次C-Claude都在输入适配就失败，均未调用图内模型；输入形状与执行契约不匹配，报错误称模型输出错误，锁定计划又拒绝修正输入。不能据此认定主要是MiniMax能力，也不能将D失败全部归因为复杂度。

MiniMax有一次C通过，证明框架存在完整的搭图→真实执行→独立上下文内容核验→提交路径；另一轮却在重复修错中耗尽预算。若把“C能过”定义为任意一次成功，汇总表表面符合C能过/D不过，但C的成功来自MiniMax，D只测Claude，不能跨服务商消除混杂因素。复杂流程的事件/断言和记忆前置错误也已观察到，但仍需先消除简单场景共享契约阻塞，再做同模型复杂度比较。样本各2次，不是稳定成功率估计。

## 两处改动与范围

1. `backend/app/services/scenario_execution.py:52`、`authoring_session.py:542`：test_plan工具及能力说明明确每个case独立会话、车辆、state与记忆；同case前置步骤先写入。附真实可执行的两步记忆例，普通输入写入、单独事件分支读出，不预置宿主记忆。实际执行器回归重复运行两个case，并断言每个case只拥有自身一条记忆。
2. `backend/app/services/expression_preflight.py`、`studio/scripts/inspect-expressions.mjs`、`authoring_session.py:407`：inspect调用现有Studio `validateExpression`，只解析不求值。logic和satisfies沿用运行时input/value及现有纯函数；绑定沿用flow_contract的input/event/state/outputs。检查outputs节点存在，错误给字段路径、实际写法和合法例。保留legacy script优先级、局部回调变量和字符串字面量语义。`flow_contract.py:28`只增强现有绑定错误定位与示例。
3. `backend/tests/test_authoring_preflight.py`新增6项回归。既有生产文件本轮仅修改scenario_execution.py、authoring_session.py、flow_contract.py；新增静态检查桥和测试。其余为版本/需求/验收及相关文档维护。工作区既有大量未提交改动保留，不将HEAD总diff误当成本轮diff。

不修改运行时行为、预算、默认模式、路由、参数兼容、计划锁定规则或架构；不新增场景关键词/固定拓扑。桥接复用现有Node/esbuild/acorn依赖，依赖不可用时显式检查失败。静态检查不证明运行时字段存在或事件顺序正确。

真实命中：D-Claude-1在inspect拦住裸`state`条件和4处不存在的`outputs.llm_extract_enroll`引用，随后被修复。D-Claude-2仍生成了没有同case前置准备的“已有记忆”测试；新增说明并不能保证模型遵守。

## 测试

先失败后实现：最初5项测试4失败/1通过；新增真实执行器记忆示例测试先因示例输出字段不符失败，修正到实际契约后6项全通过（0.738秒）。

后端目录运行：

```sh
.venv_macos/bin/python -c 'import sys,unittest;sys.path.append("../.demo-runtime/mcp-venv/lib/python3.12/site-packages");unittest.main(module=None,argv=["unittest","discover","-s","tests","-q"])'
```

378项：369通过、9项既有可选测试跳过，26.843秒。Studio运行`npx tsc -b`通过；`node scripts/test-scenario-execution.mjs`的20项执行器测试通过。`git diff --check`通过。文档检查仍为既有42错误/24警告，本轮没有扩大治理范围。

## 实验方法与可复现性

只访问开发`127.0.0.1:8000/v1/orchestration/generate-stream`，六次顺序运行、代码冻结、single、save_on_success=false。没有在日常项目上测试写入。节点LLM按图内绑定服务运行，表中服务商指编排/核验请求服务商。耗时为客户端请求到SSE结束的monotonic时间。

C无历史、current_project=null、project_name=null，原文：上车后根据当前车内温度自动调节空调，并用语音播报调节结果。不需要再确认，规则用合理默认值，请直接生成编排。

D从dev.103 A恢复，保留10条非空历史，prompt=重新编排，只替换provider_id=anthropic和默认model=claude-sonnet-5。恢复原A按`json.dumps(sort_keys=True,ensure_ascii=False)`计算SHA256，完全匹配`139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37`。current_project取原项目全部字段、meta去掉chat_messages（保留created/map_storyboard）；history为全部非空消息，仅role/content。显式reasoning/acceptance_tests/project_name/provider_base_url=null、overwrite=false，其他字段为原A。便于下次恢复，不保存完整历史到报告。

Anthropic使用已授权网关与model_providers默认ID；仅确认配置/请求模型名，无法独立证明网关后端真实模型实现。MiniMax为MiniMax-M3。请求指纹与逐工具拒绝、trial、inspect错误详见EVIDENCE。

## 结果表

编排调用为共享CompletionBudget次数（含入口）；patch拒绝只计工具返回ok=false，inspect/trial失败另列。normalizations为实际字段修正次数，非请求次数。status修订/单次超时/过载重试三个数顺序固定。

| 次数 | 秒 | 节点/边 | 编排调用 | patch总/拒绝 | normalizations | status修订/超时/过载 | host_finalized | status | can_apply | runtime_verified |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| C-MiniMax-1 | 208.863 | 21/17 | 40 | 33/0 | 300 | 0/0/0 | false | needs_changes | false | false |
| C-MiniMax-2 | 125.623 | 8/10 | 16 | 5/1 | 0 | 0/0/0 | false | preview | true | true |
| C-Claude-1 | 208.449 | 6/7 | 22 | 7/0 | 0 | 0/0/0 | false | needs_changes | false | false |
| C-Claude-2 | 272.131 | 15/18 | 21 | 4/0 | 0 | 0/0/0 | false | needs_changes | false | false |
| D-Claude-1 | 519.402 | 26/32 | 38 | 11/1 | 0 | 1/0/0 | false | needs_changes | false | false |
| D-Claude-2 | 731.070 | 29/36 | 39 | 17/4 | 0 | 0/0/0 | false | needs_changes | false | false |

## 每次失败的直接原因与归类

| 次数 | 分类 | 直接原因 | 仅建议，未实施 |
|---|---|---|---|
| C-MiniMax-1 | 模型能力；契约说明；预算 | 33次patch均接受，但300次归一化将`$text`值恢复为仍合法的字符串类型；inspect指出车控要求number/boolean后仍反复提交字符串。最后改图断开分支，18节点不可达，无测试计划，40调用耗尽。 | 考虑按controlId注册类型生成更具体的Schema/即时反馈；先量化重复无效改图，不仅增加预算。现有归一化没有按控制项含义猜数值，本轮未改。 |
| C-Claude-1 | 契约说明；宿主流程；模型能力 | input_start配置inputFormat=json、没有eventName；计划却直接传`{cabin_temp:32}`对象。普通输入适配只读字符串或input.text，解析空串；三次trial均0模型调用。复用的“模型未返回JSON”提示指错对象，模型改图未修复输入契约。 | 明确JSON输入应该用什么形状，在计划/inspect验证图与输入匹配，并把输入解析错误与模型输出错误分开。是否支持直接对象或仅保持字符串契约，需要下一轮确定。 |
| C-Claude-2 | 契约说明；宿主流程；模型能力 | 测试把数据写成`$event.data`，事件解析读value/text；input_start也未配置eventName。三次trial均0模型调用，输入先失败，车控断言随之失败。修改计划输入被锁定规则拒绝。 | 完整描述事件Schema和入口匹配；考虑允许受控修复错误测试输入，不能任意削弱断言。本轮保持锁定。 |
| D-Claude-1 | 模型能力；契约说明；试跑预算 | trial1缺动态上游数据；后续推进到第7步，但图等待wait_door_event（door_event），测试断言logic_child_boarded=waiting，实际pending。仅改步骤status为waiting不改变错误断言；另外两次计划修改被拒绝。38次调用、三次trial用尽后交付不可应用候选。 | 区分run状态通过与实际断言失败；解释wait节点与下游pending节点差异。围绕具体事件/断言修复，不自动改测试或放宽门槛。 |
| D-Claude-2 | 模型能力；契约说明；预算 | 三次需求引用拒绝、四次patch拒绝、一次计划Schema拒绝。revision10唯一trial失败：录入后的state缺失；第二case未经前置准备就断言已有记忆。随后改到revision13，最终无该版本trial证据；39次编排、731.1秒结束。 | 说明修复并不保证遵守，应在计划登记时核对可证明的前置条件，改善锁定后修复路径；先解决重复契约错误再评估复杂度。 |

D2时间证据符合720秒共享编排时间预算耗尽（作者阶段总耗时729.678秒，允许已发起调用返回后才拒绝下一次）；这是依据耗时/预算代码的归因推断。返回diagnostics是failed=true、termination=returned，没有细分failure_reason，不把它说成780秒host_timeout。最终图仍保留，runtime_verified/can_apply=false。

所有host_finalized=false：C1无有效计划，其他C已试跑；D1三次trial已用完；D2修改到revision13后没有最新显式inspect通过证据，结束时incomplete_result才重新检查并保留候选，没有绕过正常trial/内容核验门槛。没有观察到宿主满足全部兜底条件却漏跑的证据。

定位依据：`studio/src/utils/GraphEngine.ts:747–748`为JSON输入适配，`studio/src/domain/flowSession.ts:16`为事件value/text解析、`:182–186`仅为具名事件入口序列化；`studio/src/domain/modelOutput.ts:9`是复用且误指模型的报错；`backend/app/schemas/execution_schema.py:26`测试input为Any；`authoring_session.py:347–370`计划修订锁；`scenario_execution.py:167`起为失败反馈；`authoring_team.py:295–305`为兜底资格检查。上述问题只调查/建议，没有加第三处修复。

## 完整最终错误清单

### C-MiniMax-1

- cold_mode：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- cold_temp：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- cold_fan：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- cold_on：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- cold_broadcast：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- hot_mode：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- hot_temp：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- hot_fan：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- hot_on：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- hot_broadcast：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- comfort_mode：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- comfort_temp：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- comfort_fan：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- comfort_on：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- comfort_broadcast：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- cold_settings：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- hot_settings：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- comfort_settings：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- 智能体未完成最终提交；保留最新图与执行证据供继续修复。

### C-MiniMax-2

无。执行断言与独立上下文内容核验均passed。

### C-Claude-1

- 实际试跑未通过；高温场景-自动制冷第1步：状态failed，期望not_failed
- 实际试跑未通过；节点input_start：模型未按约定返回有效 JSON，进度未推进，请重试。
- 实际试跑未通过；低温场景-自动制热第1步：状态failed，期望not_failed
- 实际试跑未通过；节点input_start：模型未按约定返回有效 JSON，进度未推进，请重试。
- 实际试跑未通过；舒适场景-低风速维持第1步：状态failed，期望not_failed
- 实际试跑未通过；节点input_start：模型未按约定返回有效 JSON，进度未推进，请重试。

### C-Claude-2

- 实际试跑未通过；很热-制冷强风第1步：状态failed，期望not_failed
- 实际试跑未通过；节点input_start：模型未按约定返回有效 JSON，进度未推进，请重试。
- 实际试跑未通过；断言['car', 'ac', 'mode'] equals cool，实际auto
- 实际试跑未通过；断言['car', 'ac', 'fan'] equals 8，实际3
- 实际试跑未通过；断言['hmi', 'message'] contains 22，实际模型未按约定返回有效 JSON，进度未推进，请重试。
- 实际试跑未通过；舒适区-自动低风第1步：状态failed，期望not_failed
- 实际试跑未通过；节点input_start：模型未按约定返回有效 JSON，进度未推进，请重试。
- 实际试跑未通过；断言['car', 'ac', 'temp'] equals 24，实际22
- 实际试跑未通过；很冷-制热强风第1步：状态failed，期望not_failed
- 实际试跑未通过；节点input_start：模型未按约定返回有效 JSON，进度未推进，请重试。
- 实际试跑未通过；断言['car', 'ac', 'mode'] equals heat，实际auto
- 实际试跑未通过；断言['car', 'ac', 'fan'] equals 8，实际3
- 实际试跑未通过；断言['car', 'ac', 'temp'] equals 26，实际22
- 实际试跑未通过；断言['hmi', 'message'] contains 很冷，实际模型未按约定返回有效 JSON，进度未推进，请重试。

### D-Claude-1

- 实际试跑未通过；首次使用：询问录入到接到孩子全流程第7步：状态waiting，期望waiting
- 实际试跑未通过；断言['nodes', 'logic_child_boarded'] equals waiting，实际pending

### D-Claude-2

- 候选尚未实际试跑通过。
- 智能体未完成最终提交；保留最新图与执行证据供继续修复。

## 可验收候选

[C-MiniMax-2 候选图](/tmp/oakegde-dev104-candidates/C-MiniMax-2.json)，8节点/10连线，4个case，第三次trial通过，内容核验passed。候选保留真实build_report、计划与证据，可离线审阅；没有导入或写入任何项目。车控为Studio模拟，内容核验是同一模型的独立上下文，不是独立事实认证。其余不可应用候选不冒充成功产物。

## 保护、清理与限制

保护文件6/6 SHA256一致：引擎配置及backend/projects下全部5文件，文件集合也未变；源码冻结基线156/156一致。六次请求结束逐次检查，最终再核对。Hermes SDK仍为d0288be5b3330d2442e3907185b8e9d0958297bb、工作区clean。详细指纹见EVIDENCE。未创建提交、未执行prepare、未修改或重启5175/stable、未写项目文件，未回显密钥。仅重启了开发8000以加载本轮已测试代码。

实验后删除本轮临时完整请求/历史、SSE、失败结果、运行日志、采集/汇总脚本与临时基线；仅保留上述用户验收候选及仓库内精简报告/证据/测试结果。开发8000保留运行。未进行实车验证，9项可选后端测试跳过，原文档检查42错误/24警告未处理。没有discussion样本，因此无需追加第二种回复方式；没有触发单次超时/过载或宿主兜底，不能用这六次证明这些分支的云端可靠性。
