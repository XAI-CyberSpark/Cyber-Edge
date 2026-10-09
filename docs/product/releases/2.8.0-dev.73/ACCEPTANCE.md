# 验收

2026-09-29｜2.8.0-dev.73｜未提交工作区、未发布

## 契约反馈与flowVersion归一化（Claude Code）

- 改动：backend/app/services/authoring_session.py，backend/tests/test_authoring_session.py。单Agent会话、Hermes worker和团队成果交付共用argument_feedback，三条路径同时生效。
- 多余字段在details中增加fix：
  - 包装层：item内的键多数属于该层合法字段时提示去掉包装；未知内容不做判断。
  - 错位：例如顶层set_data/remove_data_keys指向upsert_nodes.*，测试用例的input指向plan.cases.*.steps.*，coverage的note指向coverage.*。
  - 节点外层的systemPrompt/temperature等提示写入set_data。
  提示只使用契约字段名，测试确认不回显参数值。
- flowVersion："2"、" 2 "、2.0归一化为整数2，结果带normalized_arguments；"二"、"2.0"、True、1、2.5、None仍拒绝且不改图。导入图内已存的"2"仍在试跑前拦截（既有测试保留）。
- 验证：backend/.venv_macos，相关6组84项通过；backend全量253项通过（5项跳过为既有条件跳过）。
- 未验证：尚无新代码下的真实模型编排运行，修复提示能否降低模型重复错误未知，需对照复跑。

## 超时诊断与评测补取（Kimi）

- hermes_authoring.py：540秒宿主超时返回termination=host_timeout及stage、tool_calls、last_tool、revision、brief_registered；原超时文本不变。authoring_diagnostics.py白名单增加host_timeout和团队工具oakegde_delegate/oakegde_apply_artifact。新增test_hermes_timeout_diagnostics.py 5项，与相关既有90项通过（Kimi报告）。
- diagnose.py从error.diagnostics补取，输出diagnoses-supplement.json：33次中22次恢复终止阶段；building_graph 17、checking_graph 5、before_brief 5、submitting 2、executing_graph 1。04/14/15-team为宿主超时，历史证据无法回溯归因。原diagnoses.json与各运行首次记录未改。

## 对照复跑（Kimi，2026-09-29 晚）

证据根：outputs/agent-benchmark-20/recheck-dev73（provenance.json 记录当前工作树哈希、git 状态、快照未动）。场景01/02/11/16、仅单Agent、真实MiniMax-M3、serial、预算与首轮相同；结果另存新目录，首轮runs/与diagnoses.json未动。共7次尝试（4首次+3标注重试）。

- 4次死于模型输出截断（01首次75秒/2次API调用、11两次、16首次，均failure_reason=truncated、构建早期），对契约修复零信号；截断运行无result，usage不可查。
- 3次完整运行均can_apply=false：01-retry 127秒22次尝试、02 125秒24次尝试均needs_changes正式提交；16-retry 304秒24次预算耗尽incomplete_agent_run未提交。
- fix提示效果：02中systemPrompt层级与item包装在fix后未再犯；01-retry中remove_edges未再犯，但item在fix后仍重复2次（call 4→17→18）。flowVersion归一化在7次尝试中0次触发（模型未再写"2"），仅有单元测试证据。
- 剩余失败三类：①断言根字段ValueError（02的plan.cases.*.assertions.*同字段连续错6次，非fix覆盖范围，证据未记录模型实际写的路径）；②set_data嵌套data的ValueError（16-retry在call 5/8/10跨节点索引出现5次同类，有说明文字无结构化fix）；③模型输出截断（见上，已成单Agent第一失败源）。
- 污染说明：11-retry的worker启动于20:36:15，落在execution_schema.py临时改动窗口（约20:35–20:37:00）内；该运行0次工具失败、未触发被改的报错文本路径，失败原因为截断，实质未受影响，不予作废。01-retry（20:34:07前）与16-retry（20:37:13后）均干净。
- 样本小，新旧不混算成功率；本轮不证明任意场景可应用。

## 未完成

对照复跑已执行（见上节），fix提示部分有效但未消除重复错误；断言根字段提示、set_data嵌套fix、截断诊断（max_tokens=12000与thinking开关待查，需先记录截断轮usage）与失败调用参数字段名记录均为dev.74候选；本轮不证明任意场景可应用。
