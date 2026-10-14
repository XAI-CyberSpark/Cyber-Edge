# dev.109 任务与实施计划

维护日期：2026-10-14。主依据：[需求](PRD.md)与[整体方案](../../ORCHESTRATION_OPTIMIZATION.md)。采用 subagent-driven-development 与 TDD；用户已授权按既有方案开始实施，不重复申请方案批准。

| 任务 | 输出/接口 | 文件边界 | 验证 | 状态 |
| --- | --- | --- | --- | --- |
| M0 | 新分支、原工作区/HEAD/数据区分与保护哈希 | Git、`.demo-runtime/optimization-dev109/baseline.json` | 分支与状态回读；收尾state哈希对比 | 完成 |
| M1-A | 安全增量调用记录与用量/缓存计量 | providers、logging、batch及其测试；builder接线由主执行者负责 | 先RED再GREEN；致命失败/去重/未知usage/脱敏 | 完成（离线） |
| M1-B/C | canonical协议、实际回执、initial_windows/blocked_window | catalog、flow_contract、execution schema/runner/TS、既有RED测试；builder接线由主执行者负责 | 真实本地GraphEngine、四窗范围、锁定/用例隔离 | 完成（离线） |
| M2-A | capability_index/search_capabilities/resolve_selection、安全MCP短索引与选中discover | capability_selection、mcp_runtime、node_data_schema及测试 | 纯ID/短中文/空召回/旧节点/未授权/完整契约 | 完成（离线） |
| M2-B | build_stage_context、PlanningResult/CapabilityNeed、显式阶段schema与预算接线 | authoring_context、scenario_builder及独立测试 | 长历史/原文/否定与更正、补载计入三轮、8调用限制/旧证据 | 完成（离线） |
| 集成验收 | 独立审查、相关后端/TS回归与文档同步 | 本轮受影响文件 | 新失败处理；已知12项基线残余单列；成本实际值未测 | 完成（含基线限制） |
| 十例真实验证 | 原创suite、锁定计划、受限请求上下文与独立回放 | benchmark新suite、batch runner/tests、TEST_CASES | 10实际请求；可应用及独立回放4/7，处置1/3；人工pending | 测试完成；质量门槛未达 |
| 实际接口缺陷 | build/repair联合Schema补对象根，SSE与日志共用运行ID | builder、orchestration API及回归 | 最小真实400→200；新Schema RED/GREEN；实际ASGI关联；83项最终相关回归通过 | 完成；修前两失败保留 |
| 编排产物复评 | 按用户新范围跳过执行成功条件 | TEST_CASES与独立复评证据；产品代码保持 | 静态契约与双代理复核；图5/7符合，全10例6符合/2不符合/2待评，原产物哈希不变 | 完成；无新增调用/执行 |

执行顺序：各独立模块先确认失败/离线基线，最小实现后针对性验证；再接入builder并验证整链。共享接口由主执行者核对，数据/计划/试跑/审查按依赖顺序，不并行生成候选。

审查重点：目录漏选/未知MCP；第9条之外的否定与更正；已有图跨节点引用；动作范围/未执行宣称成功；失败补载/截断的预算与证据版本。需求语义交规划模型，宿主不按业务关键词路由。

取舍记录：当前工作区包含未提交dev.108修复，新建分支原地承接，未从HEAD另建worktree；哈希清单用于保护检查，不声称Git快照。既有12项Windows全量残余不阻止授权优化，但新失败必须解决。

第一批最终验证：593项后端570通过/2失败/10错误/11跳过，12项残余与dev.108基线一致；TS执行27项及构建通过。第一批离线集成的新问题与独立审查发现均已修复，具体证据见[验收](ACCEPTANCE.md)。随后真实测试暴露问题在下段单列。M3–M5、真实质量/成本另列为未完成，不用离线结果提前放行。

随后十例最终验证见[用例与结果](TEST_CASES.md)：新增Schema/真实ASGI回归及最终83项相关检查通过；正式批源码冻结未变化，原2失败探针保留。真实测试暴露的JSON/编辑能力选择、8K核验截断、designOnly后旧证据字段残留及局部改动范围继续未完成；08/09预算拒绝影响单列，未把安全阻断当正确gap。仅隔离8002重载并已停止，不改日常版本。

收尾只读代码审查另补两项runner预算边界，67项相关检查通过，无新真实调用；当前runner与正式实测身份分开登记，原结果未改。仍未做M3/M4/M5或人工验收。
