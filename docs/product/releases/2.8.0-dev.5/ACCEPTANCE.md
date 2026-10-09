# macOS 迁移与 OpenSparX 接入验收

日期：2026-09-13。版本：2.8.0-dev.5。结论：本轮本地迁移与接入目标通过；开发版、未发布、未提交工作区。

## 环境与服务

Apple M3 / arm64，macOS 26.6.2，16 GB RAM；检查时可用磁盘约 342 GiB。Node 24.21.0、Python 3.12.14、Ollama 0.34.0。后端使用新建 .venv_macos，旧 Windows 虚拟环境及运行时保留。

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:8000/health
- 模型：http://127.0.0.1:11435；opensparx-cabin-intent:3b，qwen25vl / Q4_K_M。
- 模型实际在 Metal / Apple M3 加载，/api/ps 返回 GPU 驻留。首次直接文字请求 17.55 秒、色块图像请求 19.2 秒；其他请求曾约 7～31 秒，不作为性能基准。

## 验收结果

| 用例 | 结果 | 证据 |
|---|---|---|
| TC-001 环境、依赖与相对路径启动 | 通过 | npm ci、host-lite 依赖安装；补齐 httpx，macOS 依赖锁定；bash 启动脚本语法检查通过 |
| 前后端与项目读取 | 通过 | /health ok；/v1/projects/ 代理读取原 16 个项目，新增示例后为 17 个 |
| 原始模型与当前 Ollama 模型完整性 | 通过 | 原下载清单文件大小、已提供 SHA-256，活动 manifest 的 config/model blob 均匹配 |
| 数据与 SU7 保护 | 通过 | 73 个原文件最终全量 SHA-256 对比差异为 0；随后模型注册表仅追加 OpenSparX，旧记录逐项保留 |
| 车模资源与显示 | 通过 | GLB/HDR 经 HTTP 读取与磁盘内容哈希相同；浏览器 SU7 实际显示正常 |
| TC-002 真实文字模型 | 通过 | 直接模型返回 200；GraphEngine 经后端调用真实模型，四窗开到 100%、再关闭到 0% |
| 真实视觉模型 | 通过 | 224×224 无个人信息的红蓝测试图，正确回答左右颜色；完整工作流返回观察并保持车窗不变 |
| 儿童关怀 unknown 分支 | 通过 | 同一无儿童图像由真实模型返回 unknown / confidence 0，HMI 显示无法判断，没有车控 |
| 浏览器端到端 | 通过 | 项目库打开新增示例，仿真选择 OpenSparX，发送打开车窗；HMI 显示 4 窗开启，控制面板四窗开度均为 100%，详情显示模型 ID 与 token 计数；随后页面发送关闭指令，显示车窗已关闭 |
| TC-003 异常保护 | 通过 | 18 项前端回归、5 项 OpenSparX 后端测试、2 项既有后端异常测试；包括断线、无效 JSON、未知动作、明确 none、截断、卡窗 |
| 构建与工作区检查 | 通过 | TypeScript + Vite 生产构建、git diff --check；原有大包/Browserslist 提示保留 |
| 一键启动 | 通过 | scripts/start_local.sh 实际启动三服务，日志在 .demo-runtime/logs；端口已用时拒绝重复启动 |

## 接入行为

仿真面板提供“OpenSparX · 本地”和“按工作流配置”。本地选项临时作用于本轮模型节点，不改写已有工作流保存的模型配置。OpenSparX 使用独立 11435 服务，不走原来的五秒模拟回退。图片和文字请求均有明确失败反馈；要求 JSON 时同时设置接口格式与明确提示，最终仍校验输出。模型明确不执行时，下游不能再用关键词或固定默认动作猜测车控。

新建儿童关怀模板默认 OpenSparX，使用合法单一状态的 JSON 示例，避免旧模板 normal|risk|unknown 被逐字复制。已有项目不批量替换模型名称。

## 恢复过程

首次官方 Ollama 启动默认清理了 14 个未引用的导入缓存；13 个从同哈希原始模型文件恢复，一个 F16 转换中间文件用同版转换器重建。该文件大小 8,139,678,496 字节，SHA-256 为 8190e74259ab7d11c706ba546d158450274c0df4a6b05cdfd942f79703cd64bf，与旧文件完全一致。所有原文件随后重新核验通过。启动器现设置 OLLAMA_NOPRUNE=1。恢复用临时 manifest 移到验收目录，原活动模型 manifest 和权重未替换。

沙箱首次禁止 ~/.ollama 初始化及 Metal GPU 访问；目录获准后生成本机密钥，最终在具备 Metal 访问权限的本机进程运行。普通 macOS 终端可直接使用启动脚本，无需 sudo。

## 证据与恢复位置

项目内 .demo-runtime/migration/ 保存：before.patch、source/ 修改前源码、backend/ 原项目/状态/记忆、assets-before.json、assets-after-check.json、direct-text.json、direct-image.json、live-graph-results.json、live-child-results.json、final-hmi-tests.log、model-registry-check.json。live-graph-results 中保留儿童旧提示词失败记录；修复后的儿童通过证据在 live-child-results。

这不是完整 Git 版本快照；本轮没有提交、标签或发布操作。恢复代码时只使用本轮源码备份，不能用 git reset 覆盖此前大量未提交工作。

## 尚未验证与限制

- 真实儿童座舱图片的准确率、连续视频、真实车端动作未验收；本轮是实际模型与模拟车辆闭环。
- 模型对部分提示仍可能不遵守结构；失败时阻止动作，不承诺每种输入都能生成合法计划。
- 未安装完整 Torch/ChromaDB/FastVLM 或车端 SDK；原有数据保留，未声称完整记忆检索和设备部署可用。
- 已有前端热更新/草稿恢复、导航以及分包体积问题不属于本轮完整验收范围。

启动与操作说明见 ../../../devops/05_macOS_Local.md（从项目根路径为 docs/devops/05_macOS_Local.md）。

## 2026-09-13 用户儿童关怀流程修复

直接读取用户新保存的 backend/projects/儿童关怀.json：输入 raw_command 为“你好”，has_image 为 true，真实 OpenSparX 返回 child_standing。模型按原提示词输出标签，而识别节点要求 status/risk_action/confidence/summary JSON，协议不一致导致报错。另有不存在的 input.targets 条件、识别节点无条件连接兜底、真假分支未标记。

- 原项目完整备份：.demo-runtime/child-care-fix/儿童关怀.before.json；源码备份在同目录 source/。未改动其他项目、模型及车模。
- 修复该项目配置，保留已有节点 ID、位置、摄像头配置及历史运行数据；增加正常状态分支。单帧复核只记录 awaiting_next_frame，不再推断已解除。
- 仿真明确提交文字时，useCameraFrame=false；工作流原摄像头运行入口仍保留。普通 OpenSparX 对话结果可传到 HMI。属性面板补齐儿童关怀模式。
- 25 项前端回归通过，含已保存流程的风险/正常/未知/低置信度/非法标签分支及摄像头缓存文字回归；生产构建通过。
- 真实本机模型：直接“你好”回答“您想聊点什么？”；修复后的儿童流程纯文字明确提示需要图片；合成红蓝图片附带“你好”返回 unknown / confidence 0，正确进入兜底，无车控。
- 证据：tests.log、build.log、live-results.json（均在 .demo-runtime/child-care-fix/）。真实运行脚本最初在推理完成后对缺失 trace 调用了 includes；后续读取保存结果的断言全部通过，并修复检查脚本。
- 浏览器项目库已加载修复后的配置；测试窗口导航按钮未切换到仿真，本次未宣称浏览器输入端到端通过。Chrome 的现有标签仍可能持有旧配置，需刷新后从项目库重新打开。
- 连续摄像头监测、真实儿童风险识别准确率仍未验收。本次为 dev.5 同轮修复，未提交、未发布。
