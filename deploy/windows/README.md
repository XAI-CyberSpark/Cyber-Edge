# OAKEgde Studio Windows 完整部署包（不含 OpenSparX 权重）

本包是完整前后端，不是只上传 index.html 的静态网站。前端已编译，后端提供项目、保存、编排、模型接口及本地ASR；通过同一个端口启动，不需要Node、Nginx或另配API转发。

## 1. 安装和打开

1. 把ZIP **完整解压**到一个新目录，例如 `C:\OAKEgde Studio`（可将解压后的OAKEgde-Studio-Windows文件夹重命名为OAKEgde Studio），不要在压缩包内双击启动，不要仅复制frontend目录，也不要覆盖同事已有项目目录。
2. 安装官方 **Python 3.12 x64**，安装时保留 Python Launcher（`py`）。已有Python3.12可跳过。下载页：https://www.python.org/downloads/windows/ 。ARM Windows、32位Python不适用本包依赖。
3. 双击根目录 `INSTALL.cmd`。它校验文件完整性、创建本机虚拟环境，并从随包的 **Windows wheel** 安装依赖，无需在线下载Python依赖。
4. 双击 `START.cmd`，保持终端窗口打开。看到服务启动完成后，用浏览器打开 **http://127.0.0.1:5175/**。
5. 网站访问密钥：**1**（文件为`config/access-key.txt`）。验证后应显示已有项目，打开项目后顶部“编排 / 仿真 / 部署”进入工作台。
6. 双击 `CHECK.cmd`。应该看到PASS，包含前端、API、密钥、项目、SU7和ASR。任何FAIL，把自检输出和START窗口报错发回来。

关闭START窗口或按Ctrl+C会停止服务。再次运行只需START，不用反复INSTALL。若提示端口占用，关闭旧实例或修改`config/server.json`的port和public_url为同一新端口。

## 2. 服务器给别人访问

编辑 `config/server.json`：host改为`0.0.0.0`；public_url填写真实访问地址（例如`http://192.168.1.20:5175`或正式HTTPS域名），需要多个来源时加入extra_origins。然后重启START。Windows防火墙按服务器策略放行该端口；脚本不会替你关闭防火墙。

若已有IIS/HTTPS反向代理，将**整个站点**转发到`http://127.0.0.1:5175`，包括`/v1/*`、SSE和`/telemetry/*` WebSocket，不能只托管frontend。代理SSE不要缓冲。必须保持网页和API同源；不要使用file://打开index.html。访问密钥放在后端校验，未登录接口返回401是正常现象。

服务器本机localhost可使用麦克风；其它电脑访问远程HMI麦克风需要HTTPS安全上下文。网页未授权麦克风时，ASR仍可显示已安装，但不会采集音频。

## 3. 哪些包含，哪些需要另接

| 内容 | 本包状态 |
|---|---|
| 前端源码、已编译网页、后端API源码 | 包含 |
| 当前4个已保存项目、节点目录、工作台、HMI、SU7 | 包含 |
| 当前云端编排API配置与密钥 | 沿用此前授权包含在backend/API_KEY.txt；需要服务器能联网，额度/账号由原提供方决定 |
| SenseVoiceSmall INT8语音识别及Windows依赖 | 包含，约229MiB模型 |
| OpenSparX原始模型目录 | **不包含** |
| Ollama OpenSparX模型数据/运行程序 | **不包含** |
| 本机Mac虚拟环境、node_modules、缓存、日志、历史快照 | 不包含 |

**没有OpenSparX服务时，顶部CYBER助手的意图推理、涉及该模型的工作流与儿童图片识别不能完成；不影响登录、项目、编排编辑、SU7或基础仿真控制。** 语音转成文字与后续意图推理是两步；包含ASR不等于包含OpenSparX。可在config/server.json的opensparx_base_url接入同事已有的兼容服务，模型名仍是`opensparx-cabin-intent:3b`。程序不会偷偷下载这些权重，也不会伪造模型成功。

设备部署/SA8397需要额外ADB、SSH或设备SDK与构建环境，本包不把这些实机依赖包装成已可用。现有代码与脚本保留。

## 4. 源码、数据和配置

- `frontend/`：本轮由同包studio源码构建的网页，唯一静态服务目录。
- `studio/`：React/TypeScript完整前端源码，含package-lock。需要改源码时另装符合Vite7要求的Node（本机构建Node24），执行npm ci、npm run build，把studio/dist内容替换frontend后重启。
- `backend/`：实际API、原项目和模型目录配置；工作台保存的项目写入backend/projects。
- `deploy/windows/server.py`：同源服务入口；`config/server.json`：端口、来源和模型服务配置。
- `config/access-key.txt`：网站访问密钥；`backend/API_KEY.txt`：云模型API密钥。两者都不在静态目录，不能上传到公共下载站。
- `models/sensevoice-small-int8/`：ASR模型和来源/许可。
- `wheels/`：Python3.12 / Windows x64依赖；不会在Mac上安装使用。
- `PACKAGE-MANIFEST.json`：逐文件SHA256；压缩包旁的.sha256校验整个ZIP。安装校验用于初次解压完整性，配置或项目修改后会与原始清单不同，属于预期。

当前访问密钥按原要求为1；公开部署请自行更换并重启。密钥和会话不应与云模型API Key混用。

## 5. “只有主页”排查

- 只部署frontend会缺少项目/API/密钥验证；必须运行START.cmd，不能靠浏览器打开HTML。
- `/health`应返回JSON；`/v1/projects/`未登录应返回JSON 401，而不是HTML。若API响应是首页HTML，通常是反向代理把API当作SPA页面回退了。
- 登录失败“此网站来源未获授权”：检查public_url/extra_origins与地址栏完全一致（含协议和端口），重启后端。
- 服务窗口“ModuleNotFoundError”：先运行INSTALL，不能使用旧Mac虚拟环境。
- 项目可打开但模型不可用：本包明确排除了OpenSparX，需接独立服务。

打包与后端/静态联合服务在macOS宿主上验证；Windows专用wheel已解析和检查。没有Windows实机执行证据，不声称已完成Windows端验收。产品dev.21为当前未提交工作区快照，不是Git发布版。

现有旧项目在dev.21新增节点检查下可能提示参数待修正（例如OpenSparX示例的cabin-vehicle节点）。这是原项目配置与当前校验的差异，不是文件缺失；本次没有擅自改写原项目。
