# 验收与限制

用途：dev.100测试、原始证据摘要与真实复跑结果；维护日期：2026-10-06。状态：局部实现与验证完成，编排仍未通过，未提交、未发布。主依据：[需求](PRD.md)、源码与仓库外实验记录。

## 上一轮最终结果补报

| 服务商 | 耗时 | 节点/连线 | status | can_apply |
| --- | ---: | ---: | --- | --- |
| MiniMax-M3 | 252.685秒 | 27/30 | needs_input | false |
| Anthropic/claude-sonnet-5（已授权网关） | 536.270秒 | 25/26 | needs_changes | false |

MiniMax剩余问题：

1. trigger_in：事件别名需要文字列表。
2. extract_memory_input：文字或数据输出不能直接驱动车控/工具。决策动作需outputFormat=actions；保留json时只能使用已支持显式HMI字段/$ref或MCP参数绑定；检查所有可达下游，不只下一跳。
3. 待确认：儿童上车识别来源（座位传感器+车门时间窗）事件名；模型提议child_boarded。
4. 待确认：儿童舒适配置具体默认项清单。
5. 智能体未完成最终提交；保留最新图与执行证据供继续修复。

Anthropic剩余问题：

1. extract_memory：同类文字/JSON输出驱动动作契约错误。
2. 每个需求必须有且仅有一条实现关系；缺少R1、R2、R3、R3b、R3c、R4、R4b、R5、R5b、R6，多余为空。
3. 智能体未完成最终提交；保留最新图与执行证据供继续修复。

上一轮MiniMax 5次patch中5次原文含aliases.item，拒绝1次；Anthropic 10次patch均无item/XML。完整诊断依据在[dev.98验收](../2.8.0-dev.98/ACCEPTANCE.md)，此前按用户要求清理原始采集，本页不声称保有完整旧日志。

## 回归

新增测试需要[requirements-test.txt](../../../../backend/requirements-test.txt)的jsonschema，仅测试使用，不加入生产模型依赖。本机已存在隔离MCP环境的该库，本轮追加其模块搜索路径复用，未安装依赖或改虚拟环境。最初直接执行缺依赖，不算缺陷复现；补齐搜索路径后的有效红灯为6项中3失败、2错误、1通过。

实际命令（backend目录）：

```sh
.venv_macos/bin/python -c 'import sys,unittest;sys.path.append("../.demo-runtime/mcp-venv/lib/python3.12/site-packages");unittest.main(module=None,argv=["unittest","tests.test_patch_data_schema","tests.test_authoring_session","tests.test_node_capabilities","tests.test_general_flow","tests.test_authoring_contract_feedback","tests.test_hermes_authoring"])'
```

结果85项通过。测试覆盖目录动态增字段、枚举/类型/数组项一致性、冲突说明、严格引用对象、合法和非法数组、patch不拆包，以及相关原有契约。初次相关测试发现新增properties使既有纠错提示只给父路径，已补完整字段路径后通过；另一次误写不存在的测试模块名已更正，不计入有效测试结果。

## Schema与固定Hermes限制

原始patch参数Schema：16285字节（紧凑UTF-8 JSON），76个set_data属性，JSON容器深度12，18处anyOf。固定Hermes清洗后：16478字节，76个属性，容器深度12，13处anyOf。此深度是包括properties/items/anyOf容器的JSON深度，不冒充提供商官方嵌套额度。可空结构被简化，多基本类型转anyOf，字段未截断。

离线发现Hermes tools/schema_sanitizer.py会把引用对象的属性名$ref改为_ref；unrename_tool_args仅沿properties/items递归，不进入anyOf，因此controlValue={"_ref":"state.value"}不会还原。未修改SDK或解析器。正常Schema展开函数的修正只处理Schema元数据，不处理模型返回参数。

原始：`{"type":"object","properties":{"$ref":{"type":"string"}},"required":["$ref"],"additionalProperties":false}`。
Hermes发送版：同一对象中的properties/required键改成`_ref`。此限制是新增显式引用Schema后的实测问题，不推翻上一轮开放set_data下正常$ref能透传的结论。

## 真实复跑

开发8000，MiniMax-M3，10条历史对话，prompt="重新编排"，single，save_on_success=false，其他参数与上一轮一致。请求SHA256为139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37；进入构建，未路由成discussion。

| 指标 | 上一轮MiniMax诊断 | 本轮明确Schema |
| --- | ---: | ---: |
| 耗时 | 252.685秒 | 363.660秒 |
| 节点/连线 | 27/30 | 27/28 |
| patch次数 | 5 | 7 |
| 原始patch含item包裹 | 5/5 | 0/7 |
| patch拒绝 | 1 | 2 |
| status | needs_input | needs_changes |
| can_apply | false | false |

本次原始patch中item包裹出现0处、XML形式引用0处；模型也未生成$ref或_ref对象，因此本次不能证明引用端到端可用。Hermes报告创作19次API调用、19次工具调用，2次失败；正常调用submit返回（非超时），图revision=5，runtime_verified=false。

实际采集到20份发送Schema快照，全部与离线清洗结果相等，76字段、anyOf完整保留；19个携带patch Schema的请求获得HTTP200，入口另有1个HTTP200。发送快照比已采集响应多1，未逐请求关联，不把该计数差额算作额外成功；未发现Schema拒绝或截断。提供商接受这些实际请求，不等于对所有JSON Schema功能或额度作保证。

原始样本：call_01a111e18ece720d92bd2b77的aliases为JSON数组，而不是item对象。原始API参数与最终patch数量分别统计，未通过自动拆包掩盖错误。

两次patch拒绝（不是数组错误）：

1. 不能同时删除和写入同一节点：nav_join、route_join；应原位upsert或先核对删除范围。
2. 删除的连线不存在：e_check_route_direct；删除节点已自动删关联边，不能重复删除。

最终剩余错误原文：

1. 实际试跑未通过；HMI 未接入控制项：school
2. 实际试跑未通过；首次无记忆：依次询问并写入记忆第1步：状态waiting，期望completed

此次item错误未复现，但只是一轮证据；patch拒绝数反而由1增至2，不能宣称整体编排已恢复或总体拒绝改善。没有继续修剩余语义/执行问题，也没有加解析兼容或增加复跑。

## 改动与保护

代码：node_data_schema.py自动生成Schema；authoring_session.py接入Schema并补足错误字段路径；scenario_builder.py仅修Schema展开判断；node_capabilities.json补items/bindable及controlValue的字面量类型，studio目录副本由脚本同步。测试：test_patch_data_schema.py、requirements-test.txt。另同步版本、领域/开发文档和本轮需求任务验收；无视觉修改。

临时worker注入已移除，worker与开始快照逐字节一致。引擎配置、团队预算服务、Hermes宿主服务及5份backend/projects项目哈希共8项全部不变；固定SDK工作树干净。未操作5175或稳定副本，saved_project=null；未创建提交。

原始采集与临时脚本按先前要求清理，仅保留必要EVIDENCE摘要、无用户历史的Schema、保护哈希、测试结果和本报告。仓库外目录：/var/folders/hd/dc08m0b10yj0nxdlyk_y2d100000gn/T/oakegde-patch-schema-453y4t7d。

目录副本同步检查、git diff --check以及新增迭代文档链接检查均通过。前端视觉/构建未运行：本轮仅同步能力元数据副本，没有界面改动。
