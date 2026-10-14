# OAKEgde Studio API 使用与参考

dev.111内部编排阶段更新：bounded正常路径先understand输出IntentUnderstanding，再本地逐需求检索，随后select输出CapabilitySelection，最后加载契约构图。请求接口不新增阈值字段或改写参数；原prompt/history仍保留。SSE的选择进度复用planning阶段，实际诊断调用stage可为select；总调用上限8保持。原文/改写不写入安全诊断日志。实现状态与验证边界见[验收](../product/releases/2.8.0-dev.111/ACCEPTANCE.md)。

目的：帮助开发者调用当前工作台后端，正确处理项目保存、编排事件和 MCP 结果。状态：当前核心接口指南，非全部路由逐字段手册。维护日期：2026-10-13。主依据：[host-lite 入口](../../backend/main_host_lite.py)、[路由](../../backend/app/api/)与 [Schema](../../backend/app/schemas/)。返回[开发者文档](../developer/README.md)与[项目主文档](../README.md)。

## 运行服务与接口来源

本机轻量后端通常位于 `http://127.0.0.1:8000`。启动方式见[快速开始](../developer/QUICKSTART.md)。实际接口以目标服务暴露的路由为准，host-lite 与完整后端存在差异，例如推理路由受可选依赖影响，记忆服务也不能统一描述为已运行 ChromaDB。

- [Swagger UI](http://127.0.0.1:8000/docs)：交互阅读；Try it out 会发出真实请求。
- [ReDoc](http://127.0.0.1:8000/redoc)：接口结构阅读。
- [OpenAPI JSON](http://127.0.0.1:8000/openapi.json)：目标服务生成的接口描述。

部分接口手工解析 `Request` 并验证字段，其请求体不一定完整出现在 OpenAPI。例如 MCP invoke、提供商配置和执行检查点。此类操作同时参考本页及路由实现，不能假设全部字段约束已由自动文档完整表达。

站点门禁默认关闭；启用时请求受既有会话认证保护。本文未定义新的 Bearer API token 机制。配置方式见[配置与接入](../developer/CONFIGURATION.md)。以下 JSON 是请求示例，不是本轮真实服务响应记录。

## 核心接口索引

| 方法与路径 | 用途 | 副作用或条件 |
| --- | --- | --- |
| `GET /health` | 进程健康 | 不证明模型或设备可用 |
| `GET /v1/projects/` | 项目摘要列表 | 本机数据读取 |
| `GET /v1/projects/{project_id}` | 完整项目 | 使用服务返回的 ID |
| `POST /v1/projects/autosave` | 有版本检查的保存 | 写项目 JSON |
| `POST /v1/projects/` | 兼容保存入口 | 不应当作 autosave 冲突的绕过路径 |
| `DELETE /v1/projects/{project_id}` | 删除项目 | 删除真实项目文件 |
| `GET /v1/orchestration/providers` | 服务商配置状态 | 已配置不等于真实可用 |
| `PUT /v1/orchestration/providers/{provider_id}` | 模型及密钥配置 | 写配置，可能触发连接验证 |
| `GET /v1/orchestration/providers/{provider_id}/reasoning?model=...` | 模型思考能力 | 未知别名不推测控制项 |
| `GET /v1/orchestration/engine` | 编排引擎配置状态 | 不披露运行路径或密钥 |
| `POST /v1/orchestration/generate` | 一次返回编排结果 | 可能调用真实模型，按参数决定保存 |
| `POST /v1/orchestration/generate-stream` | 流式编排 | 同上，响应为 SSE；`X-Orchestration-Run-ID`与本次服务端安全日志共用run_id |
| `GET /v1/mcp/connections` | 工具发现与状态 | 可访问已登记服务，不执行其业务工具 |
| `POST /v1/mcp/invoke` | 工具调用 | 可首次安装配方并执行实际工具 |
| `GET /v1/capabilities` | 已导入能力资料 | 资料不代表可执行 |
| `GET /v1/executions/{key}` | 执行检查点 | 与项目 JSON 保存不同 |

dev.108 同轮接入的服务商 ID 为 `minimax`、`openai`、`anthropic`、`deepseek`。配置 PUT 的 JSON 为 `{model, api_key?}`，先进行简短真实调用，再原子保存；验证失败保留旧配置。`api_key`只发给后端设置入口，不写进编排请求或项目；`base_url`不接受客户端任意修改。DeepSeek 使用官方固定地址，配置、默认模型与验证范围见[模型服务商](../developer/CONFIGURATION.md#模型服务商)。

## 读取与保存项目

```bash
curl --fail http://127.0.0.1:8000/v1/projects/
```

列表元素包括 `id`、`name`、`file_name`、`updated_at`、`size`。完整项目增加 `nodes`、`edges`、`meta`。读取单项目时将 ID 作为一个 URL 路径段编码，不要再次删除其内部的 `.json` 字符。

创建专用测试项目时，向 `POST /v1/projects/autosave` 发送以下 JSON。先换成新的唯一 ID；该操作会写文件，空图只验证保存而非场景执行：

```json
{
  "id": "docs-example-unique-id",
  "name": "开发文档示例",
  "nodes": [],
  "edges": [],
  "meta": {},
  "expected_updated_at": null
}
```

成功返回完整项目。更新时使用返回的 `id`、`file_name` 和 `updated_at`，将后者原值放入 `expected_updated_at`。时间戳充当版本标识，不能自行生成或舍入。保存请求选择文件的优先级为 `file_name`、`id`、`name`，因此这些字段需保持一致。

内容与现存快照相同时，丢失响应后的重试可返回已有确认；其他版本不匹配或项目已删除会返回 409。客户端应保留待保存内容，读取远端后处理冲突。兼容入口的 `overwrite` 不是解决并发覆盖的版本协议。

## 发起场景共创

请求 Schema 为 [WorkflowGenerateRequestSchema](../../backend/app/schemas/orchestration_schema.py)。下面的请求会使用实际配置的模型；示例默认不保存项目：

```json
{
  "provider_id": "minimax",
  "prompt": "设计一个收到用户输入后显示欢迎语的座舱场景",
  "save_on_success": false,
  "conversation_history": []
}
```

将其保存为本地 `request.json` 后，可观察流式响应：

```bash
curl -N --fail-with-body \
  -H 'Content-Type: application/json' \
  --data-binary @request.json \
  http://127.0.0.1:8000/v1/orchestration/generate-stream
```

其他常用字段：

| 字段 | 用法 |
| --- | --- |
| `current_project` | 编辑已有项目时传入完整项目上下文 |
| `conversation_history` | `{role, content}` 数组；客户端负责携带需要保留的历史 |
| `model` | 提供商范围内的模型 ID，省略时按服务端配置解析 |
| `agent_mode` | `single` 或 `team`，省略使用服务端配置；Hermes 构图模式 |
| `reasoning` | `{enabled, effort?}`，先查询模型支持范围 |
| `acceptance_tests` | 调用者锁定的输入序列与断言，模型不能修改其预期 |
| `save_on_success` | 明确请求服务端持久化；默认 false |

`provider_base_url` 虽保留在 Schema 中，Hermes 会拒绝与服务端已配置地址不一致的单次覆盖。配置服务商接口的请求体为 `model` 与可选 `api_key`，不接受任意其他字段；不要将密钥放进场景请求。

## 消费 SSE 与判断结果

SSE 使用 `event: 名称`、`data: JSON`，空行分隔事件。网络分块不保证与事件边界一致，客户端需缓存未完整的帧并逐帧解析。原生 `EventSource` 不提供本接口需要的 POST 请求体，可用 fetch 流读取或支持 POST 的 SSE 客户端。

当前 Hermes 对外主要交付 `thinking`（公开进度说明）与最终 `result`，路由捕获异常后交付 `error`。worker 内部的 `tool_status` 用于宿主诊断，不应假定每项工具状态都作为同名公共 SSE 事件转发。`thinking` 也不代表原始模型思维链。

HTTP 200 只表示流已建立，仍可能随后收到 `error`。连接结束而未收到完整终态也不能算成功。`result` 中包含 `project`、`documentation_markdown`、`validation`、`tests`、`used_live_model` 等字段，并可带 `build_report` 或 `chat_reply`。有讨论回复时保持原图；应用构建结果前按引擎返回的验证与报告判断，不能仅因字段中有 `project` 就覆盖画布。

dev.108提供商失败的SSE `error`可附固定`code`：`output_truncated`、`invalid_json`、`invalid_response`、`empty_response`、`tool_protocol`、`refused_response`、`timeout`、`upstream_http`、`transport_error`。`message`仍为安全可读提示，不附原响应、工具参数、思考正文或凭据。旧客户端只读message继续兼容。bounded的`build_report.calls[].completions`包含安全结束原因和token计数，另有`candidate_attempt`、`proposed_goal`、`plan_revisions`、`trial_count`；保留草稿不能据此声称已运行。

dev.103：宿主超时的SSE `error` 增加 `checkpoint`，包括最后可用 `revision`、`project`、`completion_attempts`、`normalizations`、`call_timeouts`、`status_revisions`、`patch_total`、`patch_rejected`、`overload_retries`；初始尚未调用时为0。它是中断候选证据，仍是错误终态，不能当作可应用结果或自动保存。正常 `build_report` 增加 `status_revisions`/`status_revision_details`，`diagnostics.call_timeouts` 和 `overload_retries`。status修订次数指独立status修订；计数范围与验证见[dev.103验收](../product/releases/2.8.0-dev.103/ACCEPTANCE.md)。


取消后客户端还应隔离迟到响应，防止把旧任务写入已经切换的项目。失败信息可能附白名单 `diagnostics`；不要向用户暴露未经清理的提供商原始错误或密钥。

## 锁定验收输入

`acceptance_tests` 遵循 [ExecutionPlan](../../backend/app/schemas/execution_schema.py)。例如以下片段定义一次输入后应达到 completed；它仅检查状态，不足以证明欢迎语内容正确：

```json
{
  "cases": [{
    "name": "欢迎语基本路径",
    "steps": [{
      "input": "你好",
      "status": "completed",
      "assertions": [{"path": ["run", "status"], "op": "equals", "value": "completed"}]
    }]
  }]
}
```

应按业务目标增加实际输出断言。证据根包括 `run`、`state`、`car`、`hmi`、`nodes`、`outputs`、`messages`、`actions`。`nodes[id]` 是状态字符串；不要将它当作任意节点对象。支持 equals、contains、exists、not_exists、gte、lte、satisfies；后者是受限纯数据表达式。

## 调用 MCP 工具

先读取 connections 中的工具 Schema，再调用。Fetch 示例：

```json
{
  "server_id": "catalog-fetch",
  "tool_name": "fetch",
  "arguments": {"url": "https://example.com", "max_length": 1000}
}
```

发送到 `POST /v1/mcp/invoke`。此请求可能首次安装运行环境并访问外网，本轮文档检查不执行该请求。接口只接受 `server_id`、`tool_name`、`arguments`，不接受客户端提供端点、密钥、环境或命令；参数按照真实发现的 Schema 校验。

结果包含 `source`、服务与工具标识、`data`、`content`、`text`、`is_error`。`data` 来自 structuredContent，可能为 null；文本内容不能自动当作 JSON 对象。工具失败不自动重试，避免重复业务动作。连接断开时服务端取消在途任务，预算及安装行为见 [MCP_RUNTIME](../product/MCP_RUNTIME.md)。

## 能力绑定与执行检查点

能力导入走 preview → confirm → 可选工具绑定。绑定请求体只含 `server_id` 与 `tool_name`，路径为 `PUT /v1/capabilities/{import_id}/items/{item_id}/binding`。对应 DELETE 解绑、POST `.../binding/check` 检查连接。绑定、连接和业务验证是分开的状态；详见[路由](../../backend/app/api/capabilities.py)。

执行检查点使用 `GET /v1/executions/{key}` 读取，POST `/{key}/begin` 提交非负整数 `revision` 和可选 `restart` 布尔值。续租 `/{key}/renew` 与结束 `/{key}/finish` 带 `revision`、`token`；finish 还需 `payload`。客户端优先复用 [durableFlow.ts](../../studio/src/domain/durableFlow.ts)，不要手工伪造 token 或将重启当作无副作用重试。

## 错误处理

| 状态 | 本项目中的常见含义 | 客户端动作 |
| --- | --- | --- |
| 400 | 不支持的模型设置、提供商参数或输入 | 修正请求，不盲目重试 |
| 404 | 项目、操作或接口不存在 | 区分目标资源与旧服务版本 |
| 409 | 项目版本或执行租约冲突 | 保留本地状态，读回最新版本后处理 |
| 413 | 请求超过接口预算 | 减小输入，不能静默截断业务内容 |
| 422 | 字段、路径、MCP Schema 或运行错误 | 查看 detail 并按接口契约修正 |
| 503 | 配置、运行时或编排未完成 | 保留项目并检查服务条件与诊断 |

不同接口的 `detail` 可能是字符串、对象或校验列表；客户端需兼容实际结构。SSE 失败另看 error 事件，不能仅检查 HTTP 状态。以上为核心路径，不承诺所有异常都已统一格式。

## dev.79 文件参数边界（2026-10-03）

当前实现补充，依据[本轮验收](../product/releases/2.8.0-dev.79/ACCEPTANCE.md)。

- `/v1/projects/{project_id}` 的读取与删除使用列表或保存响应中的完整 `id`。只在从文件名生成ID时去掉最后一个 `.json`；ID内部和末尾的 `.json` 保留。`draft.json.json` 的ID是 `draft.json`，不能再次截短。接口不隐式将完整文件名当作ID别名，重复删除不存在的ID返回404。
- host-lite `/v1/pipelines/save` 的 `id` 必须是非空的单文件名片段，不能包含目录分隔符/控制字符或解析到pipeline目录外；非法值返回422。
- host-lite打包/部署的 `flow_config.file_name` 和 `project_file_name` 均只能指定单个文件名，分别校验。流程写入留在本次临时目录、已保存项目读取留在项目目录；已存在的符号链接越界同样拒绝。非法参数返回422，不通过静默改名选择其他文件。

上述边界已通过临时目录/TestClient验证，不表示真实设备打包和部署已验收。


## 项目自动保存（dev.89）

`POST /v1/projects/autosave`：项目JSON加`expected_updated_at`。首次创建用稳定唯一ID和null版本；更新带上次读取/保存返回的`updated_at`。冲突/已删除返回409，调用者保留本机副本；相同内容重试返回已有确认。成功返回ProjectSchema。写入原子替换，原POST /v1/projects/兼容保留。主服务与host-lite均提供；旧服务404不能回退无保护覆盖。
