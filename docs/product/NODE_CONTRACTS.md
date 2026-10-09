# 场景编排：节点定义 v0.1

[返回项目主文档](../README.md)

日期：2026-09-25｜产品登记：2.8.0-dev.36｜状态：设计基线草案，待共同评审

这份定义解决一个问题：AI 提出的每一步，能否找到职责明确、输入匹配、实际可执行且有验证依据的能力。

本文中的能力 ID、数据结构和统一失败协议是目标契约，尚未接入生成器与执行器。当前实现另外标注；文档完成不代表模型准确性或实车能力通过验收。本轮不改变界面、模型提示词、现有项目或运行方式。

## 1. 先统一“节点”是什么

| 层级 | 定义 | 儿童关怀 | 朵朵生日航海 |
| --- | --- | --- | --- |
| 场景 | 用户希望得到的完整体验 | 发现后排儿童可能有危险时，在中控查看后排视频 | 把去滴水湖的生日旅程变成航海冒险 |
| 子流程 | 能展开查看内部步骤的一段业务过程 | 观察后排、判断是否提醒、展示画面 | 启航、沿途探索、揭晓惊喜 |
| 基础节点 | 有独立输入输出、结果和失败边界的一项可复用能力 | 画面观察、规则分支、展示视频 | 内容创作、理解回应、判定答案、更新进度 |
| 实现绑定 | 这项能力本次由哪个程序、模型或设备执行 | 视觉模型 A + 提示词版本 + 推理服务 | 云端模型 B 生成章节；程序保存进度 |

**同一能力节点可以有多种实现，一个模型也可以承担多种能力；每种绑定都需要单独验证。**

节点实例是“能力 + 该场景的配置”：例如“生成朵朵的启航故事”引用通用的“内容创作”，不新增一个写死的“朵朵节点”。画布展示业务名称，详情再展开契约与来源。子流程应可展开，但当前产品尚未实现这种画布层级。

拆分判断：如果两项工作需要不同的输入、独立失败处理、单独替换实现或单独验收，通常应拆开。不要把每个字符串处理都画成节点；通用校验、追踪等机制可由平台隐式执行，必要时展示执行详情。

当前 `interaction` 是复合执行节点，包含多项基础能力，应作为后续“持续互动子流程”的迁移入口。当前 `llm` 是通用模型执行器，不能仅凭模型名称说明它适合哪项任务。

## 2. 每个节点必须填写的六项契约

| 项目 | 必须写清楚 | 不合格写法 |
| --- | --- | --- |
| 职责与边界 | 唯一主要职责；允许产生的影响；不得代替哪些判断 | “智能处理”“提升体验” |
| 输入输出 | 字段、类型、必填、枚举、单位、来源、时效；输出状态和后续允许动作 | “输入上下文，输出结果” |
| 实现来源 | 程序/云端模型/端侧模型/设备接口；具体版本、适配器；模拟或真实 | “使用 AI”“已接车机” |
| 运行条件 | 所需设备、服务、权限、网络、状态；超时期限；重复调用策略 | “环境正常即可” |
| 失败处理 | 失败类型；停止/等待/有限重试/降级；状态是否保留；谁接管 | “自动兜底”“默认成功” |
| 验证依据 | 用例和数据版本、实现绑定、环境、结果、日期、证据位置、适用范围 | 模型自评分高、JSON 合法、别的模型通过 |

另记录稳定能力 ID、契约版本、业务名称、维护人/待分配、当前实现状态。契约升级必须说明兼容性；改变字段含义或副作用需重新验证受影响场景。

以下第 4 节是基础节点目录。其中输入输出为核心字段定义；生产注册前还须补齐完整可机器校验的 schema、长度/大小上限和实现绑定。未知项明确标为未注册，AI 可以提出使用该能力的方案，但不能交付为可运行节点。

## 3. 所有节点共用的执行约定（目标设计）

### 3.1 数据必须带来源

每次调用携带 `run_id`、`event_id`、`node_id`、契约版本、输入引用、发生时间和来源。来源至少区分用户提供、设备、模型生成、仿真。模拟到达不能变成 GPS 到达，上传照片不能变成实时摄像头，模型描述不能变成设备事实。

读取实时状态时必须配置有效期；过期输入进入缺失/未知分支。模型生成内容与真实环境事实分别保存。配置引用稳定字段路径，连线时检查类型、单位、枚举及数据语义，不把“都是字符串”当成可连接。

### 3.2 业务未知与调用失败分开

调用状态统一为 `succeeded / waiting / failed / cancelled / skipped`，业务结果放入 `data`。例如图片观察成功返回 `assessment=unknown`，表示图像无法支持判断；接口超时则是 `failed`。成功执行观察，也不等于观察结论正确。

失败返回结构化 `error.code`、简短原因和是否允许重试；不生成一份看起来成功的假结果。所有异步节点需要取消、超时和迟到结果处理。等待/失败不能默认推进进度。当前代码尚未全面采用此统一协议，现有 `error` 连线主要支持模型和持续互动节点。

每个实现绑定必须给出实际超时值、重试上限和可测的响应时间目标。本文不编造统一的“安全毫秒数”：内容创作、视频打开、后排感知分别测量。未设置期限的异步绑定不得标记为可交付。

### 3.3 能运行、运行成功、验证通过分别记录

- **实现状态**：未实现 / 模拟实现 / 真实接口已接入。
- **本次就绪状态**：可用 / 缺配置 / 服务离线 / 无权限 / 数据过期。
- **验证范围**：未验证 / 契约测试 / 模拟闭环 / 真实服务 / 指定设备与场景实测。

三者独立。例如真实模型接口已接入，但本次离线；视频在 Mac 浏览器成功播放，但从未在目标车机验收。不能合成一个含糊的“可信”徽标。

## 4. 首批基础节点定义

以下 ID 是拟定的新契约 ID，不是已注册的运行时 `type`。各节点的“验证依据”列出应证明的内容；当前证据范围见第 8 节。

### N01 接收事件 `event.receive`

- **职责与边界**：接收一次文字、图片或外部事件；保留原始内容，不自行判断危险或生成行程事实。持续视频采样由输入适配器负责，不能把一次输入宣称为持续监测。
- **输入输出**：输入原始载荷与来源；输出 `{event_id: string, kind: text|image|arrival|command, payload: object, occurred_at: datetime, source: user|device|simulation}`。不同 kind 使用不同 schema，图片含资源引用和 MIME 类型。
- **实现来源**：聊天输入程序、媒体适配器或设备事件订阅。当前文字/图片输入已接入；真实导航到达尚未接入。
- **运行条件**：载荷在大小限制内、资源可读取；订阅设备时需连接与授权；同一事件 ID 可去重。
- **失败处理**：无效文件拒绝并说明原因；设备断开报告不可用；不把失败生成的空输入继续向下游传递。
- **验证依据**：有效/无效图片、重复发送、事件顺序、取消、来源标注；设备事件另做真实接入测试。

### N02 读取上下文 `context.read`

- **职责与边界**：读取明确指定的车辆、旅程、用户授权信息或会话记忆；不补造缺失的车速、位置、年龄或网络状态。
- **输入输出**：输入 `{keys: string[], scope: string, max_age_ms: number}`；输出 `{values: object, missing: string[], stale: string[], observed_at: datetime, sources: object}`。车辆数值字段单独声明单位，用户信息限定当前授权范围。
- **实现来源**：状态存储、记忆服务、车辆/导航接口。当前仿真天气与车窗、后端短期记忆可用；不等于真实车辆上下文。
- **运行条件**：指定会话/车辆范围、可访问数据源、有效期和必要权限。
- **失败处理**：返回缺失或过期字段；场景声明哪些字段缺失时必须等待。服务失败不可冒充“成功读取为空”。
- **验证依据**：跨会话隔离、过期字段、记忆服务断开、单位一致性、隐私范围和真实数据来源核对。

### N03 观察画面 `vision.observe`

- **职责与边界**：根据本次图像和明确观察任务输出可见现象及判断；不能凭单帧认定持续行为，也不直接执行提醒或车控。
- **输入输出**：输入 `{image_ref: string, captured_at: datetime, task: string, context: object}`；输出 `{assessment: risk|normal|unknown, observations: string[], risk_action: string|null, reason: string, image_ref: string, model_score?: number}`。`normal` 仅指本次未观察到所定义风险；`model_score` 在 0–1 内，但未经校准不当作准确率。
- **实现来源**：具有图片输入能力的视觉模型与专用适配器，可在端侧或云端；必须记录模型、提示词和图像预处理版本。文本创作模型不能自动获得视觉资格。
- **运行条件**：可用且未过期的图像、支持该输入格式的模型；云端绑定需网络及图片传输许可，端侧绑定需设备性能与模型就绪。
- **失败处理**：遮挡、模糊、任务证据不足返回 unknown；接口、格式或模型异常返回 failed；不得默认 normal，不得用预设规则冒充视觉结果。
- **验证依据**：标注图片集中的危险/正常/遮挡/无人/非后排图片；漏报、误报、未知率、延迟及样本分布；逐模型和环境记录。本项目尚无此类完整准确性证明。

### N04 理解回应 `intent.parse`

- **职责与边界**：从用户话语提取当前可接受的意图和参数；不得直接修改进度或执行设备动作。
- **输入输出**：输入 `{text: string, allowed_intents: string[], context: object}`；输出 `{intent: string|null, slots: object, interpretation: understood|ambiguous|unsupported}`，意图只能来自 allowed_intents。
- **实现来源**：固定指令解析程序，或经该任务验证的语言模型；端侧大小由测试选择，不在契约中绑定“几 B 就一定够”。当前持续互动主要是固定命令解析，不能宣称已支持任意同义表达。
- **运行条件**：会话状态与允许意图明确；模型服务可用时才采用模型实现。
- **失败处理**：有歧义则简短澄清；模型离线可采用明确登记的固定命令实现，标明来源；不得猜测用户要退出、跳过或操作车窗。
- **验证依据**：同义表达、否定、混合请求、“不要暂停”、普通聊天与命令混淆；不得因误解意图越权执行。

### N05 内容创作 `content.generate`

- **职责与边界**：创作故事、角色对话、谜题、提示或惊喜文案；不能声称歌曲已播放、车辆已到达或设备已完成动作。内容生成是能力，“航海”是配置。
- **输入输出**：输入 `{brief: string, audience: object, context: object, format: narrative|question|other, constraints: object}`；输出 `{content_id: string, revision: string, format: string, public_content: object, private_rules?: object}`。叙事正文是字符串；问答额外包含题面、规则/答案、提示，答案不混入公开展示字段。
- **实现来源**：云端/端侧模型，或预先生成并审核的内容缓存。建议先用云端创作复杂旅程并缓存；端侧适配必须另测能力、资源和耗时。这是产品分工建议，不是当前自动调度能力。
- **运行条件**：创作目标、已有剧情和必要用户背景齐全；需要模型时服务可用；事实性信息须有来源，未知事实不写成已知。
- **失败处理**：有限格式修复后仍无效则失败；保留当前章节，不推进也不发奖励；有适用缓存才使用缓存，无缓存则暂停内容生成并简短说明。
- **验证依据**：契约合法之外，另检查故事连贯、适龄、可理解、谜题可解、规则稳定、避免答案提前泄露；由独立用例及人工体验评审评价新颖性，不能只用同一模型自评。

### N06 校验结果 `result.validate`

- **职责与边界**：校验结构、枚举、字段范围和特定不变量；不证明故事好看、识别正确或事实真实。原则上作为平台隐式步骤。
- **输入输出**：输入 `{payload: unknown, schema_id: string, schema_version: string}`；输出 `{valid: boolean, normalized?: object, issues: {path: string, code: string}[]}`。只允许登记过的无损规范化，不补造业务必填值。
- **实现来源**：程序 schema 校验器和已登记规则；当前 `recognition` 主要承担视觉结果解析，普通模型也有字段校验。
- **运行条件**：schema 可定位且版本一致；大小和嵌套层级受限。
- **失败处理**：阻断成功出口，交调用方有限修复或失败处理；禁止把缺失的 risk 改成 normal。
- **验证依据**：缺字段、错类型、未知枚举、截断、嵌套异常、合法边界；结构通过仍需节点自己的任务质量测试。

### N07 规则分支 `condition.route`

- **职责与边界**：根据指定字段和确定性条件选择路径；不创作规则，不自行改变风险阈值或调用模型。
- **输入输出**：输入 `{data: object, rule_id: string, rule_version: string}`；输出 `{branch: string, reason_code: string, evidence_refs: string[]}`。分支名及缺失值/unknown 策略须提前声明。
- **实现来源**：程序规则执行器；目标为受限表达式，不接受任意模型生成脚本。当前 `logic` 仍使用动态表达式求值，不能声称已具备表达式沙箱。
- **运行条件**：所有引用字段可解析、类型匹配，分支完整且不冲突。
- **失败处理**：规则错误或必需字段缺失进入错误/等待路径；不能默认走 false 分支并执行动作。
- **验证依据**：真/假/未知/缺失、边界值、冲突、循环及非法表达式；当前动态求值机制是后续实现差距。

### N08 判定答案 `answer.evaluate`

- **职责与边界**：依据当前题目的已确定规则判定回应；不改题、不发奖励、不写进度。自由讨论无需强行使用判题节点。
- **输入输出**：输入 `{question_id: string, revision: string, response: string, grading_rule: object}`；输出 `{result: correct|incorrect|undetermined, rule_revision: string, reason_code: string}`。
- **实现来源**：固定答案优先程序规范化后精确匹配允许别名；开放回答可提出单独的模型判题实现，但必须通过专门测试。当前没有通用开放题裁判。
- **运行条件**：题面与答案版本一致；规则在提问前锁定；不从本次用户答案反推标准答案。
- **失败处理**：无法判断返回 undetermined，允许重答/澄清；不扣除或发放奖励。判题服务失败不推进。
- **验证依据**：正确别名、标点、否定、部分命中、换题、重复回答、模型试图改答案；当前固定答案逻辑嵌在 `interaction` 内。

### N09 更新会话 `session.update`

- **职责与边界**：管理阶段、等待、暂停、恢复、结束和奖励；是会话进度唯一写入者。不得让模型直接覆盖状态。
- **输入输出**：输入 `{session_id: string, expected_revision: number, event_id: string, transition: string, evidence: object}`；输出 `{revision: number, stage_id: string, status: waiting|paused|completed|stopped, rewards: string[]}`。奖励需对应规则允许的完成证据，不要求所有体验都有积分或奖励。
- **实现来源**：程序状态机与存储。当前 `interaction` 有页面内会话状态；`memory` 是另一后端短期记忆能力，不能替代旅程状态持久化。
- **运行条件**：转换合法、阶段定义一致；同一 event_id 幂等，旧 revision 不覆盖新状态；生命周期和存储范围明确。
- **失败处理**：生成/判题失败保持原状态；并发冲突拒绝旧写入；退出后普通聊天不自动重启。目标持久化失败不可报告已保存，当前页面刷新会丢失进度。
- **验证依据**：重复事件不重复奖励、暂停恢复、退出、提前到达、失败保持进度、并发和跨会话隔离；持久化另做断电/刷新测试。

### N10 展示文字与提醒 `hmi.present`

- **职责与边界**：在指定 HMI 区域展示文字或提醒；只展示允许公开的字段，不执行内容中描述的动作。
- **输入输出**：输入 `{presentation_id: string, target: string, content: string, priority: normal|alert}`；输出 `{presentation_id: string, state: visible|dismissed|failed}`，visible 由显示组件确认，不由模型声称。
- **实现来源**：HMI UI 适配器；当前 `output`、`fallback`、`cockpit_alert` 承担部分职责，尚非统一回执接口。
- **运行条件**：目标界面可用，显示区域、提醒优先级和内容长度受控；结束/关闭事件可处理。
- **失败处理**：目标不可用报告显示失败；提醒收起不等于风险解除；展示失败不伪装为已播报。
- **验证依据**：实际可见、长文本、重复提醒、优先级、关闭/取消、答案不泄露；当前没有因为节点名为 `tts` 就具备语音的能力。

### N11 展示视频 `video.show`

- **职责与边界**：在 HMI 指定区域打开独立配置的视频源，返回播放生命周期；不负责识别危险，不把照片动画或历史录像称为实时画面。
- **输入输出**：输入 `{request_id: string, source_id: string, source_kind: live|replay, target: string, trigger_ref: string}`；输出事件 `{request_id: string, state: opening|playing|stalled|closed|failed, source_kind: live|replay, error_code?: string}`。这些是目标字段；当前主要返回 `video_display: opened/skipped`，部分回放路径不同。
- **实现来源**：浏览器媒体播放器或车机视频接口。当前 `video_display` 支持独立本地录像和浏览器支持的视频地址；仅有 HTTP(S) 地址不能证明是直播。
- **运行条件**：绑定明确的后排源、实际可解码、权限和网络满足，HMI 已挂载；live 需另外验证源的实时性及延迟。连接凭据不进入模型上下文。
- **失败处理**：加载失败、卡顿和断流分别报告，停止声称“正在实时播放”；保留风险未确认解除的状态。取消后的迟到成功不得重新弹窗；重试有界且可取消。
- **验证依据**：真实媒体播放、加载失败、断流、取消、关闭、再次风险、图像与独立视频源分离；Mac 录像通过不代表真实后排摄像头或车机通过。

### N12 执行车辆动作 `device.act`

- **职责与边界**：执行明确授权范围内的一项设备命令并核对实际状态；不自行扩展目标、参数或联动车辆其他功能。
- **输入输出**：输入 `{command_id: string, capability: string, target: string, parameters: object, preconditions: object}`；输出 `{command_id: string, state: achieved|rejected|partial|unknown, actual: object, source: simulation|device}`。具体参数声明单位和范围，例如车窗目标开度。
- **实现来源**：仿真行为模型或真实设备适配器；当前车窗主要为仿真，有卡窗反馈；无实车验收依据。
- **运行条件**：能力白名单、权限、前置状态、设备在线；命令 ID 去重；参数范围来自设备契约。
- **失败处理**：拒绝/卡住/部分完成返回实际结果；超时后先查询状态，不盲目重发非幂等动作；无反馈返回 unknown。
- **验证依据**：目标和实际开度、卡住、权限拒绝、重复命令、超时、禁止从右后窗扩大到全车；真实设备需单独回执和实测。

### N13 调用应用能力 `app.call`

- **职责与边界**：调用已登记的导航、音乐等应用接口；可执行操作限于能力声明，不能把任意自然语言当成 API。
- **输入输出**：输入 `{request_id: string, capability_id: string, arguments: object}`；输出 `{state: succeeded|failed|unknown, result: object, receipt_ref?: string, source: simulation|service}`；每项能力有独立 schema。
- **实现来源**：明确应用 API/适配器；当前 `tool` 中音乐、导航、电话仅界面仿真，并未真正播放、导航或拨号。
- **运行条件**：接口已实现、应用授权、网络和目标应用就绪；操作许可与参数检查通过。
- **失败处理**：服务拒绝或无回执不能报完成；不暗换应用，不自动进行未经定义的后续操作。
- **验证依据**：参数匹配、错误回执、取消、幂等/重复调用及真实应用状态；仿真界面变化不算真实服务通过。

### N14 记录执行证据 `event.record`

- **职责与边界**：记录输入引用、节点版本、实际调用与结果，支持回放排查；日志存在不代表业务判断正确。
- **输入输出**：输入 `{run_id: string, node_id: string, input_refs: string[], implementation_ref: string, outcome: object}`；输出 `{record_id: string, scope: session|persistent, stored: boolean}`。
- **实现来源**：日志程序与存储；当前 `event_log` 是当前会话时间线，刷新会丢失。
- **运行条件**：存储可用、脱敏与保留期限明确；优先记录媒体引用，不无条件保存儿童图片和密钥。
- **失败处理**：明确证据写入失败；不因此重复车辆动作。非关键诊断日志可继续并标注证据缺失；要求持久证据的交付模式需按发布策略阻断。
- **验证依据**：成功/失败均可追溯、模型与输入版本可定位、敏感字段不写入、存储故障与保留期限；永久记录尚未实现。

## 5. 两个场景按同一层级编排

### 儿童关怀

**用户目标**：测试时上传后排照片，模型判断出现所定义的儿童危险迹象后，中控左上角自动弹出独立后排视频；真实接入后可由后排输入适配器提供图像事件。

```text
接收图片 → 观察画面 → 校验结果 → 规则分支
                                ├─ risk → 展示后排视频 → 记录播放结果
                                ├─ normal → 记录本次结果
                                └─ unknown → 记录原因，等待新证据/给出简短测试反馈
```

这是建议的基础能力视图。当前 `video_display` 仍要求特定的 `decision_status` 和 `recognition.status` 风险字段，需要现有 `cockpit_alert`/映射步骤准备输入，不能直接按上述新 ID 粘贴执行。

风险成立但视频不可用，应明确“发现可能风险，画面不可用”，不能报“已经展示”。unknown 的默认策略为不触发自动风险视频，且不作安全保证；若要加入人工打开画面或保守展示策略，应另行声明与测试。无新证据、用户关闭弹窗、经过一段时间均不能解释为风险解除。

照片用于判断，视频用于查看，是两个独立数据源。真实持续监测另需采样调度、图像时效、摄像头接入、延迟测量、重复提醒与风险解除策略；仅定义节点不能补齐这些能力。

### 朵朵生日航海

**用户目标**：去滴水湖的旅程围绕朵朵生日展开航海故事，可包含谜题、小惊喜和轻量互动；它们是创意选择，不是每个阶段的必填模板。

```text
读取旅程背景 → 创作旅程内容 → 校验可执行结构
                                      ↓
                展示当前章节 → 等待回应 → 理解回应
                                      ├─ 答题 → 判定答案 → 更新进度
                                      ├─ 暂停/继续/退出 → 更新会话
                                      └─ 自由讨论 → 创作回应 → 展示
                到达事件 → 更新阶段 → 展示生日惊喜
```

这张图是目标设计；当前 `interaction` 已涵盖其中部分状态与固定问答逻辑，尚没有所有独立节点、自由讨论闭环和真实导航事件。提前到达时按已配置规则进入收尾，不能漏掉生日惊喜。驾驶员与乘客的交互对象要明确，不能用“游戏”默认要求驾驶员读题或操作屏幕。

创作阶段生成“要讲什么”；运行阶段在需要时生成“这一轮怎么回应”。模型输出内容，状态机决定能否推进；没有判题需求的叙事、角色扮演和发现式体验不强行套答题流程。

## 6. 与当前 16 种运行节点的对应关系

| 当前 type | 目标职责/层级 | 当前实现边界 |
| --- | --- | --- |
| `input` | N01 接收事件 | 手动文字/单图 |
| `systemInput` | N01 / N02 的输入适配器 | 天气仿真、当前图像；非通用 CAN/传感器接口 |
| `llm` | N03 / N04 / N05 的模型执行器 | 可调用模型；不同任务、模态和提供商路径须分别验证 |
| `recognition` | N06 校验视觉输出 | 不执行视觉识别；预设结果仅模拟 |
| `logic` | N07 规则分支 | 动态表达式，不是已隔离的规则沙箱 |
| `memory` | N02 的记忆读取/上下文写入适配 | 短期记忆，不是持久旅程状态；写入应限制会话范围 |
| `car_control` | N12 执行车辆动作 | 当前主要为车窗仿真 |
| `tool` | N13 调用应用能力 | 仅有限界面仿真 |
| `output` | N10 展示文字 | 无语音 |
| `fallback` | N10 的固定内容配置 | 错误如何路由由流程决定，描述文本不能代替连线 |
| `cockpit_alert` | N10 及风险数据映射 | 提醒/单图；连接视频时转交下游展示 |
| `risk_monitor` | 兼容占位，非合格持续监测节点 | 仅等待下一帧标记；禁止生成器当成后台监控 |
| `event_log` | N14 记录执行证据 | 仅当前会话 |
| `tts` | 旧版 N10 别名，待迁移 | 名称不符实际，只有文字；不新增使用 |
| `video_display` | N11 展示视频 | 独立媒体播放；不是摄像头感知或实时性证明 |
| `interaction` | 可展开子流程的现有复合实现 | 包含 N04/N05/N08/N09/N10 部分职责；不是一个基础节点 |

未来真实语音播报、图形游戏、持续传感器订阅、持久状态及真实导航需要独立契约和实现。473 项导入接口资料也不能仅凭有名称和参数就变成可执行节点。

## 7. 创造力与执行约束怎样配合

**允许创新的部分**：场景主题、故事结构、角色、节奏、交互方式、惊喜安排，以及“如果有新能力还能做什么”。不要求全部场景出现谜题、奖励、固定章节数或某两个场景的节点组合。

**必须受约束的部分**：调用哪个能力、字段怎样连接、设备能否执行、何时算成功、失败怎样处理、是否有证据。

编排建议分两步：先保留完整体验设想，再将每一步映射到节点与已登记实现。缺少“生成动态图形游戏”等能力时，保留想法并指出能力缺口；可提出文字互动替代方案，但不得悄悄把用户原始目标改成较弱版本并报完成。

只有已登记的能力和实现才能进入可执行图；新能力提案进入待实现区。有限节点可组合出新流程，能力库也可继续增长。

## 8. 怎样记录“准确可信”的证据

每条验证记录至少包含：

```text
能力 ID + 契约版本
实现 ID + 代码/模型/提示词/预处理版本
环境（仿真/真实服务/设备型号、OS、运行时、网络条件）
用例集与数据版本、样本数量、覆盖范围
执行日期、通过/失败/未运行、指标、原始报告位置
限制、失效条件、复核人
```

内容创作检查新颖性、可理解性和连续体验；视觉识别检查漏报、误报、未知率；状态节点检查确定性、幂等和隔离；动作节点检查真实回执。指标不可互相替代，门槛要按目标场景在测试前确定。

本轮只做代码与文档核对，没有新运行模型或设备测试。已有测试入口如下，**测试文件存在不等于当前修改后全部通过**：

| 证据入口 | 可以检查什么 | 不能证明什么 |
| --- | --- | --- |
| `studio/tests/node-capabilities.test.ts` | 分支/非法图、服务失败、动作范围 | 真实模型准确率、实车执行 |
| `backend/tests/test_node_capabilities.py` | 生成能力边界、非法节点、接口失败 | 任意愿望都能生成好体验 |
| `studio/tests/scenario-session.test.ts` | 固定问答、事件去重、进度、取消与生成失败 | 开放题评分、故事质量、持久化 |
| `studio/tests/video-replay.test.ts` | 风险分支、独立视频、加载失败及取消 | 摄像头直播延迟、真实车机可用性 |
| `backend/tests/test_model_providers.py` | 提供商适配与错误处理 | GPT/Claude 或 MiniMax 在任务上的实际效果 |

历史运行结果见 [dev.32 验收](<releases/2.8.0-dev.32/ACCEPTANCE.md)和 [dev.33 验收](releases/2.8.0-dev.33/ACCEPTANCE.md>)，仅适用于当时记录的版本和环境。本轮不继承为新契约已通过。此前 dev.34 的基准主要集中在两个场景及局部能力，不能代替开放场景编排质量验收。

模型、提示词、schema、运行适配器、关键数据预处理或目标设备变化后，需要重跑受影响证据；有对应记录之前显示“待验证”。

## 9. 让定义真正进入编排的下一步

1. 把本定义转为机器可读的节点注册表：schema、实现绑定、依赖、失败出口和证据引用。前后端引用同一来源。
2. 编排器先产出创意方案，再映射注册能力；缺能力、缺权限或缺输入则明确停在草案状态。
3. 编译阶段校验连线语义、分支、生命周期与依赖；通用模型只输出声明的结果，规则/状态/执行由平台控制。
4. 优先把观察画面、内容创作、会话状态和视频展示这几项接到新契约；逐步拆解 `interaction`，保留旧项目兼容。
5. 用儿童关怀和生日航海证明同一套基础节点能复用，再用不同用户愿望检验创作覆盖，分别记录结构正确、运行正确与体验质量。

这一版的交付是可共同修改的节点定义，不是新增 14 个已经可运行的节点。完成上述接入与验证后，才能将这些定义作为 AI 编排的实际约束。

## 10. 已实施补充：设计草稿与执行候选（2026-09-26）

普通工作流现使用WorkflowDraft结构契约，动态节点配置仍由能力校验检查；这不表示上文全部目标契约已经实施。跨提供商仅按schema声明处理字符串包装，字段错误必须可定位，不补造能力。

生成结果分为can_inspect（结构可画、允许检查）和can_apply（生成检查通过）。缺能力或待确认问题的图可在空画布中展示；不得覆盖已有普通节点。未通过草稿所有节点携带平台写入的designOnly，前后端执行器拒绝运行，保存与重载后仍然有效。后续重新生成、重新校验，不能通过模型自行声明“已验证”解除。

澄清问题与草稿共存，未确认条件继续阻断运行；不得把视觉/执行缺口变成固定文字输出，或用车窗代替氛围灯。即便can_apply为真，runtime_verified仍独立记录，不能视为真实业务运行证明。

实施与测试依据：[dev.46验收](releases/2.8.0-dev.46/ACCEPTANCE.md)。


## dev.48 已实现补充：氛围灯 HMI mock

2026-09-26 用户确认 HMI 调灯反馈可完成本轮体验。car_control 的 ambient_light.set / ambient_light.restore 仅用于 executionMode=hmi_mock，不填真实车型接口字段。set 接 input.data.light_color（#RRGGBB）、light_brightness（有限数值0–100），可接 light_reason / pose_tips（各最多600字），先校验再更新 VehicleWorld 并返回实际灯光状态；restore恢复第一次调整前的灯光，重复调节不覆盖恢复点。缺少真实车辆不构成缺口。

inputFormat=json 的 input 节点按 outputFields 校验模拟事件并输出 data 与 source=simulated-event；界面样例显式标注模拟。LLM json 的字段位于 input.data；recognition 的 vision 分支仍只适用儿童风险格式，其他JSON识别无需经过该节点。现有设备动作约束保持，只有显式 HMI 氛围灯模拟节点允许数据模式上游。


## HMI 共享控制执行契约（dev.52）

car_control可配置executionMode="hmi"、controlId、controlOperation="set"/"get"、controlValue。controlId必须位于studio/src/data/hmiControls.json注册表；值严格遵守boolean/number/string、枚举、整数、范围及颜色格式。不得同时填写module/signalKey/function。显式valueField可从input.data读取同名顶层字段；JSON模型仅该绑定允许直连，text不允许。未知控制、非法参数、缺失执行器都失败；strict_inference的无动作输出不触发固定控制。

GraphEngine调用VehicleSimulator.executeHmiControl → VehicleWorld → React订阅者，返回action_result的success、source=hmi、control、operation、requested、actual、revision。actual读自提交后的状态；get不写入。所有新设置UI调用相同执行器。旧seat加热/通风get/set映射四个座位；遮阳帘get/set映射指定区域；subscribe尚未实现。现有车窗异步执行和卡住/忙碌/取消反馈保留。驾驶/维护等参数可读写但没有相应动力学或网格动画，必须按HMI设置能力描述。

音乐/导航节点只报告已选择媒体或已设置目的地，不能把选中状态称作实际播放或路线开始。浏览器本地音频与实时地图/在线音乐服务各有独立连接状态。


## dev.56 已实现的通用图契约（2026-09-27）

此段描述新增实现，其余草案未因此全部完成。注册表以backend/app/services/node_capabilities.json为唯一来源；studio/src/data/nodeCapabilities.json 由 scripts/sync_node_capabilities.py 生成（dev.76），不手工编辑。

- `flowVersion:2`：普通输入显式使用可恢复执行；存在wait/state/stage时也启用。旧项目保持原执行路径。
- `wait`：eventName、prompt；match=any/exact，精确匹配answers；aliases文字模拟事件、hintInputs/hint提示；storeAs保存事件值。无默认业务关键词。`state`：values原子写入、increments有限数值增量。
- `stage`：parentId引用的视觉容器，连线连接内部能力；折叠只投影显示，不删改原图。显式整理布局同时整理内部节点。父子坐标保存原义。
- 数据绑定：文字`{{state.field}}`、`{{input.data.field}}`、`{{outputs.nodeId.field}}`，单字段对象`{"$ref":"state.field"}`保留类型。路径字段为字母开头的字母数字下划线。动作依然执行实际参数校验，绑定不扩大能力。
- 多输入明确joinMode=all/any；all等待所有路径决定（含跳过），any首条到达执行一次；targetHandle或源ID为input.inputs键。没有join策略不能默许重复执行。
- 事件入口input.eventName/aliases；interrupt终止其他未完成路径。结构化`$event`包含name/text/value/target或control；control=pause/resume/stop/restart/retry。输入框文本不会自动变成平台口令。
- HMI氛围灯沿用ambient_light.set/restore与hmi_mock；可配置color/brightness/reason/poseTips，或读取上游已声明字段。实际mock状态回执构成执行证据。
- 错误出口与重试保存已完成操作；重试仅重新执行失败操作及未完成后续，不倒放已成功动作。去重只对相同eventId，本地会话不提供分布式exactly-once保证。

会话目前保存在页面内存；不支持图环路、跨进程恢复和任意MCP工具执行。隔离自动试跑覆盖范围见dev.56验收。现有interaction仅为旧项目兼容，仍保留其旧推进语义；不得拿旧路径规则约束新通用图。Hermes正式入口尚未集成。


## dev.57 通用执行反馈（2026-09-27）

正式ScenarioBuilder使用同一GraphEngine运行候选的`execution_plan.cases`。每个用例包含输入步骤、预期状态与字段断言；每个用例的车辆、HMI、记忆与会话独立。执行API模型使用节点明确的providerId/model，密钥只保留在Python宿主，子进程只通过声明的模型通道请求推理。未接入服务不会伪造成功。具体应用状态与实测见[dev.57验收](releases/2.8.0-dev.57/ACCEPTANCE.md)。

- 模型指令字段是`systemPrompt`，`prompt/promptTemplate`不能静默忽略；text输出有`text/reply/raw_model_output`。wait恢复后`input.text`与`input.event.text`都代表最新回答。
- 共享HMI节点完整输出含`action_result`；实际控制值读`outputs.nodeId.action_result.actual`，不在节点根actual。executionMode=hmi不要求旧action字段。
- 逻辑表达式由Acorn解析并解释数据运算，不再通过new Function执行模型生成脚本。支持字段、比较、布尔、算术、三元、登记的字符串/数组操作与简单箭头回调；不支持全局对象、构造器、赋值、任意函数调用。源长度8k、嵌套64、操作1万、回调数组1000为资源预算。原来依赖任意JS的项目会明确报错，需要改成支持的数据表达式。
- 测试断言根字段为run/state/car/hmi/nodes/outputs/messages/actions；path为字段数组。nodes读取可恢复执行器的pending/waiting/success/skipped/failed/dormant状态；run.status为completed/waiting/paused/failed。car按嵌套快照读取，如car.ac.temp。
- 通用比较支持equals/contains/exists/not_exists/gte/lte；缺失与null不同。测试计划结构错误先修复；有效计划在候选修复阶段保持不变，不能降低预期来掩盖失败。
- 每候选上限6用例、每例30步、12次模型调用、150秒执行预算；正式生成最多三轮候选，总预算240秒。取消与超时终止子进程；子进程内存预算256MB。没有完成试跑时runtime_verified=false。

执行报告保存图摘要及输入/断言/实际状态，但它只证明这些样例。生成计划与内容审查来自同一创作模型，不能称作独立意图验收或模型质量保证。真实设备、多模态、外部工具、图循环与跨进程持久化仍需后续实现。

## dev.58 编排会话与验收计划

Hermes 的编排会话独立于场景运行会话。工具按 revision 读写节点图；upsert 的 set_data 合并顶层字段，省略字段保留，删除节点同时清理关联连线。任何改图使检查/试跑证据失效；最新候选检查及实际试跑通过后才能标 can_apply。八个工具不含终端、文件、浏览器或任意外部调用。

`WorkflowGenerateRequestSchema.acceptance_tests` 可提供 ExecutionPlan。调用方提供时计划在第一次工具调用前锁定；bounded 引擎也直接使用服务端保留的计划。模型不能通过改写预期来通过验收。未提供时模型编写的首个有效计划锁定；错误测试如无法执行应如实报告。equals 的 null 与字段不存在不同，跨 Python/Node 传输保留 null。

一次图运行中产生的非空 HMI 文字按发生顺序合并（只去除相邻完全重复项），因此动作反馈不会被其后的等待提示覆盖。会话记住最终显示文本，重复事件返回同一显示而不重执行动作。需要检查一个段落时使用 contains，而非假设只显示最后一条消息。

## dev.59 图片消息与动作回执

通用input或wait接收 `{type:"image",content:"data:image/png;base64,...",text:"问题"}`，亦可通过`$event.value`携带；HTTPS引用保持图片模态。wait.inputType为any（默认）、text、image；不符合类型继续等待，空图片不触发模型。恢复传递本次图片，后续文字不继承旧图片字节。来源仍为本次输入，不是持续摄像头感知。

Studio兼容消息使用image_url；服务端Anthropic适配为image/source，MiniMax保留image_url。支持PNG/JPEG/WebP/GIF，base64和MIME签名校验并非完整解码；模型服务完成实际解码。非用户图片块、未知模态及本地路径拒绝，HTTPS由提供商读取。单张decoded 4MiB与Studio准备限制一致，消息JSON 24MiB；Hermes和隔离试跑各2MB预算仍存在，不可把直接推理上限当成自动构图上限。依据：Claude Vision与MiniMax官方Chat Completions文档，链接见本轮验收。

JSON outputFields为字段名到string/number/boolean/array/object的映射。ambient_light.set顶层配置color/brightness/reason/poseTips；light_color/light_brightness/light_reason/pose_tips仅为省略配置时读取的上游input.data字段，误写到顶层会报错。普通绑定仍可用$ref保留类型，不改变业务场景规则。

某次运行没有显式展示节点时，实际动作返回的reply进入HMI；重复事件不重放消息。结果展示放在实际动作成功路径之后，不能先宣布成功再执行。已提供模型生成场景与独立回放证据；错误、外部工具、端侧部署与视觉准确性仍需按能力独立验证。

## dev.60 可重复等待与循环

`wait.data.repeat=true`声明新的循环入口；下游返回边必须以该等待点为唯一自然入口（等待点支配返回源）。删除这些返回边后图必须无环，因此不能绕过wait做无等待自动循环。循环之外的既有DAG语义保持。返回边不参加首次进入的汇合；多条外部进入边仍需要joinMode。一次迭代的返回路径全部决定、至少一条返回且下游无未决节点后，重新进入等待。普通条件分支、状态、模型、输出和动作构成循环体，业务退出条件仍由logic配置。

新一轮只在新事件满足等待条件时开始，清理该等待点之后的输出/分支状态（含上轮跳过的退出分支），保留state与上游已提交效果。旧输出不能被误当本轮数据。循环内旧interaction会话未接入重置，需使用wait/state/模型通用节点；阶段容器保持纯展示。嵌套与独立并行等待均有测试，不能推导所有跨入口或并发图均支持。

maxIterations是整个会话中该等待点接受输入的次数预算，默认1000，配置范围1–100000。超限记录真实失败，不继续动作；重试不清零，显式restart重置。暂停/恢复不消费业务回答，重复event_id不重放。退出用业务logic进入终点，不由平台硬编码“收尾”等词。

logic仅从input/value读取上游数据；裸state/outputs/event是不绑定的变量，即使在短路分支中也会预检失败。state节点实际输出中的state可用input.state读取；配置字段仍支持既有$ref/文字绑定。运行器已负责event_id去重，执行计划ID不等于input.event.id。

浏览器快捷rehearsal不能凭一条自动填充输入验证退出条件，对repeat图返回not_supported并说明需要显式计划，不伪造passed或failed。正式编排的真实引擎试跑继续使用固定多轮计划，所列输入通过才有运行证据。会话仍在内存，跨进程恢复、无等待计算循环、外部工具和端侧等价性另行实现。

## dev.61 执行快照

已保存项目的通用图（不含旧interaction）在每个完整事件结束时保存flow checkpoint、VehicleWorld及HMI状态；恢复不会再执行成功节点。流程签名包含节点配置与连线ID，忽略坐标/纯显示运行字段。图变更或无效快照必须显式重新开始；本轮不迁移旧快照版本。

服务端修订号和90秒执行租约在调用节点前写入running，完成快照后转ready；20秒续租失败取消后续节点，旧token/修订号不能完成。中途关闭、未确认保存或过期执行保留running，下一次输入不得自动重跑；核对动作结果后，租约过期才能重新开始。仅承诺完整事件边界恢复，不承诺崩溃时已执行外部动作的精确续接。

浏览器档案UUID与已保存项目文件名（缺少时使用项目ID）组成命名空间；现有站点认证保护API，不构成多租户用户身份。24 MiB快照预算包含图片与输出；超限明确失败，不静默裁剪。完整聊天历史、未保存草稿、旧interaction和媒体连接仍保持原范围。

## dev.62 MCP工具

真实MCP工具复用tool节点，tool_id=mcp、serverId/toolName、arguments对象；模型只可选已登记能力，动态参数以通用$ref绑定。GraphEngine读取服务端实际data（可null）、content/text和source=mcp，不将模型文字当工具回执。工具Schema、工具允许列表、明确的allow_trials与候选图绑定在服务端验证。工具出错走error出口并保留失败状态；不自动重发业务调用。配置和限制见[MCP_RUNTIME](MCP_RUNTIME.md)。

目录浏览和实际连接分开；没有登记/授权不能直接执行目录项目。固定地址、凭据引用和SDK进程由服务端配置，图里没有url/header/command字段。编排的工具描述与返回只作数据，不改变用户需求、模型权限或锁定验收。

### 结果断言与输入来源（dev.62补充）

acceptance_tests / execution_plan 的断言支持 `op:"satisfies"`，value为1–8000字符的纯数据布尔表达式。`input`（别名`value`）是path选中的实际证据；例如path为outputs时可比较两个节点的实际字段，path为hmi.message时可核对格式。复用logic受限解释器，没有eval、网络、全局对象或正则；所有用例的表达式语法在第一项模型/工具调用前预检。缺失字段、类型错误、非布尔返回保留实际证据并记为断言失败。

新增文字split仅接受一个原样字符串分隔符（可为空），原文最多100000字符、分隔符最多128字符、结果最多1000项；超限报错，不截断后判为通过。`input.split("。").filter(s => s.trim().length > 0).length === 2`可验证按中文句号分隔的两段，但不能证明事实准确或讲解有趣。关键词、格式与内容质量应分别核对。

节点input是其上游输出；工具后的input.text不是最初乘客输入。原输入从outputs中的输入节点读取，或显式保存到state并建立正确依赖。下游模型已收到上游text，无需在systemPrompt重复包装成互相冲突的字段。MCP data=null仅表示无structuredContent，不能据此声称原文中材料、年份等事实不存在。

### 编排修改参数反馈（dev.62补充）

Hermes读图返回的节点data是存储格式；oakegde_patch_graph.upsert_nodes使用set_data合并顶层字段、remove_data_keys删除指定字段，省略项保持原值。未知参数继续拒绝，不能静默把data转换为set_data或覆盖整节点。

工具参数校验失败返回details和argument_contracts：后者只列出错位置的必填项、字段类型/枚举/说明，数组索引归并为*，不回显提交值。节点内部契约错误不伪装成工具参数Schema错误。失败附带session_state中的当前revision、本次需求/测试锁定及证据状态；未登记本次需求明确指向oakegde_brief。错误调用不放宽锁定测试、版本或原子修改规则。

格式断言须匹配实际约束：仅计算非空句号分段会放过重复句号和其他终止标点。若要求全文恰好两个中文句号，可同时检查split("。").length===3与非空分段数；必要时显式排除问号/感叹号。该规则属于调用方测试计划，不硬编码到通用图引擎。


## dev.63 Hermes实际内容核验

Hermes的oakegde_trial在实际引擎断言通过后，以已配置编排模型的独立上下文核验本次文字/结构化证据；不提供图修改或业务执行工具。核验涵盖每个已运行用例/步骤，结合多轮顺序理解中间等待，不要求每步提前完成后续目标。报告source=same_model_separate_context、independent_verification=false，不冒充独立事实认证。

每个问题必须逐字引用本次用户请求/用户历史中的约束，以及具体case_index/step_index/evidence_path下真实存在的输出片段。宿主拒绝漏步、重复、伪造约束/证据和不一致的pass/fail。无问题只能说明所列证据未发现违背；不证明所有未来输入均可靠。媒体data URL替换为摘要并明确未审查，不把文字核验当成视觉事实判断。

runtime_verified仍仅代表实际引擎运行断言；可应用还需要最新版本content_review.status=passed。图修改或新试跑会使旧核验失效；缺失、服务错误、超时、无法解析和无效引用均不可放行，原运行证据保留。问题反馈用于局部修复，调用方测试不变。最多三次实际执行；同版本且图指纹一致的成功运行复用证据，已有通过/语义拒绝不重抽。每份执行证据初次核验及错误恢复合计最多两次，每次45秒；核验输入JSON250000字节、输出6000token预算，超限明确失败，不静默裁剪步骤或文字。

只对已观察到的Schema数组字段同名JSON字符串包装做无损解析，存在额外键时拒绝，不丢字段凑合法结果。没有全局业务关键词黑名单或自动降低用户需求。bounded路径仍保持既有模型辅助审查，未声称切换到本核验协议。


### dev.63 同轮补充：图编辑事务删除语义

API 编排工具 `oakegde_patch_graph` 删除节点时自动移除其关联连线。同一事务的 `remove_edge_ids` 按请求的基准图验证，允许同时明确列出这些原有连线，不能因级联删除顺序误报不存在。原图不存在的连线、重复删除 ID、同批删除并重写同一连线仍拒绝；所有校验在副本上完成，失败不改图、不推进版本、不清空既有执行证据。成功修改使旧检查/执行/内容核验失效，锁定测试保持。

依据：dev.63 结构化创作补充真实 API 失败、主工程同批删除回归，以及 `outputs/graph-transaction-dev63` 的62项相关检查。输入节点旧的英文子串预筛选另有误报；该修复尚待明确授权，不能把本节理解为已更改输入策略。


### dev.63 核验恢复契约

oakegde_trial的工具名和参数保持不变。当前版本/指纹的运行已通过时，passed或needs_changes直接返回原判定；核验error/缺失且仍有预算时，只重核验该份证据，不调用executor、模型节点或业务工具。运行本身失败仍使用原三次实际执行预算。图修改清空旧执行/核验/本次历史，锁定测试保持。

trial_action为executed、review_retried、cached或review_budget_exhausted；execution_reused区分是否复用。review_attempts包含中断与异常请求，review_retries_remaining仅表示当前允许的错误恢复次数。每份执行证据最多两次核验；实际执行预算耗尽后，当前证据仍可使用剩余核验额度。外层时间与工具轮次预算不变。

content_review_history在工具摘要和最终build_report保留当前执行的全部核验结果。model_calls/tool_calls仍是被复用报告中的历史次数，不能按重复trial累加。核验前深拷贝证据；异常只暴露类型，取消传播并计入核验额度，均不放行。此恢复仅限一个AuthoringSession，不提供跨请求、崩溃或浏览器重启恢复。


### dev.64 JSON模型节点的有限格式修复

data.jsonRepairAttempts是0–2整数，省略为0；仅outputFormat=json可以启用正数。首次结果及每次修复都按同一outputFields进行对象/顶层字段类型校验；仅该校验失败可以再次请求同一模型。未声明字段仍不进入data，不降低原契约。通过后json_repair_attempts记录实际额外请求数，raw_model_output为最后通过的原文；trace记录各次校验和推理，失败保留诊断。

保留原始文字/图片消息和模型绑定，每次修复只附加最新无效回答及校验反馈，不累积旧失败。无效回答超过32000字符明确失败、不截断；所有修复请求共用同一节点期限（dev.69网页执行：按inferencePolicy.json的模型策略，OpenSparX180秒、其他默认60秒，客户端另留5秒传输宽限；隔离验收预算独立保持）。在隔离试跑中，各次请求均计入现有12次模型调用总预算。JSON格式正确不等于内容、语义或事实正确。

服务/HTTP错误、取消、空响应、截断、模拟响应或严格本地模型身份不符不进入格式修复；原错误边/失败路径保持。修复期间不重放上游state/工具/动作，也不运行下游；耗尽后失败。默认关闭，既有项目不会新增API请求。该能力为节点配置与API编排契约，不声称新增可视化设置面板已验收。

依据：[dev.64验收](releases/2.8.0-dev.64/ACCEPTANCE.md)。旧输入子串预筛选保持未改，其误报修复仍等待此前明确授权。


### dev.64 构图参数与终止诊断补充

Hermes的NodeEdit.set_data已经是节点data的顶层字段映射，不能再设置set_data.data。该包装曾使systemPrompt/outputFormat/jsonRepairAttempts/responseText不执行，而模型绑定默认值仍可产生不必要调用。当前工具在事务提交前明确拒绝，返回准确参数路径和修复说明；不自动展开、合并或猜测字段。旧节点的无效data包装可通过remove_data_keys=["data"]显式移除。values/arguments等声明字段里的业务对象仍可包含任意名为data的键，已有项目读取及未修改字段保持。

build_report.hermes.run保留安全的SDK终止元数据：termination、completed/failed/partial/interrupted、api_calls、已知failure_reason和failure_retryable，附当前revision、节点/工具计数、最后工具状态和所处阶段。api_calls是SDK上报口径，不代表独立核对的计费请求数；失败工具计数和阶段只是观察结果，不把最后一次错误推断为唯一终止原因。未知错误分类忽略，未知异常类型归为other。

无候选/异常时HTTP503的detail提供code=hermes_incomplete、固定message和diagnostics；SSE error维持message并附diagnostics。工作进程和公开边界均白名单校验，不转发SDK messages、final_response、error文本、推理、工具原始轨迹或凭据。可检查候选仍按原实际运行及内容核验门槛处理，终止状态不作为成功依据；没有自动重试、换模型、增加预算或放行。


### dev.64 绑定预检补充

通用可恢复流程的文字绑定仍匹配运行时的{{path}}语法；根为input/event/state/outputs。路径各段须是字母开头的标识符，不能用原型字段、空段或数组数字索引。outputs后的节点ID必须存在且不是不执行的stage容器。单字段对象{"$ref":"path"}按同样规则检查；包含其他属性的普通业务对象不被当作typed ref。不自动把直接节点名改成outputs，也不猜测错字。

检查递归覆盖配置中的字符串、数组和业务对象，反馈准确data字段路径；仅忽略name/label/description和已知界面/旧运行证据字段（status/output/trace/activationIndex/effectivePrompt/collapsed/designOnly/designIssue），stage配置不执行绑定。没有匹配到实际运行时绑定语法的普通文字不被解释成表达式。仅检查静态路径是否支持，不推断input/state的动态字段存在性、分支时序或未来状态；合法缺失值仍按原绑定器返回空文字/undefined，使用者需通过实际断言验证。

Hermes inspect在本地检查每个llm的云端试跑就绪性：固定providerId/model与服务端配置可解析且存在凭据，错误在执行前返回，不消耗三次试跑预算。直接execute_candidate使用真实云端适配器时也检查；明确注入的测试适配器保持原行为并标注来源。这里只读本地配置，不发网络探测，不证明远端可用/模型能力；不推断提供商或覆盖已指定绑定。浏览器本地推理和旧非通用流程未因该云端检查被禁用。


### dev.64 内容核验格式反馈

review_execution接受可选previous_error；只有status=error、failure_stage=validate_response且artifact_sha256/evidence_sha256均与当前非空摘要一致时，才使用已知错误码生成反馈。错误码覆盖response_schema、invalid_response、coverage_invalid、omitted_steps、invalid_request_quote、invalid_evidence_path、missing_evidence、invalid_evidence_quote；字段路径只允许已知checks结构，最多12条错误输入，覆盖地址从当前真实cases/steps推导。

原始错误正文、无效核验回答和provider消息均不复制到重试提示。retry_feedback包含静态修复说明、合法错误字段及required_addresses，不提供应当通过的结论；原始证据消息保持相同，仍严格检查覆盖、引用、语义拒绝与原输出Schema。不能靠丢弃findings、把用例名称猜成编号或放宽引用来通过。服务错误不伪装为Schema反馈，未知错误码不附加反馈。

AuthoringSession在计入下一次尝试前拷贝上一条错误历史；每份成功执行证据仍最多两次核验，取消/异常计数保持，passed/needs_changes不重抽，图版本变化清空反馈历史。元数据error_code和retry_feedback进入现有报告；本轮未加入跨请求恢复或额外模型调用，也不在重试时重放运行节点。


## dev.65 通用流程中的动态HMI值

通用流程的car_control可将controlValue设为单字段对象{"$ref":"state.savedValue"}或outputs.<节点ID>.action_result.actual等合法路径，保留值类型。绑定预检检查根/路径/节点存在性，运行时解析后仍按注册表检查类型、范围、整数、选项和颜色，不把未解析引用直接执行。数字不能通过{{...}}文字插值传入。旧非通用图不支持该绑定。

通用流程中的JSON模型可连接显式配置的已登记HMI读取/常量/动态目标节点，不限于valueField；这补充上文dev.52的旧限制。模型text输出仍不作为车控动作，其他未接入车辆接口仍拒绝；未新增真实车辆执行器。单节点配置检查只验证引用形状，是否通用流程及输出节点存在性由整图检查负责。模型输出到动作的实际值仍须通过严格执行检查。

SDK诊断补充固定SITE_FAILURE_CODES的truncated、invalid_response、empty_response、loop_error、interpreter_shutdown、session_busy，不接收任意字符串或错误正文。详细证据见[dev.65验收](releases/2.8.0-dev.65/ACCEPTANCE.md)。


## dev.65 事件输入载荷（同轮补充）

无入边且配置eventName的input/systemInput先将本次载荷交给原输入处理器，处理后单独附加event={name,text,value}。文字入口text为字符串，不再把包含text/event的包装对象嵌套进text；显式事件text优先于value.text。图片保留type/content，模型接收本次文字与原图片。JSON入口的value可为JSON字符串或对象，经已有outputFields类型验证和字段筛选进入data；event元数据不混入业务字段，同名业务event仅保留在data内。

普通起点、wait、路由、去重、重复等待与执行权限保持。没有新业务命令或默认拓扑。事件文字以字符串交给原输入处理器，也经过原有字符串筛选；没有移除crash/hack/kill筛选。旧持久快照不自动改写历史输出，更新前已失败且保留旧嵌套输出的会话需重新开始验证。专项与原失败图证据见[dev.65验收](releases/2.8.0-dev.65/ACCEPTANCE.md)，不代表整个草稿已通过。


### dev.65 核验证据错误定位

引用原请求、证据路径或实际片段不合法时，ReviewProtocolError仅带由主机生成的checks.<序号>.findings.<序号>.<字段>地址。允许的一次错误重核验复用该安全定位，不回显无效引用原文或提供商响应；图/证据摘要隔离、严格引用匹配与两次总额度不变。核验指令明确唯一字段名与非字符串的排序紧凑JSON格式，推荐引用标量字段；不自动丢弃额外字段、不自动改判通过。实测与限制见[dev.65验收](releases/2.8.0-dev.65/ACCEPTANCE.md)。


## dev.68 Hermes 分工层

维护日期：2026-09-27。依据：[本轮需求](releases/2.8.0-dev.68/PRD.md)，实现状态与实际验证以[验收](releases/2.8.0-dev.68/ACCEPTANCE.md)为准。

主管使用 `oakegde_delegate` 创建独立 Hermes AIAgent：requirements 返回 ScenarioBrief，architect 返回状态/转移/绑定/能力缺口设计，builder 返回 GraphPatch，tester 返回锁定计划评估或 TestPlanInput。子 Agent 工具为只读能力/图与本角色 deliver；成果附唯一 ID、角色和基准 revision。主管通过 `oakegde_apply_artifact` 应用，沿用原 AuthoringSession 事务及契约；子 Agent 没有并发写图入口。首版串行委派、最多8次；未启用官方 delegate_task 的后台/并行模式，也没有修改固定 SDK。

请求 `agent_mode=single|team` 覆盖服务端默认；省略按 `.demo-runtime/orchestration-engine.json` 的 agent_mode，未配置仍为 single。全部角色继承当前请求明确选择的提供商、模型和服务端地址，不静默切换模型。图执行器和执行后的独立内容核验仍沿用原逻辑，测试员的文字评估不代替实际运行。

单/多模式同为40次编排 completion 尝试和720秒，所有子 Agent 共用预算；外层780秒取消整个进程组。这里的 completion 计数不是账单请求数，SDK内部传输重试、场景模型最多12次/候选与原内容核验各有既有边界。报告 collaboration 记录角色、成果、用量与耗时，不存原始SDK推理；execution_and_review_usage 仅采集提供商返回的数值字段。金额未知时 cost_usd=null，不能使用未知网关费率估算成实付金额。

能力预检基于实际已登记契约/连接配置；HMI行为测试在最终图的隔离试跑中执行。没有真实机器人、车辆或服务接口的动作允许保留：覆盖标记 missing、节点标记 designOnly/designIssue、报告 capability_gap/can_apply=false。此类草稿可查看，但不能被称为运行通过；本版不接入新的真实设备。


### dev.68 MiniMax 交付与字段修复

2026-09-27。新增 input 省略 flowVersion 时仍由宿主默认补整数2；显式填写时 GraphPatch 和候选能力预检要求 JSON 整数2，拒绝字符串、布尔、其他数值，避免模板绑定误入旧执行器。只验证声明了该字段的节点，不迁移原有无字段项目。set_data 配置直接位于顶层，能力表 fields 是字段目录，不能复制成配置包装。

同模型专业角色接收宿主读取的能力/图快照，交付有效成果即结束子循环。MiniMax-M3 的 api.minimaxi.com/v1 绑定已验证指定工具提交，子角色采用该方式；主管仍普通 ReAct 工具循环，其他绑定不自动启用。测试计划锁定时，测试员的交付 Schema 不再提供可改写的计划结构，只允许 assessment 和 null proposed_plan。错误字段按既有 argument_feedback 返回，不输出无效原值；报告仅增加交付次数和安全契约反馈。预算、三次试跑、内容核验和 designOnly 边界保持。实际成功和失败见本轮验收。


### dev.68 同版本已验收结果的宿主收尾

专业角色调用结束时，如果模型尚未调用submit，宿主只在所有必需角色成果均已应用（架构为已交付）、无待确认问题/能力缺口、当前revision结构检查通过、实际运行通过、独立上下文内容核验通过，并且三份证据的图摘要均与当前图一致时调用原AuthoringSession.submit。记录finalization.source=host_verified_finalize和model_submit_called=false，trace明确标注宿主来源；不增加completion预算、不改图、不重新试跑、不编造模型提交。缺失角色、陈旧证据、内容拒绝/错误、不可执行设计继续原草稿流程。测试员“已交付但未应用”的例外仅适用于明确缺失能力草稿，不适用于可运行候选。


## dev.69 本地推理生命周期

网页OpenSparX请求遵循共享策略studio/src/data/inferencePolicy.json；断连与180秒服务期限关闭本地HTTP推理连接，等待底层取消检查点释放。图像保留原有最长边2560与原图精度，原始上传不改写。超时、取消不提供正常/风险结论，后续节点不得继续。同步内部调用及其他云提供商尚不具备相同的断连中止保证。见releases/2.8.0-dev.69/ACCEPTANCE.md。

## dev.90 MCP目录配方补充（2026-10-05，已实现范围）

已封装目录工具允许手动拖入现有tool节点：`tool_id=mcp`、`serverId=catalog-fetch|catalog-time`、对应`toolName`和arguments；上游引用规则保持。同一服务的每个工具使用独立参数列表。仅配方声明input_ref的字段默认引用上游，其余必填字符串留空，可选无默认值参数省略。可选catalogId/mcpParameters仅用于展示和表单，不能授权任意命令、端点或环境变量。首次实际调用由后端固定配方准备环境，自动试跑权限仍独立且该配方默认关闭。未封装目录条目不可添加；人工可用不等于生成器试跑可用。输入、失败出口、原始结果和取消边界见[MCP_RUNTIME](MCP_RUNTIME.md)，实际证据见[dev.90验收](releases/2.8.0-dev.90/ACCEPTANCE.md)。

## dev.96编排契约说明补充（2026-10-06）

现有执行能力不变。编排能力查询对基础注册表作深拷贝，补充HMI字段类型/注册ID与有效示例、tool_id取值、providerId/model区别；HMI约束取自实际hmi_controls.json，前端目录保持。错误反馈明确顶层set_data、remove_data_keys和事务冲突修复。模型绑定保持显式，不自动填值；真实导航等未接入能力仍按missing记录。说明改进不代表场景执行通过，见[dev.96验收](releases/2.8.0-dev.96/ACCEPTANCE.md)。

## dev.98字段目录与错误定位（2026-10-06）

本节替代dev.96的“编排视图临时补充字段”实现描述；历史验证不改写。规范目录直接声明所有本轮三个校验器读取的顶层data字段。common_fields提供一次定义的joinMode等通用字段；每种节点fields提供类型、枚举/开放值域、无条件与条件必填及示例。禁止键明确标记forbidden并给合法替代，不作为可用能力。兼容logic.type已有项目，不迁移项目数据；新图只推荐logic_type=if/filter。

报错包含data.logic_type实际值、data.joinMode和普通入边ID、coverage.node_ids具体不存在ID。删除节点或以删旧增新方式改ID，patch结果warnings列受影响需求；coverage原样保留，只有显式覆盖修改才能修正引用。不会为了通过校验自动删除需求或改验收。

目录与HMI注册、前后端生成副本通过回归检查；不引入执行能力或调整架构/预算。结果见[验收](releases/2.8.0-dev.98/ACCEPTANCE.md)，维护方法见[开发约定](../developer/DEVELOPMENT.md)。

## dev.100模型工具的字段Schema（2026-10-06）

目录字段增加bindable（是否允许整个字段使用类型保留引用）及数组items。node_data_schema自动投影为GraphPatch的set_data.properties；绑定对象单独定义为仅有字符串$ref、禁止额外键的对象，通过anyOf与字面量组合。此Schema用于模型工具说明，未增加参数转换、拆包或运行期校验。嵌套业务对象的细节仍由现有专项契约负责。

prompt/inputType/type存在跨节点契约差异，只提供逐节点描述，不硬选类型或合并为无条件可用的枚举。局部patch不要求完整节点必填字段；全禁用字段不作为可写属性。通用字段只生成一次。运行元数据trace/output的数组items保持开放JSON值，aliases/answers/hintInputs为字符串元素；不凭示例推断类型。模型ID仍显式填写，不自动绑定。

固定Hermes会把$ref字段名清洗为_ref，anyOf内逆向恢复有已确认缺口；本轮不修解析器，因此不能声称引用端到端已可靠。大小、实际请求与剩余问题见[dev.100验收](releases/2.8.0-dev.100/ACCEPTANCE.md)。

## dev.101通用试跑诊断与引用恢复（2026-10-07）

controlId的enum_source指向hmi_controls，patch Schema直接从注册表生成枚举，目录同步脚本刷新物化枚举并检查漂移。图内非法HMI控制原已由inspect检查；本轮补测试初始cases[].controls的登记/inspect/执行前校验。未知ID给文字相近注册项，并明确没有能力时标missing，仿真须确有实现且标simulated，不能捏造ID。

实际waiting与期望completed不符时反馈包含等待节点、prompt、事件名/类型/匹配/答案/别名。AI选择修图或显式修测试，宿主不代改。用户确认：仅AI生成计划且当前试跑有该不匹配证据，可将对应步status改waiting并紧接补回答；原步骤/输入/断言与用例条件全部保留。调用方计划、无证据/旧证据与其他改动仍锁定；不重置3次试跑预算。

Hermes交给AuthoringSession的工具入口递归还原精确单字段字符串_ref对象，按调用和报告记录次数；不修改SDK，不拆item，不改多字段_ref对象。此条替代dev.100中本轮尚未处理的宿主引用恢复状态，历史实验结论保留。验证、源码清单和仅本地保存的上游问题见[dev.101验收](releases/2.8.0-dev.101/ACCEPTANCE.md)。


dev.102（2026-10-08）用户明确授权：共享编排预算由24次/480秒放宽到40次/720秒，宿主540→780秒。此前版本数字仅为历史证据；当前期限审计、真实结果及限制见[本轮验收](releases/2.8.0-dev.102/ACCEPTANCE.md)。图执行与独立内容核验的局部预算保持。


## dev.102：预算与工具参数边界（2026-10-08）

用户授权共享编排预算40次/720秒、宿主780秒，Vite编排代理810秒；网页编排fetch没有定时提前取消。worker临时profile中custom/anthropic请求与停滞期限同步720秒，仍受整体deadline约束。入口3轮、子角色4轮、委派8次及图执行150秒/三次、核验45秒/最多两次维持各自边界，不把这些局部预算误当成整轮期限。

剩余编排调用≤3、当前revision检查通过且有未试跑有效计划时，宿主可执行完整trial；内容核验不可用只重试核验一次。启动需预留245秒宿主时间，不足明确跳过；不生成测试或修改图。host_finalized只说明触发来源，能否应用仍由runtime_verified、can_apply与原证据门槛决定；host_trial_model_calls/review_calls独立计数。未通过沿用incomplete_result。报告保留finalization原因、失败阶段和原证据。

工具入口先做既有单字段_ref还原，再按生成Schema处理item/$text单键包裹；只接受明确的数组/标量类型及无损转换，未知字段/类型冲突/多键对象不拆。顶层只允许完整通过patch Schema的item对象。每次变换的路径与前后值写入diagnostics.normalization_details，normalizations与normalizations_by_provider汇总。多类型controlValue若允许字符串，则保留字符串，不推测控件语义；后续HMI校验仍可能拒绝字符串数字。

测试计划Schema自动来自ExecutionPlan类型目录，case/step均禁止多余字段；错误附具体路径及正确层级示例，不自动搬字段。SDK和共享依赖不修改。完整回归与真实结果见[dev.102验收](releases/2.8.0-dev.102/ACCEPTANCE.md)。


## dev.103：测试状态与不可达反馈（2026-10-08）

测试步骤status通常省略，沿用not_failed及实际值断言；明确要求完成/等待时才填写。AI计划可单独改/删任一步status，不需waiting证据。其他输入/断言/controls/步骤增删继续遵守dev.101受限规则，调用方计划锁定；缓存失效但试跑次数不重置。此条取代dev.101仅waiting证据下修订status的限制，历史证据不改写。

不可达节点检查附ID与“从可达节点补边”/remove_node_ids两个修法。patch显式删边或删节点导致新不可达时提前警告，不自动删除。图LLM遇真实HTTP529/503等待2秒原模型重试一次，计入原model_calls/时间上限，报告overload_retries；其他状态不重试。当前每次编排API默认150秒（替代dev.102单请求720秒），整轮40/720/780不变；配置主依据见[开发配置](../developer/CONFIGURATION.md)，测试与结果见[dev.103验收](releases/2.8.0-dev.103/ACCEPTANCE.md)。


dev.104：inspect复用Studio纯数据表达式解析器，前置检查logic条件及测试satisfies（根input/value、既有纯函数白名单）；绑定仍按flow_contract允许input/event/state/outputs。禁止将绑定根直接当表达式全局变量。outputs引用须指向现存执行节点；反馈带字段路径、实际值与示例。不执行表达式、不改变运行时。每个测试case独立会话、车辆和记忆；已有记忆必须在本case前置步骤写入，正确例见scenario_execution.py的MEMORY_CASE_EXAMPLE。


## dev.105：JSON 输入与测试计划契约（2026-10-09）

当前实现：input/systemInput 的 inputFormat=json 接受直接对象（step.input 推荐形状）、JSON 字符串，以及带 text 字段的对象（text 必须是 JSON 字符串，存在 text 时按包装解析）。例如 outputFields={"temp":"number"} 对应 step.input={"temp":22}。outputFields 是必需字段与严格类型映射，不是 JSON Schema；不做字符串转数字，缺字段/错类型立即失败，只保留声明字段，输出位于 outputs.<入口>.data，来源仍为 simulated-event。JSON格式优先于媒体判定，业务type/content字段不触发图片校验或被额外包装。具名事件使用 $event.name 与 $event.value，不使用 $event.data；后续 wait 回复按等待节点接收，不重新套用已完成入口的 JSON 约定。

前端 GraphEngine 与后端 trial 共用 TypeScript 输入解析器。test_plan 提交、inspect、执行前均检查可确定的入口输入，错误包含 plan.cases[i].steps[j].input、节点与字段。提交失败不锁定计划，不调用模型；inspect 会重新检查修改后的图。INPUT_JSON_PARSE / INPUT_OBJECT_REQUIRED / INPUT_FIELD_MISSING / INPUT_FIELD_TYPE / INPUT_FIELDS_SCHEMA 属于 input_contract；真正模型返回解析失败使用 MODEL_JSON_PARSE / MODEL_OBJECT_REQUIRED / MODEL_FIELD_TYPE 等 model_output 码。模型输出字段声明本身无效属于 graph_logic。parseModelObject/validateModelFields 仅在真实模型响应处理处使用。

trial 的 contract_diagnostics 提供 category/code/path/node_id/field（适用时）/message/repair_hint，类别为 input_contract、model_output、graph_logic、assertion；failures 同步标注类别和修复方向。输入错误先改测试计划或不符合需求的入口契约；模型输出错误检查实际模型节点；图错误检查连线/绑定/配置；断言错误比较真实证据再决定修计划或图。状态符合 not_failed 但值断言失败时，不再声称状态不符。既有计划锁定与试跑预算保持，提示不等于授予任意改测试权限。

inspect 对普通/具名入口及可达路径保守推断，在 wait/interaction 处停止继续遍历；可能到达等待而 status=completed 或用例无后续 step 时给 PLAN_WAITING_PATH 警告，包含节点、事件与原因。动态条件、匹配结果、interrupt/join、循环与 interaction 内部阶段无法完整静态证明，警告不阻断、不声称路径必然发生。

每个 case 都是全新会话、车辆、state 和记忆，不跨 case 保留。多轮记忆必须在同一个 case 的多个 step 中准备和读取。若此前 case 有可达 buffer 写入，而当前 case 可达 buffer 读取但没有自身可达写入准备，给 PLAN_CASE_MEMORY_ISOLATION 警告。读/写角色沿运行时“下游可达 llm 则读，否则写”的契约识别，无场景词判断；只提示可能依赖，不能从任意自然语言或模型条件证明记忆假设。动态分支可能产生漏报/误报，仍需 trial。

验收与实验主依据：[dev.105 验收](releases/2.8.0-dev.105/ACCEPTANCE.md)。不改日常5175，不代表任意场景编排可靠或实车验收。


## dev.106：断言前置契约与受限恢复（2026-10-09）

断言路径必须来自真实图/目录：car 中有显式 path 的控制项按该 path 读取，其余用 ["car","hmiSettings","完整controlId"]（controlId 中的点不拆分）；JSON节点字段位于 ["outputs","节点ID","data","字段"]，output/tts返回字符串；["nodes","节点ID"]必须引用现有节点及合法状态。提交与inspect返回 PLAN_ASSERTION_PATH 和合法候选、PLAN_ASSERTION_TYPE 和期望类型。equals严格区分string/number/boolean；使用JSON数值/布尔值，不把数字或true/false加引号。AI锁定计划仅额外允许：有推导/实际类型证据时，将equals字符串值改为语义等值数字/布尔；或把非法路径改为预检合法候选。返回revision_kind，其他内容保持，调用方计划仍完全锁定，缓存失效但预算不重置。

错误类型反馈保留JSON原值及类型，如期望 `"3"(string)`、实际 `3(number)`；缺字段显示 `undefined(missing)`。静态检查只拒绝已知封闭输出形状中的非法路径，动态工具结果/未声明对象字段保留未知，仍由实际执行断言验证。节点状态按通用/旧执行器区分。

state跨case检查从state节点values/increments写入字段与input/state/outputs绑定读取字段推导，不按节点名字或场景语言推断。此前case写入且本case读取前没有可达准备时给PLAN_CASE_MEMORY_ISOLATION；分支可达性不是执行证明，可能误报或漏报。

编排适配层识别length/max_tokens/max_output_tokens，整次请求最多额外重试一次，重试前丢弃部分响应，不执行其工具参数；提高该次token上限（最多64000），计入40次/720秒原CompletionBudget。剩余调用不足或不足150秒（现有单次超时上限）则跳过；第二次仍截断阻止SDK再次实际请求。诊断truncation_retries、truncation_skip_reason（call_budget/time_budget/retry_limit），不修改Hermes源码。

范围、测试与真实实验见[dev.106验收](releases/2.8.0-dev.106/ACCEPTANCE.md)。


dev.106收尾补充：断言路径排除原型继承字段，buffer输出形状沿真实读写角色推导；同一断言可同时进行合法候选路径修正和有目标类型证据的等义类型修正，revision_kind=assertion_path+assertion_type。冻结实验与最终补修证据分列，见[验收](releases/2.8.0-dev.106/ACCEPTANCE.md)。

### dev.107 精确连接诊断、核验证据编号与推进门槛

node_capabilities.connection_contract是数据提取、动作决策、显式HMI/MCP绑定的机器依据，brief登记结果与capabilities同时提供。patch_graph接受有效图事务后立即返回GRAPH_CONNECTION_CONTRACT诊断；inspect使用同一检查阻止不兼容图执行。诊断包含上游节点、每条连线ID/端口和下游节点、实际输出形状、消费契约及1–3条合法修法。沿非error路径追踪，遇到新模型/展示等重新生成输出的节点停止旧来源传播；auto输出由运行时判定，不冒称静态已知。HMI显式常量与合法字段绑定、MCP显式参数绑定按真实行为允许；动态结果仍需trial。

内容核验保留完整文本/结构证据（含nodes状态），宿主给每个节点输出、动作回执、节点状态及其他证据域字段分配稳定evidence_id。编号绑定case/step/路径/值，内容或步骤改变不能复用；同证据重核验编号相同。finding优先提交evidence_id；宿主回填原路径与原文，再检验请求引用、步骤覆盖与判定一致性。check.evidence_ids允许pass引用所审关键证据。旧evidence_path/observed_quote仍需严格匹配；invalid_evidence_quote记录两侧长度/哈希/首个差异位置及最多320字符差异窗口，服务异常正文仍不回显。250KB/45秒/两次核验预算不变，不静默删证据。

PLAN_ASSERTION_WEAK警告nodes.<id> exists仅证明状态记录存在，skipped/dormant/pending也会通过；建议equals success或实际回执/输出。PLAN_EVENT_UNMATCHED使用执行器eventOf和图中入口/等待配置，对无匹配可达入口或等待的输入说明识别事件与期望；text内JSON不自动解包。两者仅警告，宿主不改计划；动态分支仅作保守推断。

结构inspect通过且无计划时返回next_required_step。共享调用或时间超过50%且无计划时，宿主在下一次编排模型调用注入一次AUTHORING_PLAN_DUE提醒，提醒不增加调用/时间额度。主动submit没有当前revision和图指纹对应的实际trial证据时返回SUBMIT_TRIAL_REQUIRED；图改动后须重跑。宿主预算结束保留不可应用草稿及既有host finalize验证门槛不变。

本轮验证与限制见[dev.107验收](releases/2.8.0-dev.107/ACCEPTANCE.md)。
