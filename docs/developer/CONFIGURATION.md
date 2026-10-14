# 配置与能力接入

目的：理解配置在哪一层生效，并完成模型、Hermes 与 MCP 接入。状态：当前实现参考；秘密值不收录在文档。维护日期：2026-10-14。主依据：下文源码与 [MCP 运行契约](../product/MCP_RUNTIME.md)。返回[开发者文档](README.md)与[项目主文档](../README.md)。

## 编排模型与诊断日志（dev.108，2026-10-13）

dev.111阶段与检索政策：先意图理解/改写，再逐有效需求本地检索与独立select。内部`search_capabilities(..., min_score=0.35, top_k=32)`按本次最高RRF归一化分取阈值内最多K项，参数须为有限0–1数值/正整数；精确ID和已有引用可越过门槛/K并单列。候选不再按字符裁剪，完整短目录在选择阶段可补选，无证据/降级不假报缺口。阈值不是语义可信度或授权判断，默认值为初始政策，尚无用户UI参数。已知DeepSeek select与understand均16384输出额度，总authoring仍8次；正常路径增加一次选择请求，实际用量按stage记录，原文/改写不进入诊断日志。实现与验证见[dev.111验收](../product/releases/2.8.0-dev.111/ACCEPTANCE.md)。

在 Studio 打开项目的“编排”页，点击右侧聊天输入框旁的模型名称下拉框，再点击“未接入”的模型或“编辑模型…”。填写账号实际可用的模型 ID 和 API 密钥，点击“验证并保存”。验证会进行一次简短真实模型调用；失败不会替换原配置。密钥保存在本机后端 `.demo-runtime/model-providers.json`，不用写进项目或聊天。该入口配置的是场景创作服务，不是模型资料目录。

编排入口自动写 `.demo-runtime/logs/orchestration.jsonl`：每次请求有独立标识、引擎、阶段、耗时、候选节点数量、可应用状态及白名单终止类别。日志不含需求、历史、节点正文、密钥或原始服务商错误正文。单文件 5 MiB，保留三个轮转备份；日志写入失败不得改变编排结果。HTTP/SSE 批测证据的取得方式见[测试与排障](TESTING.md#编排接口批测dev1082026-10-13)。

同轮修复后记录安全模型元数据：固定`finish_reason`、请求输出上限、输入/总输出/思考token计数和固定失败码；缺少用量时保持未知，不能当作0。`length`截断与网络失败分别反馈，不保留部分工具参数或原始推理文本。实现与真实复测状态见本轮验收，不将完整JSON当作可应用图。

本机开发沿用前端5174/后端8001，默认5173/8000为其他服务占用；这不是日常5175副本更新。日志在后端载入新源码后生效。实现与验证范围见[dev.108验收](../product/releases/2.8.0-dev.108/ACCEPTANCE.md)。

## 服务地址与环境变量

### 工具检索模型（dev.110，2026-10-14）

用户后续确认完整召回99.9%优先于裁剪：现在无论排序或模型是否可用，理解阶段都能看到本次注册快照的完整短目录；排序只影响优先加载，不决定能力有无。当前84项的完整身份/用途/来源/权限已保留，详细Schema仍按选择加载。上下文会增加，旧每例11–15项仅表示优先列表，不能当作模型看到的全部能力范围。

工具筛选默认使用BM25＋本地 `BAAI/bge-small-zh-v1.5`，与用户选择的编排生成模型分别运行。采用官方修订 `7999e1d3359715c523056ef9478215996d62a620`，512维、512 token、CPU/float32、CLS池化和L2归一化，查询使用官方中文检索前缀。模型文件逐一SHA256核验；[官方模型说明](https://huggingface.co/BAAI/bge-small-zh-v1.5)。检索不发付费生成请求，不发现或执行工具。

从项目根目录显式准备一次；只有 `--prepare` 安装依赖与下载权重，全部写入 `.demo-runtime/capability-embeddings/`。`--check` 默认离线真实推理，不安装；本机已实际完成两种命令。独立Python环境与锁定依赖见[依赖文件](../../backend/requirements-capability-embeddings.txt)，共享host-lite不安装torch/transformers。

```powershell
.\backend\.venv_host_lite\Scripts\python.exe -X utf8 scripts\setup_capability_embeddings.py --prepare
.\backend\.venv_host_lite\Scripts\python.exe -X utf8 scripts\setup_capability_embeddings.py --check
```

本机实际占用约4.24GB，含约96MB模型、CPU依赖及下载缓存；不是模型本身4GB。正常编排仅从本地读取，不自动下载。后端懒加载独立worker，同一进程复用模型与向量缓存；模型启动、推理、竞争等待均有界。`CAPABILITY_EMBEDDING_RUNTIME_DIR`可指向已经准备好的独立目录；准备脚本只允许上述默认目录。改变运行目录/模型配置后重启对应开发后端，不重启日常5175。

每个节点、动作、控件及已登记MCP绑定对应独立记录；静态语义文档/契约哈希和模型指纹控制缓存失效，当前权限、来源和配置仍从注册表读取。向量文档不放进模型上下文。精确ID/已有引用保留，弱或不可用召回可扩大短索引；模型缺失或异常以`semantic_recall_unavailable`及安全reason标记降级，不能当作能力不存在。只有选择具体MCP服务后才载入真实详情，召回不授予试跑权限。实际检索指标与未验证范围见[dev.110验收](../product/releases/2.8.0-dev.110/ACCEPTANCE.md)。

dev.109（2026-10-14）不增加能力选择对外API或新模型默认，不升级固定SDK。内存索引从当前注册表与已绑定MCP安全元数据生成；只有选中服务才发现，只有选中工具才加载参数Schema，权限仍由既有绑定检查。未配置/无试跑授权与未知用途分别反馈，检索不授予权限。

载入新后端后，诊断日志在每次实际请求发起/完成时增量记录安全call_id、阶段/尝试、authoring/graph_inference、耗时、输入/输出/思考/缓存与上下文组件字节/字符。失败、取消和无result也保留前序完成消耗；缺失usage为unknown及已知下限。Claude有缓存时总输入为未缓存+缓存读+缓存写；字段缺失不补0。DeepSeek等prompt总输入已包含缓存，不重复累加；思考已含在总输出时不再相加。日志不存原始推理/正文/密钥。

批测用`--log-path`指向同运行实例的JSONL及其轮转文件，按HTTP run_id关联；缺header或日志不能当作0成本。默认路径为仓库根目录下`.demo-runtime/logs/orchestration.jsonl`，开发源码未重载时不视为新日志策略已生效。Claude总输入归一化依据[官方缓存计量说明](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)。当轮质量及用量见[dev.109记录](../product/releases/2.8.0-dev.109/ACCEPTANCE.md)，当前真实十例见[dev.111测评](../product/releases/2.8.0-dev.111/TEST_CASES.md)；没有成对缓存收益或费用节省验证。

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

编排服务支持的服务商 ID 由 [model_providers.py](../../backend/app/services/model_providers.py)定义，目前为 `minimax`、`openai`、`anthropic`、`deepseek`。在产品模型设置中接入后，服务端配置存放于 `.demo-runtime/model-providers.json`；读取状态使用 `GET /v1/orchestration/providers`。

官方服务可按代码读取 `MINIMAX_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`DEEPSEEK_API_KEY`。已有服务端保存配置可能优先于环境变量，修改环境后仍使用旧配置时应检查解析顺序。网关不能自动继承官方服务凭据；服务地址由服务端管理，不能用单次场景请求任意更换。

DeepSeek 在现有模型菜单中独立接入，固定官方地址 `https://api.deepseek.com`，默认模型 `deepseek-flash`；可填合法的 `deepseek-` 模型 ID，实际权限在“验证并保存”时确认。当前[官方列表](https://api-docs.deepseek.com/quick_start/pricing/)还包括 `deepseek-v4-pro`，核对日期2026-10-13；旧的 `deepseek-chat` 不能当作当前已验证模型。不能把 DeepSeek ID 和密钥填进 GPT/MiniMax/Claude 配置，它们有独立模型前缀和服务地址。

已知两个 DeepSeek 模型提供思考开关与 low/high/max 强度，按[官方 Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)发送 enabled/disabled；接入的简短验证关闭思考以避免验证额度被推理耗尽，生成仍使用用户所选设置或服务默认。未知别名不提供猜测的思考能力。本轮复用现有设置弹窗，没有新增通用服务商/任意地址入口，左侧“添加模型资料”仍只管理能力资料。真实配置与批测状态见[本轮验收](../product/releases/2.8.0-dev.108/ACCEPTANCE.md)。

dev.108修复将已知DeepSeek的bounded阶段额度设为：需求规划16,384、构图/修复32,768、内容审查8,192；思考与结果共同占用额度，不是给JSON另保留32K。没有显式选择时继续官方默认思考行为；用户显式开关/强度原样传递。单次HTTP请求仍按90秒读取/15秒连接超时，整体编排720秒，构图/试跑最多三轮。其他服务商和未知DeepSeek别名保留14,000额度/240秒整体期限；Hermes角色额度和既有总预算保持。API官方最大393,216不是产品默认应发送的额度，实际输出长度决定用量。

图内推理的短结果预算与编排分开：已知DeepSeek型号在网页运行和隔离试跑中关闭隐式思考，按节点原max_tokens输出（当前服务上限14,000）。节点运行接口没有编排`reasoning`字段，这不会改写用户在编排菜单选择的思考模式；未知别名不添加猜测参数。本轮没有新增输出额度编辑UI。

建议按以下顺序接入：确认提供商与真实模型 ID → 配置密钥 → 回读服务状态 → 查询该模型支持的思考设置 → 使用明确测试输入验证真实调用。`configured: true` 只表示找到了配置，不表示网络、余额或模型可用性已经验证。

思考设置查询接口为 `GET /v1/orchestration/providers/{provider_id}/reasoning?model=...`。返回是否支持、能否关闭与允许的强度。未知模型别名不推测能力；`reasoning` 可省略以使用默认请求行为。具体约束见 [model_reasoning.py](../../backend/app/services/model_reasoning.py)。

Windows 的 POSIX `0600` 模式不等于 ACL 验证；本轮未验证 Windows 凭据文件的专用 ACL。固定 Hermes worker 对仅由宿主环境变量提供的凭据另有既有重解析限制，不能凭宿主 configured=true 就认定 Hermes 全链路可用；本轮使用 bounded，菜单保存配置按既有 settings_path 读取。

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
