# dev.57 验收

2026-09-27｜开发工作区，未提交、未发布。35个变更文件已应用到主工程，逐文件摘要核对通过并保存应用前备份；后端已重载，health HTTP 200。证据见deployment.json/restart.json。

## 已完成验证

- 前端107项测试通过：通用事件/等待/状态/分支、实际HMI回执、模型传输、最新回答、表达式拒绝脚本、测试失败与错误字段阻断；含原节点/HMI/模型回归。
- 后端66项测试通过：真实Node子进程、超时回收、模型绑定、schema契约、实际失败驱动修复、测试预期不可改写及三轮预算。模型替身用例明确标注injected_test_adapter，不计作云模型质量验证。
- TypeScript与Vite生产构建通过；保留既有大于500kB分块提示。暂存构建不含完整公共素材，不是可分发发布包。
- 字体角色审计139文件、2234条，无规则违规；本轮无视觉布局修改。
- 真实API生成“旅途即兴比喻”：6节点、4用例、4次实际执行模型调用，132.11秒返回preview/runtime_verified=true。API返回的模型名称为claude-sonnet-5，来自用户已有网关绑定；测试不验证上游真实模型身份。另用独立固定检查核对原始记录：HMI文字与真实模型返回一致，长度19/22/25/25字，无车辆动作。此检查不是独立重跑，不替代语义质量评估。

真实生成成功记录保留在live/creative-anthropic；源摘要、原始schema/messages/模型输出、执行输入和实际结果均留档。后续同轮变动包括等待冲突检查、最多三轮以及先运行后审查，需以相应最新测试和主工程运行结果为准，不把旧生成视为新链路全程复验。

## 主工程与最新链路验证

- 安装后从主工程导入试跑宿主，用独立固定输入“今天很期待一路上的风景”执行已生成的六节点图：1次真实API调用通过；HMI文字非空且不超过40字，无车辆动作。main-execution.json保存完整结果，main-verification.json记录摘要。此次重新执行使用最新安装代码，不是重新生成图。
- 已通过本地认证API新增`api-metaphor-dev57.json`（项目名“API心情比喻 · dev.57验证”），保存后GET回读nodes/edges一致；不覆盖已有项目。这个示例使用正常模型调用，不写死回复。
- 最新车辆温度愿望测试已采用三轮及先试跑后审查；该次网关在候选构建阶段响应超时，135.21秒返回明确错误，未得到可验收结果。更早失败记录保留。不能把该运行标为通过，生成可靠性仍待改善。
- 已更新工作台页面成功加载到使用密钥登录层；浏览器完整点击、仿真界面和画布视觉尚未验收。没有降低认证要求或修改密钥。

## 发现并修正

1. 旧test_cases和execution_plan并存导致模型写错位置：生成工具只保留一个必需可执行计划；解析层保留旧兼容。
2. wait下游仍收到启动文字、text回复不能正确展示：改为最新回答与显式text/reply输出。
3. 模型填写prompt而引擎读取systemPrompt：明确契约并阻断无效字段，不静默忽略。
4. HMI共享控制被旧action要求误阻断、回执路径说明不准：按真实executionMode与action_result校验。
5. “成功”界面回调不能证明wait完成：试跑节点状态读取实际会话checkpoint。
6. 答案与hintInputs重叠导致永远只提示：确定性冲突检查；按字段归一化比较。
7. 同模型审查猜测运行效果：合法图先试跑，实际显示与失败证据再交审查。明确禁止把分组偏好变成用户需求。
8. schema错误和模拟来源标记不再靠泛泛重试：具体字段诊断、确定性来源标记、已验证网关绑定的指定结构化工具。

## 仍未完成 / 限制

- 同一车辆温度愿望经过多个真实API生成版本仍曾失败（需求字段、覆盖ID、节点连接、提示口令、测试自身与审查漂移）；失败记录全部保留，不能宣称生成稳定或所有用例通过。最新运行结果另在同目录记录。
- 生成计划来自同一模型，有限测试无法证明所有用户意图；跨主题生成质量基准仍需扩大。
- 多模态真实调用、外部MCP执行器、图环路、跨进程持久化、实车接入尚未完成。原始目标继续有效。
- 无头宿主需要Node及Studio依赖/源码；桌面独立包未验证。试跑HMI/记忆隔离，未接入服务如实失败。
- 表达式不再支持任意JS脚本，旧项目若依赖这类代码会明确报错；没有自动改写用户项目。
- 浏览器实际交互、后端当前进程重载与最终代码应用分别留证，不以单元测试替代。

## 证据与复现

本地证据目录：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/agent-orchestration-dev57/`。

`live_probe.py`调用正式build_events，使用合成请求，save_on_success=false；配置仅在服务端读取，日志不含API密钥。`independent_creative_check.py`核对输出身份/长度/动作。`baseline.json`与应用清单用于检查并行改动；before/保存应用前受影响文件，非Git版本快照。

前端：`cd studio && node scripts/test-scenario-execution.mjs scenario-execution.test general-flow.test node-capabilities.test hmi-controls.test hmi-simulation.test scenario-build.test opensparx.test`。

后端：`python -m unittest tests.test_scenario_execution tests.test_scenario_builder tests.test_general_flow tests.test_model_providers tests.test_node_capabilities`。
