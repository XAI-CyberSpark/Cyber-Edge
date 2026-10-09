# dev.65 验收记录

2026-09-27。主工程 /Users/Shared/sherry/OAKEgde Studio；证据 /Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/reversible-settings-dev65。未提交、未发布。

通用流程的已登记HMI控制支持类型保持的controlValue.$ref绑定，JSON模型可经显式HMI配置组合状态与恢复；实际执行的类型、范围、整数、选项检查保持。92项后端、79项前端及生产构建通过。补充6个固定SDK终止原因码，未知值与原始错误文本仍不透出。真实API形成28节点草稿，后续三次试跑均在启动输入契约处失败，未保存示例；当时继续云端修复因自动审批要求具体外发授权而暂停；后续Claude授权与结果见本轮补充。

专项实际引擎测试：模型数值经$ref写入18度，等待后恢复读取的27度；模型调用1次，读取/写入回执累计2→3，没有上游重放。缺失、null、string、boolean、越界、小数值写入前失败；非法路径/未知控制/旧流程/文本模型仍拒绝。测试模型回复为标注夹具，不能当真实API。

正式API：live/formal耗时171.64秒，3次API/3次工具，需求已登记但0节点；根因不明。live/incremental使用分批局部改图，63.20秒、16次API、17次工具、28节点；静态检查发现动态引用误报及图配置错误，0次实际试跑，无可应用结果。测试计划未改，未保存项目。

检查证据：backend-regression-verified.log为92通过；frontend-regression-verified.log为79通过；build-complete.log为tsc和Vite通过，既有大包提示保留。初始诊断测试对termination值的断言写错，修正测试后通过；最初回归缺项目夹具/运行目录错误、构建缓存受限及runner的__dirname错误均为暂存环境问题，相关失败日志保留。最终暂存node_modules使用逐项只读引用与本地缓存，生产配置未变。

SDK终止码的实际子worker和公开SSE脱敏测试通过；首次真实中断原始原因已未保留，不能凭新白名单追认。完整浏览器、实际自主构图全场景、真实设备未验收。


## 正式修复与当前限制

live/repair：原MiniMax编排API，260.85秒、13次编排API、13次工具；静态模型绑定/汇合修复后，三次实际试跑都失败，运行模型调用0、车控写入0。首次因can_undo直接使用state变量被生产TS表达式预检拒绝；后二次is_start把事件输入产生的对象与字符串比较，报“数据运算需要标量”。最终仍28节点、can_apply=false、内容核验not_run，没有保存。候选仍有number/null提示冲突、撤销记录时点等未验收问题。运行失败正确阻止应用，不能视为场景实现完成。

preflight-comparison.json记录同一API图去除草稿标记后的只读比较：动态目标值误报消失，main_wait汇合错误保留。专项修复没有改变GraphEngine文件或原输入筛选；applied-verification.json确认17文件摘要、文档链接和20项目完全不变。

自动审批先拒绝切换Anthropic配置端点，再拒绝继续向原MiniMax端点发送完整草稿与错误证据，理由都是该具体载荷/目的地缺少明确外发授权。两条被拒命令均未执行，没有发出请求；未通过其他工具绕过。已准备pending-request.json（仅本轮合成测试需求、API草稿及反馈，save_on_success=false），向用户请求明确授权发往https://api.minimaxi.com/v1并进行本轮后续构图/试跑/核验，当时尚未收到答复；后续用户选择Claude，见本轮补充。保留输入过滤修改的旧待授权状态。外发批准前不运行保留测试；heldout-plan.json两组12步已在首次构图结果前固定，尚未执行。

后台无活动子worker时，原PID58617温和停止，按原脚本启动PID61760监听8000，以加载公开响应处的新原因码。backend-reload.json记录。此重载没有云端调用；完整浏览器未验证。当前交付仅通用契约修复与真实失败证据，实验场景未完成、整体开放目标仍进行中。


## 事件入口载荷修复（同轮离线补充）

证据根：/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/event-input-dev65。版本仍dev.65。FlowSessions仅在无入边的命名事件input/systemInput调用原输入适配器前选择真实载荷，之后把event元数据独立保留。GraphEngine文件及其旧输入筛选字节保持；事件文本如今以字符串进入既有筛选，未移除任何词条。普通起点/等待/路由/去重没有场景特判。

- before-tests.log/after-tests.log：最终10项专项。旧代码可复现文本嵌套、JSON事件载荷和事件文字筛选问题；新代码10项通过。覆盖命名/别名/对象文字、JSON字符串和对象/字段过滤/非法字段拒绝、图片字节与显式本次问题、空图片失败、实际天气来源、重复事件不重放、repeat等待新输入、稳定快照恢复与普通输入。图片推理回复是明确本地夹具，不代表图像识别验证。最初新增重复等待测试错误地读取已重新等待的wait输出，因该输出会变成返回路径结果而失败；改为在消费事件时用state记录实际文字/值，原失败日志after-tests-initial.log保留。
- frontend-regression.log：104项通过（10项新增，既有通用/重复/持久流程、JSON/HMI/MCP与执行断言）；backend-regression.log：71项相关既有检查通过。build.log：tsc与Vite构建通过，既有大包提示保留。前端范围文件见frontend-test-files.json。
- startup-replay-input.json、before/after-candidate.json：读取上一轮真实API的28节点图，仅在本地副本去掉不可执行草稿标记，未手改任何业务字段/连线/坐标。原三组用例各取首步作局部诊断。旧代码三组都在is_start报标量错误；新代码均进入waiting，读取并保存23/45、28/80、19/15。各2次get、0次set，全程0模型/工具调用。该局部计划不替换调用方原13步计划。
- offline-full-plan.json：原28节点图、原3组13步计划，在本地明确注入5个预写JSON模型响应；真实模型调用0，未做内容核验。连续调整后撤销在can_undo的input.state路径缺失处失败；实际state.lastTemp/lastBrightness已被新值覆盖，也不符合“调整前”的撤销语义。模糊/越界分支、恢复初始值和未调整直接恢复在夹具下通过，但总体failed。此测试不证明自然语言模型正确，不构成可应用/保存依据。

该离线补充时尚未收到云端外发授权，因此该阶段没有外部API请求、没有运行两组12步保留测试、没有保存新项目或更改输入筛选。旧已失败快照不会自动重写历史输出，需要重新开始验证。完整浏览器、真实API全流程和开放目标仍未完成。限定应用摘要及20项目保持结果见manifest.json、final-verification.json；未提交、未发布。


## 儿童关怀演示录像替换（2026-09-27）

按用户指定，将既有后排演示视频替换为桌面「座舱后排儿童跪坐玩耍视频生成 (1).mp4」，仅更新本地素材，沿用dev.65，不改场景图、模型或界面。实际页面用本次提供的儿童图片识别返回风险，中控左上角自动播放新视频；1280×720、10.08秒、paused=false、readyState=4。正式鉴权视频接口全文件SHA256与用户源文件一致，Range返回206。原录像已备份于工作区outputs/rear-video-replacement-20260927。保留演示回放标识，不代表实时摄像头；未提交未发布。


## Claude授权、构图与核验补充（2026-09-27）

同轮Claude验证完成：用户明确授权配置的fucheers.top网关后，Claude自主修复并提交30节点可撤销设置图；原3组13步与构图前锁定的2组12步保留输入均通过真实模型运行和内容核验。6组异常数值/边界本地模型夹具及3种启动输入通过；已新增“Claude 临时座舱设置（撤销与恢复）”，原20个项目保持。核验证据错误定位与格式说明补充，85项相关检查通过；历史失败、保留测试首次网络受限及一次错误重核验均留档。版本仍2.8.0-dev.65，未提交、未发布；仅所列输入和模拟HMI，不代表实车、完整浏览器或任意场景可靠。

证据根：/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/claude-reversible-dev65。用户在网关外发内容说明后回复“使用”；本轮编排、运行模型、内容核验均配置anthropic/claude-sonnet-5，目的地https://www.fucheers.top/v1。该名称是网关配置，未独立认证上游模型身份；未切换回MiniMax、未更改全局默认选择。

- live/initial：264.51秒，16次构图调用、17次工具；修复形成30节点。revision3无效输入的number/null不一致使真实运行失败；revision4原13步运行通过但内容核验needs_changes；revision5再改图后未试跑即到构图调用上限，最终can_apply=false。历史核验把诊断字段名和合法state中继误当固定约束，后续明确业务语义，但不改写旧结果。
- live/repair-authorized：507.22秒，11次构图调用、12次工具；32节点补入两项值的联合整数/范围检查，以及每次有效调整前的实际HMI get。原13步、5次真实推理运行通过；两次内容核验分别invalid_evidence_quote、额外case_index1字段，阻止应用。墙钟时间包含服务及整理等待，未修改平台预算。
- 核验模块补充：ReviewProtocolError附主机生成的checks.<序号>.findings.<序号>.<字段>定位；允许的一次错误重核验可以定位具体无效引用。指令明确唯一字段名及标量/排序紧凑JSON引用方式。引用匹配、Schema额外字段拒绝、图/证据摘要隔离、45秒期限、两次核验总额度保持，不自动丢弃错误字段或改判通过。code-manifest.json限定2文件，review-tests.log为85项通过；新增错误定位不泄露虚假引用、重核验仍能语义拒绝、标量引用和额外字段拒绝验证。
- live/verified-repair：173.45秒，9次构图调用与9次工具；Claude改为普通input直接读取初始值，去掉固定启动口令限制，最终30节点。原3组13步全部通过、5次真实模型调用，内容核验首次passed，正式鉴权SSE返回can_apply=true并submit；save_on_success=false。
- live/heldout-verified-repair初次直接测试受沙箱网络限制，两次推理请求均连接失败，不计通过。随后获得执行权限，在live/heldout-verified-repair-authorized原图/原测试不变重跑：2组12步、5次真实推理通过；中文数字、合法边界、缺字段、无效请求后撤销及动态恢复均有实际值与写入次数断言。第一次核验多出case_index0，原有的一次错误重核验通过；executions=1，没有重放推理或控制。70.64秒。保留测试SHA与首次构图前heldout-lock.json一致，从未发给构图模型；仅测试/核验阶段使用。
- live/verified-repair/fault-guard.json：6组明确注入本地JSON的实际引擎测试（18步），覆盖valid=true但温度或亮度越界/小数、valid=false但数值合法，以及合法边界正对照。非法结果均零写入且无可撤销记录，合法值可执行与撤销；0真实API，不证明语言识别质量。startup-variants.json另用“你好”“启动”“现在开始”及27/75、16/0、30/100初值，3组6步启动/恢复通过，拒绝模型适配器、0模型调用。
- saved-example.json：新建backend/projects/claude-reversible-settings-dev65.json，显示名“Claude 临时座舱设置（撤销与恢复）”；nodes/edges与通过验证的API结果完全一致，元数据标明实验范围。原20项目哈希保持。未手工写业务图、未改GraphEngine输入筛选、未提高预算、未覆盖已有项目。

完整浏览器操作、画布布局、真实车辆、未接外部工具与开放场景质量仍未验收；总体“任何创造场景均可靠”目标未完成。全部失败及核验重试保留，不能只以最后通过次数描述成功率。
