# 任务

- [x] capability_library：confirmed 能力项绑定/解绑已登记 MCP 工具，binding_status 按当前配置复查，check_connection 只做 live discovery（群聊协作实现，未区分个人署名）。
- [x] capabilities API：绑定/解绑/连接检查端点，请求体仅 server_id/tool_name（群聊协作实现，未区分个人署名）。
- [x] mock vehicle 登记配置与 stateful fixture（window.set/window.status + simulate 错误路径）。
- [x] test_capability_binding / test_mock_mcp_fixture 两组新测试。
- [x] 修复 test_mock_mcp_fixture 缺条件门导致主 venv error=2：加 `OAKEGDE_TEST_MCP_PYTHON` skip gate（Codex；修复后专项 Ran 10 OK skipped=3）。
- [x] 第一层验收：主 venv 全量 discover 263 项 OK(skipped=8)（Hermes 实跑）。
- [x] 第二层验收：scratch venv 装 requirements-mcp-runtime.txt（mcp 2.2.0），全量 OK(skipped=5)；Codex 首跑，kimi、Hermes 独立复跑一致。
- [x] 第三层 live protocol：编写 lab fixture（charging_status/exhibit_details/forbidden_write），LiveProtocolTests 5 项 OK、全量 skipped=0（kimi）；修正 exhibit_details 显式返回 TextContent 列表以表达无结构化输出（kimi）。
- [x] lab fixture 收进 backend/fixtures/，review 通过（无迁就断言）并用仓库内版本复跑 skipped=0（Hermes）。
- [x] 登记 2.8.0-dev.75：VERSION、CHANGELOG、CONTEXT、主文档当前状态、PRD/TASKS/ACCEPTANCE（kimi 汇总提交）。已知限制：fixture `--port 0` 先 bind 再释放存在理论端口竞争窗口，CI 环境再改。
