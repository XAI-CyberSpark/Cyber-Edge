# 验收

2026-10-01｜2.8.0-dev.75｜未提交工作区、未发布

## 改动范围

本轮围绕“能力目录中的能力项如何绑定到已登记 MCP 工具，并能用 mock MCP fixture 验证绑定/调用链路”补充后端能力与测试。

代码与配置范围：

- `backend/app/api/capabilities.py`
  - 新增能力项绑定接口：绑定、解绑、连接检查。
  - 请求体只接收 `server_id` 与 `tool_name`，不允许调用方提交 URL、凭据或进程信息。
- `backend/app/services/capability_library.py`
  - confirmed 能力项可从 `未接入` 变为 `已绑定`。
  - 绑定时重新检查 `mcp_runtime` 已登记 server/tool；未登记或未授权时拒绝保存。
  - `binding_status()` 每次按当前 MCP 配置复查，不盲信历史保存的 binding。
  - `check_connection()` 只做 live discovery：能证明服务在线且暴露该工具，状态变为 `已接入`；不执行工具，因此 `verification` 仍为 `未验证`。
  - 解绑清除 `binding` 与 `connection`，恢复 `未接入/未验证`。
- `backend/config/mcp-servers.mock.json`
  - mock vehicle MCP 服务登记配置，用于本地验收和示例。
- `backend/fixtures/mock_mcp_server.py`
  - stateful Streamable HTTP MCP fixture，提供 `window.set` 与 `window.status`。
  - 返回结果带 `source: mock`、`status`、窗口状态，便于断言。
  - 支持 `simulate=timeout/failure` 触发错误路径。
- `backend/tests/test_capability_binding.py`
  - 覆盖绑定、拒绝未登记 server/tool、draft 不可绑定、配置变更导致绑定失效、解绑、离线检查、API bind/check/unbind。
  - 跨进程 mock server 连接测试受 `OAKEGDE_TEST_MCP_PYTHON` 保护。
- `backend/tests/test_mock_mcp_fixture.py`
  - 覆盖 mock MCP fixture 的真实发现、调用、状态变化和错误路径。
  - 已修正为仅在设置 `OAKEGDE_TEST_MCP_PYTHON` 时运行；主后端 venv 不装 `mcp` 时应 skip，不应 error。

## 验收环境

- 仓库：`/Users/Shared/sherry/OAKEgde Studio`
- 后端工作目录：`/Users/Shared/sherry/OAKEgde Studio/backend`
- 主后端 venv：`backend/.venv_macos`
- MCP runtime venv：`/Users/sherry/.hermes/profiles/codex/cache/scratch/oakegde-mcp-venv`
- MCP runtime Python：`/Users/sherry/.hermes/profiles/codex/cache/scratch/oakegde-mcp-venv/bin/python`
- MCP runtime 依赖：`requirements-mcp-runtime.txt`，实测安装 `mcp 2.2.0`
- MCP runtime venv 位于 Hermes scratch，不修改仓库主 venv、不污染 `.venv_macos`。

## 验证结果

| 用例 ID | 关联目标 | 前置条件与输入 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|---|
| TC-001 | 主后端 venv 不安装 MCP SDK 也能跑通 | `cd backend && .venv_macos/bin/python -m unittest tests.test_capability_binding tests.test_mock_mcp_fixture`，不设置 `OAKEGDE_TEST_MCP_PYTHON` | 绑定逻辑测试通过；依赖 MCP SDK 的 fixture 测试跳过，不报错 | `Ran 10 tests in 0.138s — OK (skipped=3)` | 通过 | @codex 实跑。修复前同命令为 `errors=2, skipped=1`，错误来自 `test_mock_mcp_fixture` 用主 venv 启动依赖 `mcp` 的 fixture。 |
| TC-002 | 主后端完整测试第一层验收 | `cd backend && .venv_macos/bin/python -m unittest discover -s tests`，不设置 `OAKEGDE_TEST_MCP_PYTHON` | 全量后端测试通过；MCP runtime 相关测试按条件跳过 | `Ran 263 tests ... OK (skipped=8)` | 通过 | @Hermes 实跑；@codex 修复未打坏其他用例。 |
| TC-003 | MCP runtime venv 第二层验收 | 新建 scratch venv，安装 `requirements-mcp-runtime.txt`；设置 `OAKEGDE_TEST_MCP_PYTHON=/Users/sherry/.hermes/profiles/codex/cache/scratch/oakegde-mcp-venv/bin/python` 后运行 `cd backend && OAKEGDE_TEST_MCP_PYTHON="$P" .venv_macos/bin/python -m unittest discover -s tests` | `test_capability_binding.LiveMockBindingTest` 与 `test_mock_mcp_fixture` 不再 skip，真实启动 mock MCP fixture 并通过；skip 数比主 venv 少 3 | @codex 实跑：`Ran 263 tests in 21.484s — OK (skipped=5)`；@kimi 独立复跑：`Ran 263 tests in 19.392s — OK (skipped=5)`；@Hermes 再跑：`Ran 263 tests in 18.198s — OK (skipped=5)` | 通过 | 三方独立结果一致；`mcp 2.2.0` 已安装在 MCP runtime venv；`test_mock_mcp_fixture` 两个用例在第二层为 `ok`。 |
| TC-004 | mock fixture 的真实工具行为 | 第二层环境；fixture 提供 `window.set`、`window.status` | discovery 返回两个工具；`window.set` 返回 `source=mcp` 包装与 `data.source=mock`，状态可回读；timeout/failure 被转换为 `MCPRuntimeError` | 第二层 discover 全量通过，skip 数从 8 降为 5，说明 3 个受 `OAKEGDE_TEST_MCP_PYTHON` 保护的 MCP 用例真实执行通过 | 通过 | @Hermes `-v` 复核指出 `test_mock_mcp_fixture` 两个用例均为 `ok`；剩余 skip 不在该 fixture。 |

## 可复现命令

### 第一层：主后端 venv

```bash
cd /Users/Shared/sherry/OAKEgde Studio/backend
.venv_macos/bin/python -m unittest discover -s tests
```

期望结果：

```text
Ran 263 tests ... OK (skipped=8)
```

说明：这层不安装 `mcp`，因此 MCP SDK 运行时相关用例应按条件跳过。主后端 venv 保持干净是预期行为。

### 第二层：scratch MCP runtime venv

```bash
cd /Users/Shared/sherry/OAKEgde Studio/backend
V=/Users/sherry/.hermes/profiles/codex/cache/scratch/oakegde-mcp-venv
.venv_macos/bin/python -m venv "$V"
"$V/bin/python" -m pip install -r requirements-mcp-runtime.txt
OAKEGDE_TEST_MCP_PYTHON="$V/bin/python" .venv_macos/bin/python -m unittest discover -s tests
```

期望结果：

```text
Ran 263 tests ... OK (skipped=5)
```

说明：与第一层 `skipped=8` 对比，减少的 3 个 skip 是本轮 MCP mock fixture 相关用例真实执行通过。

已复核的 MCP 版本命令：

```bash
P=/Users/sherry/.hermes/profiles/codex/cache/scratch/oakegde-mcp-venv/bin/python
"$P" -c "import importlib.metadata as m; print('mcp', m.version('mcp'))"
```

实测输出包含：

```text
mcp 2.2.0
```

## 第三层 live protocol 试跑（可复现通过）

lab fixture 已收进仓库 `backend/fixtures/mock_lab_mcp_server.py`（charging_status / exhibit_details / forbidden_write；forbidden_write 在 server 端真实注册、仅不进测试 allowlist，用于覆盖客户端授权拦截），review 结论为无迁就断言，并已用仓库内版本复跑确认。

复跑环境：

- fixture server：用 MCP runtime venv 启动仓库内 fixture（首跑 `http://127.0.0.1:57331/mcp`，复跑 `http://127.0.0.1:59755/mcp`，均已关闭）
- `OAKEGDE_TEST_MCP_URL`：指向运行中的 fixture 地址
- `OAKEGDE_TEST_MCP_SDK`：MCP runtime venv 的 site-packages（worker 子进程经 sdk_path 导入 `mcp 2.2.0` / `httpx2` / `jsonschema`）
- `OAKEGDE_TEST_MCP_PYTHON`：MCP runtime venv 的 python（同时放开第二层受门用例）

复现命令：

```bash
cd /Users/Shared/sherry/OAKEgde Studio/backend
V=/Users/sherry/.hermes/profiles/codex/cache/scratch/oakegde-mcp-venv
"$V/bin/python" fixtures/mock_lab_mcp_server.py --port 0   # 记下输出的 url，另开终端
OAKEGDE_TEST_MCP_URL="<上一步输出的url>" \
OAKEGDE_TEST_MCP_SDK="$V/lib/python3.12/site-packages" \
OAKEGDE_TEST_MCP_PYTHON="$V/bin/python" \
.venv_macos/bin/python -m unittest discover -s tests
```

结果：

- 专项 `tests.test_mcp_runtime.LiveProtocolTests`：@kimi 首跑 `Ran 5 tests in 3.898s — OK`；@Hermes 用仓库内 fixture 复跑 `Ran 5 tests in 3.526s — OK`，期间 fixture 日志 44 次 `POST /mcp`，证明请求真实走网络。
- 全量：两人各自独立跑出 `Ran 263 tests — OK`，`skipped=0`（第一层 8 → 第二层 5 → 第三层 0）。

覆盖行为：discovery 过滤未登记/未授权工具、结构化结果 `north=2`/`south=0`、Schema 校验拦截（`{'station': 12}`）、工具错误路径（未知站点）、`forbidden_write` 客户端授权拦截、图谱试跑走 `registered_mcp`。

已知限制（已修复）：fixture `--port 0` 原为先 bind 取端口再释放交给 uvicorn，存在理论上的端口竞争窗口；已改为 `uvicorn.Config.bind_socket()` 一次绑定、socket 全程持有交给 `Server.run(sockets=[...])`，修复后 LiveProtocolTests 5/5 复跑通过（随机端口实测）。`mock_mcp_server.py` 同款写法已一并修正，`OAKEGDE_TEST_MCP_PYTHON` 下 test_mock_mcp_fixture + test_capability_binding 10/10 复跑通过。

fixture 语义说明：`exhibit_details` 显式返回 `list[TextContent]`，SDK 不生成 outputSchema、不带 structuredContent，测试第 97 行 `data is None` 测的正是被测代码对这种标准响应的处理；此前 scratch 版直接返回 `str` 会被 SDK 包成 `{'result': ...}`，属 fixture 未表达清工具语义，已在入库版修正并经 review 确认非迁就断言。

## 未覆盖项与限制

- 本轮已证明的是：能力目录绑定逻辑、API 绑定入口、主 venv 条件跳过、scratch MCP runtime 下 mock fixture 的真实启动与调用，以及仓库内 lab fixture 上的 live protocol 路径。尚未证明对任意业务 MCP 服务、实车服务或长期运行的外部 MCP server 均可靠。
- `check_connection()` 只做 discovery，不执行工具；因此连接状态可以变为 `已接入`，但能力项 `verification` 仍为 `未验证`，真实业务执行验收需要单独的 benchmark/场景证据。
- 验收记录对应 2.8.0-dev.75 提交时的工作区状态；未发布。
