# dev.64 验收

日期2026-09-27。开发版，未提交、未发布。主工程/Users/Shared/sherry/OAKEgde Studio；证据根/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/json-repair-dev64。保留现有项目与未提交修改，无设备/业务工具调用。

## 实际结果

- 80项前端检查通过（含10项新测试），覆盖创作/数值两用途、默认关闭、耗尽、原始多模态上下文、共享期限、取消、服务/空/截断/模拟/超长结果、总模型调用预算及已有流程/持久恢复/MCP路径。
- 64项后端检查通过，含新增严格配置参数检查及既有节点、通用流程、构图会话、隔离试跑；前后端目录一致。日志backend-tests.log、frontend-tests.log。
- npm run build通过；既有大包提示仍存在，未声称性能优化。见build.log。
- live/creative和live/numeric：人工编写的四节点测试图。修改前真实主引擎各一次注入无效响应后失败，下游跳过；修改后先注入相同无效回答，再各成功调用一次真实MiniMax-M3 API修复。文字字段/原创短句、数值20及HMI温度断言通过；各2次适配器请求、上游state只增加1次，温控只有1次模拟动作回执。原始消息保持相同。耗时分别1.67秒、1.04秒；结果包含实际输出与trace。
- 首次网络连接失败保留于live/creative-network-failed：1次真实API尝试，0次成功返回。随后获运行环境网络权限后验证通过，不把连接失败视为可格式修复错误。

## 边界

真实API测试的首个格式错误由测试适配器注入，不是自然服务错误；图为测试夹具，不冒充API自主生成。模型配置及既有密钥内部读取，未输出/复制密钥。HMI为模拟，无实车、MCP或项目保存。此次没有新增场景关键词、固定模板或改变旧输入过滤。完整浏览器、API自主构图采用新配置、其他提供商/自然错误恢复率尚未验收；格式通过不等于语义可靠。

应用清单与校验见manifest.json、deployment.json、final-verification.json；备份在before。恢复需先核对当前摘要，避免覆盖后续修改。本轮只复制清单文件，不创建Git提交或恢复标签。


正式接口补充：两次鉴权SSE自主构图请求均未完成，证据在live/formal-author与live/formal-author-retry。第一次停在读取能力/当前图后；第二次进入需求登记和局部改图后返回通用编排错误，没有result或可提交候选，未保存项目。该接口未暴露具体工具错误，原因尚未定位；不归因于格式修复或网络，也不把两次失败隐去。此项验收未通过。主后台未重启，Hermes每请求新worker读取当前文件；未测试旧bounded路径热加载。


## 构图闭环补充

证据根：/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/authoring-diagnostics-dev64。版本继续dev.64。8个代码/测试文件应用，保留基线与备份；后端PID52005在无活动子worker时温和退出，原脚本启动PID57166监听8000。未改输入过滤、SDK版本、模型绑定、执行/审查门槛、用户项目或预算。

- live/observe：主工程内部hermes_events加观察器，真实MiniMax API自主构图完成，32.55秒。三节点图配置jsonRepairAttempts=2，海风/夜雨两组运行和内容核验通过；初次patch字段错误后模型修复，初次核验格式错误后复用相同执行证据重核验通过。并非网页SSE验收，也不据此推定之前两次中断原因。
- 首次补充测试缺少暂存Studio依赖，记录backend-tests-missing-studio.log；补齐真实Studio只读引用后52项通过。加入参数守卫后旧断言要求原字段说明片段，修正说明保留兼容提示；最终54项通过，backend-tests-verified.log。含实际worker子进程的返回失败/异常分支及公开响应脱敏，不包含真实SDK故障注入或全量浏览器测试。
- live/formal-author：重载后正式鉴权SSE返回60.49秒的不可应用草稿。SDK上报16次调用、18次工具调用、5次工具错误，4节点、revision3，末次参数契约失败。两轮实际试跑显示Silent；读图证据确认模型/输出/状态字段嵌在多余data层。后续改图仍把字段放错并触发汇合检查/连线冲突，原始失败保留。此结果说明新增诊断生效，不说明构图通过。
- nested-config-before.json：旧生产NodeEdit确实接受set_data.data；无API调用。修复后在事务前拒绝全部修改，告知直接写set_data字段和清理旧包装；新增测试确认修正可成功、业务values中的data对象仍合法、无关元数据保持。

live/formal-author-guard：49.85秒返回三节点不可应用草稿，jsonRepairAttempts=2且无多余data层，但首次缺providerId；补齐后显示“主题：/短句：”空值。图使用{{generateSnippet.data.title}}、{{userInput.text}}，而既有契约要求outputs.<nodeId>或input/state根。三次实际试跑耗尽，最后改图后无有效执行证据；SDK completed=true并不等于可应用，提交门槛正确阻断。该正式验收未通过，不再对相同请求盲目重试；下一步应提前识别不支持的变量引用/缺失模型绑定，避免把构图错误拖到模型调用后。终止诊断只报告SDK与工具观察，不能作为独立根因证明或成功认证；原先两个无候选失败仍不能精确归因。主工程无自动模型回退，不重试语义拒绝，不更改调用方验收，未保存新项目。完整浏览器、开放场景可靠性与自然格式错误恢复率未完成。


## 绑定预检补充

证据根：/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/binding-preflight-dev64。7个代码/测试/夹具文件已应用，版本仍为dev.64。原PID57166温和退出，原脚本启动PID58617监听8000；未改输入过滤、SDK版本、既有项目、模型绑定选择或验收预算。

- 83项前端、78项后端通过（新增3项前端、5项后端，其中14组共享绑定案例）；npm run build通过，既有大包提示保留。最初共享JSON夹具多写一个括号，导致前后端测试各报夹具解析错误，已修正且原日志保留为*-invalid-fixture.log。
- before-probe.json/after-probe.json：同一份真实失败图，旧生产inspect通过无错误；新增检查报告generateSnippet.systemPrompt及showSnippet.responseText内三处非法根，明确建议outputs.<nodeId>路径。trial不运行、executor调用0、预算消耗0、无真实API调用。单元测试另验证缺失providerId/未配置提供商在启动子进程前拒绝，且不改写模型。
- saved-projects-readonly-check.json：8个已有通用流程项目与旧validate_flow比较，无新增错误。仅静态只读比较，不宣称八项目重新运行或浏览器验收。
- live/formal-author：正式鉴权SSE、真实MiniMax API，读取新检查反馈并自行修正原失败图。22.82秒完成，3节点、jsonRepairAttempts=2；原海风/夜雨两组输入、运行及内容核验通过，仅1次实际执行、2次运行模型调用。原连线/坐标保持，修改模型提示词及展示文本的引用，未保存项目。初次登记需求前inspect被工具拒绝后自行修复顺序。repair-diff.json保留配置差异；展示文字多生成了字面量反斜杠n，故未把它作为最终展示质量完成。
- live/formal-format：同一API在新请求中仅修正展示换行，原两组断言保留并加真实换行断言。52.57秒返回；第二轮运行通过，实际展示是真正换行。当前执行的首次内容核验为model_call阶段HTTPException，第二次为validate_response阶段ValidationError（case_index非数字及findings元素类型错误）。两次核验额度耗尽，can_apply=false，未保存或绕过门槛。这不是运行/图检查失败，也不把后一次SDK completed=true当作候选可应用。

原绑定修复的正式验收已通过；更新后的换行候选尚未通过内容核验，因此新输入复验与新示例保存暂未进行。没有新增同请求的盲目重复调用。后续应改进核验契约错误反馈/可靠性，再核验完整候选；不得降低内容要求或丢弃失败。全局开放目标、浏览器、自然模型错误率与动态值时序仍未完成。没有Git提交/发布。


## 核验格式反馈补充

证据根：/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/review-feedback-dev64。4个后端/测试文件应用，版本仍dev.64；无需重启主服务，每请求新Hermes worker读取新代码。后台仍PID58617。没有修改输入过滤、SDK版本、模型绑定、核验总次数或语义放行门槛。

- 95项相关后端检查通过，新增5项覆盖格式反馈仍可给出needs_changes、覆盖/引用错误码、跨证据/有效判定不反馈、错误字段白名单与预算/历史隔离。最初新测试修改展示正文触发了锁定运行断言失败，核验没有运行；已把该测试修正为保持输出的版本修改以检查历史失效。初始失败backend-tests.log保留，最终backend-tests-verified.log通过；本轮无前端源码变化，不另称构建/浏览器验证。
- live/heldout-feedback：既有API生成并修复换行的三节点图，三个新输入暮色/咖啡/向阳花，真实MiniMax运行模型3次。首次核验格式错误为明确测试注入，不是真实服务故障；唯一第二次核验使用真实配置API并收到具体错误字段与3个数字步骤地址，核验通过。三次trial为executed→review_retried→cached；实际执行1次，两次核验收到相同证据，5.43秒。不是对上一轮已耗尽旧证据追加第三次核验。
- live/formal-author：更新协议后的正式鉴权SSE回归，以现有格式正确图、原海风/夜雨两组及换行断言重新实际执行产生新证据。37.75秒，2次真实运行模型调用、1次内容核验通过，无故障注入。过程有3次工具拒绝后自行恢复；结果可应用。formal-preservation.json确认节点字段无变化、连线/坐标及规范化锁定计划相同；每次实际HMI含2个换行、0个字面量反斜杠n。此前服务/Schema失败保留，不把这次成功当作自然失败率统计。
- 新文件backend/projects/api-theme-preflight-dev64.json，显示名“API 主题短句（预检与核验修复示例）”；节点和连线原样保存，仅新项目身份/名称及验证范围元数据登记。使用独占创建，不覆盖已有文件。首次进程内回读因ProjectService相对projects路径指向工作区而404；文件已成功创建，未重新写入。随后正式鉴权HTTP回读一致，saved-example.json登记摘要。完整网页打开、画布布局和所有未来输入仍未验收。

原两组正式回归与三个新输入均有列明运行及模型辅助核验依据；旧已耗尽错误记录没有删改。该示例依赖用户配置的MiniMax服务，当前核验仍是同模型独立上下文，不构成独立事实/原创性认证；未连接真实车辆或业务MCP。更多场景/媒体、服务自然错误率、跨请求恢复和整体开放目标未完成。未提交、未发布。
