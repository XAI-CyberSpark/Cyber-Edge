# 验收记录

2026-09-25；macOS，本地 `127.0.0.1:5175` / 后端8000；`2.8.0-dev.33`，未提交未发布。

## 通过

| 检查 | 结果 |
| --- | --- |
| 后端 unittest | 51项：提供商隔离、协议请求与响应、空/拒绝/截断输出、脱敏、验证失败不保存、文件0600、双生成入口与完整管线、既有节点/互动契约。 |
| 模型设置 DOM | 4组：已配置直接切换；未配置打开弹窗；取消清除密钥；验证失败不切换；成功选择；无浏览器持久化密钥。 |
| 生成/保存 DOM | 5组：失败保留图、通过后真实引擎试跑、模型选择进入请求和保存元数据、运行失败保留图、晚到结果不覆盖其他标签。 |
| 构建/试跑/运行路由 | 6项；实际 GraphEngine 测试，确认普通 LLM 请求带精确模型与 provider_id，不含密钥。 |
| 既有回归 | 21项互动会话、8项节点、19项后排视频、20组项目导航通过。 |
| 页面 | GPT/Claude 都可从场景共创打开配置；无密钥保存按钮禁用；取消保留 MiniMax；打开聚焦密钥，Escape回到选择器；720×800设置窗口无裁切；恢复原视口。 |
| 构建 | TypeScript和Vite通过。保留已有大包/Browserslist提示。 |
| 真实现有连接 | 新适配器用已配置 MiniMax-M3 返回最小结构化 `ok:true`；只验证连接及结构化返回，不作为场景质量证据。 |

API 凭据配置保存位置 `.demo-runtime/model-providers.json`，文件0600、原子替换、Git忽略。该路径用于实际服务端机器；本地共享访问密钥用户可配置，不是多租户权限方案。验证只发简短测试文本，用户场景在用户后续生成时发送。

## 未完成与限制

- GPT/Claude 没有真实凭据，未调用它们生成用户场景；协议适配使用隔离HTTP响应和真实执行路径测试，不能等同真服务验收。默认模型ID可编辑，账户可用性以验证结果为准。
- 本轮前期 MiniMax 多次生日航海/太空探险/超出现有车控能力的真实测试，出现数组封装、对象字符串、题目答案类型、内容审查不一致与超时。已增加可损失为零的表示转换和有限检查；未获得可宣称“任意输入可靠”的证据。用户转向模型切换后停止此类调参循环。
- 最后一次 M2.7 比较超时；没有保存成新项目。真实连接最小测试只覆盖最终统一适配，不是最终版本完整场景评测。
- 模型审查由同一模型完成，可能漏报/误报；只辅助检查，不是独立事实核验。
- 自动试跑目前只覆盖 input→authored interaction 的简单图；状态在页面内存，刷新清空；到达/下一站来自聊天模拟；无真实导航、实车或无限动态图形游戏。
- 创作选择改变后续生成所用模型；不会立即改写已有图、已保存本地识别模型或既有 live 互动节点的配置。新的一般 LLM 文本节点携带提供商运行；云端适配器不接受图片。
- 本轮涉及文件定向 `git diff --check` 通过；全仓已有其他修改中 PropertyPanel.tsx 第339行空白告警，保留未改。

## 复核命令

后端：`.venv_macos/bin/python -m unittest tests.test_model_providers tests.test_scenario_builder tests.test_interaction_contract tests.test_node_capabilities -q`

前端：`node scripts/test-model-picker.mjs`、`test-scenario-generation.mjs`、`test-scenario-build.mjs`、`test-scenario-session.mjs`、`test-node-capabilities.mjs`、`test-video-replay.mjs`、`test-project-navigation.mjs`；`npm run build`。

接口参考：[OpenAI Chat Completions](<https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[GPT-4.1](<https://developers.openai.com/api/docs/models/gpt-4.1)、[Claude Messages](https://platform.claude.com/docs/en/api/messages/create>)、[Claude 模型列表](https://platform.claude.com/docs/en/models/overview>)。这些文档支持适配方式，不作为本产品效果证据。
