# 验收

2026-10-03｜2.8.0-dev.78｜未提交工作区，未发布

环境：本机 macOS，backend/.venv_macos，Node 24.21.0。后端使用隔离临时数据和合成 worker；前端使用 jsdom + 模拟 fetch。不调用云端模型或真实业务工具。

| 用例 | 命令/方式 | 实际结果 |
|---|---|---|
| TC-001 修复前后端基线 | `.venv_macos/bin/python -m unittest discover -s tests` | 266项，1项 PermissionError 失败，8项跳过 |
| TC-002 新增异常复现 | TransportTests 两项新增测试 | 修复前6个 error：进程组拒绝1个，异常消息5组；修复后全部通过 |
| TC-003 后端全量回归 | 同 TC-001 | 268项，260通过，8项因环境条件跳过 |
| TC-004 连接失败和重试 | `node scripts/test-component-library.mjs` | 修复前断言失败；修复后7组 PASS，含失败原因可见、成功重试移除旧错误 |
| TC-005 MCP 和本地化 | test-mcp-library.mjs、test-localization.mjs、audit-localization.mjs | 各3组 PASS；Missing 0，Raw JSX [] |
| TC-006 前端构建 | `npm run build` | TypeScript 与 Vite 通过；保留既有大 chunk 和 browsers 数据过期提示 |
| TC-007 文字规范 | audit-typography.mjs --write、test-typography.mjs | 140文件、2290条目、0违规；6断言通过 |
| TC-009 服务重启 | `bash scripts/start_local.sh`、`backend/.venv_macos/bin/python scripts/check_local.py` | 重启后前后端代理正常，4个项目，SU7资源校验通过，本地OpenSparX模型可发现 |
| TC-008 基线功能 | test-general-flow.mjs、test-scenario-session.mjs、test-project-navigation.mjs | 分别13、21、21项通过；这些基线在修复前运行 |

证据与修改前快照：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/development/debug-20261003/`，其中 initial.patch 包含开始前已有未提交修改，evidence/ 保存复现及后端回归日志。

限制：不是全仓所有测试或所有页面的完整验收；8项环境条件测试未执行；未验证真实模型、真实 MCP 与车辆。进程组信号被系统拒绝时回退仅针对直接子进程，不承诺绕过系统权限终止孙进程。界面失败原因由 DOM 夹具验证，未在用户已保存能力数据上人为制造失败。

回滚：仅撤销本轮4个源码/测试文件相对 before/ 的增量及本轮文档登记，保留原有未提交修改；不要使用 git reset --hard。

## 2026-10-03 Git基线补充

用户授权整理可恢复开发基线；源码保持本轮验收状态。本地提交和标签、忽略文件及恢复限制见 [BASELINE.md](BASELINE.md)。本文开头的“未提交工作区”描述原始验收时状态；保存基线没有把未执行的测试改为通过。
