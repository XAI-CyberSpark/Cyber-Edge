# dev.107 验收

维护日期：2026-10-09；状态：实现及自动验证完成，真实实验进行中。未提交、未发布。主依据：[需求](PRD.md)、[任务](TASKS.md)。

## 实现

1. node_capabilities.json 的 connection_contract 作为机器依据，brief登记和capabilities均返回。前后端按同一目录规则追踪显式LLM text/json/actions输出，通过非error连线到具体消费者；经过重新生成输出的模型/展示等节点时停止旧来源传播。GRAPH_CONNECTION_CONTRACT包含完整节点/连线路径、实际形状、下游期望与1–3个修法。patch提交有效事务后立即返回诊断，inspect据此阻止执行。auto输出依赖运行时，不静态假装确定。显式固定HMI可接文字，HMI valueField/$ref和MCP arguments检查已知字段，HMI检查目录类型；未声明的动态结果仍需trial。
2. 执行核验证据包含nodes，宿主为每个输出、动作回执、节点状态及其他证据域字段分配地址/原值绑定的evidence_id，同证据重试稳定。模型优先引用ID，宿主回填原字段及原值；仍检查请求引用、完整步骤覆盖、判定/问题一致性。pass可用evidence_ids列关键证据。旧引用保留严格匹配；invalid_evidence_quote提供有界原文/引用差异、长度、哈希与首差异位置。并未放宽核验或扩大250KB/45秒/两次核验预算。
3. PLAN_ASSERTION_WEAK提醒nodes.<id> exists不能证明执行过，建议equals success或实际输出/动作回执。PLAN_EVENT_UNMATCHED沿用eventOf和入口/可达等待配置，解释实际识别事件与期望；不解包text。两者只警告、不自动改写或放开锁定计划，动态路径仍需实际试跑。
4. 结构检查通过且无计划，inspect明确下一步；共享调用或时间超过50%仍无计划，宿主下一编排调用注入一次AUTHORING_PLAN_DUE。没有当前revision和图指纹对应的实际trial时，主动submit返回SUBMIT_TRIAL_REQUIRED。预算结束的不可应用草稿保留、已验证host finalize规则不变；总40调用/720秒及宿主780秒未加额度。

## 自动验证

- 后端：411项，402通过、9项既有可选环境测试跳过，46.242秒。
- 前端执行器相关73项（71通过、2项托管MCP条件跳过），通用流程13项通过，合计86项（84通过、2跳过）；TypeScript构建类型检查通过。
- 本轮后端新增9项、前端新增6项；既有“无试跑可主动提交”及“引用错误不记差异”的测试预期按新要求更新，同时验证宿主草稿和严格核验不放行。
- 初步集成发现证据深度全字段编号会令复杂候选超过既有250KB，改为每个输出/回执/节点状态及其他域直接字段编号，原始证据未裁剪。dev.106 A-Claude-1含编号回放包110186字节（静态占位request，仅用于规模检查）。

后端从backend目录运行（与用户命令等价；根目录的tests并不存在）：

```sh
PYTHONPATH=/tmp/oakegde-test-deps .venv_macos/bin/python -m unittest discover -s tests
```

前端根目录运行前两项，studio目录运行第三项：

```sh
node studio/scripts/test-scenario-execution.mjs authoring-progress.test assertion-contract.test input-contract.test scenario-execution.test repeated-flow.test durable-flow.test mcp-flow.test
node studio/scripts/test-general-flow.mjs
npx tsc -b
```

本轮没有安装或升级任何包。沿用/tmp/oakegde-test-deps：attrs26.1.0、jsonschema4.26.0、jsonschema-specifications2025.9.1、referencing0.37.0、rpds-py2026.9.1；共享解释器前后freeze复查在收尾记录。

## dev.106七份候选静态回放

只回放最终保存的图/计划，不调用模型或执行图；没有计划的候选不捏造计划检查。计数为这一快照的诊断条数，不是历史工具累计次数。

| 候选 | 有计划 | 新错误/警告命中 | 既有警告 |
|---|---|---|---|
| A-Claude-1 | 是 | {"PLAN_ASSERTION_WEAK": 1} | {"PLAN_WAITING_PATH": 1} |
| A-Claude-2 | 否 | 无 | 无 |
| A-Claude-3 | 是 | {"GRAPH_CONNECTION_CONTRACT": 1} | {"PLAN_WAITING_PATH": 4} |
| A-MiniMax-1 | 否 | 无 | 无 |
| C-Claude-1 | 是 | 无 | 无 |
| C-MiniMax-1 | 是 | 无 | 无 |
| C-MiniMax-2 | 是 | {"PLAN_EVENT_UNMATCHED": 3} | 无 |

A-Claude-3原来的三个上游笼统错误现在只剩一条实际输出来源路径；旧来源到新的模型节点已被替换，不将其继续误归因给更上游提取节点。A-Claude-2和A-MiniMax-1最终图没有新连接错误且无计划，不能把没有命中解读为历史构图过程无错误。两者若主动submit仍被新证据门槛阻止；本表不冒充历史模型重新修复结果。

## 真实实验方法

六次顺序single请求，开发8000、save_on_success=false、overwrite=false。A与C的MiniMax请求SHA256与dev.106完全一致（A:139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37；C:fe0acad0dd8f06a903eadf1257d23d453b69d0752a47e5e8f47e64393e58f845），Claude仅换provider_id/model。A只读项目快照与10条非空原始历史作为请求，未写原项目。模型配置名为claude-sonnet-5/MiniMax-M3，不能独立证明网关底层实现。

实现冻结后再实验；候选保存/tmp/oakegde-dev107-candidates。编排调用数为CompletionBudget含入口的实际attempt；图内模型/核验调用另计。首次test_plan分别记录第一次尝试与第一次有效锁定，调用编号为宿主当时completion_attempts，秒数从共享预算创建计时（接近客户端计时，但不混作完全同一时钟）。patch计含被拒绝的调用。诊断命中统计每次工具返回的条目，含重复反馈；不是唯一缺陷数。evidence_id_used只有收到核验报告中有效ID引用计数才记true，不能因为支持ID就宣称模型使用了它。
