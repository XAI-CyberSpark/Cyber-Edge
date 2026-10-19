# 配置与能力接入

目的：理解配置在哪一层生效，并完成模型、Hermes 与 MCP 接入。状态：当前实现参考；秘密值不收录在文档。维护日期：2026-10-05。主依据：下文源码与 [MCP 运行契约](../product/MCP_RUNTIME.md)。返回[开发者文档](README.md)与[项目主文档](../README.md)。

## 服务地址与环境变量

| 配置 | 作用位置 | 缺省值或行为 |
| --- | --- | --- |
| `PYTHON_BIN` | 首次安装脚本 | 建立虚拟环境所用 Python，默认 `python3`，脚本含可用运行时回退 |
| `VENV_DIR` | 安装及后端启动脚本 | macOS 使用 `backend/.venv_macos` |
| `BACKEND_HOST` / `BACKEND_PORT` | 后端启动脚本 | `127.0.0.1` / `8000` |
| `STUDIO_HOST` / `STUDIO_PORT` | 前端启动脚本 | `127.0.0.1` / `5173` |
| `VITE_PROXY_TARGET` | Vite 开发服务器 | `/v1` 与遥测代理目标，默认 `http://127.0.0.1:8000` |
| `VITE_API_URL` | 前端构建环境 | 空值时使用浏览器当前 origin；独立部署时可指定 API 基地址 |
| `OLLAMA_BASE_URL` / `OPENSPARX_BASE_URL` | host-lite 启动环境 | 启动脚本默认 `http://127.0.0.1:11435/v1` |
| `OAKEGDE_SITE_ACCESS` | 站点门禁 | 默认关闭，设为 `1` 启用现有门禁 |

改变前端构建变量后需重新启动开发服务或重新构建产物。`VITE_*` 可能进入客户端，不应用于存储密钥。变量行为依据[启动脚本](../../scripts/start_backend_host_lite.sh)、[前端启动脚本](../../scripts/start_studio_host.sh)、[Vite 配置](../../studio/vite.config.ts)与 [API 地址模块](../../studio/src/lib/api.ts)。

例如使用独立端口开发，在两个终端从仓库根目录分别执行：

```bash
BACKEND_PORT=8011 bash scripts/start_backend_host_lite.sh
```

```bash
VITE_PROXY_TARGET=http://127.0.0.1:8011 STUDIO_PORT=5175 bash scripts/start_studio_host.sh
```

端口隔离不等于数据隔离：同一仓库的后端仍可能读取相同项目和状态。会写数据的验证应使用受控测试环境或独立测试项目。

## 模型服务商

编排服务支持的服务商 ID 由 [model_providers.py](../../backend/app/services/model_providers.py)定义，目前为 `minimax`、`openai`、`anthropic`。在产品模型设置中接入后，服务端配置存放于 `.demo-runtime/model-providers.json`；读取状态使用 `GET /v1/orchestration/providers`。

官方服务可按代码读取 `MINIMAX_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`。已有服务端保存配置可能优先于环境变量，修改环境后仍使用旧配置时应检查解析顺序。网关不能自动继承官方服务凭据；服务地址由服务端管理，不能用单次场景请求任意更换。

建议按以下顺序接入：确认提供商与真实模型 ID → 配置密钥 → 回读服务状态 → 查询该模型支持的思考设置 → 使用明确测试输入验证真实调用。`configured: true` 只表示找到了配置，不表示网络、余额或模型可用性已经验证。

思考设置查询接口为 `GET /v1/orchestration/providers/{provider_id}/reasoning?model=...`。返回是否支持、能否关闭与允许的强度。未知模型别名不推测能力；`reasoning` 可省略以使用默认请求行为。具体约束见 [model_reasoning.py](../../backend/app/services/model_reasoning.py)。

模型目录资料和可调用编排提供商是不同机制。把模型说明导入目录，不会自动下载权重、配置推理端点或验证模态。

## Hermes 编排引擎

引擎配置位于 `.demo-runtime/orchestration-engine.json`，读取逻辑见 [hermes_authoring.py](../../backend/app/services/hermes_authoring.py)。配置文件缺失时，源码默认 `engine=bounded`、`agent_mode=single`；现有部署可覆盖这些默认值。用 `GET /v1/orchestration/engine` 查看服务实际选择。

Hermes 配置结构如下，路径必须替换为本机真实绝对路径，不能直接复制占位符使用：

```json
{
  "engine": "hermes",
  "agent_mode": "team",
  "runtime_root": "/absolute/path/to/verified-hermes-sdk",
  "python": "/absolute/path/to/hermes-venv/bin/python"
}
```

`pythonpath` 是可选字段，仅在现有安装需要时设置。源码核对的 SDK 修订为 `d0288be5b3330d2442e3907185b8e9d0958297bb`；启动会检查 SDK HEAD 与干净状态。配置路径无效、SDK 修订不同或 SDK 有修改会返回 503，不会静默换用另一引擎。

本仓库目前没有统一的 `setup_hermes_runtime.py` 安装脚本。已有集成与历史证据见 [dev.58](../product/releases/2.8.0-dev.58/ACCEPTANCE.md) 和 [ADR 0009](../adr/0009-conversation-intake.md)。全新机器的完整 SDK 安装与迁移教程仍需独立复现后补齐；不要使用一次普通 `pip install` 就声称完成固定修订接入。

## 登记已有 MCP 服务

完整契约以 [MCP_RUNTIME](../product/MCP_RUNTIME.md)为准。先准备独立客户端运行时：

```bash
backend/.venv_macos/bin/python scripts/setup_mcp_runtime.py
```

这会安装独立 MCP SDK 并生成运行配置，不等于已连接业务服务。服务登记文件是 `.demo-runtime/mcp-servers.json`；在已有文件中合并配置，勿整篇覆盖其他登记。结构示例：

```json
{
  "servers": {
    "your_service": {
      "url": "https://example.org/mcp",
      "headers_env": {"Authorization": "OAKEGDE_YOUR_SERVICE_AUTH"},
      "tools": {"search": {"allow_trials": false}}
    }
  }
}
```

这是[仓库示例](../../backend/config/mcp-servers.example.json)中的占位服务，不是可用端点。`headers_env` 的值是环境变量名称，该变量内容应包含完整请求头值，例如 Bearer 前缀。环境变量应由后端进程获得；密钥不进入节点、项目 JSON 或文档。

`allow_trials=false` 表示不允许生成器在自动试跑中调用该工具，远端 `readOnlyHint` 不会自动授予权限。读取 `/v1/mcp/connections` 查看发现结果，再使用 `/v1/mcp/invoke` 验证明确的工具参数。连接检查可能访问远端服务，但不等于执行了业务工具。

## 托管 MCP 配方

目录中的服务说明只是资料。能首次 Run 自动安装的服务由 [mcp_packages.RECIPES](../../backend/app/services/mcp_packages.py)显式登记，不能直接执行 README 或远端配置中的任意命令。

已记录完整验收的 Fetch 为 `catalog-fetch/fetch`，首次实际调用时准备隔离环境，后续复用。Fetch 可访问运行主机可达网络，包括内网；独立虚拟环境不是网络沙箱。首次安装与取消预算详见 MCP 主契约。

截至本次源码核对，Time 的 `catalog-time` 配方也已出现；dev.90 的继续任务仍在更新，因此其验收以[该轮记录](../product/releases/2.8.0-dev.90/ACCEPTANCE.md)为准，本指南不提前认定完成。新增配方需核对包、版本、工具 Schema、凭据、安装失败、并发和取消，并通过真实协议与图执行检查。

## 数据保存与访问控制

| 位置 | 内容 | 维护注意事项 |
| --- | --- | --- |
| `backend/projects/` | 项目 JSON | 保留用户场景、对话与图，不用于临时测试覆盖 |
| `backend/state/` | 执行检查点、能力库、模型登记等 | 迁移按实际文件保留，不能用重新构建替代恢复 |
| `.demo-runtime/` | 运行配置、服务日志、独立运行时 | 可能含凭据，避免整目录公开或提交 |
| `models/` | 本地模型与相关数据 | 不能从文件名推断为可删除缓存 |
| 浏览器 localStorage | 项目恢复副本与浏览器身份 | 清理浏览器数据可能失去尚未确认保存的草稿 |

站点门禁默认关闭是现有产品决定，见 [ADR 0007](../adr/0007-site-access-default-off.md)。它不是多租户权限系统。公网部署前按[Web 部署文档](../devops/04_Web_Studio_Production_Deployment.md)核对实际监听、访问控制与目标环境；本机默认配置不是公网发布结论。

## Hermes输出额度（dev.95）

角色输出上限由`authoring_team.output_token_limit`提供：搭建员32000，其他角色12000。MiniMax思考token也消耗该上限；真实搭建曾在12000下连续truncated且未调用交付工具。保持用户思考设置；当前dev.102用户授权预算为40次/720秒编排与780秒宿主期限，不是无限重试。成果截断不能当作有效图。验证状态见[dev.95](../product/releases/2.8.0-dev.95/ACCEPTANCE.md)。

## 日常环境的数据与配置（dev.93）

独立入口5175，开发5173/8000保持。首次复制backend的projects/pipelines/state及编排/模型/MCP配置至`.demo-runtime/stable/data/`，后续分别保存，准备新版本不覆盖日常数据。固定代码目录通过本机链接读取这份独立数据；密钥文件权限600。Python、Hermes SDK、已安装MCP依赖及模型仍为共享运行依赖。完整入口与恢复边界见[快速开始](QUICKSTART.md#日常使用的独立环境dev93)。


dev.102（2026-10-08）用户明确授权：共享编排预算由24次/480秒放宽到40次/720秒，宿主540→780秒。此前版本数字仅为历史证据；当前期限审计、真实结果及限制见[本轮验收](../product/releases/2.8.0-dev.102/ACCEPTANCE.md)。图执行与独立内容核验的局部预算保持。


## dev.103：调用超时、计划修订与恢复证据（2026-10-08）

本节为当前规则，替代dev.101仅waiting证据下修改status，以及dev.102每请求720秒的描述；历史验收保留。整轮40次/720秒、宿主780秒和代理810秒不变。

测试步骤一般省略status，继续按not_failed检查；实际值断言照常验证。只有明确要求该步结束/等待时显式填写。AI生成计划可单独修改/删除任一步status，不需waiting证据；输入/断言/controls/步骤增删继续遵守dev.101受限规则，调用方计划完全锁定。修订清除检查/执行/核验缓存，不重置三次试跑；status_revisions与status_revision_details记录独立status修订。

EngineConfig.api_call_timeout_seconds默认150秒，可在服务端引擎配置中显式覆盖；本轮未改本机配置文件。worker一次性profile的custom/anthropic请求与停滞timeout均来自该值，覆盖MiniMax/OpenAI及Anthropic。超时交给Hermes正常重试并消耗编排调用次数，call_timeouts记录；SDK看门狗关闭socket形成连接异常也算超时。固定SDK不修改。

worker在工具/API进度处回传请求内checkpoint；宿主超时error包含最后校验通过的revision/project快照、completion_attempts、normalizations、call_timeouts、status_revisions与patch计数。仅返回候选证据，不保存、不自动应用。初始化未开始调用时计数为0。checkpoint不消耗原模型消息预算。

trial图模型仅真实HTTP529/503等待2秒后原模型重试一次；真实attempt计入model_calls和原12次上限，overload_retries单独记录。执行器150秒与独立核验规则不变。inspect不可达反馈列ID与补边/remove_node_ids两种办法；显式删边/删节点导致新不可达时patch.warnings提前说明，不代删图。

## 随仓库交付的接口目录（2026-10-19）

[capability-library.seed.json](../../backend/config/capability-library.seed.json)保存473条已导入接口资料（参数、分类、原文依据），不包含连接绑定、密钥或执行历史。条目保持“未接入、未验证”。

两个后端入口启动时调用`capability_library.initialize_library`，使用`OAKEGDE_CAPABILITY_DB`（兼容旧前缀）或后端工作目录下`state/capability-library.sqlite3`。imports表为空时事务导入；已有任何草稿或确认记录就不合并、不覆盖。重复启动不重复导入，失败回滚并中止启动。运行数据库继续排除在Git之外。

拉取代码并重启自己的后端后，空库的`GET /v1/capabilities`应返回473条。已有非空目录继续保留；不要删除旧库来强行初始化。MCP服务登记、独立SDK和授权仍需单独准备。
