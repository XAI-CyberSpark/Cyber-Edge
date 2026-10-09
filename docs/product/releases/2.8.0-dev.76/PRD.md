# 节点能力注册表单一来源

2026-10-01｜2.8.0-dev.76｜负责人：Hermes（claude-code）｜状态：已实现，已独立复核

背景：运行节点定义有两份内容相同、靠手工同步的副本：`backend/app/services/node_capabilities.json`（后端 `node_capability_service` 读取）和 `studio/src/data/nodeCapabilities.json`（前端编译期 import）。一致性只靠 `test_shared_catalog_has_image_input` 比对，且前端文件不存在时静默跳过。ADR 0008 决策 2 要求先统一注册表再接设备适配器；本轮是目标架构演进顺序第 1 步（见 [03_Target_Architecture.md](../../../architecture/03_Target_Architecture.md) 3.1、第 7 节）。

## 方案与取舍

- 唯一来源：`backend/app/services/node_capabilities.json`。后端运行时、独立部署（`deploy/production` 的 backend 构建上下文只有 `backend/`）都直接读它。
- 前端副本：`studio/src/data/nodeCapabilities.json` 保留在仓库中，但改为生成产物，由 `scripts/sync_node_capabilities.py` 从唯一来源逐字节复制；不再手工编辑。
- 为什么不让前端直接引用后端文件：`deploy/production/docker-compose.yml` 的 studio 构建上下文是 `../../studio`，`studio/Dockerfile` 只 `COPY . .`；`vite.config.ts` 的 `fs.allow` 也只允许 studio 目录。直接引用 `../backend` 会让生产镜像构建失败，改动构建上下文属于部署结构变化，超出本轮范围。
- 防漂移：后端测试改为逐字节比对，前端副本缺失或不一致直接失败，不再跳过；仅在没有 `studio/` 目录的独立后端检出中跳过。脚本 `--check` 模式退出码 1，可接入 CI 或提交前检查。

## 范围

- 新增 `scripts/sync_node_capabilities.py`（同步 / `--check`）。
- `backend/tests/test_node_capabilities.py`：拆分原 `test_shared_catalog_has_image_input`，新增 `test_studio_catalog_is_generated_copy_of_backend_source`。
- `.gitignore` 增加 `.cursor/`（本轮撤除 Cursor 调试埋点时发现日志目录未被忽略）。
- 文档：架构 3.1 现状、NODE_CONTRACTS 注册表来源说明、版本登记。

## 非目标

- 不改注册表内容与结构，不做 NODE_CONTRACTS 第 9 节的机器可读注册表（schema、实现绑定、依赖、失败出口、证据引用），那是 3.1 的后续目标。
- 不改 `Sidebar.tsx`、`domain/nodeCapabilities.ts`、`tests/localization.dom.tsx` 的 import 路径：前端副本路径不变，三处无需改动。
- 不改 Docker 构建上下文、不碰能力库 SQLite 链路（dev.77 绑定 UI 并行进行）。
