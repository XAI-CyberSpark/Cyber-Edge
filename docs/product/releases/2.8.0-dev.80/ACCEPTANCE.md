# 验收与根因记录

2026-10-03｜2.8.0-dev.80｜未提交、未发布｜[主文档](../../../README.md)

## 根因与证据

1. [scenario_builder.py](../../../../backend/app/services/scenario_builder.py) 的build_events原逻辑：除少量显式问候外都进入构建器，没有讨论阶段。
2. [hermes_worker.py](<../../../../backend/app/agents/hermes_worker.py) 原104–111行：主管普通文本结束后，只检查session.result；没有brief/图便发送error，没有合法chat_reply出口。[hermes_authoring.md](../../../../backend/app/agents/hermes_authoring.md>)也只定义图提交职责。
3. 原主管run_conversation仅传request.prompt，漏传conversation_history；用户“按刚才的做”缺少主管决策上下文。子角色获取部分历史不能补偿入口缺失。
4. [orchestration.py](../../../../backend/app/api/orchestration.py)原错误提示只要求“查看终止状态”，前端却只显示message，使阶段与原因不可见。

修复前本地实际worker配合合成SDK：`completed=true, api_calls=1, tool_calls=0, stage=before_brief`，正常纯文本讨论仍返回“智能体未形成可检查候选”。这是可重复的完成契约缺陷。截图当时的外部模型结果未保留，当前日志仅有SSE POST 200，不能证明那一次没有同时发生模型鉴权、限流或其他上游错误。

## 修复与验证

| 项目 | 实际结果 |
|---|---|
| 只读入口 | 仅oakegde_route_turn；discuss非空回复、build无伪造完成回复，合法交付后停止额外总结调用 |
| 原图保护 | discussion返回原current_project完整内容，can_apply=false；宿主拒绝带图修改/应用权限/持久化声明的入口结果，save_on_success=true也不写项目 |
| 构建隔离 | 合法build后才创建原single/team构建器；普通文本回复不能作为图构建成功；原测试与内容核验门槛保留 |
| 对话历史 | user/assistant历史、最新消息、当前项目以结构化数据进入两个主管；未提升客户端角色权限 |
| 编排专项 | `python -m unittest discover -s tests -p 'test_*authoring*.py'`：78项通过 |
| 后端全量 | `PYTHONDONTWRITEBYTECODE=1 .venv_macos/bin/python -m unittest discover -s tests`：283项，275通过、8项环境条件跳过 |
| 前端 | test-scenario-generation.mjs 8组、test-workspace-requests.mjs 7组通过；讨论文字正常展示、无图替换/自动保存、下一次请求携带该轮回复 |
| 构建 | npm run build：TypeScript/Vite通过；既有大chunk与browsers数据过期提示保持 |
| 真实SDK本地协议 | 固定SDK d0288be…，当前安装Python/runtime；只连接127.0.0.1合成HTTP模型、synthetic-key；一次completion，仅route工具，status=discussion，原图保持 |
| 真实MiniMax语义 | 未执行：自动审批明确拒绝外发截图讨论请求，已向用户询问是否授权向api.minimaxi.com发送本次测试文字，尚无答复 |

真实SDK协议检查与真实模型是两种证据。上述本地测试未验证模型能否正确理解截图原句或所有上下文中的同意/否定，也未验证真实生成的业务质量。

证据目录：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/development/agent-intake-dev80/`。before/、initial.patch、initial-status.txt、preexisting.json保留本轮前状态；evidence/intake-before.log为有效原架构失败；初始夹具搭建错误不是产品证据。authoring-after.log、backend-full.log、real-sdk-local-protocol.log、两份DOM与build.log为最终验证。代码测试可从工程重复运行；SDK协议脚本只使用本地服务。

## 状态与限制

本轮只改Hermes入口，未改bounded分支、既有显式问候快捷回复、模型参数、设备架构、视觉布局或执行能力。构建增加一次意图判断调用，计入共享24次completion/480秒，入口最多3轮，宿主540秒期限保持；讨论无需构建四角色。

尚无包含dev.79/dev.80的Git提交，baseline-20261003-dev78保持。恢复应按本轮before副本只撤销增量并保留后续编辑，不使用reset --hard。真实模型复验待授权。

收尾：已确认无活动Hermes请求后正常重启本项目监督服务；check_local.py通过，4个项目、SU7车模/环境光HTTP哈希及本地模型发现正常，未发起推理。原7个数据文件的集合与内容哈希一致；dev.79源码/测试增量保持（VERSION与摘要文档按新迭代更新），HEAD与基线标签未变；文档链接与git diff --check通过。
