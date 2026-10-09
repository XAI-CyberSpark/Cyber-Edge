# OAKEgde Studio

OAKEgde Studio 当前聚焦智能座舱场景编排：通过对话定义体验，生成业务工作流，在可控环境验证，并探索向车端交付。

当前是已有工程原型的产品规范化阶段。功能是否可用，以对应环境的实际验收记录为准。

## 开始使用

- 产品与开发流程：[项目主文档](docs/README.md)、[开发流程](docs/product/PRODUCT_WORKFLOW.md)、[迭代模板](docs/product/ITERATION_TEMPLATE.md)。
- 当前范围：[CONTEXT.md](<CONTEXT.md) 与 [架构决策](docs/adr/>)。
- 主机开发和 SA8397 交付：[开发说明](README开发文档.md)。
- SA8397 运行：[使用说明](DELIVERY_README使用文档.md)。
- Web 生产部署：[部署文档](docs/devops/04_Web_Studio_Production_Deployment.md)。

开发说明中的主机命令主要面向 Linux。根目录 `docker-compose.yml` 是历史配置，引用缺失路径，不作为当前启动入口。Windows 和设备环境需分别核验。

## 目录

| 路径 | 用途 |
|---|---|
| studio/ | React 编排界面、场景与仿真逻辑 |
| backend/ | Python 服务、项目存储、模型与部署接口 |
| runtime/sa8397/ | 板端 C++ Runtime |
| scripts/ | 构建、运行、部署及验证脚本 |
| examples/ | SA8397 示例输入与流程 |
| deploy/production/ | Web 生产部署配置 |
| desktop/ | Electron 桌面壳及资源准备脚本 |
| docs/ | 产品流程、技术与交付文档 |
| core/、hal/、manifests/ | 既有端侧引擎、硬件抽象与清单，适用范围待进一步核验 |

`backend/projects/` 中的流程是已有项目数据，清理时保留。桌面前端资源由 `desktop/scripts/prepare-resources.mjs` 从 `studio/dist` 生成，无需保存生成副本到源码仓库。

## 日常工作方式

每轮迭代先定义用户目标和验收条件，再拆任务、实现、验证、发布与复盘。按模板保留需求、任务和验收记录。模拟运行通过不表示真实模型或目标设备已通过。

## 原根目录笔记

原 README 记录：项目管理、Ctrl+S 保存工作流、顶部窗口新增与关闭、对话与项目对应；后续计划解决场景模型库与工作流匹配，让动画与工作流对应。这是历史笔记，本轮未逐项复验。

## 产品版本

当前产品编号见 [VERSION](<VERSION)，迭代状态与待办见[项目主文档](<docs/README.md)。组件编号独立记录；当前源码恢复入口见 [dev.78 Git 开发基线](docs/product/releases/2.8.0-dev.78/BASELINE.md)，未正式发布。见 [版本管理规则](docs/product/VERSIONING.md>) 与 [变更记录](CHANGELOG.md>)。

- [macOS 本地启动与迁移](docs/devops/05_macOS_Local.md)：新电脑前后端、OpenSparX 与数据保护说明。
