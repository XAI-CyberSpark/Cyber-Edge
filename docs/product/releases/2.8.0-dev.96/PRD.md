# 通用编排契约说明与纠错

2026-10-06｜dev.96｜实施前分析；依据用户限定的single契约修复任务。[返回主文档](../../../README.md)。

目标：减少模型因字段位置、值类型和事务操作约束不清晰造成的修错调用。保持显式模型绑定；不自动填写或替换model，不改架构/默认模式/预算，不实现缺失设备或导航能力，暂停team耗时调查。仅开发8000，save_on_success=false，用户项目与日常5175保持。

## 实施前错误分类

行号为本轮修改前源码，后续证据以具体函数及最终diff为准。

| 错误类 | 分类 | 依据与处理 |
|---|---|---|
| HMI缺controlId、混用module；ambient动作被包成对象 | a | node_capabilities.json的car_control.fields为空，规则只在长description；hmi_control_contract.py:9–20要求字符串ID及严格值类型，:29–39要求顶层字段并排斥module/signalKey/function。模型实际写成action:{controlId:...}。给编排能力查询提供结构化字段/注册表与合法示例，不改界面。 |
| 文字/JSON模型驱动车控或普通工具 | b | node_capability_service.py:105–111只说“使用动作输出契约”，不点名outputFormat=actions和显式JSON→HMI例外；完善纠错，不改变判断。 |
| 重复写同节点、同时删除并写节点（重复2次）、删不存在的边、缺type/position | b | authoring_session.py:270–288，错误缺冲突ID和操作修复方式。保留事务拒绝，告知合并同ID编辑、原位变更type、remove_data_keys及读图核对。 |
| base_revision缺失（2次）、字段放错层（2次） | b | GraphPatch字段定义及argument_feedback；已有部分位置提示，补base_revision语义与无歧义修复提示，不推断版本、不自动修参数。 |
| model=minimax（3节点） | c | scenario_execution.py:20–37明确要求显式providerId/model，model_providers.py:101–105区分具体模型ID。用户已选择保持显式绑定，本轮只补字段说明/错误提示，不自动填值。 |
| toolId=minimax、未设置tool_id（3节点） | a | tool.fields为空；node_capability_service.py:80实际识别tool_id/tool，GraphEngine.ts按相同字段派发。补正确字段名与取值说明。不能把此错误直接归为缺导航能力。 |
| 真正的导航/路线规划服务 | d | tool目录与FLOW_INSTRUCTIONS明确nav仅界面仿真；未经登记可用的MCP不能当真实导航。只记录缺口，本轮不接入服务，也不以模拟偷偷替代用户真实需求。 |
| source_quote拼接、joinMode/condition缺失 | b | validate_brief已提供拒绝原文、FLOW_INSTRUCTIONS已解释joinMode及logic条件；证据不足以认为需再加校验或改语义，本轮保持已有有效反馈。 |
| 未完成最终提交 | 结果状态 | 前述错误与调用额度耗尽的结果，不作为新增能力或放宽验收的理由。 |

## 旧调用统计边界

旧报告能确认24次共享completion=入口1次+主编排23次；主编排26次工具调用：读取4次（能力1+图3）、需求登记2次、GraphPatch19次（10成功/9拒绝）、inspect1次、trial/submit均0。不能说24次全部用于修错。

旧记录无completion ID。按相邻毫秒内成组工具事件推算并与23次SDK统计交叉核对：初次读能力/图1次、需求登记2次、首次搭图3次、inspect1次、后续读图2次、检查后修改14次；加入口1次=24。此分组是时间线推算，不能当逐调用原始证据。

19次patch中，初建5次工具调用（3成功/2缺base_revision）；检查后14次（7成功/7拒绝）。拒绝重复类：同节点删除并写入2次，额外字段/位置错误2次；另有重复节点、缺type/position、缺失边各1次。旧记录不保存每次参数或逐模型意图，不能精确把7次成功修改全部归因到具体错误类别。

## 验收

每类改动先用回归测试复现信息缺口，再补字段或纠错说明；确保有效配置仍通过、无效配置仍拒绝、失败patch不改图、模型绑定不被宿主替换。用上轮requests.json中的single请求原样经8000复跑一次，分别报告候选、可应用、实际执行状态和剩余错误。临时脚本/日志仓库外，无Git提交。
