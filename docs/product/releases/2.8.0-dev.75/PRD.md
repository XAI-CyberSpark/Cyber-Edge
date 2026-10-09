# 能力目录绑定已登记 MCP 工具（含 mock/lab fixture 验证链路）

2026-10-01｜2.8.0-dev.75

背景：组件库/能力目录中的能力项此前只有"未接入"状态，无法与 dev.62 起登记的 MCP 服务工具建立可核查的绑定关系。本轮让 confirmed 能力项可绑定到已登记 server/tool，并用 mock fixture 验证绑定/调用链路。

范围：
- 后端 `app/services/capability_library.py`：confirmed 能力项可从"未接入"变为"已绑定"；绑定时重新检查 mcp_runtime 已登记 server/tool，未登记或未授权拒绝保存；`binding_status()` 每次按当前 MCP 配置复查，不盲信历史保存的 binding；`check_connection()` 只做 live discovery（能证明服务在线且暴露该工具则置"已接入"），不执行工具，`verification` 保持"未验证"；解绑清除 binding/connection。
- 后端 `app/api/capabilities.py`：新增绑定、解绑、连接检查接口；请求体只接收 `server_id` 与 `tool_name`，不允许调用方提交 URL、凭据或进程信息。
- 配置 `backend/config/mcp-servers.mock.json`：mock vehicle MCP 服务登记示例。
- fixture：`backend/fixtures/mock_mcp_server.py`（stateful Streamable HTTP，window.set/window.status，支持 simulate=timeout/failure）；`backend/fixtures/mock_lab_mcp_server.py`（charging_status/exhibit_details/forbidden_write，供 LiveProtocolTests 第三层使用，@kimi 编写、@Hermes review 通过）。
- 测试：`backend/tests/test_capability_binding.py`（绑定/拒绝/失效/解绑/API）；`backend/tests/test_mock_mcp_fixture.py`（fixture 真实发现/调用/错误路径）。两者均以 `OAKEGDE_TEST_MCP_PYTHON` 做条件门，主后端 venv 不安装 `mcp`，未设置时应 skip 不 error。
- 版本与主文档同步登记。

非目标：不对接真实业务/实车 MCP 服务；不把 discovery 通过当作业务执行验证（`verification` 仍为"未验证"，需独立 benchmark/场景证据）；不改动主后端 venv 依赖（mcp==2.2.0 仅装于独立 scratch venv）。

验收：三层口径——主 venv 全量 263 项 OK(skipped=8)；scratch MCP runtime venv OK(skipped=5)，三方独立复跑一致；live protocol 第三层 5 项 OK、全量 skipped=0，用仓库内 fixture 复跑确认可复现。详见本目录 ACCEPTANCE.md。
