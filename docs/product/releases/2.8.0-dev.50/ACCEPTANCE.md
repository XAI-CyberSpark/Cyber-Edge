# 验收记录

2026-09-26｜本地 OAKEgde Studio 5175｜实际 Hermes 原样复验场景。

1. `node scripts/test-workflow-layout.mjs`：4/4通过，含测量尺寸、分支/合流、循环、断开节点、隐藏/子节点、输入不变与幂等性。
2. 真实浏览器点击“整理节点”：六节点整理前有4对矩形相交，整理后0对；主流程上方，fallback下方；使用原始Hermes节点和边，不执行模型/车控。
3. 浏览器恢复后确认撤销恢复六节点原始坐标，undo-evidence.json为true。自动整理入口代码已接入，但未完成端到端测试。
4. `npm run build` 最终退出0，生产构建通过（已有大包/Browserslist提示）；文字审计127文件2060条，0违规。本轮不宣称完整验收。
5. 本轮未保存覆盖原样复验项目；原始生成证据保留。打开旧项目仍保留原坐标，用户可主动整理并保存。

证据：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/canvas-layout/`，含 before/after.png、DOM矩形、geometry-evidence.json、修改前源文件。

限制：布局避免节点矩形重叠，不保证所有复杂回路的连线完全绕障。节点展开后可再次手动整理，不持续追踪重排。临时QA页创建两次自动审批等待超时，未获执行结果；后续验收待补。未提交未发布，飞书未同步。
