# 验收与发现记录

2026-10-03｜2.8.0-dev.79｜未提交工作区，未发布｜[项目主文档](../../../README.md)

主工程 `/Users/Shared/sherry/OAKEgde Studio`，Node 24.21.0、backend/.venv_macos；审查起点 `6c458f7`。第一阶段三个子 agent 只读；主 agent 复现、去重后实施修复，再由子 agent 只读复核。

## 确认发现

以下位置以修复前基线为准，链接定位对应文件；每项包含触发与证据。

| 编号 / 级别 | 位置 | 触发条件 | 修复前证据与影响 | 修复 |
|---|---|---|---|---|
| A-01 / P1 | [WorkspacePage.tsx](../../../../studio/src/components/pages/WorkspacePage.tsx) 358、449、467、623、800行 | A 正在编排时新建 B，再返回 A；或同事件周期重复提交 | 主 agent 隔离 DOM 复跑：请求1未结束，loading已为false；重复请求2后请求1完成又清空loading。两结果可进入同图应用路径，存在迟到覆盖风险（覆盖路径为代码证据） | 按工作流 pending 与同步重入锁；finally仅释放所属工作流 |
| B-01 / P1 | [main_host_lite.py](../../../../backend/main_host_lite.py) 400–401行 | `/v1/pipelines/save` 的 id 为 `../projects/victim` | 临时 TestClient 返回200，临时 victim 项目确被替换成 pipeline 对象；未触碰真实项目 | 单文件 ID 与解析路径包含关系校验；非法输入422 |
| B-02 / P1 | [host_lite_edge_service.py](../../../../backend/app/services/host_lite_edge_service.py) 234–250行 | `flow_config.file_name` 或 `project_file_name` 为越界相对/绝对路径 | 真实 `_prepare_flow_json` 在临时环境覆盖外部 `outside.json`；发生在打包脚本运行前。读取分支同样缺少边界 | 两个文件名分别检查；写入和读取均限制在指定目录；符号链接越界拒绝 |
| B-03 / P1 | [project_service.py](../../../../backend/app/services/project_service.py) 32、56、73、107行 | `draft.json.backup.json` 或 `draft.json.json` 与 `draft.json` 并存 | 主 agent 复跑：保存ID draft.json.backup，列表却为draft.backup，加载404；子 agent补充临时复现连续后缀会读取/删除相邻项目；主 agent正式回归覆盖重复删除 | 列表仅剥末尾扩展名；ID不重复剥除、不做文件名别名回退 |
| C-01 / P2 | `studio/scripts/test-*.mjs`，具体9项见下表 | 子进程被信号终止或无法启动，spawnSync.status为null | 子 agent提取原语句，18个异常场景全部错误退出0；主 agent原runner故障注入测试修复前在signal断言失败 | `status ?? 1`，普通非零退出码保持 |
| C-02 / P2（测试维护） | [feishu-refinements.dom.tsx](<../../../../studio/tests/feishu-refinements.dom.tsx) 原17–56行；[qualcomm-catalog.dom.tsx](../../../../studio/tests/qualcomm-catalog.dom.tsx>) 原48行 | 执行现有DOM回归 | 默认Sidebar已改折叠组件目录，模型独立入口与重试标签已改变；高通提示不再包含“缓存”。本轮未改这些产品源码；参考dev.49/67现行规范核实为旧测试过期 | 分流mock、使用现行入口与标签，保留内置拖拽、真实模型、失败/重试、空与格式错误、渲染不执行等断言 |

C-01 九个 runner：component-library:18、diagnostics:17、feishu-refinements:17、mcp-library:18、node-capabilities-dom:18、project-navigation:14、qualcomm-catalog:18、scenario-generation:14、scenario-session-dom:18，均位于 `studio/scripts/test-<名称>.mjs`。

日志检查：backend历史模型404、studio旧ECONNREFUSED及OpenSparX旧错误属于追加历史记录，末尾未出现对应新错误；没有将它们冒充本轮新缺陷，也未触发真实推理复验。

## 验证结果

| 用例 | 实际方式 | 结果 |
|---|---|---|
| TC-001 修复前复现 | 子agent隔离脚本由主agent复跑；新增测试先对原源码运行 | 前端重复请求断言失败；后端6项测试执行得到11个失败、4个error（含子用例）；runner signal退出码0断言失败 |
| TC-002 文件边界 | `cd backend && PYTHONDONTWRITEBYTECODE=1 .venv_macos/bin/python -m unittest discover -s tests -p test_project_file_boundaries.py` | 6项通过；普通与内嵌/连续后缀ID、更新、重复删除、非法路径/类型/符号链接、顶层字段覆盖均验证，外部临时文件保持 |
| TC-003 编排状态 | `cd studio && node scripts/test-workspace-requests.mjs` | 7组通过：同步双发、切换保留、跨项目并行、后台完成隔离、失败重试、关闭隔离、成功后再发 |
| TC-004 runner故障注入 | `node scripts/test-runner-exit-codes.mjs` | 9个原runner各4种真实子进程结果，共36项通过；隔离esbuild与DOM，用于验证退出码，不能替代DOM验收 |
| TC-005 后端全量 | `.venv_macos/bin/python -m unittest discover -s tests` | 274项，266通过、8项环境条件跳过 |
| TC-006 既有DOM | 9个受影响runner，见C-01 | 最终全部通过；依次7、5、5、3、7、21、5、7、7组，共67组。加新编排测试，共10份、74组 |
| TC-007 构建 | `npm run build` | TypeScript及Vite通过；既有大chunk、browsers数据过期提示保留 |
| TC-008 复核 | A/B独立临时复跑，C代码核对 | A的7组、B的6项通过；C确认36项故障注入没有加载失败假通过或业务数据访问 |
| TC-009 本地服务 | 正常停止已核对身份的旧监督进程，`bash scripts/start_local.sh`；`backend/.venv_macos/bin/python scripts/check_local.py` | 健康与前后端代理通过，4个项目，SU7车模/环境光HTTP哈希一致，发现本地OpenSparX模型；未执行推理 |
| TC-010 保护与差异 | Git状态、逐文件SHA校验应用、数据前后哈希、`git diff --check` | 开始工作区干净；原7个项目/状态/pipeline文件内容和文件集合保持；基线标签及历史提交保留，无自动提交 |

## 证据与限制

本机证据和修改前副本位于 `/Users/sherry/Documents/ChatGPT/OAKEgde Studio/development/audit-dev79-20261003/`。`evidence/` 保存修复前日志、targeted-after.json、backend-full.log、9个DOM日志、两份旧测试失败与修正后日志、build.log及local-health.log；`before/` 与 `data-before.json` 保存源码/数据校验基线，不是完整业务备份。正式回归脚本已加入主工程，可独立重复运行。

所有路径攻击测试限自动删除的临时目录，DOM使用mock fetch。未执行真实云端模型、业务MCP、车辆、打包/部署流程或完整浏览器手工交互。8项条件跳过未计为通过；不是全仓全部测试或全面安全审计。路径检查拒绝请求中的越界以及已存在的越界符号链接，不承诺抵御可并发操纵主机文件系统的攻击者。

产品源码未改变视觉或文案，未新增排版审计。读删接口以真实ID为准；外部调用方若传完整文件名作为别名，需要改用列表/保存响应的ID。

dev.79 尚未提交；`baseline-20261003-dev78` 仅包含上轮代码。若需要撤销，只撤销本轮明确文件的增量，保留用户后续修改及项目数据，不使用reset --hard。
