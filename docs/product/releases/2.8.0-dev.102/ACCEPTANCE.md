# dev.102 验收

状态：实现与指定验证完成；三次真实编排0/3可应用，稳定性目标未达到。未提交、未发布。维护日期：2026-10-08。

基线dev.101成功0/3；第3次检查通过但24调用耗尽，未trial/submit。

## 初始回归

新增8项测试在原代码上3失败/5错误；实现后8项通过。用户补充语义对应的2项测试也先失败后通过；本轮共13项新回归通过。最终后端全量362项（skipped=9），20项执行器及tsc均通过。跳过来自现有环境/显式协议测试条件，不将跳过计为通过。

## 预算审计

| 层 | 原值 | 本轮 |
|---|---|---|
| CompletionBudget | 24次/480秒 | 40次/720秒 |
| worker主管max_iterations | 24 | 40（共享预算仍包含入口及子角色） |
| 宿主hermes_events | 540秒 | 780秒 |
| Studio编排fetch/SSE | 无定时取消，仅用户取消 | 保持，无短期限 |
| Vite编排代理 | 未显式配置 | timeout/proxyTimeout均810秒 |
| SDK临时profile | Anthropic请求90/停滞100；custom请求默认1800 | 两者请求与停滞均720秒，仍受整轮期限约束 |
| 图执行/内容核验 | 150秒/候选、45秒/内容核验 | 独立验收预算，保持 |
| 子角色/入口轮数、委派次数 | 4/3/8 | 角色内局部边界，保持 |

SDK源码与共享依赖不改；无新增运行时依赖。

## 参数边界

Schema源为节点能力fields生成的GraphPatch，以及ExecutionPlan等Pydantic类型契约；测试计划不含节点data，不复制节点目录字段。Schema转换守卫只识别当前生成词汇，遇未知校验关键字拒绝归一化。多类型字段若已经接受字符串，保持字符串；不凭controlId猜类型。计数/明细记录在每次工具与最终build_report.diagnostics，并按提供商汇总。


## 宿主收尾口径（用户本轮补充）

host_finalized=true只标记宿主已触发trial/submit，失败时也为true。实际断言和独立内容核验均通过才调用submit；失败停止追加编排决策，通过原incomplete_result保留图与全部执行/核验证据。报告finalization包含触发原因、revision、失败阶段、剩余时间，host_trial_model_calls与review_calls单独计数，不占40次编排completion。核验error/not_run最多重试一次，复用原执行；needs_changes不重抽。三次实际执行上限不变。

兜底保守预留完整图执行150秒、两次核验各45秒、5秒交付宽限，共245秒。宿主将本次780秒单调时钟deadline传给worker；不足则记录“剩余时间不足，未执行兜底”，host_finalized=false。780秒是硬总限，预留并非对外部调用或调度时延的保证。

## 请求恢复与隔离

上一轮临时目录已经不存在；从只读开发项目恢复候选请求，经SHA256完全匹配后才复跑：139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37。10条历史、MiniMax-M3、prompt=重新编排、single、save_on_success=false。启动的是原先未运行的8000开发服务，未操作5175。6项保护文件为引擎配置及5份项目，阶段复查全部未变。


## 验证命令与结果

后端目录执行用户指定命令：

```bash
.venv_macos/bin/python -c 'import sys,unittest;sys.path.append("../.demo-runtime/mcp-venv/lib/python3.12/site-packages");unittest.main(module=None,argv=["unittest","discover","-s","tests","-q"])'
```

最终362项、25.177秒，OK（skipped=9）；353项实际通过。9项跳过依赖未启用的独立MCP协议/stdio测试环境，本轮没有放宽或删改断言。新增13项回归包括Schema守卫、精确归一化边界、错误层级提示、完整trial/核验重试、时间不足跳过及worker真实入口接线（合成SDK，非模型质量验证）。最初8项为3失败/5错误；用户补充口径的2项测试先2失败，再通过。

Studio：`node node_modules/typescript/bin/tsc -b`退出0；`node scripts/test-scenario-execution.mjs`20通过/0失败。无视觉或文字排版修改。

文档检查`node studio/scripts/check-docs.mjs`仍为42错误/24警告；利用修改前Markdown快照在同一检查器下复核，前后均66项且新增0项。本轮新增/修改链接18个均存在。原文档历史链接、路径及格式问题不混入本轮修复。`git diff --check`通过（有既有CRLF提示）。


## 三次真实复跑（同请求、连续、代码冻结）

| 轮次 | 耗时/秒 | 节点/边 | 编排调用 | patch总数/拒绝 | normalizations | host_finalized | status | can_apply | 最终问题 |
|---|---:|---|---:|---|---:|---|---|---|---|
| 1 | 780.171 | 不可得 | 不可得 | 23/4 | 不可得 | 无最终报告 | host_timeout（无build_report） | false，无结果可应用 | 场景搭建时宿主时间耗尽 |
| 2 | 406.650 | 18/21 | 40/40 | 18/5 | 35 | false | needs_changes | false | waiting/completed不符，结构化模型输出失败，HTTP529 |
| 3 | 245.480 | 32/37 | 40/40 | 24/11 | 0 | false | needs_changes | false | 11个节点不可达，未完成提交 |

runtime_verified：第2/3次false；第1次无报告，不能声称已经验证。成功率0/3，低于2/3。本轮不追加修复，也没有第四次重跑。三次都进入build，不是discussion。

第1次只收到SSE error，没有最终result。末次宿主检查点：tool_calls=32、revision=19、last_tool=oakegde_read_graph、last_tool_ok=true、brief_registered=true。309.3秒后没有新工具进度，780.171秒宿主超时；没有原始API传输诊断，不能进一步断言是模型思考、网关还是连接等待。23次patch来自SSE进度，4次拒绝由宿主白名单日志argument_contract确认，与19次成功修订相符。没有节点快照、编排completion计数或normalizations统计，必须记“不可得”，不是零；这是现有超时报告未回传候选/计数的限制。未返回saved_project，也未写任何项目。

第2次正常模型触发trial一次，真实图模型调用7次，执行失败故内容核验0次；宿主触发调用0次（host_trial_model_calls=0、review_calls=0）。第3次模型触发trial两次，各0次图模型调用，在到达模型前分别因表达式错误和等待不符失败；内容核验0次，宿主调用0次。没有达到“最新检查通过、有计划、尚未trial”的宿主收尾条件：第2次已试跑；第3次后期检查失败；第1次最近修改后检查已失效且没有成功登记测试计划。三次均未观察到宿主兜底触发，真实模型下的兜底成功仍无样本；相关逻辑由自动回归和合成SDK入口测试验证，不用它们冒充真实成功。

采集脚本最初把末尾done耗时事件覆盖了result引用；已从完整SSE事件中的result重建第2/3次统计，没有重新发请求，没有修改产品代码。第1次确实没有result，与此采集问题不同。

### 与dev.101对比

| 指标 | dev.101 | dev.102 |
|---|---|---|
| 预算 | 24次/480秒，宿主540秒 | 40次/720秒，宿主780秒 |
| 三次can_apply=true | 0/3 | 0/3 |
| 耗时/秒 | 321.917 / 430.787 / 206.158 | 780.171 / 406.650 / 245.480 |
| 节点/边 | 25/28、25/27、19/26 | 不可得、18/21、32/37 |
| patch总数/拒绝 | 6/0、11/2、10/0 | 23/4、18/5、24/11 |
| 归一化 | 无item/$text归一化 | 不可得、35、0 |

每轮均同一请求但模型输出不同，这不是保证可复现的确定性性能对照。不能把一次35次格式修正等同于35个已解决业务错误，也不能宣称拒绝率改善。

## 直接失败原因归类与建议（仅记录，不实施）

| 轮次 | 分类 | 证据与直接原因 | 后续建议 |
|---|---|---|---|
| 1 | 预算；宿主流程的观测限制 | 构建仍未结束即780秒超时；最后工具成功后约471秒无新工具结果。无最终候选/计数，仅有revision19检查点。 | 分开测量单次API等待与整体预算，增加可恢复的候选/计数检查点；不能仅继续放大总预算。现有证据不足以归咎模型或网关。 |
| 2 | 契约/说明、模型能力/服务、预算 | wait_boarding真实waiting却期望completed；2次修订不满足原有受限规则；strategy_llm未返回可执行结构化结果，intent_llm上游HTTP529；40次编排耗尽。节点/边编辑字段错层产生5次patch拒绝。 | 依据实际waiting证据生成符合约束的修订；将按控件ID确定的值类型进一步表达在Schema中，独立评估模型格式与上游可用性。529不等于密钥失效，不自动改绑/重试策略。 |
| 3 | 模型能力、契约/说明、预算 | 先把state当成表达式全局变量（应从input读取），随后wait_school等待与completed不符。修图出现删不存在的边、同patch删写同边、7次顶层item字段拒绝；后续图有11个不可达节点，40次耗尽。 | 保持窄解包边界，研究如何让模型使用正确事务结构与连线修复；考虑把可静态发现的表达式变量问题提前反馈。现有日志未保存未归一化的原始arguments，不能进一步判定7次item具体形状。 |

宿主没有绕过试跑/核验或为了可应用而自动改图、改测试。第2/3次没有“只差submit”的已通过候选，因此增加宿主兜底也不能合法放行这些结果。

### Schema与归一化的实际效果

第2次35次均为工具入口记录的item/$text规则修正，按provider汇总minimax=35（第3次minimax=0，第1次未知）；这些是变换事件数，包含后来被事务校验拒绝的调用，不是去重字段数。例：`systemPrompt: {"$text":"…"}`→字符串。`controlValue: {"$text":"24"}`→字符串`"24"`，因为目录原类型是string/number/boolean联合，不能猜成number；HMI检查仍据注册控件拒绝错误类型，模型后来需自行修正。测试初始controls.value为Any，没有明确Schema目标类型，同样不自动拆包。这里可考虑未来按注册ID产生条件Schema，本轮未实现语义猜测。

数值专用Schema下`{"$text":"22"}`→22与布尔专用Schema下`{"$text":"true"}`→true已由单元测试验证。原样保留转换失败、多键、未声明类型及无法完整通过patch Schema的顶层对象；没有拓扑或场景特判。第3次item字段仍被拒绝是授权边界的正常结果，不以扩大兼容来追求通过。

## 最终错误原文

### 第1次

1. 本轮场景编排未完成。停止阶段：场景搭建。原因：本轮时间预算已用完。当前项目未被替换。

### 第2次

1. 实际试跑未通过；正常完整路径-临近放学接娃回家第1步：状态waiting，期望completed
2. 实际试跑未通过；等待节点wait_boarding（wait），prompt='正在前往学校，请等待后排座椅与车门信号…'，等待输入={"eventName": "message", "inputType": "any", "match": "any", "answers": [], "aliases": [], "hintInputs": []}；如果停下等待是设计意图，将该步expected_status改为waiting（提交测试计划时字段名为status），并在下一步提供回答；否则修改图。由AI判断，不自动改测试。仅AI生成计划且有本次不匹配证据时允许受限修订，原步骤/断言保留；调用方计划仍锁定。
3. 实际试跑未通过；非临近时间走常走路线第1步：状态waiting，期望completed
4. 实际试跑未通过；等待节点wait_boarding（wait），prompt='正在前往学校，请等待后排座椅与车门信号…'，等待输入={"eventName": "message", "inputType": "any", "match": "any", "answers": [], "aliases": [], "hintInputs": []}；如果停下等待是设计意图，将该步expected_status改为waiting（提交测试计划时字段名为status），并在下一步提供回答；否则修改图。由AI判断，不自动改测试。仅AI生成计划且有本次不匹配证据时允许受限修订，原步骤/断言保留；调用方计划仍锁定。
5. 实际试跑未通过；儿童未上车不开启舒适配置第1步：状态failed，期望completed
6. 实际试跑未通过；节点strategy_llm：模型推理未完成：模型没有返回可执行的结构化结果，未使用规则替代。。未使用规则回退。
7. 实际试跑未通过；断言['nodes', 'nav_to_school'] equals success，实际skipped
8. 实际试跑未通过；触发别名接娃第1步：状态failed，期望completed
9. 实际试跑未通过；节点intent_llm：模型推理未完成：MiniMax 调用失败（HTTP 529），请检查 API 密钥、模型权限或额度；未切换到其他模型。。未使用规则回退。
10. 实际试跑未通过；断言['nodes', 'nav_to_school'] equals success，实际skipped
11. 智能体未完成最终提交；保留最新图与执行证据供继续修复。

### 第3次

1. logic_has_memory：无法从输入起点到达。
2. state_store：无法从输入起点到达。
3. nav_to_school_time：无法从输入起点到达。
4. nav_to_school_regular：无法从输入起点到达。
5. output_depart：无法从输入起点到达。
6. wait_school：无法从输入起点到达。
7. wait_dismiss：无法从输入起点到达。
8. wait_route：无法从输入起点到达。
9. wait_home：无法从输入起点到达。
10. state_initial_setup：无法从输入起点到达。
11. llm_eta：无法从输入起点到达。
12. 智能体未完成最终提交；保留最新图与执行证据供继续修复。


第3次最终不可达清单来自最终revision13报告；历史revision6的未知变量及revision8的waiting失败是修复过程证据，不冒充最终图的试跑结果。最新图未实际复验通过。

## 本轮文件与差异摘要

- `backend/app/services/authoring_team.py`：40/720默认预算；原trial/核验重试/submit组成的宿主收尾，245秒预留，不修改图或测试。
- `backend/app/agents/hermes_worker.py`：主管40轮、临时profile期限、下一次编排调用前及循环结束检查；诊断/来源/独立调用计数汇总。
- `backend/app/services/hermes_authoring.py`：780秒总时限与传给worker的单调时钟deadline。
- `backend/app/services/hermes_tool_arguments.py`：生成Schema驱动的窄归一化守卫，保留原_ref还原，无SDK或依赖变更。
- `backend/app/services/authoring_session.py`：逐调用归一化明细，测试计划错误路径与层级示例。
- `backend/app/services/scenario_execution.py`、`execution_review.py`：沿用150/45秒数值，提取为可共用的预留依据；执行失败/超时也返回实际调用计数。
- `studio/vite.config.ts`：编排SSE代理timeout/proxyTimeout均810秒；没有页面布局、颜色或文案改动。
- `backend/tests/test_authoring_budget_repairs.py`：13项新增回归，包含生成Schema一致性与合成worker接线测试。
- VERSION、CHANGELOG、CONTEXT、docs/README、ADR0005/0009、节点契约、当前架构、开发配置/开发/测试/维护/更新及本迭代三件套：同步预算、限制与实际验收结果。工作区此前已有大量改动，本清单仅指相对本轮开始快照的差异，不把全仓库dirty diff归入本轮。

## 保护、清理与发布状态

6项保护哈希（引擎配置及5份backend/projects文件）全部一致；三次期间73份编排相关源码哈希全部一致。固定Hermes SDK git status为空，未修改SDK。未操作stable目录、5175、prepare或Git提交。第2/3次saved_project=null；第1次无结果且所有项目哈希不变。开发8000用于测试，日常实例未更新。

仓库外证据保留聚合EVIDENCE、红/绿测试输出、源码差异及保护哈希；原始SSE、完整候选、请求副本、临时复跑/统计脚本和控制台诊断日志在收尾移除。没有向生产源码注入临时日志。新增diagnostics字段是本轮用户要求保留的产品诊断功能。

结论：dev.102实现与本地回归完成，真实稳定性仍未达标。预算放宽和有限格式修正没有解决持续构图/测试计划错误及上游失败；不声称编排已经恢复、已发布或已更新日常Studio。下一步只列建议，等待另定范围。
