# 验收

2026-10-01｜2.8.0-dev.77｜执行人：Hermes（claude-code）｜基于 `c0cc91a` 的未提交工作区｜未发布

运行模式：本地 DOM 测试（jsdom + 模拟 fetch）、类型检查、生产构建与静态审计；不涉及模型、设备或真实 MCP 服务。

| 用例 | 命令 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| TC-001 组件库 DOM 回归（含绑定/检查/解绑） | `cd studio && node scripts/test-component-library.mjs` | 全部 PASS | 6 组 PASS，含 `imported capability can bind, check and unbind a registered MCP tool without becoming canvas-draggable` | 通过 |
| TC-002 MCP 库 DOM 回归 | `node scripts/test-mcp-library.mjs` | 全部 PASS | 3 组 PASS | 通过 |
| TC-003 本地化回归与审计 | `node scripts/test-localization.mjs`；`node scripts/audit-localization.mjs` | PASS；Missing 0 | 3 组 PASS；Missing 0，Raw JSX [] | 通过 |
| TC-004 类型检查 | `npx tsc -b` | 退出 0 | 退出 0 | 通过 |
| TC-005 生产构建 | `npm run build:desktop`（vite build） | 退出 0 | 退出 0，仅既有 chunk >500kB 警告 | 通过 |
| TC-006 排版审计 | `node scripts/audit-typography.mjs --write`；`node scripts/test-typography.mjs` | 0 违规 | 140 文件 / 2290 条，violations []；6 断言 PASS | 通过 |
| TC-007 后端全量回归 | `cd backend && .venv_macos/bin/python -m unittest discover -s tests` | 无失败 | `Ran 264 ... OK (skipped=8)` | 通过 |
| TC-008 en.json 无重复键 | Python `object_pairs_hook` 检查 | 空列表 | `[]` | 通过 |

独立复核：kimi 按上表命令复跑 TC-001~008，结果一致。

| 用例 | 方法 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| TC-009 360px 窄窗口绑定区排版 | kimi：真实后端 + vite dev，CDP 设备仿真 360×800（innerWidth=360），打开「儿童关怀」项目导入能力项「调整中控屏亮度与自动调节」 | 无横向滚动，输入与按钮完整可见 | 详情面板 303px、右缘 359px，docScrollW=360；两列输入各 126.5px、右缘 337px；「解除绑定」折到第二行；截图目视一致 | 通过 |

未验证：
- 绑定、检查连接、解绑三步未在真实后端上端到端点击执行；DOM 测试用模拟 fetch，接口路径与请求体按 `backend/app/api/capabilities.py` 核对一致。TC-009 只覆盖了真实后端下的排版。
- 360px 下输入框约 127px，超长工具名会被视觉截断（框内可滚动）。
- 后端返回的中文错误信息（如“能力项不存在。”）在英文模式下未翻译。
- `npm run build`（`tsc -b && vite build`）因工具限制拆成 TC-004 与 TC-005 分别执行。
