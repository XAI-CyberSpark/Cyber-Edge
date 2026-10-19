# 本地开发快速开始

目的：运行网页与轻量后端，并区分页面启动成功、模型可用和场景验收成功。状态：当前操作指南，命令已按源码核对；本轮未在全新电脑重装。维护日期：2026-10-05。适用：macOS 开发环境。返回[开发者文档](README.md)与[项目主文档](../README.md)。

主依据：[安装脚本](../../scripts/setup_local.sh)、[服务管理脚本](../../scripts/local_services.py)、[本地环境记录](../devops/05_macOS_Local.md)。


## 日常使用的独立环境（dev.93）

日常使用 [Studio 5175](http://127.0.0.1:5175)，开发使用5173/8000。首次在仓库根目录运行：

```bash
python3 scripts/studio_stable.py prepare
python3 scripts/studio_stable.py start
```

prepare复制源码后在副本中构建，不经过正在运行的Vite。start运行选定快照中的前后端，同源提供API/SSE，不使用reload；占用5175时拒绝重复启动，不杀原进程。终端Ctrl+C只停止该日常进程。

运行快照在`.demo-runtime/stable/releases/`，日常持久数据在`.demo-runtime/stable/data/`。首次复制当前已保存项目、状态和配置（SQLite使用backup）；后续prepare不覆盖日常数据。开发与日常项目之后分别保存，不自动双向同步；原浏览器5173的未同步草稿不会自动迁移到新端口。模型凭据保存在本机私有目录，不对外分发整个运行目录。

明确要更新日常版本时，先prepare新快照；它只选择下次启动版本，当前实例不变。等编排结束、自动保存完成后，在日常服务终端Ctrl+C，再start。恢复旧代码时将`.demo-runtime/stable/selected`改为已留存快照的绝对目录，再在空闲时重启；数据不倒退，涉及未来数据格式迁移时需另外制定恢复方案。不要直接编辑已运行快照。

应用源码、前端构建和写入数据已分开；Python虚拟环境、固定Hermes SDK、已安装MCP依赖和本地模型资源仍共享，本轮没有复制完整依赖环境。不要在日常任务期间升级这些共享依赖或停本地模型。准备/启动不会自动调用模型或重试失败编排。验证及限制见[dev.93验收](../product/releases/2.8.0-dev.93/ACCEPTANCE.md)。

## 准备环境

需要 Git、Node.js 与 npm、Python 3.10+。仓库的 Vite 版本见 [package.json](../../studio/package.json)；既有 Mac 环境记录使用 Node 24。macOS 后端依赖锁定在 [requirements-host-lite-macos.lock.txt](../../backend/requirements-host-lite-macos.lock.txt)，安装脚本默认建立 `backend/.venv_macos`。

进入仓库根目录后先确认当前改动，避免覆盖已有开发成果：

```bash
git status --short
cat VERSION
node --version
python3 --version
```

首次安装前后端依赖：

```bash
bash scripts/setup_local.sh
```

此命令会安装 Python 依赖并在 `studio` 中执行 `npm ci`；需要依赖源网络。它不会替你准备所有本地模型权重、Hermes SDK 或实际设备。安装失败先检查错误，不删除旧虚拟环境或模型目录来“重置”。需要新 Python 环境时，可用 `PYTHON_BIN` 和 `VENV_DIR` 显式指定。

## 只运行网页和后端

macOS 用户也可以直接双击仓库根目录的 `start_oakegde.command`。它会启动本地模型、后端和 Studio，等待 `5173` 可访问后打开浏览器；依赖需要先按下方步骤安装，启动不会自动安装依赖。

在仓库根目录打开两个终端，分别运行：

```bash
bash scripts/start_backend_host_lite.sh
```

```bash
bash scripts/start_studio_host.sh
```

打开 [本机工作台](http://127.0.0.1:5173)。脚本默认监听本机：前端 5173，后端 8000。前端通过 Vite 代理访问 `/v1`，无需将后端地址写进每个组件。

后端脚本会先进入 `backend` 再启动 `main_host_lite:app`。手工启动也应保持这个工作目录，因为项目服务使用相对 `projects` 路径；从错误目录启动可能看到另一份空项目列表。

这条路径适合开发页面和后端接口。未配置模型时，模型相关操作仍会失败；网页可打开不代表编排引擎已经就绪。

## 同时运行本地模型

已有 OpenSparX 模型与独立 Ollama 数据的本机，可使用统一启动器：

```bash
bash scripts/start_local.sh
```

它启动 OpenSparX/Ollama 11435、后端 8000 和前端 5173，将日志放入 `.demo-runtime/logs/`。任何默认端口已占用时会拒绝重复启动，不会结束原进程。终端按 Ctrl+C 停止该启动器创建的子服务。

首次准备 Ollama、模型文件与迁移校验，见[本地环境记录](../devops/05_macOS_Local.md)。不要把 `start_local.sh` 当作自动下载全部模型的安装器。该管理脚本的预检端口固定为上述三项；需要自定义端口时分别启动服务，并同步代理配置。

## 检查是否真的启动成功

先检查后端，再检查前端代理：

```bash
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:5173/v1/projects/
```

健康接口应返回 `status: "ok"`，项目接口应返回 JSON 列表，空列表也是合法结果。若返回登录错误，先核对是否启用了站点门禁。已有模型和资源齐全的工作区可进一步运行：

```bash
backend/.venv_macos/bin/python scripts/check_local.py
```

这会检查健康状态、代理项目数、SU7 资源哈希和独立 Ollama 模型清单；它不是适用于空白电脑的最小健康检查，也不验证真实模型质量。

## 完成第一次开发验证

打开工作台确认页面可访问，选择一个专用测试项目验证相关操作。自动保存会写项目数据，不要借用用户业务项目做随意试验。前端修改后按影响范围执行测试，并运行：

```bash
cd studio
npm run build
```

构建成功证明 TypeScript 和生产打包通过，不能代替浏览器交互。测试脚本、窄屏检查和故障处理见[测试与排障](TESTING.md)。

## 迁移与停止

两个独立终端分别 Ctrl+C 停止各自服务。不要因为端口被占用就批量杀死 Python 或 Node 进程。

迁移电脑时重新建立虚拟环境和 Node 依赖；保存项目、状态、模型及服务配置。数据位置见[配置与接入](CONFIGURATION.md)。Git 提交不自动包含业务数据、被忽略的运行配置和模型，也不能代表全部未提交修改已经备份。

## 从代码仓取得运行资源（2026-10-10，dev.107交付补充）

[Cyber-Edge](https://github.com/XAI-CyberSpark/Cyber-Edge) 的源码快照补齐Studio/HMI图片、站点图标、Maple的191个WOFF2文件、SU7 GLB/HDR和开发者页预览图，使用原路径、普通Git分发。SHA-256与字节数见[运行资源清单](RUNTIME_ASSETS.json)，它是交付清单，来源与许可证以资源目录旁的文件为主依据。已有克隆在仓库根目录执行：

```bash
git pull --ff-only
```

按用户最新要求，不上传语音识别模型权重及配套资源，也不新增LFS要求。需要本地ASR时，继续使用原有 `scripts/download_asr_model.py` 和 `backend/requirements-asr.txt` 自行准备；本轮未改这些脚本或依赖。语音播报由浏览器调用本机已安装的中文语音（`localService=true`），没有独立TTS音色包可上传；本机没有中文语音时须先在操作系统安装。场景中的示例歌曲名是展示数据，不代表已接入音乐音源。

Maple保留OFL及主题MIT声明。SU7来自用户指定release-hmi素材，独立分发授权仍未从原包确认，补传不构成新的许可声明，详见[原来源记录](../../studio/public/models/su7/SOURCE.md)。本轮不上传个人录音、日常项目、密钥、依赖目录、构建副本或多GB本地模型。

本节记录资产交付方式，不代表全新机器安装或稳定编排验收。具体检查范围见[dev.107交付验收](../product/releases/2.8.0-dev.107/ACCEPTANCE.md#运行资源补传2026-10-10)。

## 拉取代码后恢复接口目录（2026-10-19）

仓库已包含473条接口资料的JSON种子。执行`git pull --ff-only`后，在可停止编排的时机重启自己的开发后端；空imports表会自动初始化SQLite。打开组件库，或查询`GET /v1/capabilities`，应有473条接口。已有任何导入记录的库不覆盖、不合并。资料仍未接入真实MCP；详情见[配置与接入](CONFIGURATION.md#随仓库交付的接口目录2026-10-19)。本轮没有更新或重启日常5175。
