# 验收与对比结果

2026-10-06｜dev.96｜未提交、未发布。仅开发8000；未重启服务、未操作5175，不修改用户项目或默认引擎配置。

## 分析与改动

实施前逐类分析及源码依据见[需求](PRD.md)。用户明确选择保持显式模型绑定，本轮不自动填值。源码变更只有：

- node_capability_service.py：编排专用能力视图补充字段类型、注册控制项、正确工具/模型字段与有效示例；改进动作和工具错误反馈。基础CATALOG与前端副本不变。
- hmi_control_contract.py：错误说明controlId字段位置、controlValue类型/范围/枚举，以及用remove_data_keys清理互斥旧字段；验证条件未改变。
- authoring_session.py：使用编排专用能力视图，明确base_revision来源，patch冲突提供具体ID与合并/原位修改/删除方式；事务约束保持。
- scenario_execution.py：模型绑定400错误附providerId/model区别与connections来源；不自动填写、替换或调用其他模型。
- 新增tests/test_authoring_contract_feedback.py：有效/无效配置、注册表不变、失败事务原子性与模型绑定保持回归。

## 测试

实施前正确目录运行6个新测试方法，出现7个子用例失败及2个缺字段错误，复现反馈缺口。首次从根目录运行曾因测试导入路径错误失败，不算缺陷复现。添加完整输入起点修正示例测试夹具后，合法HMI示例经原图校验通过，没有弱化断言。

命令（backend目录）：

```bash
.venv_macos/bin/python -m unittest tests.test_authoring_contract_feedback tests.test_authoring_session tests.test_node_capabilities tests.test_dynamic_hmi_bindings tests.test_general_flow
```

68项通过，3.683秒；git diff --check通过。未运行全后端、前端构建或真实设备；本轮没有前端改动。测试不等于真实场景成功。

## 一次真实复跑

直接使用上轮requests.json中的single请求，逐字段相等；请求SHA256为139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37。MiniMax-M3、10条非空对话、prompt=重新编排、agent_mode=single、save_on_success=false。仍为24次completion/480秒共享预算、540秒宿主期限；无追加重跑。

| 指标 | 上一轮 | 本轮 |
|---|---:|---:|
| 总耗时 | 265.793秒 | 411.471秒 |
| 节点/连线 | 28 / 29 | 28 / 28 |
| build_report.status | needs_changes | needs_changes |
| can_apply | false | false |
| 共享模型调用 | 24 | 24 |
| Patch调用 / 拒绝 | 19 / 9 | 14 / 6 |
| 全部工具拒绝 | 10 | 9 |
| 最终实质错误（不含未提交汇总） | 15 | 10 |
| 实际试跑 / 内容核验 | not_run / not_run | not_run / not_run |
| Discussion | 否 | 否 |

本次HMI字段与嵌套动作错误未出现在最终错误清单；没有出现缺base_revision、同ID重复写入或同时删除/写入节点的拒绝。但不存在边删除仍被拒绝一次，额外item字段错误出现4次。新候选LLM节点数为0（旧图为3），因此模型ID/文本驱动作错误的消失不能归因于提示修复；不能比较两图语义等价或宣称改善成功率。真实导航仍无已登记MCP接入，不能把界面仿真视作已实现真实导航。

本轮比上轮慢145.678秒，约54.8%；不能宣称耗时改善。仅一次模型样本，无法隔离服务波动和上下文/输出差异的影响。完整编排仍未通过。

## 剩余错误

- logic_strategy：多个输入需要明确汇合方式all/any。
- logic_memory_ready：多个输入需要明确汇合方式all/any。
- logic_pickup（logic_pickup）：仅支持 if 和 filter，循环与 switch 尚未实现。
- logic_strategy（logic_strategy）：仅支持 if 和 filter，循环与 switch 尚未实现。
- logic_boarded（logic_boarded）：仅支持 if 和 filter，循环与 switch 尚未实现。
- logic_memory_ready（logic_memory_ready）：仅支持 if 和 filter，循环与 switch 尚未实现。
- R1 引用了不存在的实现节点。
- R2 引用了不存在的实现节点。
- R3 引用了不存在的实现节点。
- R4 引用了不存在的实现节点。
- 智能体未完成最终提交；保留最新图与执行证据供继续修复。

## 旧24次调用用途统计

原始记录确认入口1+主编排23次模型调用。模型调用与工具调用不是一一对应。26次工具调用中：读取4、需求登记2、patch19、检查1，试跑/提交均0。

以时间相邻2–6ms的3组多工具合并、其余至少间隔1.3秒，推算23个主调用分组并与SDK计数核对：

| 用途 | 推算模型调用数 |
|---|---:|
| 对话入口 | 1 |
| 读取能力/图 | 3 |
| 需求登记及引用修正 | 2 |
| 初次搭图 | 3 |
| 结构检查 | 1 |
| 检查后修图 | 14 |
| 合计 | 24 |

旧日志没有completion ID和每次patch参数，以上是时间线推算，不能精确还原每次模型意图。检查后14次patch中7次成功、7次拒绝；其中同节点删除并写入重复2次、额外字段/层级错误2次，重复节点/缺type和position/删除不存在边各1次。初建另有缺base_revision拒绝2次，需求阶段引用拒绝1次。不把24次全部算成修错。

## 数据保护与证据

源码/项目/引擎配置SHA256对照仅发现上述4个源码文件变化；backend/projects/*.json与orchestration-engine.json保持。新测试与文档单独登记，未创建提交。预算相关authoring_team.py、hermes_authoring.py、hermes_worker.py无本轮变化。

仓库外证据目录：`/var/folders/hd/dc08m0b10yj0nxdlyk_y2d100000gn/T/oakegde-contracts-zit7071n`，包含request.json、single-sse.jsonl、comparison.json、OLD_CALLS.md、source.diff与实施前源码副本。上一轮证据沿用oakegde-compare目录。没有记录密钥或SDK私有推理。

需要用户决定的模型默认值已明确选择“保持显式绑定”，本轮无待决项。新出现的logic_type、joinMode、coverage错误及item字段反馈是后续候选排查范围，本轮不追加实现或模型调用。team耗时调查保持暂停。
