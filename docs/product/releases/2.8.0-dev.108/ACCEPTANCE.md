# dev.108 验收

维护日期：2026-10-13；状态：第一轮可靠性修复和32K冻结六例复测已完成，五例仍未满足预期；进一步修复尚未验证。用户转向核对简单任务成本与工具选择，当前停止后续真实模型调用。全量有既有残余问题。产品版本 2.8.0-dev.108；基线提交 ab13ab5，当前改动未提交、未发布。主依据：[需求](PRD.md)与[任务](TASKS.md)。

## 环境与开始状态

- Windows，Python 3.13.5 项目虚拟环境 `backend/.venv_host_lite`，Node 25.8.0。
- Studio `http://127.0.0.1:5174`、host-lite `http://127.0.0.1:8001`；两者 HTTP 200，健康状态 ok。默认 5173/8000 为其他进程占用。
- 实际引擎 bounded；开始时 MiniMax、GPT、Claude 的 configured 均为 false，本机配置文件、模型 key 文件及相关环境变量均未提供密钥。
- 已向用户说明 Studio 编排聊天输入框旁的模型选择器 → 未接入/编辑模型 → API 密钥与模型 ID → 验证并保存。配置与真实批测仍待完成。
- 开始时仅 `backend/state/` 为未跟踪运行数据；不清理或覆盖。

## 验证记录

### 已完成

- 日志专用22项及相邻 Builder/Hermes routing 合计48项通过；新增固定 bounded 阶段、规划/执行失败终止位置及问候分类完成红绿验证。均为本地替身，不是模型质量证明。
- 批测脚本17项本地 HTTP/SSE 边界测试通过，覆盖 UTF-8 分块、SSE error、断流、结果后失败证据、超时、响应上限及 DeepSeek 显式绑定。
- 修复本机真实图试跑的 Node 启动失败：同一进程缺 `SystemRoot` 时退出134，仅添加该变量后退出0。新增2项环境白名单回归与2项既有实际图执行/断言用例通过；没有放开完整环境继承。
- 菜单 DOM 的7组检查通过，DeepSeek 复用设置弹窗、正确 provider 请求与验证后选择均用本地 HTTP 替身核对。前端生产构建通过（7.48秒；既有大块体积警告）；排版审计148文件/2431条、零违规。
- 开发后端已重启，健康 `ok/host-lite`，前端代理 `/v1/projects/` HTTP200；未触碰其他端口的服务。
- 首轮真实本机 HTTP/SSE 六例在 2026-10-13 03:52:40 UTC 开始，MiniMax / MiniMax-M3 / bounded；六例均 HTTP200、收到 thinking/error，全部 `provider_not_configured/blocked`，返回候选0、可应用0，没有调用真实模型。报告：`.demo-runtime/workflow-batches/20261013-115240-bb7780ab/SUMMARY.md`。
- 该轮日志中六组独立 request_id/run_id 均有 started 与 terminal，终止类别 unavailable/HTTP503；更早日志包含本地回归与探查样本，不能当作真实模型记录。实际编排日志为 `.demo-runtime/logs/orchestration.jsonl`，报告时间与服务商用于定位该批次。
- 两个既有 `backend/state/` 文件的 SHA-256 与开始时一致；未新增或覆盖用户项目。

### 全量后端的 Windows 残余问题

第一次447项仅父进程`-X utf8`，结果9 failures/23 errors/11 skips。给继承环境增加`PYTHONUTF8=1`与`PYTHONIOENCODING=utf-8`后，第二次447项结果为2 failures/10 errors/11 skips（71.211秒），不能宣称全套通过。证据为 `.demo-runtime/logs/backend-tests-dev108-utf8.log`。残余均在基线已有代码/测试中：

| 类别 | 数量 | 实际限制 |
| --- | --- | --- |
| ExecutionStore SQLite连接生命周期 | 6 errors | 连接上下文只提交未显式关闭；Windows tearDown删数据库遇到WinError32，属于既有实现问题，待独立修复 |
| MCP取消的进程检测 | 1 error | 测试`os.kill(pid,0)`在Windows报WinError87；该栈未证明实际取消失败 |
| 用户项目作测试夹具 | 1 error | 测试硬读未跟踪的儿童关怀项目，当前源码克隆不含它；未补造用户项目 |
| 符号链接权限 | 2 errors | 测试创建symlink报WinError1314，对应逃逸断言尚未运行 |
| POSIX权限模式 | 2 failures | 模型配置测试要求0600，Windows返回0666；未将此当作Windows ACL验证，也未削弱断言 |

### 最终补充与加载验证

- DeepSeek 新增11项及既有思考控制5项，共16项通过；协议、独立密钥、保存前验证、失败保留配置、未知别名能力和错误脱敏使用本地 HTTP 替身验证。新增11项先 RED（3 failures/8 errors），实施后 GREEN；证据 `.demo-runtime/logs/deepseek-provider-red.log`、`deepseek-provider-green.log`。
- 最终全量后端463项：440通过、2 failures、10 errors、11 skips，71.928秒；失败名称与上表一致。证据 `.demo-runtime/logs/backend-tests-dev108-final.log`，回归日志另写 `orchestration-tests-dev108.jsonl`，避免混入服务的编排记录。本轮相关检查通过不代表全量通过。
- 旧开发实例退出后，最终服务改为工具会话持续运行；后端8001/Studio5174重新启动并回读健康与代理。服务进程信息在 `.demo-runtime/dev-processes.json`，实际监听 PID 后端36608、前端26280。最终列表包含独立 DeepSeek / deepseek-flash，configured=false；页面需刷新或点击“刷新模型”。
- 最终 DeepSeek 真实本机 HTTP/SSE 六例在2026-10-13 06:18:02 UTC开始，仍无凭据，六例均 `provider_not_configured/blocked`，候选0、可应用0。报告 `.demo-runtime/workflow-batches/20261013-141802-10841633/SUMMARY.md`；六组独立日志终止于 planning/unavailable/HTTP503。没有把缺配置报告记成真实模型失败率或生成质量结论。
- 编排配置和 API 文档已同步 DeepSeek，启动文档补充本机 Windows 命令与 UTF-8 前提。全站文档检查56错误/24警告；把27页受检文档内容替换为基线HEAD在同一检查器下对照，也是56/24，新增问题0。证据 `.demo-runtime/logs/docs-check-dev108-final.log`、`docs-check-dev108-delta.json`。新增三篇迭代文档与主入口本轮段落的相对链接缺失0；主入口历史链接问题保留，单独扫描记录在 `dev108-links.json`。
- 排版清单在 Windows 生成后统一恢复仓库的正斜杠文件路径，无清单内容变更；`git diff --check`通过。独立只读审查未发现本轮 P1/P2 阻断项。

## 已保存密钥后的真实批测（2026-10-13）

用户完成页面接入后明确要求批量验证。只读取非秘密状态：DeepSeek / `deepseek-flash` configured=true，实际引擎 bounded。六例各一次，保留服务默认思考设置，编排代码在批测中不变；请求只含套件原始输入，不传验收答案、当前项目或聊天历史，`save_on_success=false`、`overwrite=false`。

北京时间14:26:06至14:36:22，总615.678秒；6例实际请求，HTTP均200，2份结果（1份8节点草稿、1份空图），可应用0、自动规则通过0、完整验收0、缺配置阻塞0。四例SSE error，两例needs_changes，CLI退出1。它是六个不同案例的一次抽样，不能外推总体成功率；模型接入能返回内容不等于编排已通过。

| 用例 | 耗时 | 实际结果与停止位置 |
| --- | --- | --- |
| CT-01 雨天关窗 | 101.631秒 | 需求规划完成，构图阶段通用503/SSE error，无候选 |
| CT-02 只关右后窗 | 186.384秒 | 8节点草稿needs_changes；JSON分类→条件→固定单窗动作被GRAPH_CONNECTION_CONTRACT拒绝，can_apply/runtime_verified均false |
| CT-03 空调能力缺失 | 101.829秒 | 预期capability_gap，实际needs_changes/空图；需求覆盖ID、断言状态路径及锁定计划修订均出现拒绝，最终结构化缺口丢失 |
| IN-02 指代不清 | 90.213秒 | 预期needs_input，实际构图阶段通用503/SSE error，无澄清结果 |
| BT-02 答错、提示与奖励 | 28.309秒 | planning阶段ValueError/contract_error，SSE error，无候选 |
| CR-01 太空探险复用 | 107.312秒 | 规划完成，构图阶段通用503/SSE error，无候选 |

证据目录：`.demo-runtime/workflow-batches/20261013-142606-73173b8d/`，其中`SUMMARY.md`/`summary.json`是原始批测汇总，每例保留request/events/evaluation，有返回才保留result/candidate。`stage-log.json`筛选了该时间窗口中的六组独立请求及终止记录。两份既有state数据哈希前后相同，证据为protected-data-before/after.json；没有保存候选到项目库，也没有修改模型配置或日常副本。

### 归因与证据边界

- 三个HTTPException案例都进入提供商通用“连接失败或未返回完整结果”分支，现有元数据无法区分截断、空响应、响应JSON错误或传输断流。接近90秒不足以证明超时，不能凭提示归因鉴权失败；没有原始响应正文、finish_reason或usage证据。BT-02可定位需求规格契约，但没有保存非法字段详情。
- CT-02节点实现的固定`WINDOW_POSITION/set/area=4/targetStatus=0`分支可构造仅rr目标；Python和TS图连接校验却把它当普通actions消费者，拒绝上游JSON。执行器入口也先经过图校验，不能仅凭内部实现分支推断最终图可运行。原计划还缺rr实际开度、实际目标键及其他三窗保持的独立断言。旧修订执行失败的证据不能继承给最终修订。
- CT-03说明保留22度并承认没有真实接口，但需求brief把真实目标变成HMI仿真链路；第一轮显式真实缺口被额外coverage ID校验拒绝，第二轮错误状态断言路径在试跑前被拒，第三轮触发计划锁定并丢失结构化coverage。最终不能当作正确能力缺口反馈，也不能称已测空调动作。
- 生成时内部试跑与批测独立回放分开统计：两份最终结果runtime_verified=false；批测没有独立回放，人工评审项仍pending。只读代码/语义审查不代替人的体验验收。旧interaction形态的互动oracle范围虽已发现，本批BT/CR无候选，尚未触发该oracle误判。

另对CT-02做三次隔离离线诊断：原草稿加独立正/负两例、仅内存去除designOnly/designIssue后执行模型原五例、同一内存副本执行独立正/负两例，均在图预检被GRAPH_CONNECTION_CONTRACT拒绝。三次model_calls/tool_calls/确定性回调调用均0，动作为空，没有额外真实模型或工具请求，也没有绕过校验。默认窗初始全0，不能把空动作时数值不变当成关窗行为通过。原始5份工件SHA-256前后一致，证据`CT-02-1/diagnostic-offline-executor.json`；官方批测结果未改。这确认当前最终图执行入口确实受同一契约阻塞，仍未证明内部固定车窗分支可以通过完整图链路。

后续定位应先补提供商安全失败分类，再核对固定车窗节点与连接契约的一致性、需求缺口保留和计划修订边界。不要为这些案例添加场景关键词特判、重写验收答案或绕过图校验。本轮只验证与隔离诊断，未修改生成代码或重抽失败样本。

## 六例深入归因与修复方案（2026-10-13，同轮补充）

用户要求解释失败原因、可能原因与修复方式。本轮只做诊断与方案，没有修改生产行为、预算、模型选择或服务配置，也没有以重放结果改写原六例结论。

### 真实提供商元数据重放

对CT-01、BT-02各重放一次规划与首轮构图，用独立进程的内存观察器记录固定结束原因、长度、用量及无输入原值的校验元数据。共5次模型响应：CT-01两次，BT-02三次；在首次build返回/失败后立即停止，没有检查、执行图、保存项目或读取用户历史。生产文件哈希前后一致。证据`diagnostic-provider-probe.py`及`diagnostic-provider-probe.json`位于原批测目录，与原始结果分开。

| 重放阶段 | finish_reason | completion_tokens | reasoning_tokens | 实际解释 |
| --- | --- | --- | --- | --- |
| CT-01规划 | tool_calls | 2807 | 1554 | 规格有效，引用均来自原话 |
| CT-01构图 | length | 14000 | 11858 | 总输出额度耗尽，剩余工具参数不完整，_result抛ValueError后包装为通用503 |
| BT-02首次规划 | tool_calls | 3338 | 1749 | 提供商提交工具参数，但JSON对象解析502，未形成规格 |
| BT-02第二次规划 | tool_calls | 2484 | 1145 | 有效规格，11项需求、无重复ID、原话引用有效 |
| BT-02构图 | length | 14000 | 14000 | 全部额度用于推理，构图参数没有完成，通用503 |

这已复现“思考消耗总输出预算→截断→被报告为连接失败”的链路。原始CT-01/IN-02/CR-01未记录finish_reason，不能反向宣称这三次原始调用已逐一证实截断；IN-02和CR-01的截断仍为强候选原因，需安全元数据定位。BT-02重放的首次JSON对象解析失败未保存原始参数，不能断言具体是转义、字段或双重编码。HTTP已返回工具结果不等于其JSON对象/业务契约有效。

### 收紧车窗诊断结论

现行NODE_CONTRACTS及dev.96需求明确保留普通车控只接受actions，JSON例外限定已登记HMI/MCP字段绑定。既有测试没有验收JSON→logic→旧固定WINDOW_POSITION路径。因此CT-02确定是最终候选违反现行图级契约，不能仅凭内部固定执行分支称“校验误拒”。目录泛称“固定参数/显式JSON字段/上游动作计划”没有区分模式，且同模型审查在actions桥调用失败后建议删除桥，导致第三次再次回到JSON违约路线。

优先修复保持既有契约：让负责意图/动作决策的LLM直接输出合规actions，条件节点读取授权结果，固定车窗节点继续锁定区域；不要求每个图都多加一颗模型。同步生成说明、目录描述及审查提示，结构/协议修复由统一检查器负责，内容审查不得推荐违反已检查的连接关系。放宽JSON→合法固定窗属于新的契约扩展，须明确范围并同步Python/TS/目录，不能当作恢复既有承诺。

### 已离线复现的恢复与评测缺口

只读内存替身复现以下四类，不调用模型/网络或用户数据：

1. 首轮有missing，修复返回非法空payload后，最终project/coverage被清空，capability_gap降为needs_changes；已识别事实和当前尝试错误没有分开保存。
2. AI计划仅把预检建议的不存在路径改为合法路径，输入/运算/预期22不变，bounded仍因绝对锁定拒绝。真实CT-03第三轮差异没有保存，不能断言它就是这种等义修改。Hermes已实现“无效计划不锁定、agent受限纠错、caller锁定”；bounded未复用。普通dict比较还会把True与1当作相同，应使用既有严格JSON比较。
3. 已形成blocking questions后构图503，bounded抛异常，先前有效的澄清问题不返回；应保留needs_input事实，并继续禁止执行，不能编造草稿。
4. 合法needs_input＋全designOnly草稿符合dev.46已确认行为，当前benchmark却要求没有节点。此规则应按现行约定修正，验证questions、不可应用、草稿不可执行即可；不能为了让测试通过改成旧的无图产品行为。真实IN-02没有brief工件，其questions是否非空仍未知。

### 建议实施顺序与通过条件

- **P0 安全诊断与预算适配**：保留finish_reason、结构化失败码、用量（含reasoning_tokens）、阶段和剩余期限；length/空响应/JSON解析/工具协议/网络失败分开。先做同输入的思考开/关或低强度对照，再按阶段适配额度；检查图内推理同样使用的较小max_tokens，不能只修生成调用。不得自动关闭用户显式思考设置、无限增加预算、强制回退模型。thinking模式不支持强制required/named tool_choice，不能用错误强制调用制造HTTP400。
- **P1 动作契约与修复意见一致**：保留actions门槛，让生成/审查正确消费检查器反馈；同一图在Python/TS得到一致诊断。独立测试必须以非零、不同的四窗初始开度验证仅rr实际关闭、其余保持，覆盖询问/否定/其他窗/失败反馈；静态零错误不能代替试跑。
- **P1 需求与缺口保真**：原始目标与执行来源不可被提案中的仿真方案替代；missing挂回原需求ID，最近有效草稿/覆盖和当前错误分开，坏repair不能清空已核实缺口，也不能永久继承模型误判或把旧执行结果冒充新图证据。
- **P1 计划受限纠错及澄清保护**：复用已确认的严格比较/预检/受限修订机制；caller计划、输入、真实预期和预算继续锁定。澄清结果优先保留，草稿构建失败不掩盖questions；更新有已确认约定冲突的benchmark断言。

修复后先跑离线回归（length、非法JSON、动作协议、缺口后坏repair、合法/非法计划修订、questions后503），再冻结代码重跑原六例；真实模型、注入推理、生成内试跑、独立回放及人工评审继续分列。该方案尚未实施，不能称六例已修复。

## 用户授权修复与复测（2026-10-13，同轮）

用户要求开始修复并核对14,000额度。按上文已登记方案实施，保留其他提供商默认预算、普通车控actions契约、显式编排思考设置、调用方验收计划、稳定5175及用户数据。

- 已实现安全响应失败码和结束原因/数值用量；截断不再统称连接失败，部分工具参数不得进入执行或日志。新增提供商回归先RED（6方法9失败），GREEN与日志/相邻合计49项通过；整体期限另1项先RED。SSE兼容message并附白名单code。
- 已知DeepSeek的bounded额度16,384规划/32,768构图与修复/8,192审查，整体720秒，仍最多三轮构图与试跑；其它模型原额度/期限保持。网页与隔离试跑的短结果调用关闭已知DeepSeek隐式思考，节点接口没有显式思考字段；不改用户编排菜单选择。
- 原始目标保留；坏repair保留最近完整原ID覆盖与不可执行草稿，候选来源单列、不继承旧执行成功。blocking questions优先返回needs_input。bounded复用AuthoringSession的预检、严格JSON比较、有效计划锁定和受限修订。恢复与接线回归23项＋日志22项通过，9.578秒；先RED证据及边界见builder-recovery-*日志。
- 普通固定窗目录与生成/审查说明统一actions，未放开JSON。8项确定性完整图测试及相邻共23项通过，2.526秒；先RED说明3断言失败。四窗以17/29/43/68分别准备并实际断言，仅rr关闭，其余保持；否定、询问、其他窗、模型失败及实际VehicleWorld卡窗均验证。Python/TS诊断一致，目录同步检查通过。
- 澄清oracle允许合法全designOnly草稿，仍要求非空问题、can_apply/validation false及明确runtime_verified=false；严格图字段、ID与边引用检查。12项先RED6失败，修改后oracle＋batch29项通过；旧批测夹具补runtime_verified=false，未弱化断言。
- 前端类型/生产构建通过，6.71秒，既有Browserslist/大包警告。文档检查仍为56错误/24警告，与此前基线一致；本轮API与CONCEPTS为0错误。

真实预算A/B：`.demo-runtime/workflow-batches/budget-ab-20261013-155156-f49b3da4/metadata.json`，UTC07:51:56至07:56:01（245.275秒），一次CT-01规划后，同一首次构图messages分别用32K/high与32K/low。两次均tool_calls且WorkflowDraft字段有效，分别总输出17,191（思考14,571）/17,455（思考14,744），超过原14,000。未检查、执行或保存图，不能记为可应用或独立质量通过；low本样本未节省，默认思考未修改。

第一次集成508项（77.254秒）4失败/11错误/11跳过：原12项残余之外，新增提供商pipeline fixture清空PATH/SystemRoot使新预检不可用、锁定拒绝文字兼容断言、Windows Hermes worker取消检查异常三项，已单独定位/收尾中。证据backend-tests-dev108-repair.log。冻结复测与最终回归结果待下面补记，未把本次错误计为通过。

### 最终集成与原六例冻结复测

最终全量514项：491通过、2失败、10错误、11跳过，78.332秒；12项残余名称与前述基线一致，没有新增失败。证据`.demo-runtime/logs/backend-tests-dev108-repair-final.log`。第一次集成额外问题均已处理：提供商pipeline测试仅恢复PATH/SystemRoot/UTF8而仍隔离凭据，保留三次响应并加强runtime_verified断言；锁定拒绝恢复兼容提示而未改禁止规则；Windows取消测试经原断言诊断确认worker当时GetExitCodeProcess=0/WaitForSingleObject=0已终止，只需事件循环释放句柄后PID消失。测试有界等待最多200ms并保留最终死亡断言，生产取消/SDK零修改。

独立整体审查发现两个P2后补红绿回归：非missing的空/ghost引用不再替换旧missing；规划两次失败末次ValueError保留最多两条安全元数据/固定码。窗口另补Builder入口，完整WINDOW_POSITION配置需既有action=windows，未放宽校验器。最终提供商11+日志22项通过，恢复/旧集成/日志共50项通过，窗口/相邻25项通过；复审确认两P2消除，无新增P1/P2阻断。

开发后端8001重载最后冻结源码（PID85520，工具会话24416），Studio5174为PID40148/会话81320；健康ok/host-lite，Studio HTTP200，DeepSeek/deepseek-flash configured=true。进程元数据在`.demo-runtime/dev-processes.json`。冻结79份后端/图引擎/目录源码及2份受保护state哈希，保存`.demo-runtime/repair-frozen-before.json`；它是本次对照标识，未提交工作区仍不是Git恢复快照。

原六例各一次串行真实HTTP/SSE复测于UTC08:21:51开始、08:43:13结束，目录`.demo-runtime/workflow-batches/repair-frozen/20261013-162151-5ca3c931/`，不传独立验收答案/当前项目/历史、不保存或覆盖。6次请求、3份结果，可应用0、自动规则通过1（IN-02）、5失败、1待人工评审；总1281.524秒，CLI退出1。79份生产源码及2份state前后哈希一致，证据`.demo-runtime/repair-frozen-before.json`与`repair-frozen-after.json`。原批次与预算探针保持独立证据。

| 用例 | 第一轮修复后的冻结结果 | 证据与边界 |
| --- | --- | --- |
| CT-01 | needs_changes；324.505秒 | 完整9节点，生成内所列试跑通过；实际固定area1仅fl且四例真实初值全0，不能证明所有开启窗关闭；内容审查仍拒绝 |
| CT-02 | needs_changes；238.837秒 | actions连接已过结构，但作者提示混用node分类字段windows与模型canonical动作名；模型试跑MODEL_ACTION_INVALID，最终固定area3是rl非rr，未执行不能称误关已发生 |
| CT-03 | SSE invalid_json；116.818秒 | 构图工具参数非法JSON，finish=tool_calls/output16323/reasoning13781；当前把该503当致命，没有使用已有构图修复预算 |
| IN-02 | needs_input；174.122秒 | 10节点不可执行草稿、can_apply/runtime_verified=false；修正后的独立澄清规则通过，人工核对仍pending |
| BT-02 | SSE output_truncated；198.587秒 | 32,768额度，reasoning29,354，仍length；未形成候选 |
| CR-01 | SSE output_truncated；228.655秒 | API报告总输出/思考均32,769（保留原计数），finish=length；未形成候选 |

后续准备：canonical动作样例/区域映射、实际审查证据摘要、known内容协议失败使用原三轮修复，以及隔离trial的可选initial_windows/blocked_window，已新增测试RED，生产实现尚未落地。64K构图/16K审查额度仅已修改工作区helper并出现预期RED（3子例），没有重载服务或完成新额度验证。2026-10-13用户指出简单任务token过多并要求解释工具选择，当前停止进一步代码编辑及真实调用，先核对成本机制，不能声称这些准备已完成。

### 工具选择与成本核对（用户追问）

当前真实引擎bounded。理解/构图都注入完整19类CATALOG（紧凑JSON33,966字符）；构图系统说明10,157字符，实际WorkflowDraft工具schema4,712字符。提供商只暴露submit_scenario供阶段提交，tool_choice=auto；模型在JSON中选择节点，没有任务相关候选召回/目录裁剪。修复保留既有消息，并要求完整替换图/计划，非差异patch。提示还含Hermes oakegde工具指引，而bounded实际未暴露这些工具，属于跨引擎说明不匹配；是否直接造成各次额外思考没有原始推理证明。

CT-01首构图真实输入18,563/总输出21,010/思考18,167；全程7次模型响应，累计输入109,606/总输出55,117/思考41,516。累计输入包含重发内容，不等同不考虑缓存折扣的收费金额；max_tokens是上限，不是每次固定消耗。下一方向应优先缩小任务相关能力与阶段上下文、统一契约及避免整图重复重写，不能仅提高额度。

## 整体优化方案交付（2026-10-13，同轮，仅规划）

用户要求任务能力筛选、上下文精简、提示词及其他整体优化，并明确可以新分支实施、当前只定方案。[专题方案](../../ORCHESTRATION_OPTIMIZATION.md)记录基线、全局约束、目标链路、两级能力视图/漏选恢复、阶段上下文、patch/证据语义、调用预算、M0–M5与质量/成本验收。简单无返工路径3次编排调用、首构图≤6K，预登记组含失败/返工的成对token降幅中位数≥60%等为待校准目标，不是实测成果。

本轮只修改文档；未创建分支、实施生成策略、重载服务或追加模型调用。未实施RED和未测64K helper保持原状态，不将现有HEAD视为完整当前修复快照。后续独立codex分支须承接相关未提交修改并保护用户数据。版本保持dev.108，未提交、未发布。

三路只读审查覆盖能力/上下文、质量/计量及全方案：吸收了operation粒度、MCP按需发现、完整用户约束、更明确的补载终态、事前成本分组、分组质量分母、bounded/Hermes预算、指纹现状和独立验收接入等意见；最后复核未发现剩余实质矛盾。这是方案审查，不是新策略运行验收。

实际文档验证：新方案及当前迭代21条本地链接目标均存在，证据`.demo-runtime/logs/docs-dev108-optimization-links.json`；现有文档检查范围27页，仍56错误/24警告，与本轮修改前按文件/错误码/内容比较相同，仅行号移动，证据`docs-dev108-optimization-before.log`与`docs-dev108-optimization-final.log`（均在`.demo-runtime/logs/`）；`git diff --check`通过。检查器未自动覆盖所有新增方案正文，因此新方案另做链接和人工源文件/接口核对，不称整个文档库全绿。仅文档变化，未重跑后端/前端功能测试；当前生产与真实六例结论不变。

## 内部召回工具选型补充（2026-10-13，仅规划）

用户追问内部能否用召回工具进一步节省成本。既有方案4.4/M2-A增加宿主SQLite FTS5/BM25候选召回、同次规划模型语义选择、中文/ID处理及全短索引回退；保留全19类极短节点概览，主要裁剪细粒度动作/HMI控件/MCP工具。未命中不假报gap，模型不知道漏选ID时可按原始requirement查全索引；仍不确定时在剩余调用中展示完整短索引保守选择。独立只读审查确认这些边界，并吸收OR词项/ID精确旁路与同义改写回退建议。

本机实际只读检查：host-lite Python用内存SQLite连接查询PRAGMA compile_options，sqlite_version=3.45.3，ENABLE_FTS5=true，随即关闭连接；未读取/修改用户数据库，未创建索引、执行检索或调用真实模型。证据为`.demo-runtime/logs/capability-retrieval-environment-dev108.json`；编译支持不能当作中文召回准确率或成本收益已验证。生产代码、服务、分支与版本均保持本轮开始时状态，版本仍dev.108。

文档收尾：方案与迭代21条本地链接目标存在，`git diff --check`通过；现有27页检查仍56错误/24警告，与前次按内容比较无新增项，仅行号移动。证据为`.demo-runtime/logs/docs-dev108-retrieval-plan-links.json`与`docs-dev108-retrieval-plan.log`。未重跑功能测试，召回准确率、额外token收益与索引实际执行仍待实施后验证。

## 当前限制

本机批测不等于其他环境故障复现；缺模型配置不能得出生成质量结论。离线响应、HTTP/SSE 错误路径、真实模型和设备执行分开报告。没有进行实车或日常稳定版更新。

统一新增模型/任意服务地址入口未实现，按用户选择复用现有菜单。固定 Hermes SDK 的 DeepSeek 连续工具回合、思考内容回传与 Windows 真实调用尚未实测；仅宿主环境变量凭据的 worker 重解析限制仍在。默认引擎继续 bounded，未升级 SDK；未知模型 ID 的官方可用性由用户配置验证确认。当前工作区未提交，版本号和输入哈希不构成可恢复的 Git 快照。
