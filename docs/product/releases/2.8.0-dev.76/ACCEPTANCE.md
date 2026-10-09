# 验收

2026-10-01｜2.8.0-dev.76｜执行人：Hermes（claude-code）｜基于 `147dd2d` 的未提交工作区｜未发布

运行模式：本地单元测试与脚本检查，不涉及模型、设备或 MCP 运行时。

| 用例 | 命令 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| TC-001 一致时检查通过 | `python3 scripts/sync_node_capabilities.py --check` | 退出 0 | `in sync`，退出 0 | 通过 |
| TC-002 漂移时检查失败 | 在前端副本末尾追加空格后执行 `--check` | 退出 1，提示从后端源同步 | `drift: ... differs from source`，退出 1 | 通过 |
| TC-003 漂移时后端测试失败 | 同上状态下 `.venv_macos/bin/python -m unittest tests.test_node_capabilities` | 失败 1 项 | `Ran 15 ... FAILED (failures=1)` | 通过 |
| TC-004 同步恢复 | `python3 scripts/sync_node_capabilities.py` | 副本与源逐字节一致 | `wrote ...`；与改动前备份 `cmp` 一致 | 通过 |
| TC-005 后端全量回归 | `cd backend && .venv_macos/bin/python -m unittest discover -s tests` | 无失败 | `Ran 264 ... OK (skipped=8)`（新增 1 项） | 通过 |
| TC-006 前端能力目录测试 | `cd studio && node scripts/test-node-capabilities.mjs` | 无失败 | pass 9 / fail 0 | 通过 |

独立复核：kimi 按上表命令复跑 TC-001~006，结果一致（后端全量 264 项 OK(skipped=8)，前端 pass 9 / fail 0）。

未验证：前端 `tsc -b && vite build` 未在本轮执行（前端 import 路径与副本内容均未改变）；未接入 CI，`--check` 目前依赖开发者或评审手动执行。

维护规则：节点能力定义只改 `backend/app/services/node_capabilities.json`，改完运行 `python3 scripts/sync_node_capabilities.py` 并一起提交两份文件。
