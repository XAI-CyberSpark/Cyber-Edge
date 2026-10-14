# 能力检索独立金标 v1

用途：离线评价能力可见性、排序及候选选择性。状态：金标首次运行前冻结；用户确认99.9%完整召回优先后，原留出失败已打开诊断，当前集作为回归证据，不再视为新盲测。维护日期：2026-10-14。归属：[dev.110](../../docs/product/releases/2.8.0-dev.110/PRD.md)；主依据：[编排整体优化方案](../../docs/product/ORCHESTRATION_OPTIMIZATION.md)、[运行节点契约](../../docs/product/NODE_CONTRACTS.md)、[节点注册表](../../backend/app/services/node_capabilities.json)及[HMI 控件](../../backend/app/services/hmi_controls.json)。

[capability-retrieval-v1.json](capability-retrieval-v1.json)含64条原创查询，development/heldout各32条，原split名称及金标保持不变。首次混合检索实现仅使用development改进语义文档；后续完整可用性诊断已核对heldout逐例预算遗漏。新的总体/盲测结论需新独立数据，不能继续用相同32例证明。原标注按契约独立推导，未由排名制造答案，未新增生产别名。

冻结 SHA-256：`5ceb6e5dcf7ed01edbf163f081af21031c1075f13fd3f41314aeb7156921267c`。运行 manifest 应保存同一数据身份与源码、模型身份。修改标签或查询需明确建立新的数据身份，不能用旧哈希描述新结果。

覆盖全部 84 项生产索引身份：19 类节点、9 项车辆动作身份、3 个内置工具操作、53 个 HMI 控件。另有 3 项原创 MCP 连接夹具身份。music/nav/call_phone 在两组中各有独立单操作案例；中文转述、精确 ID、多目标、360/388 字长叙述、否定、历史更正、局部修改引用、旧节点可读限制、未登记真实能力和未知 MCP 分别登记。

## 数据与评价语义

用户最新准入：按任务全部必需能力可见计成功，漏任一项即任务失败，目标≥99.9%；平均Recall和Top-K仅为诊断。指标版本2分别保存完整规划可见池的`all_required_rate`及优先候选`ranked_all_required_rate`，可见池包含candidates/node_overview/capability_overview。完整目录曝光保障不计作排序精度提升，也不证明模型选择或任务编排成功。小回归样本通过不证明总体99.9%，`population_target_validated`保持false。

- `required_ids` 为任务明确需要召回的契约身份；每个 ID 都必须召回。不会自动给每个 operation 添加 carrier 节点或固定图拓扑；载入契约时的依赖闭包属于生产机制。
- `acceptable_groups` 每组只需召回其中任一身份，各组仍要分别满足。仅 DEV-27/HOLD-11 的固定、无语音文字展示允许 `node:output` 或 `node:fallback`，两者都明确支持配置 `responseText`。这个等价不覆盖错误出口路由、动态模型文字或语音要求。
- `required_refs` 为当前项目必须保留的已有身份，用于检验宿主引用保留，不代表新增动作授权。局部编辑案例只登记真实引用集合，不制造测试专用图拓扑。
- `evidence` 提供文件及 JSON pointer/文档定位说明，`reasoning` 说明独立标签依据，`ambiguities` 记录容易误读的边界，`non_authorization` 保留执行限制。召回被否定动作或需读取的控件不等于允许执行；检索器不承担完整规划或授权判断。
- `expected_retrieval.known_task=true` 的候选上限为 30，精确 ID 为 10，且不接受完整索引回退作为选择性通过。它们是冻结的评价期望，实际未达到须如实报告，不按结果移动预算或标签。
- DEV-29/DEV-30/HOLD-29/HOLD-30 为未知/不可证实任务，允许保守扩大短索引，候选上限为 null。空 gold 不计入正例 MRR/recall 分母；未知状态与回退单列。DEV-30 有明确未知 MCP 身份，只检验身份可回查，不把用途 unknown 算作已知语义任务。

窗口区域由既有参数表达。`windows.close_all/open_all` 是 canonical 授权动作，固定节点的 area/targetStatus 锁定单窗或全部车窗；`action:windows` 是节点分类，目录没有 HMI 车窗控制项，不能添加虚假等价组。未来天气 MCP 与当前仿真天气的来源也不能等价。

`connection_snapshots` 只含原创、非秘密元数据与参数 Schema。`registered` 的日程/天气工具描述决定各自用途；`opaque` 的 w7 没有标题或描述，不能按工具名猜功能。夹具 `configured/available` 是测试事实，不代表本机真实连接；所有工具 `allow_trials=false`，本评测不发现、安装、调用真实 MCP。

## 已验证与限制

新增数据有效性检查先在文件缺失时观察到 6 项失败，再补数据；最终 6 项通过，检查查询分组、登记 ID、源文件/JSON pointer、覆盖、预算、已有引用、否定说明及未知元数据。Windows 项目根目录可运行：

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONPATH='D:\workspace\Cyber-Edge\.demo-runtime\test-deps;D:\workspace\Cyber-Edge\backend'
Set-Location backend
.\.venv_host_lite\Scripts\python.exe -X utf8 -m unittest tests.test_capability_retrieval_dataset
```

本检查仅消费静态目录和原创夹具，不检索、不加载 embedding、不发模型请求，也不读写项目/日常数据。运行环境报告已有 Anaconda 路径定位警告，但该次命令退出 0，6 项检查全部通过。此结果不证明检索准确度、编排产物质量、工具执行、浏览器或实车效果。未创建提交或可恢复版本快照。
