# macOS 本地启动与迁移

适用：Apple Silicon，2.8.0-dev.5 开发工作区。服务仅监听本机。

## 日常与开发隔离（2026-10-05，dev.93）

日常入口改用固定版本 http://127.0.0.1:5175；以下5173/8000仍为开发环境。准备、启动、数据目录、更新和恢复步骤以[快速开始](../developer/QUICKSTART.md#日常使用的独立环境dev93)为主依据。源码修改不更新日常版本；先显式prepare，再在空闲时重启。共享Python/SDK/模型依赖的限制见同页；本轮不是完整容器隔离。

## 启动

在项目目录运行：

```bash
bash scripts/setup_local.sh  # 首次安装；无需每次启动都安装
bash scripts/install_ollama_macos.sh  # 首次安装 macOS Ollama；已安装时跳过
bash scripts/start_local.sh
```

之后可直接双击仓库根目录的 `start_oakegde.command`。它等 Studio 在 `5173` 可访问后自动打开浏览器；终端关闭或按 `Ctrl+C` 会停止这次启动的本地模型、后端和前端。它不会执行依赖安装，也不会操作日常 `5175` 实例。

浏览器打开 http://127.0.0.1:5173。前端 5173，后端 8000，独立 Ollama 11435。日志保存在 `.demo-runtime/logs/`。启动终端按 Ctrl+C 一起停止；端口占用时拒绝再启动，不会停止其他进程。

也可在三个终端分别运行：

```bash
bash scripts/start_opensparx.sh
bash scripts/start_backend_host_lite.sh
bash scripts/start_studio_host.sh
```

检查资源、项目 API 和模型清单：

```bash
backend/.venv_macos/bin/python scripts/check_local.py
```

## 环境

Node 需满足 Vite 7 要求，当前机器 Node 24.21.0。Python 需 3.10+，本次使用已随 Codex 安装的 Python 3.12.14 创建 `backend/.venv_macos`；可以用 `PYTHON_BIN` 指定自己的 Python。旧 Windows `.venv_host_lite` 保留。虚拟环境不可跨电脑搬运，应在新目录重新创建。

当前无需安装完整 Xcode、Torch 或 CUDA 即可运行 host-lite 与 Ollama。系统 Git 依赖尚未安装的 Xcode Command Line Tools，本次检查使用已有 Git 运行时；这不影响前后端启动。

## Ollama

使用官方 [Ollama v0.34.0 发布文件](https://github.com/ollama/ollama/releases/tag/v0.34.0) 的 `ollama-darwin.tgz`，解压至 `tools/ollama-runtime/darwin/`。启动器优先使用其中的 `ollama`，也支持 `OLLAMA_BIN` 或系统 PATH 上的 Ollama。

- 原始权重：`models/OpenSparX-3b-cabin-intent`。
- 服务数据：`models/ollama-opensparx`。
- 模型 ID：`opensparx-cabin-intent:3b`。
- 主机：`127.0.0.1:11435`，独立于默认 11434。
- 初始上下文 8192（为图片与提示词、回答预留空间），模型保留 30 分钟；可以用 `OLLAMA_CONTEXT_LENGTH`、`OLLAMA_KEEP_ALIVE` 调整。
- 日常不运行 `ollama pull` 或重新创建模型；直接使用已迁移且校验过的 manifest/blob。启动器设置 `OLLAMA_NOPRUNE=1`，保留导入中间缓存。首次启动会在 `~/.ollama` 生成本机身份密钥。

模型清单中的平台字段来自旧转换环境，不作为当前运行平台判断依据，以本机实际加载结果为准。

## 数据保护与恢复

迁移前的项目、状态和记忆备份在 `.demo-runtime/migration/backend/`；修改前源码备份在 `.demo-runtime/migration/source/`。`assets-before.json` 记录项目、车模和模型文件的大小及 SHA-256；`before.patch` 记录开始时已存在的受跟踪文件差异。此目录不是完整 Git 快照，未提交工作区不能用 HEAD 代表全部成果。

没有清空项目、记忆、车模、原始权重或 Ollama 缓存。历史 Linux/设备部署文档保留用于追溯，主机应使用本页入口。设备 `/data/local/tmp` 路径属于车端配置，不替换成 Mac 路径。

## 使用模型与仿真

1. 进入工作区，打开“项目库”中的“OpenSparX 座舱交互示例”。
2. 切换到“仿真”。右侧模型选择默认为“OpenSparX · 本地”，应显示“服务可用 · 文字与图片”。
3. 输入“请打开全部车窗”或“请关闭全部车窗”；HMI 车辆控制中检查四窗的实际开度。
4. 可上传 PNG/JPG/WebP 图片进行观察，点击“查看详情”可见本轮模型 ID、token 数和车辆指令。
5. 选择“按工作流配置”可恢复各节点自己的模型配置；仿真临时选择不会改写保存的节点配置。纯规则工作流（例如雨天关窗）应使用该选项。
6. 测试台的新建“儿童关怀”模板使用 OpenSparX。未见儿童或无法判断时进入 unknown 分支；模型异常、格式不合法和截断输出都不会伪装成成功。

OpenSparX 已追加到模型注册表，原有 Gemma4 车端记录保留。原有 16 个项目未覆盖，仅新增一个示例项目。

## 限制与排障

- 这是“真实本地模型 + 模拟车辆”闭环；不代表真实车辆部署、儿童风险识别准确率或持续视频监控已通过验收。
- 首次加载和图片推理比热启动慢。本机验收请求曾出现约 7～31 秒耗时，受内存与并发工作影响，不作为性能承诺。
- 模型缺少内嵌 tokenizer.chat_template 时 Ollama 会有格式警告。当前测试通过明确 JSON 提示与输出校验处理；遇到不合格输出会显示失败，不执行猜测动作。
- 从受限代理沙箱启动时，Metal GPU 可能无法访问（甚至 8 KB 分配失败）；在普通 macOS 终端运行启动脚本即可。本轮最终服务使用有 GPU 访问权限的本机进程。
- 前端 Vite 热更新若未检测到外部写入，重启前端服务后刷新页面。源码/依赖变化后运行 `npm run build`，测试使用 `npm run test:hmi`。
- host-lite 不安装完整 Torch/ChromaDB/FastVLM 或设备 SDK；原有记忆文件保留，不声称完成重型记忆检索与车端能力验收。

## 本次缓存恢复记录

第一次运行官方 Ollama 时默认清理了 14 个未被当前 Q4 模型引用的导入 blob。13 个从同哈希原始文件恢复；一个 8,139,678,496 字节 F16 转换中间文件使用同版 0.34.0 转换器重建，SHA-256 为 `8190e74259ab7d11c706ba546d158450274c0df4a6b05cdfd942f79703cd64bf`，与迁移前完全一致。随后再次核对全部 73 个原有文件，差异为 0。恢复用临时模型 manifest 已移到 `.demo-runtime/migration/restore-f16-manifest.json`，日常仍只使用原来的 Q4 模型。

完成全量文件一致性检查后，模型注册表仅追加了 OpenSparX 记录，已验证原记录完整保留。

接口依据：[Ollama 兼容接口文档](https://docs.ollama.com/api/openai-compatibility)。
