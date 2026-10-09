# G-Edge 运维与可维护性保障手册

为了确保系统在未来 3 年的业务扩展中保持高可用性，我们设计了以下企业级运维与可观测性保障机制。

## 1. 统一日志规范 (Logging)
系统已摒弃随意的 `print()`，统一使用 Python 标准的 `logging` 模块，并输出为 JSON 格式，以便于日志收集工具进行结构化解析。

### 1.1 ELK/EFK 日志收集架构
*   **采集端 (Agent)**: 使用 `Fluent-bit` 或 `Filebeat` 以 DaemonSet 形式运行在 Kubernetes 集群中，或作为系统服务运行在 Orin 边缘设备上。
*   **存储端**: 日志统一汇聚至 Elasticsearch / OpenSearch。
*   **展示端**: 通过 Kibana 或 Grafana 进行日志检索与告警配置。

### 1.2 日志字段规范
所有后端日志强制包含以下字段：
*   `timestamp`: ISO8601 时间戳
*   `level`: INFO, WARNING, ERROR, FATAL
*   `trace_id`: 链路追踪 ID (用于串联单个请求的所有日志)
*   `service`: 当前微服务名称 (如 `agent-core-service`)

## 2. 分布式链路追踪 (Tracing)
系统集成了 **OpenTelemetry**，并支持将 Trace 数据导出至 **Jaeger** 或 **Zipkin**。

在 `docker-compose.yml` 中，我们预留了 `OTEL_SERVICE_NAME=backend-service` 环境变量。当端侧接收到推理请求时，Trace ID 会透传至底层模型，从而精准定位长耗时节点（例如是由于模型加载慢，还是 Token 生成慢）。

## 3. 监控与告警 (Metrics & Alerting)
采用 **Prometheus + Grafana** 体系。

*   **业务指标**: 暴露 `/metrics` 接口，统计 API QPS、P99 延迟、错误率。
*   **硬件指标**: 通过 `Node Exporter` (PC端) 和自定义的 `jtop` 探针 (Orin 端侧) 采集 CPU、内存、GPU 显存及 NPU 算力占用率。
*   **告警规则**: 
    *   边缘设备失联 > 5 分钟 (P1 告警)
    *   GPU/NPU 显存占用 > 90% (P2 告警)
    *   推理接口 P99 延迟 > 5000ms (P3 告警)

## 4. 研发规范与代码审查 (Code Review)
为保障团队协作质量，所有代码必须遵循以下 PR (Pull Request) 规范：

1.  **分支管理**: 采用 GitFlow 模型。禁止直接 Push 到 `main` 或 `develop` 分支。所有开发需从 `develop` 拉取 `feature/*` 或 `bugfix/*` 分支。
2.  **静态检查**: 提交代码前，必须通过本地的 `ruff check` 和 `npm run lint`。这些检查已集成在 GitHub Actions CI 流水线中。
3.  **单元测试**: 核心逻辑的变更必须附带 Pytest 测试用例，CI 流水线要求代码覆盖率不得低于 **80%**。
4.  **Code Review**: 
    *   PR 必须至少有 1 名核心架构师 Approve。
    *   Review 重点：架构是否被破坏、是否包含硬编码、异常处理是否闭环、日志打印是否合规。