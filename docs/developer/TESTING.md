# 测试与故障排查

目的：为改动选择合适验证，并定位本机开发常见故障。状态：现有测试入口与排障指南；本轮文档工作未重跑全套产品测试。维护日期：2026-10-05。主依据：仓库脚本、源码和迭代验收。返回[开发者文档](README.md)与[项目主文档](../README.md)。

## 按改动选择检查

前端命令在 `studio` 目录运行。使用实际存在的脚本名，不假定仓库有通用 `npm test`。

| 修改范围 | 检查入口 |
| --- | --- |
| TypeScript 与生产构建 | `npm run build` |
| 排版与文字角色 | `node scripts/audit-typography.mjs --write` |
| 固定界面语言 | `node scripts/audit-localization.mjs` |
| 项目自动保存 | `node scripts/test-project-autosave.mjs` |
| 项目导航 | `node scripts/test-project-navigation.mjs` |
| 编排请求取消与切换 | `node scripts/test-workspace-requests.mjs` |
| MCP 目录与参数 | `node scripts/test-mcp-library.mjs` |
| 模型选择与设置 | `node scripts/test-model-picker.mjs` |
| 节点右键删除、撤销及菜单 | `node scripts/test-node-deletion.mjs`（DOM，ReactFlow渲染器隔离） |
| 图执行逻辑 | `node scripts/test-scenario-execution.mjs` |
| 通用流程 | `node scripts/test-general-flow.mjs` |
| HMI 局部浮层、焦点、分类与共享状态 | `node studio/scripts/test-hmi-chrome.mjs`（此条从仓库根目录运行；DOM隔离车模/助手，视觉仍需浏览器检查） |
| HMI 相关基础检查 | `npm run test:hmi` |

完整入口见 [studio/scripts](../../studio/scripts/)。部分脚本接受指定测试文件，如：

```bash
node scripts/test-scenario-execution.mjs mcp-flow.test
```

不要给不支持文件筛选的脚本臆造参数。涉及真实服务的用例应先读测试的环境条件，确认其是否写入数据或外发请求。

后端在 `backend` 目录执行，例如项目保存回归：

```bash
.venv_macos/bin/python -m unittest tests.test_project_autosave
```

需要较大范围回归时：

```bash
.venv_macos/bin/python -m unittest discover -s tests
```

不要把根目录的所有历史测试当成同一套受维护验收，也不要将缺少环境导致的 skip 算为通过。MCP live protocol 的运行时、fixture 和环境变量要求见 [MCP_RUNTIME](../product/MCP_RUNTIME.md)及对应测试文件。

## 浏览器检查

自动检查后，用真实页面确认受影响的操作：初始状态 → 输入 → 提交 → 等待 → 成功或失败 → 取消/重试 → 刷新或重新打开。只执行与改动相关的路径，不机械扩大为整站回归。

布局修改至少检查桌面和窄屏下的溢出、按钮可达、焦点和滚动。曾有 Vite 缺少生成颜色规则导致“变量已改、页面未生效”的情况，因此应同时核对实际服务输出与可见页面。

测试需要写项目时使用明确测试项目或隔离数据目录。关闭页面不等于撤销自动保存。使用网络拦截模拟模型时，要在验收写明模拟；不能声称调用了真实模型。

## 验收应记录什么

记录代码/未提交工作区、场景与模型配置、输入、预期、实际、结果和证据位置。至少明确这是静态核对、模拟测试、真实接口、真实模型还是设备验证。失败诊断、跳过项和复现限制同样属于结果。

模型验收除 HTTP 成功外，还要检查输出内容与预期关系；设备动作验收需要实际反馈。图结构检查、SDK 协议检查和 HMI 仿真都不能替代它们。模板见[迭代模板](../product/ITERATION_TEMPLATE.md)。

## 常见故障

| 现象 | 先检查什么 | 处理与确认 |
| --- | --- | --- |
| 5173 页面无法访问 | 前端终端、依赖、端口占用 | 使用前端启动脚本，确认服务监听与返回页面；不批量杀进程 |
| 页面正常但 API 失败 | 8000 健康状态、Vite 代理目标 | 分别请求后端与前端代理，确认地址对应同一后端 |
| 项目突然为空 | 后端工作目录与所用仓库 | 确认从 `backend` 启动，找到原项目文件，不新建同名文件覆盖 |
| 自动保存返回 409 | `expected_updated_at`、其他标签页、项目是否删除 | 保留本地副本，读回远端版本后处理冲突；不使用旧接口强制覆盖 |
| 自动保存返回 404 | 当前后端是否支持 autosave | 对照当前源码与运行服务；不要回退无版本保护的保存 |
| 模型显示已配置但请求失败 | 模型 ID、服务商、端点、余额及连通性 | 记录脱敏错误和对应请求，分别核对配置与真实调用 |
| 思考参数返回 400 | 模型能力查询结果 | 仅提交当前模型支持的开关与强度，未知模型使用默认设置 |
| Hermes 返回 503 | 引擎配置、绝对路径、SDK HEAD 与工作区状态 | 检查固定运行时，不删改校验，不覆盖用户 SDK 修改 |
| MCP 目录可见但不可添加 | 是否有已登记工具或审核配方 | 资料可见不代表运行准备完成；按缺失条件完成登记 |
| MCP 调用返回 422 | server/tool 标识、真实 Schema、参数类型 | 使用发现的 Schema 修正，保留原错误出口；不将工具失败包装为成功 |
| MCP `data` 是 null | `text` 与 `content` | 按工具原始结果消费，不假设一定存在 structuredContent |
| 等待中的执行无法自动恢复 | 上轮是否中断、外部动作是否已发生 | 检查动作结果后显式重新开始，避免自动重放 |
| 样式值已改但页面没变 | 真实 CSS、选择器、缓存、HMR | 在实际页面核对生效规则；需要时只重启相关前端 |
| 本地模型加载失败 | Ollama 11435、模型数据与进程权限 | 按本地环境记录排查，不删除权重或重新拉取作为默认处理 |

## 日志与可复现问题

统一启动器日志在 `.demo-runtime/logs/`；分别启动时先看各自终端。提供问题时记录触发操作、时间、服务端口、产品编号、相关输入与脱敏错误。不要公开模型密钥、完整环境变量或原始用户资料。

固定复现后再改代码，使用同一用例检查问题消失。若不能复现，保留观察与限制，不写“已修复”。对可自动化且有回归价值的故障补测试；纯文档或低风险文字修正只做必要检查。

## 打包与部署

前端 `npm run build` 输出是构建结果，仍需目标环境验证。网页部署看 [Web Studio 部署](../devops/04_Web_Studio_Production_Deployment.md)，桌面版看 [Desktop](../../desktop/README.md)，Windows 看 [Windows 部署](../../deploy/windows/README.md)，设备交付看 [SDK 导出](../devops/02_SDK_Export_Guide.md)。

发布时记录实际代码提交、组件版本、产物和恢复方法。当前工作区有未提交修改，不能把某个 HEAD 或产品编号当作涵盖全部成果的可恢复快照。

## 日常隔离验证（dev.93）

运行`backend/.venv_macos/bin/python scripts/test_studio_stable.py`验证SQLite WAL复制、首次迁移不覆盖、静态私有文件边界与SSE/生命周期转发。日常实例检查5175的`/health`及`/v1/projects/`；HTML不应包含`/@vite/client`。日志中的开发服务重启不能被认作模型失败；日常更新也应等任务结束。版本证据见[dev.93](../product/releases/2.8.0-dev.93/ACCEPTANCE.md)。

真实TCP断流夹具：`backend/.venv_macos/bin/python scripts/check_studio_stable_stream.py`启动临时Vite代理与模拟SSE服务，重启代理后验证独立流仍交付结果；不调用模型、不停止日常/开发实例。需要允许本机临时端口绑定。

## 目录与聊天补修（dev.94）

`test-component-library.mjs`覆盖DOM原生class变更时的inert解除/恢复及导入资料未接入边界；`test-mcp-library.mjs`覆盖整卡拖拽、多工具当前载荷、运行中与无配方禁用；`test-qualcomm-catalog.mjs`覆盖模型拖拽、Alt+Enter及移除按钮；聊天既有行为由`test-chat-composer.mjs`检查。

纯DOM不能证明CSS级联或原生落点可用。dev.94在5173专用夹具隔离项目与写请求，实测1280/720px拖拽、360px布局、深浅气泡；不是用户项目或日常5175测试。截图及未验证范围见[验收](../product/releases/2.8.0-dev.94/ACCEPTANCE.md)。

## 编排工具拒绝诊断（dev.95）

Hermes worker输出白名单rejection_code供本机排查，服务日志记录run标识、工具名和拒绝分类，不记录原始参数或模型推理。team应用需求成功后超时阶段应为building_graph，不能误报before_brief。测试：backend目录运行`.venv_macos/bin/python -m unittest tests.test_authoring_diagnostics tests.test_hermes_timeout_diagnostics tests.test_hermes_authoring`。真实模型复现仍需按用户授权的数据与服务范围执行，不覆盖项目。

## 通用契约反馈回归（dev.96）

在backend运行`.venv_macos/bin/python -m unittest tests.test_authoring_contract_feedback tests.test_authoring_session tests.test_node_capabilities tests.test_dynamic_hmi_bindings tests.test_general_flow`。新测试先复现字段目录和修复信息缺口，再检查有效配置仍通过、无效配置仍拒绝、失败patch不修改图，以及缺失/错误model不被自动替换。68项通过；真实模型复验单独见[验收](../product/releases/2.8.0-dev.96/ACCEPTANCE.md)，不能以本地回归代替真实编排。

## 字段一致性回归（dev.98，2026-10-06）

在backend运行 `.venv_macos/bin/python -m unittest tests.test_capability_field_consistency tests.test_authoring_contract_feedback tests.test_authoring_session tests.test_node_capabilities tests.test_dynamic_hmi_bindings tests.test_general_flow`。新测试先证实49项字段缺口、15项元数据缺口及诊断/警告缺失；验证字段声明、HMI注册一致性、代表性合法配置、旧logic兼容和coverage不被自动重写。生成目录检查为 `python3 scripts/sync_node_capabilities.py --check`；在Studio目录执行 `npx tsc -b`，根目录执行 `node studio/scripts/test-node-capabilities-dom.mjs`、`node studio/scripts/test-general-flow.mjs`。真实模型请求和比较单列在[dev.98验收](../product/releases/2.8.0-dev.98/ACCEPTANCE.md)，不与离线回归混同。


## 车模实物与降级回归（dev.99）

从仓库根运行 `node studio/scripts/test-car-rig.mjs`：加载现用SU7实际GLB，与冻结的dev.97几何/材质/绑定逐项比较，检查模型SHA和所有已声明选择器，核对门轴/角度/热点与四窗行程；加载CarConcept实际GLB验证两门两窗和缺失节点降级，另验证VehicleWorld后窗状态保持。测试加载器省略纹理请求，纹理/画面需用浏览器验证。

CarConcept原文件是研究输出，不随生产构建分发。若干净环境缺少夹具，先从[固定上游](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/CarConcept)下载glTF-Binary/CarConcept.glb至 `outputs/carconcept-audit-2026-10-06/CarConcept.glb` 并保留同目录LICENSE.md；测试要求SHA256为 `c272098089d78c5cd9fd9f24ff50ee8acf8d932c55f2d55fc10adb6c8998966b`，不可用其他压缩变体替代。缺文件应失败，不跳过；许可及logo限制见[报告](../product/CAR_ASSET_REVIEW.md)。

浏览器验收页保留在 `studio/tests/rig-review.html`，5173访问 `/tests/rig-review.html`，默认使用SU7；`?concept`为两门测试。仅此夹具需要在 studio/public 下临时创建 __rig-fixtures 目录，并放入 CarConcept.glb，验收后删除该临时副本，并确认最终dist不含它。截图和实际检查见[dev.99验收](../product/releases/2.8.0-dev.99/ACCEPTANCE.md)。该页面不用后端/真实项目；不能拿用户日常项目测试。

相关现有检查：`node studio/scripts/test-hmi-chrome.mjs`、`node studio/scripts/test-hmi-controls.mjs`；前端构建和字体审计仍从studio运行。本轮实屏覆盖SU7闭门、开门半窗、全窗锁车夜间和CarConcept缺失降级；未做真实车控、移动设备或候选正式接入验收。

## patch字段Schema回归（dev.100，2026-10-06）

新增test_patch_data_schema使用jsonschema验证合法/非法样本。标准依赖准备命令为`python -m pip install -r requirements-test.txt`（backend目录，在测试环境安装，会联网；本轮未执行该安装）。已有依赖时运行`python -m unittest tests.test_patch_data_schema`。本轮复用了本机隔离MCP环境已有的jsonschema，实际85项命令与红绿结果见[验收](../product/releases/2.8.0-dev.100/ACCEPTANCE.md)。

本地JSON Schema通过不代表提供商支持或模型遵守。须区分原始Schema、Hermes清洗后Schema、实际HTTP发送与返回参数；本轮仅真实复跑MiniMax一次，未修改默认模式、预算或解析器。

## 通用试跑修复（dev.101，2026-10-07）

新增tests.test_authoring_trial_repairs覆盖注册表驱动枚举、图/初始控件前置检查、真实子进程等待证据、精确引用恢复及拒绝调用计数、计划受限修订与禁止边界。TS执行器用node scripts/test-scenario-execution.mjs检查；非视觉修改不替代浏览器验收。

三次MiniMax实验沿用同一只读请求快照，开发8000、single、save_on_success=false，三轮代码冻结，不通过中途改预算或改图输入制造稳定性。测试命令、最终次数与剩余错误统一记录在[dev.101验收](../product/releases/2.8.0-dev.101/ACCEPTANCE.md)。


## dev.102：预算与工具参数边界（2026-10-08）

用户授权共享编排预算40次/720秒、宿主780秒，Vite编排代理810秒；网页编排fetch没有定时提前取消。worker临时profile中custom/anthropic请求与停滞期限同步720秒，仍受整体deadline约束。入口3轮、子角色4轮、委派8次及图执行150秒/三次、核验45秒/最多两次维持各自边界，不把这些局部预算误当成整轮期限。

剩余编排调用≤3、当前revision检查通过且有未试跑有效计划时，宿主可执行完整trial；内容核验不可用只重试核验一次。启动需预留245秒宿主时间，不足明确跳过；不生成测试或修改图。host_finalized只说明触发来源，能否应用仍由runtime_verified、can_apply与原证据门槛决定；host_trial_model_calls/review_calls独立计数。未通过沿用incomplete_result。报告保留finalization原因、失败阶段和原证据。

工具入口先做既有单字段_ref还原，再按生成Schema处理item/$text单键包裹；只接受明确的数组/标量类型及无损转换，未知字段/类型冲突/多键对象不拆。顶层只允许完整通过patch Schema的item对象。每次变换的路径与前后值写入diagnostics.normalization_details，normalizations与normalizations_by_provider汇总。多类型controlValue若允许字符串，则保留字符串，不推测控件语义；后续HMI校验仍可能拒绝字符串数字。

测试计划Schema自动来自ExecutionPlan类型目录，case/step均禁止多余字段；错误附具体路径及正确层级示例，不自动搬字段。SDK和共享依赖不修改。完整回归与真实结果见[dev.102验收](../product/releases/2.8.0-dev.102/ACCEPTANCE.md)。


## dev.103 验证入口（2026-10-08）

`tests.test_authoring_reliability`覆盖status单独修订/禁止边界、缓存与试跑次数、HTTP529/503一次重试和其他错误不重试、不可达警告及host_timeout候选/计数回传。`tests/check_authoring_timeout_sdk.py`为手动集成检查：需开发8000空闲，使用实际固定HermesSDK与本机合成慢服务、合成密钥，测试1秒配置下三种服务商中断后正常重试；不请求真实云模型、不使用日常端口。测试结束释放端口。生产默认150秒，不改引擎配置文件。A/B真实实验、命令与限制见[dev.103验收](../product/releases/2.8.0-dev.103/ACCEPTANCE.md)。


dev.104：新增backend/tests/test_authoring_preflight.py（6项）：变量/引用错误前置定位、有效局部变量与模板、case隔离说明和真实执行器记忆示例。inspect桥接studio/scripts/inspect-expressions.mjs使用现有Node、esbuild、acorn及Studio表达式模块，不运行用户表达式；依赖不可用时显式检查失败。全量378项369通过/9跳过，tsc及20项执行器通过；真实模型结果见dev.104验收。


## dev.105 输入契约与归因检查

后端新增`tests.test_input_contract`覆盖三种合法输入、字段/形状错误定位、提交原子性、图改变后inspect重查、trial前阻断、真实TS子进程模型输出分类、等待/记忆警告、四类反馈和说明。前端新增`studio/tests/input-contract.test.ts`覆盖严格字段类型、具名事件包装、普通与通用引擎错误码、实际模型替身返回错误、等待路径和case记忆准备。

从根目录运行`node studio/scripts/test-scenario-execution.mjs input-contract.test scenario-execution.test repeated-flow.test durable-flow.test mcp-flow.test`，另跑`node studio/scripts/test-general-flow.mjs`；在studio运行`npx tsc -b`。后端全量命令、跳过项、真实模型7次实验与保护证据见[dev.105验收](../product/releases/2.8.0-dev.105/ACCEPTANCE.md)。自动回归使用替身/隔离记忆，不等于真实模型或设备验证。


## dev.106 隔离测试依赖

5175与开发服务共享backend/.venv_macos 解释器，不能向其site-packages安装测试包。先检查缺少项，仅将requirements-test.txt需要的缺包及缺少依赖安装到`/tmp/oakegde-test-deps`，用PYTHONPATH加载；安装前后保存并比较共享解释器pip freeze。已存在的依赖沿用原版本。

在backend目录运行：

```sh
PYTHONPATH=/tmp/oakegde-test-deps .venv_macos/bin/python -m unittest discover -s tests
```

前端新增`assertion-contract.test`，与input-contract/scenario-execution等执行器回归一起运行；`npx tsc -b`做类型检查。固定SDK截断协议检查为`backend/tests/check_authoring_truncation_sdk.py`，占用开发5173，运行前确认空闲；本地模拟服务不调用云模型。实际安装包、版本、执行命令与结果见[dev.106验收](../product/releases/2.8.0-dev.106/ACCEPTANCE.md)。

本轮dev.107新增后端test_authoring_progress_contract.py与前端authoring-progress.test.ts，覆盖连接来源追踪、显式HMI/MCP绑定、证据编号与旧引用差异、弱断言/事件预检、预算提醒与提交门槛。继续使用/tmp/oakegde-test-deps，不安装到共享解释器；七份dev.106候选只做静态回放，六次真实实验另行记录，不能混称模型通过。实际命令与结果见[验收](../product/releases/2.8.0-dev.107/ACCEPTANCE.md)。
