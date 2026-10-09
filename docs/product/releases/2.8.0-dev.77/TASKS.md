# 任务

| 任务 ID | 具体输出 | 状态 | 实现与验证记录 |
|---|---|---|---|
| TASK-001 | `CapabilityDetails.tsx` 新增 `CapabilityBinding` 区块（绑定/检查/解绑、忙碌与错误提示） | 完成 | DOM 测试覆盖三步操作与状态文本 |
| TASK-002 | `Sidebar.tsx` 传入 `import_id`，`onUpdate` 就地替换能力项；标题状态读 `binding_status` | 完成 | 同上；解绑后列表仍不可拖拽 |
| TASK-003 | `capabilityPresentation.ts` 类型扩展 | 完成 | `tsc -b` 通过 |
| TASK-004 | `component-library.css` 绑定区样式，输入框复用参数输入样式 | 完成 | 排版审计 0 违规，未新增裸字号 |
| TASK-005 | `en.json` 新增 22 条英文文案 | 完成 | 本地化审计 Missing 0，无重复键 |
| TASK-006 | 验收登记与文档同步 | 完成 | VERSION、CHANGELOG、CONTEXT、docs/README、TYPOGRAPHY_INVENTORY.json |
| TASK-007 | 独立复核 | 完成 | kimi 复跑 TC-001~008 一致，并补测 TC-009（360px 窄窗口排版通过） |
