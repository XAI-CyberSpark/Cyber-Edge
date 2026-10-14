# dev.111 验收

维护日期：2026-10-14。状态：机制、本地检索回归及真实十例静态编排测评完成；编排7/10符合，质量未达目标，未发布。用途：分别登记编排阶段机制、本地真实检索与真实改写效果。主依据：[需求](PRD.md)、[任务](TASKS.md)、[本轮十例](TEST_CASES.md)、[历史检索验收](../2.8.0-dev.110/ACCEPTANCE.md)。

环境：Windows、现有host-lite Python、隔离官方BGE CPU环境；实施/测评时为分支 `codex/orchestration-optimization` 未提交工作区。用户后续授权的源码快照范围与复验见文末。日常5175、原开发运行实例、共享依赖与用户数据保持。

| 验收项 | 预期 | 当前结果 |
| --- | --- | --- |
| 意图→检索→选择顺序 | 理解无目录，原文与改写附在选择上下文，正常新协议独立select | 模型/HTTP替身通过；改写与来源写入report/project.meta |
| 查询/引用/选择合同 | 唯一完整需求映射、有效非空查询/纯约束null、引文逐字、已登记ID | 有效/无效回归通过；生产旧格式拒绝，纯约束不正向检索 |
| 阈值/K政策 | 每意图0.35/32，普通候选硬K，强制项例外，无字符裁剪 | 有效/无效参数、ties、长记录、已有引用、合并64候选等通过 |
| 兼容/权限/降级 | 自定义旧适配器、完整目录、来源/权限、安全失败仍有效 | 相关回归通过；旧适配器明确兼容标签、生产不绕过 |
| 计量与模型参数 | select计入阶段/失败用量，总8保留、DeepSeek select16384 | 替身与独立HTTP probe通过，显式thinking保持，select失败按实际stage记录 |
| 真实BGE固定回归 | 同64例、4未知排除、60已知完整候选与完整可见池分别报告 | 通过本轮固定回归；优先候选60/60完整，目录可见池60/60；不是总体99.9%或真实改写效果 |
| 真实生成模型改写与静态编排 | 独立于模型替身与BGE检索，不计执行成功 | DeepSeek＋真实BGE固定十例7/10符合；图6/7、缺口/澄清1/3，未达质量目标，见本轮十例 |

固定数据集已用于诊断，本轮为回归而非盲测。总体99.9%目标未验证；当前十例JSON已符合、局部编辑及缺口交付仍失败，历史失败工件和dev.110全量12项Windows/夹具残余保留。本轮测评本身未创建提交、发布或日常实例更新；后续源码快照单列。

## 真实BGE筛选政策对照

根代理运行 `scripts/evaluate_capability_retrieval.py --modes hybrid --min-score 0.35 --top-k 32 --baseline .demo-runtime/optimization-dev111/baseline-capability_selection.py --output .demo-runtime/optimization-dev111/retrieval-final.json`，退出0。只使用原64例查询，不调用生成模型、不改写gold；4未知例不进入60个已知任务分母。模型指纹 `c1dc06b0cb96dc4397f57a56cb7b9c99862b1dd0a323c5aa5bd718f26628b54e` 与dev.110一致。

| 政策（同原始查询） | 必需能力完整候选率 | 必需单位 | 已知任务平均候选 |
| --- | --- | --- | --- |
| 冻结dev.110的6000字符候选预算 | 55/60（91.67%） | 149/156 | 11.57 |
| dev.110仅取消裁剪对照（历史，无阈值/K） | 60/60（100%） | 156/156 | 54.25 |
| 当前相对阈值0.35＋普通Top-K32 | 60/60（100%） | 156/156 | 31.10 |

当前候选范围27–36，超过32的条目来自精确ID/已有引用的强制保留；所有普通候选均满足阈值与K，已有引用全部保留，已知任务无降级或回退。完整目录另计可见池，100%候选率本身不借目录兜底；候选也包含非必需能力，不能称Precision100%。最终Recall@10为94.456%、nDCG@10为0.867，与冻结预算基线一致；不能把扩大候选范围称前排排序已由意图改写改善。

首轮 `.demo-runtime/optimization-dev111/retrieval-raw-regression.json` 曾显示有分已有引用移到末尾导致前排排序回退。已补RED回归并保留有分引用在融合排序中的位置，无分引用才追加；首轮证据不覆盖，最终新工件对应修后源码。

本轮平均完整发现视图字符约35,011→46,773（全64查询口径），不等于整个新流程token或费用。该检索回归不调用生成模型，报告明确 `intent_rewrite_evaluation.executed=false`、`query_source=dataset_original_queries`。后续真实十例用量另计，尚无成对改写收益/成本验证；总体目标仍 `population_target_validated=false`。

## 阶段与集成证据

根代理最终从backend运行host-lite unittest的19模块：intent_selection_pipeline、authoring_context、builder_stage_protocol、builder_hybrid_recall、capability_availability、scenario_builder、scenario_builder_recovery、model_providers、deepseek_provider、orchestration_logging、incremental_provider_usage、provider_completion_diagnostics、builder_provider_schema、capability_selection、hybrid_capability_recall、capability_embeddings、capability_retrieval_evaluation、capability_retrieval_dataset、mcp_selected_discovery。UTF-8及既有隔离test-deps启用；无安装/升级依赖。

`targeted-final-tests.txt`：248项47.558秒，**246通过、2失败、0错误/跳过**，退出1。残余为 `test_configuration_only_saves_after_validation_private_atomic_and_restart_readable` 与 `test_gateway_configuration_keeps_endpoint_and_key_isolated`，Windows文件模式0o666不能满足POSIX0o600断言；与dev.110 `full-backend-tests.txt`两个既有失败同名同因，未改或跳过断言。不能称全部测试通过，原全量12项残余仍未解决。本轮不重复全后端/前端构建，未涉及界面。

TDD工件保留builder-red/provenance-red、threshold-policy-red、required-ref-order-red与evaluation-red-confirmed；最终builder-green-final14项、evaluation-final-green12项及上述根代理整合输出均保存。新增pipeline涵盖纯约束、改写空白、非法映射、生产旧格式拒绝、显式ID、select未知能力重试、报告来源、外部旧协议兼容、32＋32并集无全局截K。

两个独立只读审查无未关闭P1/P2：`independent-flow-tests.txt`11项通过、`independent-union-probe.txt`验证候选64项及来源/局部分数；另一HTTP替身probe验证select对象根、DeepSeek16384和显式thinking、8次跨阶段实际POST后第9次被拒、select失败stage/usage及生产旧合同两次拒绝，退出0、真实网络0。探针不是实际生成模型理解或改写质量测评。

最终证据绑定为 `.demo-runtime/optimization-dev111/final-artifact-bindings.json`，核对金标/冻结基线/模型指纹、当前源码/迭代文档、真实检索与测试工件；保护前后models.json、capability-library.sqlite3、model-providers.json及金标SHA保持，日常副本与共享依赖未操作。新增迭代本地链接与 `git diff --check`收尾检查通过（既有CRLF提示单列，不是差异错误）。未重载运行实例；当前源码实现需按既有开发启动流程加载，不能把prepare或源码修改当作日常实例已更新。

## 上下文体积对照补充（2026-10-14）

用户追问当前上下文相较未优化前的提升。只读探针 `.demo-runtime/optimization-dev111/context-size-probe.py` 运行退出0，最终输出 `context-size-probe-final.json`；首次未计提交指令的 `context-size-probe.json`保留，最终工件补齐生产 `_complete` 的submit_scenario提示。使用当前相同原文/brief/系统提示与无历史、无既有项目的三个固定夹具，只改变全量目录与完整字段Schema为选中契约及其投影Schema。计量为compact JSON Unicode字符/UTF-8字节，不是提供商token；能力选择是预登记手工固定契约，不是生成模型输出。

| 固定夹具 | 全量目录对照的构图输入字符 | 当前已选契约构图输入字符 | 减少 |
| --- | --- | --- | --- |
| 显示固定文字 | 67,121 | 23,231 | 65.39% |
| 关闭右后窗并显示回执 | 67,729 | 34,023 | 49.77% |
| 设置空调温度/风量并显示回执 | 67,754 | 31,382 | 53.68% |

以上包含messages（system、原文/brief、目录、来源事实和模型状态、提交指令）与实际投影WorkflowDraft/CapabilityNeed联合Schema；不含HTTP传输封装、提供商tool包装常量、understand/select、返工或核验，也没有实际token/缓存/响应时间数据。全量对照继续使用当前提示词和其他上下文，这是隔离“按需契约/Schema”影响的静态对照；不是未完整冻结的dev.108逐字重放，不能称整轮输入下降约50–65%。

当前全目录36,402字符，三个选中目录分别5,616、13,174、10,960，局部缩减84.57%、63.81%、69.89%。dev.109历史目录探针36,267→8,450（76.70%）范围与选择组合另计，不能拿该旧局部数代替当前构图总输入。

当前understand无能力目录，但select新增完整短目录、候选及改写来源；同原查询发现视图35,011→46,773字符的历史统计也只是部分数据JSON。因此全流程实际input-token/费用降幅仍未知，需同请求、模型与设置的成对运行核对；dev.108六例与dev.109十例套件不同不能成本同比。本次上下文探针未追加生成模型、BGE、工具或试跑调用，未修改产品源码，版本继续dev.111；后续用户授权的真实十例另列下节。文档补充后原manifest保留历史，探针绑定见 `context-probe-bindings.json`。

## 当前架构真实十例补充（2026-10-14）

用户明确授权后运行当前understand→真实BGE→select→build/本地repair，DeepSeek/deepseek-flash、reasoning=null、固定原十例及每例一次；在图执行或review前停止，不将执行成功计入准确率。主结果**7/10（70%）**，图**6/7（85.71%）**、缺口及澄清处置**1/3（33.33%）**，0未完成。独立代理静态复核，人工手动复核未执行；不称总体准确率或可应用率。逐例、停止点、失败字段及限制以[测试记录](TEST_CASES.md#实际结果)为准。

07已改目标文字但规范化产物另外改变15处字段；08正确识别真实设备缺口，却三轮返回含未登记ID的capability_need，最终needs_changes；09也返回needs_changes，且草稿允许用户输入标志触发“预订完成”，无实际MCP回执来源。08/09的类型化缺口交付属于编排评分而非被排除的执行成功；正确缺口解释不能抵消完整处置失败。有效意图/原文来源/必要能力及来源边界各10/10，查询政策9/10，阶段正确不代表最终任务成功。

冻结run为 `.demo-runtime/optimization-dev111/orchestration-accuracy/real-20261014-073112-849fce`。42次真实调用（10understand/10select/10build/12repair），输入671,542＋输出206,298＝**877,840 token**，思考155,401包含在输出；未知/拒绝/provider失败0。各例耗时合计1,136.697秒，未建立成对成本基线，费用/节省比例未知。完整采集summary/outcome保留pending原字段，最终判定另存accuracy-assessment.json；独立字段复核independent-static-review.json、阶段复核intent-selection-review.json与最终final-artifact-bindings.json绑定确切工件。

测试进程退出0只表示采集完成，不表示十例全部符合。本轮未改生产逻辑/阈值/金标或重抽失败例，6个核心源码、harness、suite及3个保护状态哈希保持；设备/MCP/图执行/模型review/项目保存均未调用。原开发、日常5175、共享依赖保持，未提交、未发布。总体99.9%、人工验收、真实执行及HTTP/SSE/UI端到端尚未验证。

## 用户授权源码快照（2026-10-14）

用户在知晓十例7/10及三项待修问题后要求“提交下代码，把新的优化点都带上”。本次提交范围为dev.108–111已实现的DeepSeek接入、编排契约/恢复、隔离试跑初态、调用/失败计量、BM25＋官方BGE独立能力索引、先意图理解/改写再检索/select、相对阈值/每意图Top-K及配套前后端测试、原创金标和领域/迭代文档；不表示修复三项真实编排失败或完成M3–M5。继续本分支，不合并、推送、打标签、发布或更新日常实例；实际恢复标识以Git提交记录和收尾报告为准。

显式范围清单92个文件，排除并保留backend/state/models.json与只有LF/CRLF差异的TYPOGRAPHY_INVENTORY.json；ignored运行工件、数据库、模型、SDK、venv及用户项目不入库。两路独立只读审查确认前后端目录同步、本地模块引用完整、51个Python文件AST通过、相关差异/敏感模式扫描无新增阻塞；原始运行证据仍仅保存在本机ignored目录，Git携带源码、夹具和验收结果文档。

提交前重新运行后端全量：**687项，663通过、3失败、10错误、11跳过，96.512秒，退出1**，原输出backend-tests.txt保留。与dev.110全量逐项比较：12个同名残余保持，先前目录副本漂移已不出现，新增失败为旧输入合同测试仍要求理解阶段PlanningResult。当前生产合同已按本轮需求拆为IntentUnderstanding及独立CapabilitySelection；最小复现1项RED后，仅同步测试断言，并加强理解不选择能力/brief和queries/选择不改brief的检查，未改生产逻辑或削弱执行/权限断言。修后input_contract＋intent_selection_pipeline **22项通过、6.289秒、退出0**；没有再次全量复跑，不写成687项全部通过，既有12项继续待修。

前端复验：trial-window-conditions **7/7**、scenario-execution **20/20**、model-picker **7组DOM检查**均通过；npm run build退出0，Vite7.73秒，保留既有大chunk与Node localstorage提示。只纠正配置文档中日志默认路径为仓库根.demo-runtime/logs/orchestration.jsonl。未改视觉/动效或新增依赖，不追加真实模型/设备/MCP/用户项目调用。

新复验/提交绑定位于 `.demo-runtime/optimization-dev111/commit-checks/`，scope-before.json、backend-summary.json、baseline-comparison.json、contract-red/green、studio-summary与构建/测试输出分别保存。原真实十例final-artifact-bindings.json是评分时源码/文档快照，不因提交登记改写历史；当前文档与Git暂存范围另作提交绑定。产品仍dev.111开发版，真实质量及既有残余未达完整验收，未发布。
