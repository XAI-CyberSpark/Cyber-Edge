# dev.58 验收与启用

2026-09-27｜开发工作区，未提交、未发布。26个文件已应用主工程并逐项摘要核对，原内容已备份；Hermes已启用，后端重启health HTTP 200。正式认证SSE与JSON入口均已通过实际请求。

## 已有验证

- 后端84项统一回归通过（backend-tests.log），含真实 Node 子进程 null/缺失值区分。覆盖工具事务、版本、实际失败驱动局部修复、固定验收、取消回收及原生成链路。
- 前端108项通过，TypeScript/Vite构建通过（既有大分块提示保留）；暂存构建未复制公共素材，不是发布包。
- 官方 SDK 固定干净提交 `d0288be5b3330d2442e3907185b8e9d0958297bb`。真实调用用户已配置网关模型名 `claude-sonnet-5`；不独立核实上游模型身份。
- 温控愿望：真实 API 自主生成11节点，两种选择试跑；独立固定用例复验温暖24/清凉20、结束22，其他车辆状态保持。运行是 HMI mock，无实车动作。
- 文字愿望：调用方固定三组输入/断言，实际 API 生成4节点、局部修正后通过；3次运行模型调用，显示18/21/20个 UTF-16 字符，与原始模型返回完全一致，无车辆动作。81.44秒。证据 `live/creative-caller-anthropic/`。
- 早期文字运行有无效断言导致失败；另一次模型自写测试通过但独立字符检查42/29，其中42不满足40字符基准。保留两次证据，不计为通过。后来固定用例的成功不证明随机模型在全部未来输入中永远满足长度。


## 主工程正式接口验收

- 认证 GET `/v1/orchestration/engine` 返回 hermes 及固定SDK提交。
- SSE `/generate-stream`：温控体验56.25秒，11节点、2条固定分支；启动与无关事件不执行车控，温暖24/清凉20，显示选择和温度，结束恢复22。额外逐步深比较证明除空调温度外车辆状态保持。新增项目 `hermes-comfort-dev58.json`，显示名“Hermes乘客舒适设置 · dev.58验证”（名称无隐含格式要求），回读nodes/edges一致。
- JSON `/generate`：文字比喻74.42秒，4节点、3组调用方固定用例；实际运行3次API模型，展示23/18/15字符，均与原始模型回复一致，无车辆动作。新增项目 `hermes-metaphor-dev58.json`，显示名“Hermes旅途比喻 · dev.58验证”，回读一致。
- MiniMax正式SSE局部编辑23.27秒：只改指定wait节点的data.prompt。逐字段比较确认11节点其他字段、全部11连线、用户元数据保留；两分支固定用例再次通过。此前缺需求覆盖的候选被阻止试跑，智能体补齐后通过；没有保存或覆盖项目。
- 完整原始请求、返回与独立检查在 `live/formal-http-comfort`、`live/formal-http-creative`、`live/formal-http-minimax-edit`。三次运行均使用既有服务器模型配置，不切换到伪造成功适配器；不同编排提供商都通过了各自列明的请求。
- 这些接口验收未包含浏览器画布点击与视觉验收；未据此宣称全部输入稳定或任意场景完成。

## 使用路径

Studio 共创继续使用已有 `/v1/orchestration/generate-stream`；JSON入口为 `/v1/orchestration/generate`。服务端配置读取 `.demo-runtime/orchestration-engine.json`，缺省仍为 bounded；损坏配置或 Hermes 失败不静默回退。认证 GET `/v1/orchestration/engine` 查询选择状态（不返回路径或密钥）。模型选择含义保持不变。

启用命令：用 backend 虚拟环境 Python 执行 `scripts/configure_orchestration_engine.py --engine hermes --runtime-root <已安装SDK目录> --python <SDK解释器绝对路径> --pythonpath <依赖目录>`。工具验证固定干净提交，不下载依赖或接收密钥。切换回既有生成器：同脚本 `--engine bounded`。配置变更下一请求生效；首次安装 Python 源码需重启后端。

本机 SDK 位于工作资料目录 `outputs/hermes-trial/runtime`，Python 与 pydeps 同级保存。迁移机器时必须独立安装/验证该依赖，不能把本机绝对路径配置直接复制成发布包。

调用方可附加 acceptance_tests（cases→steps→input/status/assertions）；断言读取实际 run/state/car/hmi/nodes/outputs/messages/actions。计划不能由模型改写，null 比较保留。未提供时模型设计并锁定测试，报告 test_plan_source=agent；有固定用例为 caller。两者均不等于独立语义质量审核。

## 限制与证据

多模态、外部MCP执行、通用图环路、跨进程持久化、完整浏览器交互及端侧部署未完成；整体目标继续有效。工具执行有16轮/300秒、每会话3次试跑预算，不是无限自主任务。失败保留可检查设计草稿；没有真实通过不能保存为成功结果。

本地证据目录 `/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/hermes-integration-dev58/`。保存 source-manifest、工具调用和完整执行证据，不含模型密钥。测试替身记录与真实模型调用分开。主工程变更已按基线逐文件校验并备份，保留已有未提交修改和用户项目。deployment.json、engine-configuration.json、restart.json记录应用、选择和健康状态。
