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

## 运行资源补传（2026-10-10）

这是用户授权的源码仓库交付补充，产品版本仍为dev.107，不是正式应用发布。独立脱敏快照从旧单根源码提交124f6ef补齐运行资产，不推送原仓库历史或原工作区未提交功能修改。用户随后明确“语音识别模型不用上传”，最终提交排除所有本轮ASR资源及LFS配置，不引入LFS克隆要求。

范围：49份图片/图标（包含开发者页预览）、191个WOFF2字体、SU7 GLB/HDR、图标来源元数据及Maple主题许可证。运行资源清单478项，总37,155,725字节，全部普通Git保存。`studio/public/docs/`只放行这一张手工预览图，项目、凭据、虚拟环境、构建目录和模型权重继续排除。

实际验证：

- 全部资产字节数/SHA-256与清单一致；71处生产源码/HTML固定资源URL、HMI清单及字体CSS引用均存在。GLB纹理/数据内嵌，不依赖被遗漏的外部文件。
- 独立上传快照的`npm run build`通过（借用现有node_modules，非全新机器依赖安装）；构建后478份public资源与来源字节一致。临时依赖链接及dist已清理，不上传。
- 使用现有Three/Meshopt解码及通用carRig，SU7的50个部件、四门四窗和材质绑定检查通过。
- 既有`test-hmi-widgets.mjs`未通过：缺少显式tsconfig造成`@/i18n`解析失败；临时指定现有tsconfig后仍有三项旧`地图导航：回家`选择器断言失败。资产上传没有修改这些组件或脚本，本轮不扩展为界面修复；不将此测试记为通过。
- 首次保护检查3699项（backend/projects、stable副本/日常数据及凭据）哈希一致。没有prepare、停止/重启Studio、SDK修改或全量后端测试；本轮只变更资产与交付文档。

来源/限制：字体保留OFL及MIT；SU7仍按既有用户提供来源记录，不新增独立授权声明。TTS使用操作系统本地中文语音，未捏造可分发音色包。本轮不交付ASR权重、本地LLM/Ollama或研究候选模型。推送及匿名下载见下方交付记录；未重新整仓克隆。

交付完成：资源提交`0a172a9`已正常更新新仓库main（未强推）。匿名API回读1498个文件，478项运行资源的Git对象哈希与本地一致；另实际下载图片、WOFF2、GLB和HDR四类二进制样本，字节数及SHA-256全部一致。未再次整仓克隆，未在全新机器安装依赖。保护文件3699项最终哈希检查无变化，当前可达历史凭据扫描无真实密钥、服务商token或私钥命中；11个通用赋值匹配均为既有测试假值。临时诊断脚本/构建目录在收尾清理。

ASR未出现在main及其可达历史中。用户排除ASR前，239,233,841字节的LFS对象曾上传成功，但指针提交未到达远端；保留为未被main引用的对象，不擅自删除远端内容。普通Git取得本轮资源无需LFS。产品仍为2.8.0-dev.107，本次是资源交付，不是日常Studio发布。

## 接口目录数据补交付（2026-10-19）

473条资料以JSON种子补回，保留ID/参数/分类/原文依据及未接入、未验证状态；不携带绑定、连接状态、凭据、项目或执行历史。当前开发仍dev.111，本次仅修正独立dev.107交付快照。

先写4项回归，缺少初始化函数/种子路径时全部失败。独立上传快照36项相关测试：34通过、2项原有可选环境跳过；新增4项全部通过，覆盖空库473条、重复启动数据库不变、已有草稿/确认数据保留、启动API和失败回滚。临时工作目录及隔离数据库下，实际启动`main_host_lite:app`的TestClient并GET接口，返回473条且全部未接入。全功能main入口挂同一函数，但未整体启动；复用已有依赖，未重新安装/测试新操作系统，未调用真实MCP或模型，未改前端。

种子782194字节，SHA-256：`486f480130d3052673ce21791830cc8992f820541683cbbb9a53bfa45714ba6f`。真实凭据/token/私钥/本机路径检查零命中；唯一手机号形式候选实际是32位UUID内的数字片段，保持原ID。远端交付与最终保护检查待收尾。
