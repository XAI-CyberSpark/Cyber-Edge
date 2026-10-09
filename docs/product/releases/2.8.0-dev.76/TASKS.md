# 任务

| 任务 ID | 具体输出 | 状态 | 实现与验证记录 |
|---|---|---|---|
| TASK-001 | 确认唯一来源与构建约束 | 完成 | 两份 JSON `cmp` 一致；studio 生产构建上下文只含 `studio/`，`vite fs.allow` 限于 studio，故前端保留生成副本 |
| TASK-002 | `scripts/sync_node_capabilities.py` | 完成 | 同步模式写入；`--check` 一致退 0、漂移退 1；写入前校验 JSON 合法 |
| TASK-003 | 后端漂移测试改为缺失即失败 | 完成 | 新增 `test_studio_catalog_is_generated_copy_of_backend_source`，人为制造漂移时失败，恢复后通过 |
| TASK-004 | `.gitignore` 忽略 `.cursor/` | 完成 | `git check-ignore` 命中 `.cursor/debug-e37476.log` |
| TASK-005 | 文档同步 | 完成 | 架构 3.1、NODE_CONTRACTS、CHANGELOG、CONTEXT、docs/README、VERSION |
| TASK-006 | 独立复核 | 完成 | kimi 按 ACCEPTANCE 命令复跑 TC-001~006，结果一致 |
