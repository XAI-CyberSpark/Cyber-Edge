# 验收与Hermes上游问题记录

用途：保存通用修复与三次稳定性实验的证据；状态：限定改动与验证完成，三次编排仍未通过，未提交、未发布；维护日期：2026-10-07。主依据：[需求](PRD.md)、源码、回归与仓库外实验目录。

## 实现与原缺口

controlId上一轮已有53个ID枚举，由set_data Schema投影；本轮补enum_source=hmi_controls，Schema直接读注册表，同步脚本刷新目录中的物化枚举，防止新增控件后漂移。原图内executionMode=hmi路径已经调用validate_hmi_node，inspect本来能拒绝非法ID，未重复造校验。

发现的真实缺口是测试计划cases[].controls：此前计划登记与inspect未检查初始控件，直接交给TS VehicleWorld，非法ID才在试跑时报错。新增统一前置校验覆盖计划登记、inspect和直接执行API。旧原始日志已按要求清理，不能重新证明上一轮school究竟出现在哪个字段；该漏检路径已用独立unregistered.example回归复现，不将推断写成历史定案。

未知ID列出最多3个文字相近的真实注册ID，明确这些不是语义等价建议；没有适用控件需标missing，确有仿真能力才标simulated，不生成假控件。

等待反馈由真实TS执行器返回waiting_nodes：节点ID、实际提示、事件名、输入类型、匹配方式、答案、别名与提示输入。Python反馈附两种修法；输入测试的字段实际叫status，expected_status是执行报告字段。测试输入不自动改写。

用户确认的例外仅允许AI生成计划针对当前版本已观测不匹配显式修订；保留原步骤、输入、断言、用例条件，必须紧接插入回答。调用方计划、陈旧或缺失证据、任意断言修改仍拒绝。接受修订使执行/核验缓存失效，不重置试跑次数或图revision。

引用还原发生在我们对session.invoke的工具适配入口，仅精确匹配{_ref:字符串}；任意深度列表/对象中的匹配值恢复成{$ref:字符串}。多字段_ref对象、非字符串、原有$ref、XML、item包装不自动拆解。每次工具结果及trace记录reference_restorations，最终hermes元数据记录累计值。未改Hermes SDK。

## 回归

先执行新8项测试：3失败、4错误、1通过，证实初始控件漏检、缺等待证据、尚无还原入口和计划不可修订。实现后通过；随后108项相关后端与20项TS执行器测试通过。固定SDK离线Schema清洗及入口恢复复现通过。追加非法初始控件不锁计划、拒绝调用仍记录引用恢复数及真实子进程显式修订后接收回答的边界测试。最终111项相关后端测试全部通过；追加共享接口的tests.test_authoring_team共19项通过（不调查性能、不改流程），合计130项。20项TS执行器通过，tsc -b通过。新增端到端夹具初次漏eventName被既有inspect正确拒绝，补齐合法夹具后通过；产品代码未因此改动。

实际后端命令（backend目录，复用已安装jsonschema；未安装或修改环境）：

```sh
.venv_macos/bin/python -c 'import sys,unittest;sys.path.append("../.demo-runtime/mcp-venv/lib/python3.12/site-packages");unittest.main(module=None,argv=["unittest","tests.test_authoring_trial_repairs","tests.test_patch_data_schema","tests.test_authoring_session","tests.test_scenario_execution","tests.test_node_capabilities","tests.test_dynamic_hmi_bindings","tests.test_general_flow","tests.test_authoring_contract_feedback","tests.test_hermes_authoring"])'
```

共享接口回归命令（backend目录）：`.venv_macos/bin/python -m unittest tests.test_authoring_team`。

TS命令（studio目录）：`node scripts/test-scenario-execution.mjs`；`./node_modules/.bin/tsc -b --pretty false`。本轮没有视觉修改，未做浏览器或实车验收。


## 三次真实复跑

使用开发8000与此前完全相同请求：MiniMax-M3、10条历史、prompt=重新编排、single、save_on_success=false。请求SHA256：139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37。顺序运行，三次期间产品代码冻结；不是三种不同修复版本。

三次`can_apply=true`为 **0/3**。三次均进入single构建，未路由成discussion；三次共享completion_attempts均为24/24。产品代码哈希在实验前后完全一致。

| 次数 | 耗时/秒 | 节点/边 | patch总数/拒绝 | status | can_apply | 引用还原 | 实际trial次数 |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 1 | 321.917 | 25/28 | 6/0 | needs_changes | false | 0 | 2 |
| 2 | 430.787 | 25/27 | 11/2 | capability_gap | false | 0 | 0 |
| 3 | 206.158 | 19/26 | 10/0 | needs_changes | false | 0 | 0 |

三次都没有调用触发精确_ref恢复，不能称真实模型已验证该分支；固定SDK离线复现和宿主入口回归验证了恢复行为。三次都没有成功接受受限测试修订；自动回归中该修订可通过并继续真实图执行，不等于本次模型正确使用了它。

过程与剩余问题：

- 第1次321.917秒，25节点/28边，6次patch/0拒绝，needs_changes、can_apply=false；24次调用耗尽，引用还原0次。最终错误为“候选尚未实际试跑通过”“智能体未完成最终提交”。最近试跑仍停在wait_school等待message/text输入，反馈已给实际prompt及两种修法；还有has_memory状态断言不符。5次测试计划修订因不满足受限条件被拒绝，没有接受的测试修订；另有2次brief原话引用错误。最后改图后旧试跑证据失效，最终报告只保留未通过总述，不能把它当作最新图已经复验。
- 第2次430.787秒，25节点/27边，11次patch/2拒绝，capability_gap、can_apply=false，未进入trial，引用还原0次。parse_info、decide_route仍有输出驱动动作契约错误；6个控件的controlValue类型不合法，最终图实际值为{"$text":"true"}/{"$text":"22"}/{"$text":"1"}/{"$text":"40"}等对象，不是布尔/数字，也不是本轮授权的单字段_ref对象。R8_comfort_config仍标能力缺口、且未完成最终提交。两次patch拒绝涉及顶层多余item/id/source/target，以及把controlValue放在NodeEdit而非set_data。这里的item是顶层多余字段，不等同于上一轮aliases.item；未采集本轮API原文，不对其上游首发层作新结论。

- 第3次206.158秒，19节点/26边，10次patch/0拒绝，needs_changes、can_apply=false。最新revision10图检查已通过，但测试计划第一次把步骤字段放到case层并包含顶层item等无效键；第二次计划登记成功时已到24次调用，未调用trial或submit。引用还原0次。

不为上述新发现添加$text或item自动拆包，不中途改变三次实验的代码。

最终错误原文（按每次build_report.issues，不用历史试跑错误冒充最新图检查）：

### 第1次

1. 候选尚未实际试跑通过。
2. 智能体未完成最终提交；保留最新图与执行证据供继续修复。

### 第2次

1. parse_info（parse_info）：文字或数据输出不能直接驱动车控/工具。模型负责决策动作时配置set_data.outputFormat=actions；保留json输出时，只能按已支持的显式HMI字段/$ref或MCP参数绑定组合，不得将原文当普通工具/车控动作。检查所有可达下游动作节点，不只是下一跳；不要只改systemPrompt而遗漏outputFormat。
2. decide_route（decide_route）：文字或数据输出不能直接驱动车控/工具。模型负责决策动作时配置set_data.outputFormat=actions；保留json输出时，只能按已支持的显式HMI字段/$ref或MCP参数绑定组合，不得将原文当普通工具/车控动作。检查所有可达下游动作节点，不只是下一跳；不要只改systemPrompt而遗漏outputFormat。
3. set_child_lock（set_child_lock）：儿童锁目标值类型无效；controlValue必须为JSON boolean，不能用字符串代替数字/布尔。
4. set_ac（set_ac）：目标温度目标值类型无效；controlValue必须为JSON number，不能用字符串代替数字/布尔。
5. set_seat_heat_1（set_seat_heat_1）：副驾加热目标值类型无效；controlValue必须为JSON number，不能用字符串代替数字/布尔。
6. set_seat_vent_1（set_seat_vent_1）：副驾通风目标值类型无效；controlValue必须为JSON number，不能用字符串代替数字/布尔。
7. set_ambient_brightness（set_ambient_brightness）：氛围灯亮度目标值类型无效；controlValue必须为JSON number，不能用字符串代替数字/布尔。
8. set_display_brightness（set_display_brightness）：屏幕亮度目标值类型无效；controlValue必须为JSON number，不能用字符串代替数字/布尔。
9. R8_comfort_config 缺少能力：已声明舒适配置链：氛围灯与文字反馈；其余车控节点将一次性补齐
10. 智能体未完成最终提交；保留最新图与执行证据供继续修复。

### 第3次

1. 候选尚未实际试跑通过。
2. 智能体未完成最终提交；保留最新图与执行证据供继续修复。




## 给Hermes上游的问题描述（仅本地文档，未提交）

标题：unrename_tool_args does not descend into anyOf when restoring sanitized property keys。

版本：固定提交d0288be5b3330d2442e3907185b8e9d0958297bb。定位：tools/schema_sanitizer.py的_rename_property_keys（43行）和unrename_tool_args（61–78行）；model_tools.py:523在出站调用sanitize_tool_schemas。

最小Schema：

```json
{"type":"object","properties":{"controlValue":{"anyOf":[{"type":"number"},{"type":"object","properties":{"$ref":{"type":"string"}},"required":["$ref"],"additionalProperties":false}]}}}
```

步骤：将上述参数包装为OpenAI function tool，执行sanitize_tool_schemas；观察anyOf内properties和required的$ref变为_ref。模拟模型返回`{"controlValue":{"_ref":"state.target"}}`，再执行`unrename_tool_args(original_schema, arguments)`。

预期：`{"controlValue":{"$ref":"state.target"}}`。实际：仍是_ref。原因：出站清洗递归遍历anyOf，但入站仅识别直接properties和items，联合分支的原名映射未被遍历。本地用固定SDK函数复现；宿主入口恢复后计数1且得到预期对象。

建议上游为联合分支增加无歧义的属性名逆向映射，并测试对象/数组嵌套、冲突分支及无关字段保持；不要对含多个字段的业务对象做无条件重写。本项目本轮只采用用户授权的精确单字段形状还原，不修改SDK，不声称通用联合Schema解析已经修好。

## 保护与限制

8项保护哈希（引擎配置、团队服务预算、Hermes宿主服务及5份开发项目）全部保持；实验期间10份产品源码哈希全部一致。SDK Git工作树干净；三次saved_project=null。未操作5175/稳定副本，未改架构、默认模式或预算，未创建提交。不宣称实车、导航或所有场景能力通过。

仓库外证据目录：/var/folders/hd/dc08m0b10yj0nxdlyk_y2d100000gn/T/oakegde-dev101-2iqoozly。保留EVIDENCE.json、上游离线复现、保护哈希、相关测试输出及本轮改动前源码快照。原始SSE、完整候选结果及临时运行脚本按此前清理要求移除；本轮没有注入临时生产日志。

## 改动文件与范围

- backend/app/services/hmi_control_contract.py：相近注册ID及missing/simulated纠错。
- backend/app/services/node_data_schema.py、node_capabilities.json、scripts/sync_node_capabilities.py及studio/src/data/nodeCapabilities.json：注册表驱动controlId枚举与物化副本同步。
- backend/app/services/scenario_execution.py、studio/src/domain/scenarioExecution.ts：初始控件前置校验、实际等待证据及修复提示。
- backend/app/services/hermes_tool_arguments.py、backend/app/agents/hermes_worker.py：宿主工具入口精确引用还原及计数，SDK不改。
- backend/app/services/authoring_session.py、backend/app/agents/hermes_authoring.md：inspect补漏、用户确认的受限计划修订、提示与trace计数。
- backend/tests/test_authoring_trial_repairs.py：新增11项回归，覆盖多个独立输入/负向边界，未加入业务场景特判。
- VERSION、CHANGELOG、CONTEXT、主入口、节点契约、开发/测试/维护/周更新及本迭代三份文档：同步实现、验证、未完成与上游问题；没有视觉修改。

## 结论与未完成

本轮修复了前置检查、等待诊断和明确授权的引用还原边界，未让真实编排稳定通过。剩余失败来自模型持续产生的参数/值封装、输出与动作契约、测试计划构造/修订不合规，以及在完成试跑前耗尽原调用预算。本轮不追加兼容、不调预算、不继续更改架构；后续修法需另定范围。
