# 验收

2.8.0-dev.32，2026-09-24 开始，09-25 完成验证。本地开发版，未提交未发布。

## 结果与证据

执行闭环已验证；模型文案的全面产品验收未完成，不能据此承诺随机场景均正确。

- 新版真实编排调用 /v1/orchestration/generate-stream，MiniMax-M3，22.2秒，used_live_model=true，2节点1连线，四个阶段。未让模型自行保存项目。
- 原始生成工作流实际运行通过。模型建议用例里存在“答对立即推进”等不符合执行规则的表述；交付示例说明与用例已按实际规则重写，原始响应保留。
- 逐步实测发现并修复：MiniMax 运行请求被送去本地服务；思考文本混入正文；JSON错误；纯叙事章节添加多余交互。纯叙事现在采用文字契约，问答仍用JSON校验，最多一次格式修复。
- 最终样例仍发现内容缺陷：第二题叙事中的海龟提示与固定图例冲突，且两章奖励文案重复。固定题面确保判题依据明确，但没有验证所有叙事句子的语义一致性。该项明确未通过内容验收。
- 内容实测发现：自由谜题有无依据天象推断、开场泄露答案、遗漏判题所需条件。交付示例审校了题面/答案，增加配置约束与开场字词检查；保留模型创作叙事。不是声称原始模型输出全部正确。
- 最终保存示例完整运行：13次输入、4次真实模型请求，最终completed，2条线索记录（本次两章奖励文案重复，尚未解决）。每次模型请求耗时ms：[2061, 5630, 2338, 1743]。这是一个样例的观测，不是延迟/成功率承诺。
- 依次验证：开始隐去答案→错误答案→提示→暂停→暂停时下一站不推进→继续→固定答案正确→下一站→相同eventId重放不推进→第二题正确→等待抵达→模拟到达显示生日惊喜→结束。
- 真实模型验收使用实际 GraphEngine 和登录后的生产 API；HMI callback 在独立脚本中记录命令，不伪造模型回复、不调用车辆。浏览器另行验证真实 HMI 展示。

证据目录：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/continuous-scenarios/`。主要文件：live-request.json、live-result.json、live-runtime-results.json、saved-project.json、reviewed-runtime-results.json、final-evidence-summary.json。before/work 与 hashes.json 保留本轮代码前态/工作副本，不能当作全仓库 Git 快照。

## 自动检查

- `node scripts/test-scenario-session.mjs`：21项，状态转换、固定题面/答案、隐藏谜底、叙事正文、格式重试、上下文、取消与跨场景复用。
- `node scripts/test-scenario-session-dom.mjs`：3组，三按钮聊天完成真实状态机流程，错误配置可见，离开取消请求。
- `node scripts/test-node-capabilities.mjs`：8项。
- `node scripts/test-video-replay.mjs`：19项，照片风险/正常/未知到独立视频、真实播放要求、晚到结果取消。
- `node scripts/test-node-capabilities-dom.mjs`：7组。
- `node scripts/test-hmi.mjs`：42项。
- `node scripts/test-diagnostics.mjs`：5组。
- `backend/.venv_macos/bin/python -m unittest tests.test_node_capabilities tests.test_interaction_contract`（在backend内用对应相对路径）：23项。
- `npm run build`：TypeScript与Vite生产构建通过。既有包体积/浏览器数据提示仍存在。
- Python环境没有pytest；已使用仓库的unittest，不新增依赖。

## 真实页面

127.0.0.1:5175；正常使用密钥登录。新增项目能打开，画布显示“乘客输入”和“朵朵航海生日旅程（4阶段）”。阶段配置可展开检查，固定答案和创作要求均可读。

在右侧现有聊天输入开始、风、暂停、继续、下一站、东边、下一站、到达了，实际模型生成内容并显示在聊天/HMI。恢复时保留已完成问题；到达后出现生日贺卡。界面保留一个上传入口、输入框和发送，详情默认折叠。HMI助手仍是语音入口，没有新增键盘入口。

1280×720检查聊天与HMI；720×900检查阶段编辑器，document.scrollWidth=720、窗口宽720，编辑器353px，无页面横向溢出。测试后恢复默认视口。

## 限制与下一轮

- 文字问答原型，没有图形小游戏、播报、真实定位、真实摄像头或实车动作。旅程事件只能手动模拟，不在后台持续监听。
- 当前单工作流单互动节点，输入直连。只有完成时才走下游；最多12阶段、1000事件，状态在当前页面内存，刷新/关闭清空。
- 判题是规范化后的短答案等值匹配；可配置等价答案，不提供自由语义判题。固定题面只在配置后受平台保护；其他模型自创题不等于事实正确。
- 开场隐藏检查是固定答案字词检查，不能保证同义暗示、图例或全部叙事语义无泄漏。故事长度、适龄程度、虚构与现实边界及细节一致性仍需独立内容评测，不能标记完整产品验收通过。
- 生成结构检查不是业务验收。未知能力只记录提案/缺口，不因此变成执行器。473项导入能力未在本轮变成可执行工具。
- 部分开发调试运行曾失败；保留失败记录。最终样例通过不代表所有请求都稳定成功。
- 本轮未打包Windows、未部署外部环境、未改现有儿童关怀项目数据。

MiniMax参数依据：[官方 OpenAI SDK 文档](https://platform.minimax.io/docs/api-reference/text-openai-api)。运行时M3短互动使用直接回答并分离思考字段；不向用户日志展示思考内容。
