# dev.103 验收

维护日期：2026-10-08。状态：实现与指定验证完成；A组0/3可应用，B组两次均停留讨论，稳定编排目标未达成。未提交、未发布。主依据：[需求](PRD.md)及实际测试记录。

真实复跑已完成；实现、模拟验证与真实模型结果分别列出，不能声明编排已恢复。

## 实现与本地测试

新增10项通用回归：初始8项为7错误/1通过；调用超时默认常量先失败；看门狗关闭socket的计数测试先失败（0≠1），均在实现后通过。实际固定SDK慢服务先失败（请求未中断），实现后MiniMax-M3/OpenAI gpt-5.2/Anthropic claude-sonnet-5三协议都超时一次后正常重试成功。测试用1秒配置，第一次响应延迟5秒，默认仍150秒；不是三种云模型真实性能测试。SDK可能先抛socket连接异常而非TimeoutError，统计同时检查其stale计数增量，无SDK修改。

后端（backend目录）：
```sh
.venv_macos/bin/python -c 'import sys,unittest;sys.path.append("../.demo-runtime/mcp-venv/lib/python3.12/site-packages");unittest.main(module=None,argv=["unittest","discover","-s","tests","-q"])'
```
结果：372项，363通过、9跳过，24.991秒。跳过来自已有MCP实连接/显式环境开关，未放宽断言或跳过本轮测试。首轮全量失败为旧worker夹具缺新增配置字段和诊断新增计数后的精确断言；更新夹具与预期后全绿。

Studio目录：`./node_modules/.bin/tsc -b`通过；`node scripts/test-scenario-execution.mjs`20/20通过。后端目录手动` .venv_macos/bin/python tests/check_authoring_timeout_sdk.py`仅占开发8000合成服务，三协议通过，结束释放端口后恢复开发后端。`git diff --check`通过（原有CRLF提示）。

文档检查仍42错误/24警告，与dev.102记录相同；本轮涉及的CONCEPTS/CONFIGURATION/API页均0错误，新内容未引入新的文档检查项。原历史链接/路径问题未混入本轮。

## 实验约束

仅开发8000，所有真实请求save_on_success=false，不写项目。74份后端实现/提示词/目录源码冻结，逐次复查；A请求JSON规范化SHA256为139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37，与dev.102完全一致。B为同provider/model/single设置、无历史/current_project=null/project_name=null，提示“上车后根据当前车内温度自动调节空调，并用语音播报调节结果”，请求SHA256 da8a737d3e746f2e4407c65155cf5bd3d61982720308abaab68f64003c5a69a4。

计数：编排调用含入口与Hermes重试，patch总数包含拒绝；normalizations按变换事件计数；status_revisions指独立status修改/删除的接受次数；overload_retries仅图LLM实际额外attempt。正常结果can_apply取build_report，错误终态不可应用。五次结果如下。

## A组结果

| 次数 | 秒 | 节点/边 | 编排调用 | patch总/拒绝 | 归一化 | status修订 | 单次超时 | 过载重试 | host_finalized | status | can_apply |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| A1 | 470.552 | 19/26 | 40 | 25/4 | 72 | 0 | 0 | 0 | false | needs_input | false |
| A2 | 621.912 | 19/25 | 36 | 11/2 | 0 | 0 | 0 | 0 | false | needs_changes | false |
| A3 | 234.560 | 30/38 | 40 | 21/2 | 15 | 0 | 0 | 0 | false | needs_changes | false |

## B组结果

| 次数 | 秒 | 节点/边 | 编排调用 | patch总/拒绝 | 归一化 | status修订 | 单次超时 | 过载重试 | host_finalized | status | can_apply |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| B1 | 28.464 | 0/0 | 1 | 0/0 | 0 | 0 | 0 | 0 | false | discussion | false |
| B2 | 8.344 | 0/0 | 1 | 0/0 | 0 | 0 | 0 | 0 | false | discussion | false |

A组MiniMax-M3 single可应用0/3，与dev.102的0/3相同；本轮没有host_timeout，最长621.912秒，但不能据此推断成功率改善。A2/A3登记的所有测试步骤status均为空（序列化为null），not_failed默认已生效；没有发生status独立修订。五次未观测到单次API超时或图LLM过载，相关路径仅有合成验证。所有host_finalized=false；未获得真实宿主兜底成功样本。A1/A2/A3共实际执行0/1/3次trial，图模型调用0/1/2次；独立内容核验均0次，因执行断言未通过。A3最后图修改使之前试跑证据失效，最终execution=not_run不代表它从未试跑。

B组不是搭建器失败样本：两次均status=discussion、errors=[]、chat_reply非空，入口只有1次调用；都未执行brief/patch/inspect/trial。B1要求先确定温度分段、上车触发、播报风格等；B2要求先确定舒适温度/阈值、播报内容和是否自动执行。因此“简单编排稳定成功”的目标没有得到验证，不能将正常讨论完成计为构建成功。没有追加“开始”或改提示词来改变实验条件。

## 最终错误与直接原因

### A1

- parse_memory2（parse_memory2）：文字或数据输出不能直接驱动车控/工具。模型负责决策动作时配置set_data.outputFormat=actions；保留json输出时，只能按已支持的显式HMI字段/$ref或MCP参数绑定组合，不得将原文当普通工具/车控动作。检查所有可达下游动作节点，不只是下一跳；不要只改systemPrompt而遗漏outputFormat。
- urgency_logic（urgency_logic）：多分支必须明确 true/false 出口，不能猜测连线含义。
- both_ready2（both_ready2）：多分支必须明确 true/false 出口，不能猜测连线含义。
- comfort_plan（comfort_plan）：文字或数据输出不能直接驱动车控/工具。模型负责决策动作时配置set_data.outputFormat=actions；保留json输出时，只能按已支持的显式HMI字段/$ref或MCP参数绑定组合，不得将原文当普通工具/车控动作。检查所有可达下游动作节点，不只是下一跳；不要只改systemPrompt而遗漏outputFormat。
- child_lock3：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- ac_set3：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- seat_heat3：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- ambient_eye3：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。
- 连线 target 不存在: child_lock2
- 连线 target 不存在: ac_set2
- 连线 target 不存在: seat_heat2
- 连线 target 不存在: ambient_eye2
- 待确认：记忆库目前是否已经有接小孩放学相关数据（学校、放学时间、常走路线、家庭住址）可被提取，还是完全由本次首次询问录入？
- 智能体未完成最终提交；保留最新图与执行证据供继续修复。
### A2

- 实际试跑未通过；有记忆_正常上车_开启舒适配置_切回家第1步：状态waiting，期望not_failed
- 实际试跑未通过；断言['nodes', 'wait_ask_info'] equals skipped，实际waiting
- 实际试跑未通过；上车条件缺失_不进入舒适配置第1步：状态waiting，期望not_failed
- 实际试跑未通过；断言['nodes', 'wait_ask_info'] equals skipped，实际waiting

试跑证据（原始失败摘要）：

- trial 1：revision=9，status=failed，model_calls=1，runtime_verified=False。
  - 有记忆_正常上车_开启舒适配置_切回家第1步：状态waiting，期望not_failed
  - 断言['nodes', 'wait_ask_info'] equals skipped，实际waiting
  - 上车条件缺失_不进入舒适配置第1步：状态waiting，期望not_failed
  - 断言['nodes', 'wait_ask_info'] equals skipped，实际waiting
### A3

- 候选尚未实际试跑通过。
- 智能体未完成最终提交；保留最新图与执行证据供继续修复。

试跑证据（原始失败摘要）：

- trial 1：revision=10，status=failed，model_calls=0，runtime_verified=False。
  - 首次触发·完整流程第1步：状态failed，期望not_failed
  - 节点has_mem_check：判断条件不可执行：未知变量：state，请从input读取字段
  - 节点combine_seat_door：判断条件不可执行：未知变量：outputs，请从input读取字段
  - 断言['state', 'school_name'] exists None，实际None
  - 上车信号缺失·不启用配置第1步：状态failed，期望not_failed
  - 节点has_mem_check：判断条件不可执行：未知变量：state，请从input读取字段
  - 节点combine_seat_door：判断条件不可执行：未知变量：outputs，请从input读取字段
  - 断言['outputs', 'route_strategy'] exists None，实际None
- trial 2：revision=12，status=failed，model_calls=2，runtime_verified=False。
  - 首次触发·完整流程第1步：状态failed，期望not_failed
  - 节点intent_judge：模型推理未完成：模型没有返回可执行的结构化结果，未使用规则替代。。未使用规则回退。
  - 断言['state', 'school_name'] exists None，实际None
  - 上车信号缺失·不启用配置第1步：状态failed，期望not_failed
  - 节点intent_judge：模型推理未完成：模型没有返回可执行的结构化结果，未使用规则替代。。未使用规则回退。
  - 断言['outputs', 'route_strategy'] exists None，实际None
- trial 3：revision=16，status=failed，model_calls=0，runtime_verified=False。
  - 首次触发·完整流程第1步：状态failed，期望not_failed
  - 节点has_mem_check：判断条件执行失败：读取字段时上游数据缺失
  - 断言['state', 'school_name'] exists None，实际None
  - 断言['state', 'has_memory'] not_exists None，实际false
  - 上车信号缺失·不启用配置第1步：状态failed，期望not_failed
  - 节点has_mem_check：判断条件执行失败：读取字段时上游数据缺失
  - 断言['outputs', 'route_strategy'] exists None，实际None
### B1

无构建错误列表；discussion，没有进入构建。
### B2

无构建错误列表；discussion，没有进入构建。

## 失败分析与下一步建议（未实施）

| 次数 | 分类 | 直接原因与证据 | 下一步建议 |
|---|---|---|---|
| A1 | 模型能力，预算 | 25次patch、4次拒绝，最终仍有JSON/动作输出契约错误、分支出口缺失、旧ID悬空引用和4节点不可达；brief带阻塞问题，且从未登记计划。40次编排预算耗尽。新增删边警告实际触发2次，模型仍未修完。 | 先评估模型能否稳定按工具反馈修复ID/分支与输出类型；核对已问明问题仍被重新登记为阻塞项的原因。不要继续仅加预算。 |
| A2 | 模型能力/契约说明 | 三个case的记忆彼此隔离，却在第2/3个case假设已有记忆，断言wait_ask_info=skipped，实际waiting；status默认not_failed本身通过。试跑后四次尝试改计划均超出允许范围而被拒绝。 | 在生成计划时明确每个case独立初始化记忆，使用同case步骤先建立前置条件；不要让宿主自动搬步骤或放宽断言。把“状态已通过、实际值断言失败”分开反馈，避免现有前缀误导。 |
| A3 | 模型能力、契约说明、预算 | trial1引用禁止的全局state/outputs；trial2模型未返回可执行结构化结果；trial3读取缺失上游字段及断言不符。之后继续改图至revision19，最终结构检查可过但无该版本执行证据；三次trial及40次编排均耗尽。 | 考虑把已可静态识别的表达式变量错误前置inspect，减少无效trial；补清楚节点输入/绑定与输出格式的对应示例，再比较模型遵约能力。保持真实试跑/内容核验门槛。 |
| B1/B2 | 宿主流程（现有入口路由门槛），模型语义决策 | 原prompt被视为需要讨论/澄清，未交接builder。与复杂图预算无关。 | 下一轮另设“明确现在生成”的基准请求，或由用户决定一句话需求应否直接搭建；不偷改本轮相同请求，也不以关键词特判路由。 |

依据：`studio/src/domain/scenarioExecution.ts:59–78`在每个case新建world/session/memories；`:108`省略status只拒绝failed但实际值断言仍需全部通过。`backend/app/services/scenario_execution.py:167`会给任何失败步添加状态前缀，所以A2“waiting，期望not_failed”并不表示状态判定失败（此既有反馈问题本轮只记录）。`backend/app/services/authoring_intake.py:15–17`要求明确构建意图才build、不明确时discuss。`backend/app/services/authoring_team.py:299–303`要求有效未试跑计划/最新检查，且三次trial未用尽；A1无计划、A2已有失败trial且模型直接submit、A3三次trial耗尽，均不满足兜底条件，未发现宿主违规跳过已满足条件的证据。

A2原始工具trace不保留模型参数，只能确认四次计划修订未通过“仅status变化/原waiting例外”校验，不能凭空声称具体删改了哪个断言。此轮未增加参数采集或兼容修复。

## 改动清单

- `backend/app/schemas/execution_schema.py`、`backend/app/agents/hermes_authoring.md`：status的Schema/提示说明与省略示例。
- `backend/app/services/authoring_session.py`：AI计划独立status修订、缓存/计数、删边不可达警告及trial过载汇总字段；调用方锁保持。
- `backend/app/services/scenario_execution.py`、`model_providers.py`：保留上游真实HTTP状态，529/503等待2秒只重试一次，实际attempt及overload_retries计数。
- `backend/app/services/hermes_authoring.py`、`authoring_team.py`、`backend/app/agents/hermes_worker.py`：150秒可配置调用期限、超时统计与恢复快照通道；整轮预算不变。
- 新增`backend/app/services/authoring_checkpoint.py`；`authoring_diagnostics.py`与`backend/app/api/orchestration.py`返回白名单计数/超时候选，不保存、不应用。
- `backend/app/services/node_capability_service.py`：不可达节点补边/删除建议及patch连通性差异计算。
- 新增`backend/tests/test_authoring_reliability.py`、`check_authoring_timeout_sdk.py`；更新`test_authoring_trial_repairs.py`、`test_authoring_intake_worker.py`、`test_authoring_diagnostics.py`、`test_hermes_timeout_diagnostics.py`以反映新的允许边界/IPC/诊断字段。
- VERSION、CHANGELOG、CONTEXT、docs/README、开发配置/概念/测试/维护/更新、API、NODE_CONTRACTS、ADR0005/0009及本目录同步。未修改Studio生产代码或视觉。

## 保护、清理和限制

保护基线6/6 SHA256一致：引擎配置及backend/projects中的5个文件；实验源码74/74冻结哈希一致。逐次请求结束和最终均核对。SDK仍为d0288be5b3330d2442e3907185b8e9d0958297bb，git status为空。详细哈希与精简指标见[EVIDENCE.json](EVIDENCE.json)。没有创建git提交，没有修改/重启5175或stable，没有prepare，未升级共享运行时。

未完成稳定性目标；B未进入构建。真实五次没有触发150秒单请求超时、host_timeout恢复或529/503重试，只能报告合成测试通过；不以合成验证替代云服务样本。9项既有可选测试跳过，原文档42错误/24警告仍存在。保持单显式模型绑定，没有回退模型，也没有为两类场景设置特判或固定拓扑。

保护复核后已删除临时请求、完整候选、SSE/SDK/服务日志、诊断脚本及临时基线副本；仅保留本报告、精简EVIDENCE和测试结果，不把项目数据写回仓库或日常实例。开发8000保留运行，未操作日常5175。
