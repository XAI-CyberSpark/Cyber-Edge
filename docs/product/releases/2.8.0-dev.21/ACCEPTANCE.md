# 验收记录

2026-09-23，2.8.0-dev.21。原项目未提交工作区，未发布；本次改动前已有大量用户修改。逐文件内容校验与修改前备份用于保护既有工作，不是完整项目版本快照。

## 验证结果

| 检查 | 实际结果 | 能证明的内容 |
|---|---|---|
| node scripts/test-node-capabilities.mjs | 8项通过 | 既有模板兼容；未知工具、环路、孤立节点、模糊分支阻止执行；条件错误不走false；普通模型失败/无效计划/模拟响应阻止车控；none不触发固定动作；目标车窗范围与来源；记忆故障 |
| node scripts/test-node-capabilities-dom.mjs | 3组通过 | 配置错误可修正为右后窗动作；定位节点；修正前阻止运行；修正后检查状态更新 |
| python -m unittest discover -s tests -p test_node_capabilities.py | 9项通过 | 生成目录与约束、重复ID、缺配置不静默补动作、未知能力、分支、环路、后端模型失败保护、目录一致性 |
| python -m unittest test_child_vision_failure test_opensparx | 7项通过 | 图文推理故障不模拟回退，保留既有OpenSparX请求和结果保护 |
| node scripts/test-hmi.mjs | 34项通过 | 正常关窗、卡窗、重复雨天、晴天、目标开度、儿童图像各分支及助手行为 |
| node scripts/test-diagnostics.mjs | 5组通过 | 运行记录、模型上下文、真实资源与未知资源显示 |
| node scripts/test-project-navigation.mjs | 20组通过 | 项目打开保存、标签、导航、删除确认等原行为；使用mock API，不操作实际项目 |
| npm run build | 通过 | TypeScript与Vite构建；保留大包和Browserslist数据过旧提示 |
| 本地后端重启 | /health HTTP 200 | 原开发服务通过原启动脚本重启；访问密钥功能保留 |

组件测试最初遇到Node与JSDOM Event类型差异，已修正测试构造；既有导航测试受首页GSAP模块加载阻塞，已仅在测试中隔离Shuffle/Prism装饰组件。旧文本推理测试原本要求mock兜底，按本轮需求改为验证503并断言mock未调用。

## 限制与待验收

- 实际浏览器位于“输入使用密钥”页。未绕过访问控制，等待用户在页面登录；节点真实页面交互、视觉与窄屏尚未验证。
- 模型测试采用受控响应/故障注入；未调用真实MiniMax完成生成，不宣称当前远程提供商可用或生成场景达到准确率目标。
- 结构检查支持现有图规则与已登记参数；不是通用数据类型推导或业务正确性证明。模型/记忆服务连通性由执行时实际请求确认，不把注册或配置完成视为服务可用。
- 逻辑表达式沿用现有本地JavaScript执行方式，新增错误处理，不宣称隔离沙箱。
- 车窗与应用动作为行为/界面仿真，未实测真实车辆、板卡或摄像头持续流；模型自报置信度不等于已校准准确率。
- 原有项目不重写；使用未实现能力或缺少明确参数的旧流程会被拦截，需要用户修正。模型生成后的自动执行已取消。
- 运行记录仍是每项目当前会话最近20次，刷新清空；本轮没有增加持久化或平台内批量场景评测。

## 修改与恢复

本轮逐文件备份：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/node-upgrade/before/`；应用时通过内容哈希保护并发改动。恢复应逐文件比较备份和当前差异，不能覆盖后来其他任务的修改。dev.20访问密钥改动独立保留。

用户暂缓飞书及专项PRD，本轮未创建任何飞书文档。详细改造范围见TASKS.md。

## 儿童关怀补充验收（2026-09-23）

本轮用户已授权改写保存的儿童关怀项目，覆盖前文“原有项目不重写”对本项目的限制；其他项目不改。沿用dev.21，不产生发布或Git快照。

- 已保存项目为9节点10连线，三个互斥反馈共享会话记录终点。前端模板与后台离线模板同步；后端自带child_care_template.json以支持独立部署。
- 视觉卡片忽略旧预设结果；仅成功后展示本次输出、模型自评分及依据。风险、正常、无法判断均显示本次图片及最终反馈，模型观察单独标注。
- 记录区分observed_status和outcome，保留run_id/input_ref/model/model_score/summary/reply；服务错误留在node_failed时间线，不误记为unknown。
- 保存文件中旧的测试定义、模拟运行和文档移至legacy_child_care_snapshot，不删除；新测试定义全部注明待真实图片评测。
- node scripts/test-hmi.mjs：40项通过，包括三分支互斥、0.8边界、低分normal/risk、非法JSON/分数、离线、重复运行去除旧图/旧警示、一次反馈一次记录、已保存项目与测试契约一致。模型响应均受控注入。
- node scripts/test-node-capabilities.mjs：8项通过。
- node scripts/test-node-capabilities-dom.mjs：6组通过，含旧预设92%不展示、失败不复用旧值、监测/提醒/会话记录文案、图片预览及反馈源端口。DOM测试隔离ReactFlow端口，不代替实际画布检查。
- python -m unittest discover -s tests -p test_node_capabilities.py：11项通过，包括真实调用离线模板生成函数及后端模板/保存契约一致。
- npm run build：通过，保留现有大包与Browserslist数据过旧提示。
- 当前实际浏览器仍位于使用密钥验证页，已提示用户在页面完成验证。没有绕过门禁；实际画布、连线与窄屏视觉待验收。
- 没有使用真实模型评测儿童图片；不声称改善了识别准确率，不声称实现语音、实时视频、持续监测、风险解除或实车控制。0.8仅为与现有项目统一的待评测分流参数。

修改前逐文件备份：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/child-care-fix/before/`。应用前逐文件哈希校验，保留并行Windows打包及访问密钥改动。备份仅覆盖本轮文件，恢复时应比较差异，不覆盖后续改动。

本轮后端通过原启动脚本重启，`/health` HTTP 200（PID 57953），新模板加载生效；原访问密钥机制保留。

## 儿童关怀无法打开修复（2026-09-23）

前次测试仅对节点/连线契约检查，漏测了完整项目的updated_at字段；该字段被手工写为ISO字符串，后端GET响应的ProjectSchema要求float，实际日志确认ResponseValidationError并返回500。已将其转换为原时刻的Unix秒时间戳，未更改节点、连线及项目内容。

新增test_saved_child_project_opens_through_typed_api，读取真实保存文件、执行ProjectSchema验证，并用现有项目router与FastAPI响应模型检查GET；12项后端检查通过。使用现有本地凭据正常认证，通过http://127.0.0.1:5175/v1/projects/儿童关怀实际请求验证HTTP 200、9节点10连线及数字时间戳。密钥及Cookie未输出。无需重启服务；浏览器仍处于独立密钥验证页，未声称完成画布视觉验收。修正本轮工作脚本避免重复写错日期。

修复前备份：/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/child-care-open-fix/before/。同轮dev.21开发版，未提交未发布。
