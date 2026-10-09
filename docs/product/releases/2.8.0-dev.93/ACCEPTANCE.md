# 验收

2026-10-05｜2.8.0-dev.93｜未提交工作区固定副本。状态：本机已启用，未正式/公网发布。

| 用例 | 结果与边界 |
| --- | --- |
| 单元/ASGI回归 | `backend/.venv_macos/bin/python scripts/test_studio_stable.py` 5项通过（增加占用/权限未知时拒绝启动）：SQLite WAL一致副本/不重复覆盖、静态与API路由/私有文件边界、SSE首包即时发送、WebSocket/lifespan转发 |
| 真实TCP断流回归 | `backend/.venv_macos/bin/python scripts/check_studio_stable_stream.py`通过：临时Vite代理重启后流只有thinking并报RemoteProtocolError；相同夹具的独立直连收到thinking+result，无错误；未动真实5173/5175/8000 |
| 构建 | 在复制源码中执行TypeScript+Vite，4767模块通过；既有大包与Browserslist过期警告保留 |
| 日常实例 | 重复start明确拒绝、不替换进程；127.0.0.1:5175，PID80288；/、/docs、静态JS/CSS、/health、项目、模型提供商与引擎接口均200；HTML无Vite client |
| 用户数据 | 5份已保存项目与原文件逐字节一致；原数据未修改；日常projects/state/pipelines指向独立data目录 |
| 运行时 | 固定快照中的Hermes verify_runtime通过，无模型调用；Python/SDK/MCP已安装依赖及模型资源仍复用本机 |
| 实际页面 | 内置浏览器显示5个项目，包括接小孩放学；页面error日志为空；没有发送对话或重新运行用户场景 |
| 固定产物 | manifest中605个文件SHA-256核对一致；运行路径是版本绝对路径，不依赖开发目录或selected后续变化 |

## 本机交付

- 运行副本：`.demo-runtime/stable/releases/2.8.0-dev.93-20261005-223437-066925`。
- 日常数据：`.demo-runtime/stable/data/`；日志：`.demo-runtime/logs/studio-stable.log`。
- 前端：`assets/index-CWqjHuxq.js`；Studio组件2.8.0，host-lite API元数据1.0.0，产品登记dev.93。
- 启动：`python3 scripts/studio_stable.py start`；显式准备下次版本：`python3 scripts/studio_stable.py prepare`。
- 日常服务不会自动重启；当前开发5173/8000保持。更新/恢复时先等编排结束，再停止日常进程并启动选定副本。完整步骤见[快速开始](../../../developer/QUICKSTART.md#日常使用的独立环境dev93)。

## 限制

没有调用真实模型、MCP工具或设备，也没有实现断线重连/任务恢复；回归使用模拟SSE。共享Python依赖、固定Hermes SDK、MCP环境和模型不能在日常任务期间升级/删除；不是完整容器隔离。新端口不继承原来源的浏览器草稿、站点偏好或登录状态，只迁移后端已保存项目。没有开机自启。未创建Git提交，产物manifest不等于完整可恢复Git历史。日常数据与开发数据不自动双向同步；后续回滚代码不能倒退数据。
