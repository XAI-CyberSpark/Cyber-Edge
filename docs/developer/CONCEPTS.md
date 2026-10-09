# 核心概念与运行链路

目的：理解界面中的对象与运行状态，避免将资料入库、构图成功、执行成功和实际设备动作混为一谈。状态：当前源码阅读指南。维护日期：2026-10-05。主依据：[CONTEXT](../../CONTEXT.md)、[当前架构](../architecture/02_Current_Implementation_Architecture.md)、下文源码。返回[开发者文档](README.md)与[项目主文档](../README.md)。

## 项目与场景图

项目是保存单位，包含 ID、名称、节点 `nodes`、连线 `edges` 和 `meta`。场景描述用户想完成的体验，场景图表达具体执行路径。项目可以包含讨论和未完成图，保存成功不表示图可执行。

能力描述通用职责，例如输入、模型理解、条件判断或工具调用。节点实例则携带这个场景的配置，例如模型、提示词和输入绑定。阶段容器用于组织节点，本身不执行动作，也不能当作产生输出的节点连接。

能力资料入库只是保存说明；即使绑定了 MCP 工具，也要分别检查登记是否有效、工具是否可连接、业务是否经过验证。目录中的模型介绍同样不代表该模型已经部署。

## 共创与执行是两条链路

共创把用户需求变成讨论结果或场景图；执行使用图中的节点处理具体输入。它们会调用不同服务，不能用一次共创成功替代场景执行验收。

```mermaid
flowchart TD
    A[用户需求与项目上下文] --> B[编排接口]
    B --> C{配置的编排引擎}
    C --> D[Hermes 对话入口]
    C --> E[bounded 编排]
    D --> F[讨论回复]
    D --> G[single 或 team 构图]
    G --> H[结构检查与隔离试跑]
    H --> I[实际内容核验]
    I --> J[结果交付]
    E --> J
    J --> K[用户工作台中的场景图]
    K --> L[图执行器]
    L --> M[模型 MCP 或仿真 HMI]
```

Hermes 的只读对话入口处理讨论或交接构建。`single` 与 `team` 都受宿主检查和既有执行验收约束；多角色本身不是质量证明。引擎由服务端配置，不能从前端显示的模型名称推断使用了哪个引擎。

构建结果可能是 `chat_reply`，也可能包含项目、验证结果和报告。客户端应按返回字段判断，不应在收到任意文字时清空或替换画布。实际逻辑见 [scenario_builder](../../backend/app/services/scenario_builder.py)、[Hermes 宿主](../../backend/app/services/hermes_authoring.py)、[工作区页面](../../studio/src/components/pages/WorkspacePage.tsx)。

## 节点如何获得数据

通用绑定用 `{"$ref":"input.text"}` 等对象表达，保留被引用值的类型。输入来源包括 `input`、`event`、`state`、`outputs`。例如 MCP 参数：

```json
{
  "tool_id": "mcp",
  "serverId": "catalog-fetch",
  "toolName": "fetch",
  "arguments": {"url": {"$ref": "input.text"}}
}
```

这是节点 `data` 的片段，不是完整可导入项目。它要求当前上游输入确实是一条 URL。工具后模型的 `input.text` 通常是工具结果，不能继续将它当成最初用户输入；需要更早节点结果时使用 `outputs.<节点ID>...`。

绑定路径只允许点分隔标识符，不支持数组下标或原型字段；节点 ID 用于绑定时也需满足路径规则。多条输入汇合要显式声明 `joinMode`，区分等待全部 `all` 和任一分支 `any`。详见 [flowContract.ts](../../studio/src/domain/flowContract.ts) 与[节点契约](../product/NODE_CONTRACTS.md)。

## 如何判断成功

| 状态或证据 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| 图结构检查通过 | 节点、配置、连线符合所检查契约 | 模型会给出正确答案 |
| 模拟回归通过 | 固定输入与模拟响应下行为符合预期 | 远端模型或工具真实可用 |
| 真实模型试跑通过 | 指定模型、输入、配置的本次运行成功 | 任意输入都可靠 |
| HMI 状态正确 | 仿真控件与场景链路正确更新 | 实车执行了动作 |
| MCP 返回成功 | 工具报告的本次调用结果 | 外部动作一定可重试或具备事务 |
| 保存返回成功 | 本次快照已获服务端确认 | 新编辑、其他标签页修改也已保存 |

工具错误走失败路径。兜底提示可以改善体验，但不能将失败重新标为业务成功。结果中的 `data` 可能为空，文本存在于 `text` 或 `content`；不要凭空补出结构化数据。

## 保存与执行恢复

项目自动保存维护图和对话快照，前端先保留本地恢复副本，再串行写服务端；更新使用 `expected_updated_at` 检查冲突。遇到 409 应保留副本并处理冲突，不能降级为无条件覆盖。实现见 [projectAutosave.ts](../../studio/src/domain/projectAutosave.ts)。

执行恢复使用另一套检查点与租约，保存流程状态及仿真状态。`running` 表示上轮仍在运行或中断，不能自动重放外部动作。项目保存、执行检查点和第三方工具幂等是不同问题。实现见 [durableFlow.ts](../../studio/src/domain/durableFlow.ts)、[执行存储](../../backend/app/services/execution_store.py)。


## dev.103：测试计划与中断恢复（2026-10-08）

测试步骤通常省略status，仍按not_failed和原业务断言验证；明确要求完成/等待时才填。AI计划可单独修改/删除status，其他字段继续按dev.101受限规则，调用方计划锁定；修订清缓存但不重置试跑次数。宿主超时返回最后候选checkpoint与计数，仍不可直接应用/保存。图模型真实529/503仅原模型重试一次，不改变独立内容核验门槛。配置见[调用期限](CONFIGURATION.md#dev103调用超时计划修订与恢复证据2026-10-08)，验证见[dev.103](../product/releases/2.8.0-dev.103/ACCEPTANCE.md)。


dev.104：编排inspect复用Studio的validateExpression进行静态检查（不evaluate），不新增根变量；logic/satisfies与模板绑定遵循各自既有契约。每个测试case的state、车辆、会话及记忆独立，跨步骤保留而跨case不共享。已有记忆须在本case先写入。


## JSON 入口与用例隔离（dev.105）

JSON 入口推荐 step.input 直接给业务对象，outputFields 声明必需字段和类型；字符串与 text 包装也支持。所有 case 都从全新状态开始，跨轮记忆必须放在同一个 case 的多个 step。输入错误在计划提交/inspect前置定位，等待预期和可能的跨case记忆依赖给出警告；trial反馈区分输入、模型输出、图逻辑与断言，附修复方向。形状、错误码及静态推断限制以[节点契约](../product/NODE_CONTRACTS.md#dev105json-输入与测试计划契约2026-10-09)为主，不把警告当作实际运行结果。


dev.106（2026-10-09）：断言路径/类型预检共用TS目录推导；修订权限与截断恢复见[节点契约](../product/NODE_CONTRACTS.md#dev106断言前置契约与受限恢复2026-10-09)，测试依赖隔离及命令见[测试说明](TESTING.md#dev106-隔离测试依赖)。本轮验证状态以[验收](../product/releases/2.8.0-dev.106/ACCEPTANCE.md)为准。

编排契约反馈（dev.107）：patch/inspect共用目录驱动的连接路径诊断；核验优先evidence_id，兼容旧引用并记录有界差异。弱节点存在断言和未匹配事件只警告。结构通过后必须登记计划/实际试跑，无当前试跑不能主动提交；预算结束宿主仍可保留草稿。详见[节点契约](../product/NODE_CONTRACTS.md#dev107-精确连接诊断核验证据编号与推进门槛)与[本轮验收](../product/releases/2.8.0-dev.107/ACCEPTANCE.md)。
