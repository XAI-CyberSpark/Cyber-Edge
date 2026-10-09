# 目标架构保持单体，实车接入按三层验收纳入 MVP

日期：2026-09-30。状态：用户确认。部分替代 ADR 0004 中“不引入真实车辆连接”的表述；ADR 0004 其余决策（HMI 为体验入口、VehicleWorld 为状态源）保持。依据：[03 目标架构](../architecture/03_Target_Architecture.md) 第 3、6 节。

## 决策

1. **保持单体**。MVP 阶段继续 Studio + FastAPI 单体 + Hermes 编排子进程，不拆微服务，不引入 PostgreSQL、Redis、API 网关。01 文档的微服务规划不作为目标。
2. **先统一能力注册表，再接设备**。前后端两份相同的 `nodeCapabilities.json` 先合并为单一来源，之后设备适配器从注册表读取动作与参数范围，避免出现第三份节点定义。
3. **设备执行走可插拔适配器**。仿真、mock、设备三种适配器实现同一执行接口（输入输出按 NODE_CONTRACTS N12），不把某一条具体 HTTP 路径写死为架构。所有结果标 `source: simulation | mock | device`；`device` 结果须注明验证深度（仅接口回执，或执行机构实测）。
4. **实车接入纳入 MVP，分三层验收**：
   - 端侧上板：编排图和端侧模型在 SA8397 上运行，与主机结果对照。MVP 内完整验收。
   - 车控接口：用户确认没有车控服务 APK，MVP 先做 mock 适配器，按车机 HTTP 规格验证请求、回执与失败语义。
   - 执行机构：座椅、车窗等真实动作不在 MVP 内，待台架或整车。
5. **组件定位**：`core/` Rust 微内核冻结为历史参考，不进主链路；`runtime/sa8397` 与 `host_lite_edge_service` 是端侧部署与实车接入目标；`deploy/production` 是服务器部署模板，使用时必须开启站点门禁（ADR 0007）。

## 依据

2026-09-30 adb 只读检查：设备 `zeekr_dhu_sa8397`，Android 16，8080 无监听，`/api/vehicle/signals` 连接失败；车控相关厂商应用存在但没有接口文档。devops 部署日志中 8397 上车控节点此前一直返回 `car control placeholder mode`。详见 03 第 3.3 节。

## 影响

- mock 或仿真通过不能写成实车已执行；设备结果必须标来源和验证深度。
- 拿到车控服务 APK、厂商 SOA 文档或台架后，新增设备适配器并单独验收，不改动执行接口。
- CONTEXT.md 中“本版不承诺真实车辆”的表述需按本 ADR 同步。
