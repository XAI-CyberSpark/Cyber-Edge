# 本地语音输入部署

## 组件

- SenseVoiceSmall INT8：`models/sensevoice-small-int8/`，权重约228MiB；模型维护者官方 sherpa-onnx asr-models 发布包。
- 精确来源/各文件SHA256：模型目录 `SOURCE.json`，随附原LICENSE与README。
- 依赖：`backend/requirements-asr.txt`（sherpa-onnx 1.13.8、numpy 2.2.6）；本机 macOS额外依赖 sherpa-onnx-core 1.13.8。不需要Torch或ffmpeg。
- 后端：`GET /v1/audio/status`、`POST /v1/audio/transcriptions`，后者接受 `Content-Type: audio/wav` 原始单声道16位PCM WAV请求体，非multipart/OpenAI协议；0.25—30秒，上限3MiB，同时只解码一段。
- HMI通过AudioWorklet采集/混为单声道，以PCM WAV发给配置的本地后端。不是流式逐字识别，也不走浏览器云端SpeechRecognition。

## macOS（现有项目）

```sh
backend/.venv_macos/bin/python -m pip install -r backend/requirements-asr.txt
backend/.venv_macos/bin/python scripts/download_asr_model.py
bash scripts/start_opensparx.sh
# 另开终端，使用已有服务时不要重复启动端口
bash scripts/start_backend_host_lite.sh
# 再另开终端
STUDIO_PORT=5175 bash scripts/start_studio_host.sh
```

## Windows（已有Python3.12与Node环境）

在项目根目录执行，已有同事压缩包未自动更新，需包含本轮源码与脚本：

```powershell
py -3.12 -m venv backend/.venv_windows
backend/.venv_windows/Scripts/python.exe -m pip install -r backend/requirements-host-lite.txt -r backend/requirements-asr.txt
backend/.venv_windows/Scripts/python.exe scripts/download_asr_model.py
$env:OPENSPARX_BASE_URL='http://127.0.0.1:11435/v1'
cd backend
.venv_windows/Scripts/python.exe -m uvicorn main_host_lite:app --host 127.0.0.1 --port 8000
```

另按原Windows说明启动独立Ollama（11435、models/ollama-opensparx）与Vite（5175）。本轮未实测Windows。可通过 `OAKEGDE_ASR_MODEL_DIR` 指定已拷贝的模型目录；应含model.int8.onnx和tokens.txt。下载脚本校验已安装文件，遇到不同内容停止，不覆盖已有模型。

## 使用

仿真 → 顶部CYBER助手右侧麦克风 → 浏览器首次授权 → 说话 → 方块结束 → 检查/修改文字 → 发送 → 车控建议确认。首次运行加载模型稍慢，后续复用。录音时按Escape或点击助手标题可取消；权限申请/转写中再次点击图标可取消。取消不会发送文字；页面隐藏/关闭助手也会取消。未保存录音，无法恢复取消的语音。

浏览器需支持AudioWorklet并在localhost或HTTPS安全上下文下打开。内置浏览器如不提供麦克风权限，可用Chrome打开同一本地地址。拒绝权限/无设备/识别错误仍可文字输入。HMI与ASR服务应部署在自己控制的本地机器；本轮未配置远程语音演示。

## 本轮恢复

原文件备份：`.demo-runtime/versions/before-dev19-asr/`；只覆盖本轮已有源码和版本文件，不包含整个项目/项目数据/环境。恢复前逐文件比较后续变化。
新增文件：audio.py、asr_service.py、requirements-asr.txt、download_asr_model.py、voiceCapture.ts、useVoiceInput.ts、voice-capture.js及测试/本版文档。回退时先移除路由和前端引用，再按需保留或移除新增文件，不回滚用户其他修改。ASR依赖和模型可留存；不自动删除原项目/模型。

本机此次启动的独立Ollama和后端日志分别为 `.demo-runtime/logs/opensparx-dev19.log`、`backend-dev19.log`；PID只是本次运行记录，不作为长期停止脚本依据。
