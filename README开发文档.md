# Cyber-Edge-Agent v2.5

这是面向 `SA8397` 交付和复现的主入口文档。\
如果你是第一次拿到这个仓库，请先读这一份 README，再按文中的路径进入更细的 MD。

当前仓库支持两类使用方式：

- `Studio 作者模式`：在主机上拖拽编排、保存项目、点击 `Deploy`
- `SA8397 运行模式`：把 Runtime、Gemma4/QNN、项目 JSON 和脚本打包/推送到 8397 后，直接用命令行运行

## 你应该先看什么

- 想快速上手打包和部署：看本 README 的“5 分钟交付路径”
- 想了解车控接口：看 [Atomic\_service\_car\_control\_http\_api.md](file:///home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/Atomic_service_car_control_http_api.md)
- 想了解 SA8397 落地和踩坑：看 [03\_SA8397\_ADB\_Deployment\_Log.md](file:///home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/docs/devops/03_SA8397_ADB_Deployment_Log.md)
- 想理解图节点和连线如何变成 Runtime 执行：同样看 [03\_SA8397\_ADB\_Deployment\_Log.md](file:///home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/docs/devops/03_SA8397_ADB_Deployment_Log.md) 里新增的“图的业务逻辑与节点连线如何变成代码执行”

<br />

## 一句话总结

如果你是奔驰侧使用者：

- 先看 README
- 再用 `Deploy` 或 `package_sa8397_bundle.sh` 打包
- 推送到 8397
- 最后用 `run_sa8397_runtime.sh run-text "..."` 直接推理

## 仓库结构

- `backend/`：Host-lite 后端、项目保存、模型注册、短期记忆、Deploy 接口
- `studio/`：前端编排界面
- `runtime/sa8397/`：板端最小 C++ Runtime
- `scripts/`：构建、打包、部署、运行脚本
- `backend/projects/`：已保存的编排项目 JSON
- `docs/`：交付、部署、运维文档

## 5 分钟交付路径

如果你的目标是“把当前项目打给奔驰同事，并能在 8397 上直接跑起来”，推荐按下面顺序走：

1. 启动 `host-lite` 后端和 `studio`
2. 在 `studio` 中保存或打开目标项目 JSON
3. 准备 Gemma4/QNN 目录来源
4. 使用 `Deploy` 或 `scripts/package_sa8397_bundle.sh` 打包
5. 推送到 8397
6. 在 8397 上执行 `run-text`

## 环境要求

### 主机侧

- Linux
- Python 3.10 或兼容版本
- Node.js / npm
- `adb`
- Android NDK

### 板端

- Qualcomm `SA8397`
- 可以通过 `adb` 访问
- 若使用远程模式，还需要目标板支持 `ssh`

### SSH 额外依赖

本地 `adb` 打包/推送不依赖额外网络安装。\
如果你要使用 `Deploy` 的 `SSH` 远程推送模式，再额外安装：

```bash
cd /home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/backend
.venv_host_lite/bin/pip install paramiko
```

### 模型来源

打包 `Gemma4/QNN` 时，需要提供模型目录来源，支持两种方式：

- 主机本地目录，例如：
  ```bash
  /absolute/path/to/sa8397-qnn
  ```
- 直接从已连接设备拉取，例如：
  ```bash
  adb:/data/local/tmp/sa8397-qnn
  ```

## 开发者启动

如果你需要打开 Studio 进行编排，请先启动后端和前端。

### 1. 启动 Host-lite 后端

```bash
cd /home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5
./scripts/start_backend_host_lite.sh
```

### 2. 启动前端

```bash
cd /home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/studio
npm install
npm run dev -- --host 0.0.0.0
```

### 3. 打开页面

- Studio：`http://localhost:5173`
- Host-lite 后端健康检查：`http://localhost:8000/health`

## 交付给奔驰的两种方式

### 方式 A：直接给源码仓库

适合奔驰侧自己构建、自己打包。

你需要一起交付：

- 本仓库完整源码
- 主 README
- `docs/`
- `backend/projects/`

### 方式 B：给 SA8397 运行包

适合奔驰侧“即开即用”。

运行包会包含：

- `sa8397_runtime`
- `libc++_shared.so`
- `action_adapter.sh`
- `llm_adapter.sh`
- `run_sa8397_runtime.sh`
- `projects/*.json`
- `flow.json`
- `manifest.json`
- `docs/`
- `Gemma4/QNN` 模型目录

## 命令行打包

如果你不想经过 UI，可以直接打包一个完整 `SA8397 bundle`。

### 1. 基本打包命令

```bash
cd /home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5

export FLOW_JSON="/home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/backend/projects/seat_set+light_sub+veh_set.json"
export MODEL_SOURCE="adb:/data/local/tmp/sa8397-qnn"
export BUNDLE_NAME="benz_sa8397_demo"

./scripts/package_sa8397_bundle.sh
```

### 2. 常用环境变量

- `FLOW_JSON`：当前要作为入口的项目 JSON
- `MODEL_SOURCE`：Gemma4/QNN 来源
- `BUNDLE_NAME`：bundle 名称
- `OUTPUT_DIR`：bundle 输出目录，默认 `dist/sa8397_bundle`
- `DEVICE_DIR`：默认设备目录，写入 `manifest.json`
- `INCLUDE_ALL_PROJECTS=1`：是否把 `backend/projects/*.json` 全部打进 bundle
- `ADB_SERIAL`：当连接多个设备时指定目标设备

### 3. 打包产物位置

默认会生成：

- `dist/sa8397_bundle/<bundle_name>/`
- `dist/sa8397_bundle/<bundle_name>.tar.gz`

## bundle 目录结构

生成后的 bundle 目录结构如下：

```text
dist/sa8397_bundle/<bundle_name>/
├── README.md
├── manifest.json
├── sa8397_runtime
├── sa8397_runtime_host
├── libc++_shared.so
├── action_adapter.sh
├── llm_adapter.sh
├── run_sa8397_runtime.sh
├── deploy_sa8397_runtime.sh
├── package_sa8397_bundle.sh
├── input.json
├── flow.json
├── projects/
├── docs/
└── models/gemma4-cpu-sa8397/
```

### manifest.json 说明

`manifest.json` 会记录：

- bundle 名称和生成时间
- 当前入口项目与 `flow.json`
- 所有打包进去的项目 JSON
- 默认设备目录
- 默认 `qnn_base`
- 运行时文件名
- 模型是否已被打包进去

## 在 Studio 中一键 Deploy

当前 `Deploy` 已接入真实 host-lite 打包/推送接口，不再只是模拟进度条。

在前端中：

1. 保存当前项目
2. 点击右上角 `Deploy`
3. 填写：
   - `Bundle Name`
   - `Target Device Dir`
   - `Gemma4/QNN Source`
   - 是否包含全部项目 JSON
4. 如果是远程设备，再填写 SSH 信息
5. 点击 `开始构建`

完成后会：

- 读取当前画布的 `nodes + edges`
- 生成当前项目 JSON
- 构建 SA8397 runtime
- 打包 README、docs、scripts、projects、manifest
- 自动给 bundle 内 `sa8397_runtime`、脚本以及 Gemma4/QNN 启动二进制补执行权限
- 推送到你选择的设备目录

### 关于模型二进制权限

当前打包/Deploy 流程已经内置自动权限修复：

- 在本地生成 bundle 时，会自动对以下文件执行 `chmod 755`
  - `models/gemma4-cpu-sa8397/litert_lm_main`
  - `models/gemma4-cpu-sa8397/litert_lm_advanced_main`
  - `models/gemma4-cpu-sa8397/common/litert_lm_main`
  - `models/gemma4-cpu-sa8397/common/litert_lm_advanced_main`
- 在通过 host-lite `Deploy` 推送到 8397 后，会再次自动对设备侧同名文件补权限

如果你是手工使用 `adb push` 把整个 bundle 目录传到设备，而不是通过 `Deploy`，建议手工执行一次：

```bash
adb shell "chmod 755 \
  /data/local/tmp/cyber_edge_agent_v25/sa8397_runtime \
  /data/local/tmp/cyber_edge_agent_v25/action_adapter.sh \
  /data/local/tmp/cyber_edge_agent_v25/llm_adapter.sh \
  /data/local/tmp/cyber_edge_agent_v25/models/gemma4-cpu-sa8397/litert_lm_main \
  /data/local/tmp/cyber_edge_agent_v25/models/gemma4-cpu-sa8397/litert_lm_advanced_main \
  /data/local/tmp/cyber_edge_agent_v25/models/gemma4-cpu-sa8397/common/litert_lm_main \
  /data/local/tmp/cyber_edge_agent_v25/models/gemma4-cpu-sa8397/common/litert_lm_advanced_main || true"
```

## 直接推送到 8397 后如何运行

如果 bundle 已推送到设备目录，例如：

```bash
/data/local/tmp/cyber_edge_agent_v25
```

那么在主机侧直接执行：

```bash
cd /home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5

export DEVICE_DIR=/data/local/tmp/cyber_edge_agent_v25
./scripts/run_sa8397_runtime.sh run-text "主驾座椅加热调到3档，订阅灯光反馈，并打开天窗遮阳帘"
```

如果你推送到了自定义目录，例如：

```bash
export DEVICE_DIR=/data/local/tmp/benz_sa8397_real_gemma4
./scripts/run_sa8397_runtime.sh run-text "我的名字是什么？"
```

### 查看结果

```bash
./scripts/run_sa8397_runtime.sh logs-brief
./scripts/run_sa8397_runtime.sh logs-latest
./scripts/run_sa8397_runtime.sh logs
```

### 多设备场景

如果 `adb` 同时连了多台设备：

```bash
export ADB_SERIAL=<your-device-serial>
./scripts/run_sa8397_runtime.sh run-text "我的名字是什么？"
```

## 从零环境复现建议

如果你的目标是让一台新机器从零开始复现，请按下面顺序检查：

1. `adb devices` 能看到目标 8397
2. `./scripts/start_backend_host_lite.sh` 能启动
3. `studio` 前端能打开
4. `MODEL_SOURCE` 指向一个真实可访问的 Gemma4/QNN 目录
5. `./scripts/package_sa8397_bundle.sh` 能成功产出 `manifest.json`
6. `Deploy` 或命令行推送后，设备目录里能看到：
   - `sa8397_runtime`
   - `llm_adapter.sh`
   - `action_adapter.sh`
   - `flow.json`
   - `models/gemma4-cpu-sa8397`
7. `run-text` 能正常返回 `runtime_result.json`

## 常见问题

### QNN/Gemma4 不在主机上怎么办

用 `adb:` 前缀直接从已连接设备拉取：

```bash
export MODEL_SOURCE="adb:/data/local/tmp/sa8397-qnn"
```

### 推送目录能不能自定义

可以。

- UI 中填 `Target Device Dir`
- CLI 中设置：
  ```bash
  export DEVICE_DIR=/your/custom/path
  ```

### 旧环境还在用 `/data/local/tmp/sa8397-qnn`

当前 `run_sa8397_runtime.sh` 会优先使用 bundle 内的：

```text
${DEVICE_DIR}/models/gemma4-cpu-sa8397
```

如果该目录不存在，会自动回退到旧路径：

```text
/data/local/tmp/sa8397-qnn
```

### 如何清空短期记忆

```bash
adb shell "rm -f /data/local/tmp/cyber_edge_agent_v25/short_term_memory.json"
```

## 相关文档

- [Atomic\_service\_car\_control\_http\_api.md](file:///home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/Atomic_service_car_control_http_api.md)
- [03\_SA8397\_ADB\_Deployment\_Log.md](file:///home/xai/Cyber-Edge-Agent-release-v2.5/Cyber-Edge-Agent-release-v2.5/docs/devops/03_SA8397_ADB_Deployment_Log.md)

##

