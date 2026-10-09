# 验收记录

2026-10-03｜2.8.0-dev.83｜未提交工作区、未发布｜[主文档](../../../README.md)

## 已确认问题

Hermes SDK普通文字回复会结束run_conversation；原max_iterations=3仅约束该SDK循环，不会主动发起新一轮让模型补交工具结果。实际worker合成SDK复现与截图一致的completed=true/stage=intake报错；修复前两个恢复断言失败，修复后通过。截图对应的上游响应仍未知，不能把本地复现说成已取到那次模型原文。

## 验证

- worker合成SDK：9项通过，含讨论、构建交接、纯文本修复、预算耗尽、鉴权失败、非法工具面、字段修正。
- 固定真实SDK d0288be…与localhost HTTP合成模型：2次completion，首次普通文本、第二次合法讨论，结果discussion且原图保持。两次请求均带指定oakegde_route_turn的tool_choice。测试仅在绑定层以已验证MiniMax绑定启用该参数，网络目的地始终localhost；不能作为外部模型能力证明。
- 证据：outputs/intake-dev83/repro.log、local_protocol.py、local-protocol.log；before/、initial.patch和initial-status.txt保存任务前状态，不是Git提交或完整业务备份。
- 后端全量 `PYTHONDONTWRITEBYTECODE=1 .venv_macos/bin/python -m unittest discover -s tests`：290项，282通过、8项环境条件跳过（backend-full.log）。新增部分完成/中断不重试、历史续传、真实拒绝计数断言。
- `scripts/check_local.py`：前后端代理、4个项目、SU7与环境光内容校验、本地模型发现通过；未触发推理。修改在每个请求新建的worker内加载，无需重启常驻服务。
- 仅后端交付逻辑变化，未改前端，不执行前端构建或文字审计。
- 真实MiniMax：用户要求“重新发送”后，经正式本机 `/v1/orchestration/generate-stream` 发送截图原句，MiniMax-M3、历史为空、无current_project、save_on_success=false。33.54秒返回discussion；首次文字结束后发出补交提示，第2次completion成功调用oakegde_route_turn（1次合法工具调用、0次拒绝）。回复讨论乘客、旅程阶段与互动方式，未进入构建；无节点/连线，saved_project=null。证据：outputs/intake-dev83/minimax-resend.json；脚本resend_minimax.py。此项是真实模型与正式接口通过，非浏览器页面重发。
- 模型回复同时提出客运大巴/高铁等载体选项，存在超出当前智能座舱产品定位的引导；本次未据此改图，不将讨论成功等同于产品范围引导质量全面验收。

## 边界

只读阶段未有效交付仍失败，永不根据普通文本隐式构建；模型鉴权/中断/失败不自动作为遗漏工具重试。入口累计3次调用和全程24次/480秒保留，第三方SDK不修改，已有项目/历史不外发、不保存。浏览器交互、完整新图生成、场景执行和真实设备不是本轮本机协议验证的结论。
