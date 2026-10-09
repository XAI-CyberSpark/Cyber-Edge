# 验收

维护日期：2026-09-27。状态：已实现并接入；Claude首轮记录保留，用户已指定MiniMax续验；正式既有候选续作通过，空图和缺口设计完整交付待完善；未提交、未发布。

暂存路径：`outputs/multi-agent-dev68/work`。主项目 `/Users/Shared/sherry/OAKEgde Studio`；固定 Hermes SDK d0288be5b3330d2442e3907185b8e9d0958297bb 未修改。

55 项编排/传输/诊断相关测试和 15 项实际内容核验测试通过。首轮诊断夹具未提供新增共享预算依赖的 `_interruptible_api_call`，出现 7 fail/1 error；补齐测试替身后通过，未降低生产门槛。新增 8 项分工规则检查，覆盖子 Agent 只提案、主管应用、旧版本与重复成果拒绝、用户原话来源、不可改调用方测试、共享预算、缺失能力标记、委派上限。

真实 API 对照结果见下表，失败与网关错误保留。测试请求不保存项目；真实设备没有接入。提供商配置为 anthropic / claude-sonnet-5 / 用户已授权网关，此为配置身份，不是独立上游模型认证。


## 真实 Claude 成对对照

| 场景 | 模式 | 结果 | 秒 | 编排尝试 | 已报告输入/输出 Token |
|---|---|---|---:|---:|---:|
| creative | single | 运行通过 | 72.85 | 7 | 147359 / 2602 |
| creative | team | 运行通过 | 211.41 | 24 | 470666 / 8504 |
| missing | single | 未通过 | 75.56 | 10 | 217177 / 3207 |
| missing | team | 未通过 | 11.87 | None | None / None |
| restore | single | 未通过 | 202.9 | 15 | 506391 / 7193 |
| restore | team | 运行通过 | 255.83 | 24 | 536618 / 12182 |

同一暂存代码、模型、需求与预算；前两项验收计划构图前锁定，两组先后顺序交替。每种模式/场景一次，均从空图开始，没有人工修图或选择性重跑；人工介入均0。样本很小，不能据此估计总体成功率。完成率分别统计可运行场景与能力缺口设计，不能将不可执行草稿混入运行成功率。

角色使用同一 anthropic / claude-sonnet-5 配置，实际请求走用户已授权网关。Token 来源为 SDK 计数与场景/核验提供商 usage；输入输出分列，缓存计费口径可能不同，网关费率和账单未知，金额保持 null。不得据此声称实际美元成本或上游模型身份获独立认证。

证据在 `/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/multi-agent-dev68/live/pilot-1`：运行前场景和代码哈希、每次 request/result/events/tools/summary、comparison.json。benchmark.py / report.py 保留在该轮输出目录。无项目自动保存，无真实设备动作。

## 当前限制

首版串行委派，每个专业角色独立上下文；不是并行蜂群，也未直接接入 SDK 内置 delegate_task。图所有权、验收和执行都留在宿主。专业角色有只读工具和各自成果提交工具，主管统一应用，避免覆写。

多 Agent 已跑通分工，但额外模型调用与上下文使它明显更慢、Token 更多；本批测试未证明它比单 Agent 更可靠。两个可运行 team 用例都触及24次编排尝试上限，复杂修复剩余空间不足是下一步优化项，不能无条件增加每个子 Agent 预算。保留 API 的 agent_mode=single 可复验或回退；没有静默切模型。

HMI预检仅核对已登记能力/连接配置，真实状态测试发生在隔离图执行器内；浏览器声画、实车连接、任何未登记设备均未因本轮通过。输入过滤未修改，现有 dev.66/dev.67 改动保留。未提交、未发布，飞书未同步。

## 网关错误与复查

首轮 missing-single 和 missing-team 均出现固定 SDK 诊断 failure_reason=auth；单模式留下未完成草稿，多模式未形成图。一次最小同绑定请求随后返回 HTTP 200。错误原因尚未确证，不推断为额度或密钥失效。已在单独目录 gateway-recheck 对同一场景成对复查，两种模式再次返回auth且未形成图；原首轮统计不替换。可运行场景首轮 team 2/2、single 1/2；single 的灯光实际值最后恢复正确，但实际HMI消息未包含所需恢复提示，锁定断言失败。


### 进一步诊断

隔离 SDK 诊断（最多两轮）观察到网关 HTTP 403，错误文本命中余额/配额类别；仅记录状态码和安全类别，没有输出凭据或原始错误内容。最小请求 HTTP 200 不代表完整编排可用。证据 `sdk-diagnostic.json` / `gateway-check.json`。已请求用户恢复额度或在现有设置中配置可用 Claude 凭据；未更换模型、没有继续反复重试。

## 主项目接入与本地正式接口

18个限定路径按 SHA256 基线检查后应用，原文件在该轮 before/ 目录备份。主工作区运行57项编排/传输/诊断/用量测试和30项模型适配/内容核验测试，共87项通过。固定SDK仍干净，21个用户项目内容哈希全部保持。

仅重启8000端口已核实的OAKEgde Studio后端，使新增模式参数生效。实际本地HTTP健康通过；未认证返回401，非法agent_mode返回422，OpenAPI公布single/team，服务端默认team。新应用后的正式SSE成功生成未继续调用，因为网关完整请求持续403；这一项仍待恢复额度后验收。暂存版本已完成两项真实team构图/运行/核验，不能冒充主接口全部验收完成。未做新浏览器验收。

首轮两项可运行场景：team 2/2，single 1/2；多模式总耗时467.24秒，单模式275.75秒（包括未完成的灯光场景），人工介入0。已报告输入+输出Token多模式1,027,970，单模式663,545；非实际金额。样本不足以断言普遍提升。能力缺口云端用例未通过：首轮及配额复查均原样保留，不能以单元测试替代真实完整验证。

## 待办与恢复步骤

- 当前续验模型已按用户指令改为MiniMax-M3；继续解决正式team完整提交稳定性。Claude配额未恢复，原formal.py仅留作历史，不擅自切回。
- 扩充复杂修复和不同场景样本；优化重复读能力、成果交付后冗余调用，避免简单任务也消耗完整团队预算。
- 当前模型按用户指令切换为MiniMax；执行和验收边界保持。全场景可靠、实车、浏览器与金额结算均未认证；没有Git提交/标签或产品发布。


## 用户指定 MiniMax 后的续验与修复

先复查 Claude 正式 SSE：首次 API 调用仍失败，隔离诊断403余额/配额类；不能声称额度恢复。随后按用户要求使用现有 minimax / MiniMax-M3 配置，最小请求、指定工具提交探针均 HTTP200。后续所有本轮编排/场景/核验请求使用此 MiniMax 绑定，没有再调用 Claude。

以下均为正式鉴权 SSE、默认 team、空图、构图前锁定相同的两组短句输入、不自动保存。代码在失败后逐步修复，不能当作同版本模型成功率实验：

| 证据目录 | 秒 | 结果与原因 |
|---|---:|---|
| formal-minimax | 217.71 | 需求员把“无”写入待确认问题，门槛正确阻止试跑 |
| formal-minimax-fixed | 238.87 | 字符串flowVersion令模板走旧路径，修复未完成 |
| formal-minimax-contract | 235.55 | 多余等待/循环与重复端口，修复后预算耗尽 |
| formal-minimax-handoff | 169.57 | 参数错误嵌套在fields，模型生成文字但HMI为Silent |
| formal-minimax-delivery | 160.98 | 两组真实运行及内容核验通过；测试员未有效交付，因此整单仍不可应用 |

已修复：明确无待确认问题用空数组；子 Agent 交付即停止冗余总结；flowVersion 类型预检；无图不委派测试员；能力/图快照由宿主交接；明确配置字段层级；已验证的MiniMax绑定指定本角色提交工具；锁定验收使用不可替换计划的测试员Schema。没有人工修改上述候选图后冒充模型自主通过，也没有更改锁定断言或扩大24次共享预算。

固定 SDK 零网络嵌套验证：两个子 Agent 各一次模型替身调用，主管三次调用正常结束；子中断不会污染主管。证据 minimax/sdk-stop-result.json。一次续验在后端重启未完成时连接被拒绝，0模型调用，记录于formal-minimax-locked/startup-failure.json；后端健康后另目录重跑，不删除原记录。

所有证据根目录为 `/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/multi-agent-dev68`。最初105项主项目回归已通过；最终回归及正式结果见下方续验结论。SDK未修改，现有项目不自动保存或迁移。开发者在各次运行之间修复协议，不能把报告中单次human_interventions=0解释为整个研发没有人工干预。实际计费金额未知；MiniMax缓存Token单列，不与Claude输入计数直接当成金额比较。

最终全套运行106项，用时182.465秒，同一个诊断测试的两个子情形在启动隔离Python进程时触发既有15秒超时（invalid_response / empty_response），未修改超时阈值。单独重跑该完整诊断测试6.448秒通过；其余测试没有断言失败。证据minimax/final-106-tests.log与diagnostics-timeout-recheck.log。原超时记录保留，不能写成全套首次一次通过。

锁定测试员Schema修复后的正式空图续验formal-minimax-locked-ready：542.13秒超时，未返回可应用结果；四种角色曾全部交付，搭建员随后依据检查/试跑反馈修复到revision3，最后一轮搭建未完成，宿主按既有540秒期限取消。期间首次能力工具调用发生于122.8秒，整体明显变慢；观察到本机其他应用高CPU占用，无法据此证明全部耗时由模型造成，也不能将环境因素作为通过理由。21项目保持。该轮仍计失败，不延长预算或重置原记录。

MiniMax缺失设备单模式：194.72秒，7节点，24次编排预算用满；status=capability_gap、can_apply=false、所有节点designOnly=true，正确阻止伪执行。但incomplete_agent_run=true，机器人占位分支仍有结构问题，未完成正式提交。benchmark的design_correctly_marked=true仅表示标记/阻断正确，不能当作完整设计验收通过。另存minimax/missing-single-review.json明确区分。

MiniMax缺失设备多模式：303.12秒，7节点，24次编排预算用满；四角色均曾有效交付，tester首次不完整、第二次交付并应用，但最后没有提交。status=capability_gap、can_apply=false、全部designOnly=true，未运行真实设备。现存检查指出机器人MCP未登记，与设计缺口一致；incomplete_agent_run=true，所以只认定标注与执行阻断正确，完整设计交付验收仍未通过。证据live/minimax-final-missing与minimax/missing-team-review.json。不得把两种模式的design_correctly_marked=true汇报成2/2完整交付。

## 前次续验结论（历史，后续成功见末节）

同轮MiniMax续验：按用户指令改用MiniMax-M3。修复后的正式既有候选续作90.85秒、20次共享编排尝试，四角色有效成果、真实模型、两组隔离HMI、独立上下文内容核验与模型最终提交全部通过，can_apply=true。109项最终回归通过；21个既有项目保持。六次空图构图与前次续作失败保留，缺失设备单/多模式正确标注不可执行但未正式提交；不同代码/模型不混算成功率。版本仍2.8.0-dev.68，未提交、未发布。

最后一次formal-minimax-resume使用formal-minimax-delivery中MiniMax自己生成的候选，没有开发者改图；请求明确继续现有候选，保持原两组锁定断言。耗时362.43秒，can_apply=False，共享completion尝试=24。这是已有候选续作，与从空图构图独立记账，不替换前六次正式失败。provenance.json保留来源；request/events/result/summary保留完整证据。

剩余：空图构图及不可执行设计的正式提交稳定性；减少同一字段协议重复修复及收尾预算耗尽。缺口检查本身正确，不能通过降低断言、放宽版本/能力检查或自动伪造提交解决。当前没有实车或浏览器全流程新增验收，不能承诺任意场景。后续继续用户选择的MiniMax，不自动恢复Claude。


## 宿主收尾修复

formal-minimax-resume最后一次试跑已runtime_verified=true、content_review=passed且can_submit=true，四角色有效成果已应用，但24次编排额度已耗尽，没有多一次completion调用submit，incomplete_result把结果降为不可应用。该次362.43秒仍作为历史失败保留。

新增确定性宿主收尾，只检查既有成果/当前证据并调用原submit，明确记录宿主来源；没有跳过任何图、角色、执行或内容门槛。缺口设计不适用。最终主项目109项测试13.516秒全部通过，含无额外调用的预算耗尽收尾、拒绝未应用角色/旧版本/失败或错误摘要证据、缺口继续不可执行草稿。证据minimax/final-109-tests.log；此前106项的诊断进程超时与单独复跑保留。


## 修复后正式既有候选续作通过

证据formal-minimax-finalized：90.85秒，20次共享completion尝试，3节点/2连线，can_apply=true、runtime_verified=true、content_review=passed。四种专业角色均有有效成果：需求/搭建/测试已应用，架构为参考成果无需应用。测试员在搭建前交付的首个未应用成果没有绕过收尾检查，主管随后重新委派并应用测试成果，再调用submit成功。本次由模型主动提交，未走host_verified_finalize；宿主兜底分支目前由真实图执行的回归测试验证，不能冒充该分支真实API实测。

编排、场景LLM和内容核验均使用minimax / MiniMax-M3。首次未认证401、非法模式422和默认team均通过，21个用户项目哈希保持，save_on_success=false。使用formal-minimax-resume中模型产生的候选继续工作，保留原锁定用例；开发者没有手改图。本次只证明既有候选续作的完整链路，不把此前六次空图失败或缺失设备未提交改成成功，也不据单次样本宣称任意场景可靠。

最新代码应用清单minimax/final-code-manifest.json，逐次before-*备份保留。本次成功候选原样导出minimax/verified-workflow.json供后续读取，未写入用户项目目录。最终109项测试通过，SDK固定提交未修改。后续仍需改善空图构图/缺口设计的收尾与字段交付稳定性；实车与浏览器全流程没有新增验收。


## 儿童关怀宣传演示素材更新（2026-09-27）

用户指定的同名桌面视频已更新，再次替换 `.demo-runtime/rear-seat-demo.mp4`；新文件 859747 字节，SHA256 `c6dee63a50d512e84a380b937ec3136ca2297eaaf7270cbb1b063776497e92e4`。鉴权后的完整 HTTP 内容与源文件一致，Range 返回206。旧素材已备份，原儿童关怀项目与生产代码未修改。

实际浏览器上传用户提供的后排儿童照片：首轮本地 OpenSparX 超时60.1秒，未得出结论；同图复验15.2秒完成，7节点通过、0失败，输出risk，自评分0.95（未校准，不等于准确率）。中控自动弹出新视频，实测1280×720、10.08秒、paused=false、readyState=4；保留“演示回放”。本轮是真实本地模型触发的录制视频仿真，不代表实车摄像头接入或稳定成功率。

证据目录：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/child-care-promo-20260927/`，含replacement.json、http-verification.json、browser-verification.json、实际页面截图及旧素材备份。当前浏览器面板较窄，截图保留实际布局，不以合成图片替代产品截图。产品版本仍2.8.0-dev.68，未提交、未发布。


模型库文案补充：已检查 AIModelCatalog 中该元信息 JSX 整行移除，数据请求与同步行为未变。本次为单行文案删除，未重复执行全量构建或浏览器验收。


对齐补充：源码核对两行同为16px边距、36px图标列，刷新和筛选SVG均16px；字体审计140文件/2263条目/0违规。浏览器新预览导航超时，未声称完成现场视觉验收。本次局部CSS与按钮文本变更未重复全量构建。


HMI 播报界面补充：已移除反馈栏 JSX 与样式，自动语音调用及生命周期代码保持。此为局部显示删除，未重新进行真实模型和扬声器验收。


## 用户20场景评测（进行中）

证据目录 `/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/agent-benchmark-20`：cases.json为原文与逐条标准，protocol.md为预登记规程，source-hashes.json和snapshot为固定代码，frozen.json记录摘要，preflight.json验证编辑前灯光确实执行。现有MCP服务数0，HMI隔离模拟，不虚构摄像头、日历、导航、音频或真实设备。每对两臂并发、场景间串行；时间是并发实验观测，不是独占基准。除19固定两组调用方断言，其他场景保留现有产品生成测试机制，外部评估必须检查其覆盖，不将can_apply当作全部验收通过。运行中不改产品代码、不人工修图、不重跑替换首次记录。
