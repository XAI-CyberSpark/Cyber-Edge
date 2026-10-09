# dev.62 验收

2026-09-27｜MCP基础实现35文件、质量补充7个代码文件及后续编排反馈修复已应用主工程。质量补充时后端重启health200；本次编排反馈通过新请求子进程加载。文档随本轮同步。开发工作区，未提交、未发布；备份是本轮逐文件副本，不是完整Git版本快照。

## 实际完成

已登记Streamable HTTP MCP通过独立官方SDK2.2.0发现Schema并执行工具；节点、Hermes/bounded编排、隔离试跑和正式HTTP共享允许列表、参数与返回契约。data为真实structuredContent（可null），content/text保留原文。显式allow_trials控制试跑，端点/凭据由服务端配置，工具失败进入error出口且不自动重发。

增加通用satisfies结果断言，复用受限表达式检查实际字段关系和格式；有限split支持两句等格式要求。全部断言语法在模型/工具调用前预检，运行时类型错误保留证据并失败。明确工具后的input来源，避免把JSON原文误当乘客编码或把data=null误当资料不存在。没有添加博物馆/充电专用执行特判。

## 自动与真实调用验证

- 初验115项后端（含真实协议夹具）、149项前端、生产构建通过。后续凭据桥接补充65项相关后端检查通过（与初验有重叠，含新增2项MCP检查）。
- 质量补充54项相关后端、51项相关前端检查通过，包含新断言的跨进程、非法表达式预检、缺失值/非布尔值、关键词假阳性与split预算。计数与初验重叠，不相加冒充全量。构建通过；仍有既有大chunk提示。文字清单139文件/2234项、0违规，与主工程清单一致。
- 充电余位：真实API模型经Hermes自主生成6节点图；首次多余等待失败，反馈修复后固定两分支通过（91.06秒）。独立4组新站点/返回变化/工具错误通过，4次真实MCP调用；正式鉴权HTTP图执行3次工具调用及直接调用通过，未登录401，3类无权限/参数/注入地址请求拒绝。
- 博物馆讲解：早期生成、预算耗尽和独立内容失败均保留。旧关键词检查曾漏掉材料/年份或“两句”要求，不计为质量通过。新增格式断言后，API模型自主修图为7节点，两组实际试跑通过但未最终submit，仍保持can_apply=false；随后继续提交成功，11次编排工具调用、82.29秒，固定A-17/B-209两组通过，can_apply=true。
- 对提交后的同一张图不改节点，独立更换云游-47/glass/1987、Q-806/silk/1644、路途-3/quartz/2026：各1次真实MCP和1次真实MiniMax调用，编码、材料、年份、测试声明及中文句号两句断言均通过。另有真实工具错误（模型调用0）及明确注入模型适配器故障，各自兜底通过；注入故障不冒充真实提供商故障。5项通过，图摘要未变。人工阅读三条输出确认材料与年份确实作为本次资料表达；这不是独立盲评或广泛创作质量评分。
- 主工程质量复验：从主工程源码打包GraphEngine，经正式鉴权MCP/推理HTTP接口执行同图，新资料正式-902/ceramic/1752及真实工具错误通过，总计2次MCP、1次模型调用。正式OpenAPI含satisfies，未登录401。此项是执行接口集成验证，不冒充又一次正式编排API构图；本轮构图通过实际Hermes服务函数运行。

## 证据与应用

证据目录：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/mcp-runtime-dev62/`。

- 基础应用：apply-manifest.json、deployment.json、before/（35文件）。质量代码：quality-code-manifest.json、quality-code-deployment.json、before-quality-code/（7文件）；质量文档另有quality-docs-manifest.json及备份。写入前校验主工程基线SHA，写入后核对目标SHA，不覆盖用户项目或其他修改。
- 基础独立/正式执行：live/independent-tool.json、live/formal-http.json、live/formal-api-summary.json。
- 未通过记录：live/generated-museum、live/repaired-museum、live/continued-museum、live/independent-museum.json；最新预算耗尽记录live/quality-museum/result.json保留。
- 提交与独立复验：live/quality-museum-submitted/result.json、live/independent-quality-museum.json。
- 主工程复验：live/formal-quality-http.json、live/formal-quality-api-summary.json、quality-restart.json。
- 相关检查：quality-backend-tests.log、quality-frontend-tests.log、quality-build.log、quality-typography.log。

## 保留限制

模型编排使用项目既有Anthropic兼容网关及其配置模型ID，执行使用MiniMax-M3；不据网关ID推断上游模型身份。测试资料全部为本机协议夹具，非真实充电站或博物馆服务。正式测试临时登记已移除；主工程无mcp-servers.json业务连接，SDK运行配置仍指向证据目录的隔离依赖，不应删除该目录。

OAuth、用户连接管理界面、实际业务服务、端侧等价执行尚未完成。dev.61浏览器登录后完整交互尚未验收，不在本轮计算为通过。编排仍可能误用修改字段或耗尽预算；本轮继续提交成功不证明单轮总能完成。句号分段及关键词断言不能证明所有事实准确或内容有趣；输入/模型输出范围以列明证据为准。总体“任何想创造的场景”目标仍未完成。


## 编排错误反馈补充

同轮发现节点修改工具将存储格式data误当set_data时，仅返回“不允许额外字段”，曾导致连续无效重试。现将字段用途加入工具Schema，并在参数校验失败时返回出错位置的必填项、类型/枚举/说明及当前会话状态；不回显参数值、不自动转换错误输入。真实复验又发现requirements数组项被写成字符串时缺少对象字段上下文，已补齐。内部节点校验与工具参数校验明确区分；原子修改、版本和锁定验收保持。

最终47项编排/SDK桥接/构建服务相关后端检查通过（包含前述检查的重叠范围，不累计成全量）；无前端或执行器改动，本补充未重复生产构建。主工程只读探针验证已安装代码返回set_data契约、错误请求不改图；探针未调用外部模型。编排子进程按请求加载当前代码和提示词，本补充未重启主后端。

真实API局部编辑使用完全合成的3节点图：只允许修改模型标题/systemPrompt，实际保留所有其他节点字段、坐标、连线、明确模型绑定和自定义元数据。第一轮11次工具调用无参数错误、两组固定试跑及独立格式断言通过，但独立文本含“？。”和“。。”，人工内容检查失败。第二轮采用新调用方更严格标点计划，12次工具调用内修复并提交；两次需求对象参数错误和一次非逐字引用错误保留。两组固定试跑及远山/雨声独立格式检查通过，远山第二句却只有“句号”，人工内容检查仍失败。不能将这两个候选的can_apply或格式passed作为完整体验验收；未保存为用户项目。

证据：repair-feedback-tests-final.log、repair-feedback-main-probe.json、live/repair-feedback-edit/与live/repair-feedback-edit-strict/（原始请求/结果、独立输出和人工检查摘要均保留）。应用与备份见repair-feedback-code-manifest/deployment及repair-feedback-followup-manifest/deployment，末尾对象字段修复由单测验证，不冒充此前真实API已使用该最终修复。

下一步应补足基于实际显示结果的通用内容核验与反馈修复，重点识别形式通过但内容空洞/偏离需求的候选。具体措辞不进入全局业务特判；创意、意图与事实核验继续与结构/运行检查区分。现有形式门槛不足以证明任意场景可靠。
