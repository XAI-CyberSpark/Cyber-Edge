# 能力目录 MCP 绑定界面

2026-10-01｜2.8.0-dev.77｜负责人：Hermes（群聊协作，claude-code 收尾验收）｜状态：已实现，已独立复核

背景：dev.75 已提供后端绑定接口（`PUT/DELETE /v1/capabilities/{import_id}/items/{item_id}/binding`、`POST .../binding/check`），但组件库详情页没有入口，用户只能通过 API 操作。本轮把这三个接口接到能力详情面板。

## 方案

- 导入能力（非内置）详情页新增“MCP 工具绑定”区块：填写 MCP 服务 ID、工具名后绑定；已绑定后可“检查连接”“解除绑定”。
- 只提交 `server_id`/`tool_name`，界面不提供 URL、密钥、进程字段；服务端仍按 dev.75 规则校验已登记、已授权的 server/tool。
- 显示后端返回的绑定状态（未接入/已绑定/已接入/绑定失效）、验证状态、试跑授权、最近一次连接检查结果。检查连接只做 live discovery，验证状态保持“未验证”。
- 详情标题行的状态改为优先显示 `binding_status.state`；操作成功后用返回的能力项就地替换列表中的同 ID 项。
- `Sidebar` 给导入能力项附带 `import_id`，用于拼接接口路径；`Capability` 类型增加 `binding`/`binding_status`/`connection`/`import_id` 可选字段。

## 非目标

- 绑定后仍不可拖入运行画布，不触发真实工具调用，不改变 verification。
- 不提供已登记 MCP 服务/工具的下拉选择（需新增查询接口，留待后续）。
- 不改后端接口与存储。
