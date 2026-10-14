# dev.109 验收记录

用户后续明确本轮只测试任务编排，跳过执行成功判断。最新产物复评为图5/7符合，全部10例6符合/2有编排问题/2无产物待评，见[最新口径](TEST_CASES.md)。以下4/7及执行指标保留为原端到端证据，不作为本轮编排功能结论。

维护日期：2026-10-14。状态：第一批实现、离线验证及真实十例完成；质量门槛未达，人工/配对成本与完整方案未验收。用途：记录第一批优化及后续十例的实际证据与限制。主依据：[需求](PRD.md)、[任务](TASKS.md)、[专题方案](../../ORCHESTRATION_OPTIMIZATION.md)。

环境：Windows、既有host-lite Python/Node；分支 `codex/orchestration-optimization`，承接未提交dev.108工作区。开始HEAD、既有变更与保护state哈希见 `.demo-runtime/optimization-dev109/baseline.json`。没有创建Git提交/标签，不能当作可恢复版本快照。

## 实际实现

- M1：canonical actions/none说明与实际解析一致，区域3/4对应rl/rr；Python与TS严格校验完整四窗、有限0–100及阻挡白名单，锁定前准备实际初态，每case隔离。审查保留初态、requested/actual/success/source、注册HMI状态及真实空容器。
- M1：安全call_id增量started/completed，发起前扣额，致命失败/取消无result仍保留先前消耗；图内调用单列且维持独立预算。批测按run_id读取日志与轮转，未知保持unknown/已知下限。Claude三项输入计数归一化，其他服务不重复缓存或思考计数。未测64K额度恢复16K规划/32K构图/8K审查，不改变显式思考设置。
- M2：内存FTS5/BM25、ID精确旁路/中文预切词/安全OR查询与短索引回退；19类型概览保留，需求映射与已选完整契约、operation/control/tool独立。MCP仅发现已选服务、加载已选工具详情，索引仍保留未选条目。旧类型可读但禁止新实例。
- M2：确定性阶段视图保留全部用户原文，显式PlanningResult/CapabilityNeed/schema，补载占原三轮构图，最多8次编排/3次审查。未加载/未知/预算耗尽不假报gap；设备/MCP来源不能被静态输出或仿真替代。生产路径必须有通过的实际执行及步骤证据，内容核验复用证据编号与逐字来源校验。

## 验证结果

第一批离线证据在根`.demo-runtime/optimization-dev109/`，不作为Git恢复快照。该阶段没有真实模型/MCP或实车调用；GraphEngine/IPC为真实本地执行，模型与网络用MockTransport或显式替身。随后授权的真实十例单独登记在下节及TEST_CASES。前端没有视觉改版或页面实屏验收。

| 检查 | 结果 | 证据/边界 |
| --- | --- | --- |
| 首轮全量 | 591项：563通过、4失败、13错误、11跳过；5项新增问题已处理 | backend-full.log；默认Schema回归+3个生产替身结构/类型过期+阶段说明断言过期 |
| 最终全量 | **593项：570通过、2失败、10错误、11跳过，87.938秒** | backend-full-final.log；12项名称与dev.108基线一致，没有本轮新增失败；不能称全量通过 |
| 新阶段/上下文/计量/图内用量与输入相关 | 52项通过（最终全量前针对性） | final-targeted.log，6.402秒；含真实来源、未试跑阻断、伪造evidence_id、fatal前usage、长历史/空值/HMI状态 |
| 选择/MCP/Schema | 36项相关（5 live MCP跳过）；最后Schema修复30项通过 | m2-a-green.log、m2-a-schema-registry-green.log；live skip不计真实接入验证 |
| 车窗条件与执行器 | TS 7/7 + 20/20；Python/IPC相关41项通过 | trial-windows-ts-green.log、scenario-execution-ts-green.log、execution-contracts-final.log；生产GraphEngine+替身模型 |
| 前端构建 | TypeScript及Vite通过；文档同步后最终7.68秒 | frontend-build-final.log；既有Browserslist与大chunk提示保留 |
| 排版/静态检查 | 148文件/2431条、零排版违规；目录sync与差异检查通过 | Windows清单file路径归一到既有正斜杠格式，未改字体/文字角色；新迭代/专题24个本地链接目标存在，document-links.json |
| 独立审查 | 所审M1/M2无未修复P1/P2；59项相关及最后stage 14项通过 | 只读审查，原空补载/MCP保留/旧tts用例复跑；连接配置/适配器身份、patch/Hermes属于后续 |
| 目录规模离线探针 | 全目录36,267字符；关窗候选5,738；选中详情8,450 | m2-a-sizes.json；字符不是token，完整短索引回退32,011字符，未承诺所有改写均节省 |
| 数据保护 | 开始登记的两份backend/state文件SHA-256保持 | baseline.json、state-protection-final.json；没读写日常副本/数据，不用用户项目作新测试 |

最终全量命令：backend目录，`PYTHONUTF8=1`、`PYTHONIOENCODING=utf-8`、绝对`PYTHONPATH=D:\workspace\Cyber-Edge\.demo-runtime\test-deps`，用既有`.venv_host_lite\Scripts\python.exe -X utf8`运行unittest discover（`-s tests`）。测试编排日志明确隔离到本轮目录，不混入运行服务日志。没有安装/升级共享依赖。

12项既有残余：ExecutionStore未关闭SQLite连接导致Windows临时目录清理错误6；MCP取消测试os.kill(pid,0)的Windows错误1；缺用户儿童关怀夹具1（不补造项目）；symlink权限2；POSIX 0600在Windows返回0666的断言2。不削弱、跳过或删除这些断言；它们按独立缺陷/环境限制继续登记。

## 交付与限制

分支保持`codex/orchestration-optimization`，版本`2.8.0-dev.109`，全部仍为未提交工作区。最终源码身份记录`final-source-manifest.json`用于关联第一批验证；正式十例另有`frozen-experiment-formal.json`，均不是Git恢复快照。没有Git快照/标签或发布；仅临时测试8002重载并已停止，原开发及日常5175没有更新。本轮离线通过不能替代真实质量、实际token/缓存/费用或其他环境验收。

现有大图首次构图保留完整项目配置，修复仍输出完整WorkflowDraft；完整短索引/契约保守回退明确记录为未达到成本目标。长历史原文保留不等于模型已正确理解所有更正；超长请求与同义改写仍须真实实验。未知外部用途/预算耗尽正确保留selection_incomplete，不承诺一次补载必能完成所有任务。

遗留：M3增量修复、M4策略实验/Hermes适配、M5成对真实质量/成本验收继续按专题里程碑管理。不能提前宣称节省比例、可应用率或已发布。

## 用户要求的十例真实测试补充（2026-10-14）

[预登记及完整结果](TEST_CASES.md)为本次案例与实测主依据。新suite只增加原创夹具/历史，原suite未改；7可执行/2缺口/1澄清、13隔离case/17step。最初两例均理解成功后build HTTP400；两个最多64输出token的实证请求定位联合Schema缺`type=object`，精确一行修复且保留union语义。另修SSE与日志共用run_id，补真实ASGI边界回归，原两失败与未知用量原样保存。

离线验证新增4项Schema先2FAIL/2PASS后通过；SSE/日志/提供商/Builder相关120项通过，最终整合83项通过（6.409秒，`ten-case-integration-green.log`）。另一73项回归71通过、2个既有Windows0600权限断言失败，未削弱断言；不是再次全量593项复测。第一批全量12项残余仍保留，没有前端代码修改需重新视觉验收。

修后正式冻结目录`ten-case-batches/20261014-011102-d467f36f`：10请求/8结果/1,056.864秒，01/04/05/06最终可应用且独立回放通过，**4/7（57.1%）**；10正确澄清，**1/3（33.3%）**。全部人工项pending，原accepted=0，代理内容复核独立标明来源。02误选JSON输入及路径，03实际车窗trial通过但8K核验思考截断、最终designOnly且旧runtime_verified残留/指纹不匹配，07局部编辑误当缺能力且非目标23处变化。08/09因预算准入拒绝没有具体gap产物，属于本批未完成且留分母，不能直接证明平台缺口能力不存在。观察错误放行0/10，两组均未达90%目标。

正式33次API，输入407,775/输出217,617/总625,392；reasoning172,015与cache_hit163,584分别已包含在输出/输入。图内推理与独立回放API0，MCP/实车0。全部探针及诊断39次、已知下限661,154，3次400的未知保留182,133预留；总计入843,287、峰值899,181/上限900,000，3次新调用被门禁拒绝。金额未知，没有配对基线，不宣称60%节省或正式发布。

正式期间278份源码/套件不变，首次探针至收尾3份保护文件哈希不变；临时8002已停止，原开发/日常副本、用户项目与共享依赖保持。后续重点为正确选择/纠正JSON与宿主编辑约束、核验阶段额度/上下文与当前产物证据一致性，以及不改范围的局部修改。没有在冻结批中修稿重跑或替换失败。

实测结束后的独立代码审查补修两项通用runner预算边界：调用条目全缺时保持unknown且保留预扣，非bounded生成按实际预算/遥测范围在POST前阻止。67项相关测试通过，无新真实调用，正式旧runner/收尾新runner及数据保护分别登记在`ten-case-environment/after-run-runner-fix.json`。未改正式结果或假称收尾版本已重跑十例。实测暴露的03旧证据字段、选择/编辑及核验问题继续未完成。
