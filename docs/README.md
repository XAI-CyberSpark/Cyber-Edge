# OAKEgde Studio 项目主文档

参数变形后续诊断（2026-10-06）：两组真实请求定位aliases.item已在MiniMax API响应中存在，Hermes与宿主未改写set_data；Anthropic对照无item/XML，正常$ref透传。上一轮XML引用仍未定案。仅诊断、无兼容修复，临时采集已移除；[证据与待选方案](product/releases/2.8.0-dev.98/ACCEPTANCE.md)。不改变当前dev.99编号。

2026-10-06 dev.98：通用节点字段目录与校验一致性，字段回归、定位信息及覆盖引用警告已实现，真实single复跑340.974秒、21节点/27连线，patch拒绝6→4，仍不可应用。[需求](product/releases/2.8.0-dev.98/PRD.md) · [任务](product/releases/2.8.0-dev.98/TASKS.md) · [验收](product/releases/2.8.0-dev.98/ACCEPTANCE.md)。当前登记以根 VERSION 为准；不更新5175，未提交、未发布。

飞书协作入口：[OAKEgde Studio 项目主文档](<https://bi98l1v0z9.feishu.cn/docx/Vz86dZhreoLgPYxrS4sc1fSrn2f)。2026-09-25 已将本次主目录原有 Markdown 引用转换为可直接阅读的飞书文档，长部署日志分卷保留；文档对应关系见 [飞书文档登记表](FEISHU_DOCUMENTS.json>)。并行 dev.40 组件库布局与最新迭代指向尚未纳入本次线上快照；原需求文档CE-20已单独回写完成状态并回读验证。飞书暂无自动双向同步，后续更新先读取线上最新内容并比较本地差异，保留共同编辑，不直接整篇覆盖。

维护日期：2026-10-09｜文档状态：项目管理入口｜维护方式：每轮工作同步更新

**以后从这里了解项目。** 这里管理方向、文档职责、当前状态和待办；详细规则写在对应子文档，避免多份内容各自演变。

开发者阅读入口：[OAKEgde Studio 开发者文档](developer/README.md)。用途：详细说明本地启动、核心概念、源码开发、模型/MCP配置、API、测试和排障；状态：持续维护，已接入本机文档网页，非完整产品验收或公网发布；维护日期：2026-10-05；主依据：当前源码、现有领域规范与版本验收。共同维护及未覆盖项见[维护记录](developer/MAINTENANCE.md)。网页版本为dev.92，仓库Markdown是内容来源；[本机阅读](http://127.0.0.1:5173/docs)。

产品更新入口：[条目式汇总](developer/UPDATES.md)；用途为面向读者的周度/功能更新，状态为本机开发进展、未发布，维护日期2026-10-05，主依据为CHANGELOG与迭代验收。详细开发编号保留在次级入口；同轮完善仍为dev.92。

Figma设计协作入口：[专用设计文件与同步说明](product/FIGMA_WORKSPACE.md)。用途：编辑当前网页设计并通过Frame链接明确同步到代码；状态：主要界面已导入，SU7静态素材待补；维护日期2026-10-05，主依据为当前开发工作区和网页采集，无后台自动同步。

## 1. 我们在做什么

OAKEgde Studio 是智能座舱场景编排与体验验证工作台。目标是把用户的自然语言愿望变成有创意、可运行、可解释、可验证的座舱体验。

当前优先把节点职责、数据契约与实现边界定义清楚，再让生成器和执行器遵守这些定义。儿童关怀、生日航海是验证不同能力组合的场景，不是平台只能支持的两种模板。体验级闭环验证是当前范围；实车接入、量产可靠性和传感器级物理仿真需独立实现与验收。

## 2. 当前状态与下一步

当前登记 **2.8.0-dev.107**：精确契约、核验证据编号和编排推进引导验证中，真实实验待完成。[需求](product/releases/2.8.0-dev.107/PRD.md) · [任务](product/releases/2.8.0-dev.107/TASKS.md) · [验收](product/releases/2.8.0-dev.107/ACCEPTANCE.md)。

上一轮 **2.8.0-dev.106**：断言路径/类型预检、类型可见反馈、受限计划纠错、截断限次恢复及state记忆警告完成。最终后端402项（9跳过）、前端相关80项（2跳过）和类型检查通过；七次真实实验2/7可应用，A-Claude 0/3未达目标，C-MiniMax 1/2、C-Claude 1/1、A-MiniMax 0/1。测试依赖隔离到/tmp，共享解释器pip freeze不变。复杂场景可靠性仍未达。[需求](product/releases/2.8.0-dev.106/PRD.md) · [任务](product/releases/2.8.0-dev.106/TASKS.md) · [验收](product/releases/2.8.0-dev.106/ACCEPTANCE.md)。

上一轮 **2.8.0-dev.105**（2026-10-09）：JSON输入契约、错误归因与计划前置检查完成；后端388项（9跳过）、前端相关74项（2跳过）及类型检查通过。7次真实对照可应用2/7：C-Claude 2/2、C-MiniMax 0/2、复杂A-MiniMax 0/3；整体可靠性未达。实验后补齐JSON媒体字段边界，两个成功候选在最终引擎重放通过。[需求](product/releases/2.8.0-dev.105/PRD.md) · [任务](product/releases/2.8.0-dev.105/TASKS.md) · [验收](product/releases/2.8.0-dev.105/ACCEPTANCE.md)。未提交、未发布，不更新5175。

前轮登记 **2.8.0-dev.104**（2026-10-09）：case隔离说明与inspect表达式前置检查完成；冻结对照可应用1/6（C-MiniMax 1/2、C-Claude 0/2、D-Claude 0/2），可靠性未达，下一步优先解决简单输入契约/反馈链路。[需求](product/releases/2.8.0-dev.104/PRD.md) · [任务](product/releases/2.8.0-dev.104/TASKS.md) · [验收](product/releases/2.8.0-dev.104/ACCEPTANCE.md)。未提交、未发布，不更新5175。

前轮登记 **2.8.0-dev.103**（2026-10-08），通用编排超时/重试/status修订已完成指定验证，A组0/3可应用，B组2次讨论未进入搭建；稳定性目标未达；[需求](product/releases/2.8.0-dev.103/PRD.md) · [任务](product/releases/2.8.0-dev.103/TASKS.md) · [验收](product/releases/2.8.0-dev.103/ACCEPTANCE.md)。未提交、未发布，不更新5175。

前轮登记 **2.8.0-dev.102**（2026-10-08），预算放宽与通用参数修复已实现；362项后端（9跳过）、20项执行器与tsc通过，三次真实复跑0/3可应用，可靠性仍未达标。主依据为本轮用户授权；[需求](product/releases/2.8.0-dev.102/PRD.md) · [任务](product/releases/2.8.0-dev.102/TASKS.md) · [验收](product/releases/2.8.0-dev.102/ACCEPTANCE.md)。未提交、未发布，不更新5175。

前轮登记 **2.8.0-dev.101**（2026-10-07）：通用HMI初始控件前置校验、等待证据与受限计划修订、Hermes入口引用恢复已实现；130项后端、20项执行器及tsc通过，三次同请求can_apply=true为0/3。完整结果见[验收](product/releases/2.8.0-dev.101/ACCEPTANCE.md)。[需求](product/releases/2.8.0-dev.101/PRD.md) · [任务](product/releases/2.8.0-dev.101/TASKS.md)。不改SDK、默认模式、架构、预算、项目或5175，未提交、未发布。

前轮登记 **2.8.0-dev.100**（2026-10-06）：从能力目录生成patch字段Schema，85项相关测试通过；真实MiniMax 363.660秒、27节点/28连线，item为0/7、patch拒绝2次，仍不可应用。固定Hermes引用分支有字段重命名限制。[需求](product/releases/2.8.0-dev.100/PRD.md) · [任务](product/releases/2.8.0-dev.100/TASKS.md) · [验收](product/releases/2.8.0-dev.100/ACCEPTANCE.md)。不改参数解析器、架构、预算、项目或5175，未提交、未发布。

前轮登记 **2.8.0-dev.99**（2026-10-06）：车模通用描述、SU7等价迁移和缺失部件降级完成，实物回归、5173截图及构建通过；旧三款风格已否决；新写实短名单有授权/文件待决项。[需求](product/releases/2.8.0-dev.99/PRD.md) · [任务](product/releases/2.8.0-dev.99/TASKS.md) · [验收](product/releases/2.8.0-dev.99/ACCEPTANCE.md)。主依据为用户两步要求与实际模型；未提交、未发布，不改5175。

上一轮 **2.8.0-dev.98**：通用字段目录、错误定位和覆盖引用警告完成回归，真实编排仍不可应用，详见[本轮验收](product/releases/2.8.0-dev.98/ACCEPTANCE.md)。

上一轮 **2.8.0-dev.97**（2026-10-06）：HMI 内车控弹窗、局部遮罩和左对齐分类导航已实现，独立滚动、深浅模式、窄容器及键盘焦点验证通过。[需求](product/releases/2.8.0-dev.97/PRD.md)、[任务](product/releases/2.8.0-dev.97/TASKS.md)、[验收](product/releases/2.8.0-dev.97/ACCEPTANCE.md)记录本轮范围与截图。主依据为用户截图及开发源码；仅更新5173，日常5175未更新，未提交、未发布。

车模候选调查（2026-10-06）：旧三款CC0因风格全部不采用；新增三款付费写实短名单及同HMI并排截图，四窗/压缩体积未实测，公开GLB分发授权待解决，见[车模核验报告](product/CAR_ASSET_REVIEW.md)。默认仍为SU7，CarConcept只作两门降级夹具；待用户选择后再替换，未清理品牌或更新日常5175。

前轮登记 **2.8.0-dev.96**（2026-10-06）：通用编排契约说明与纠错，68项相关回归通过；同请求single复跑411.47秒，仍不可应用；不改架构、默认模式、预算或前端，暂停team耗时调查。范围与依据见[需求及错误分类](product/releases/2.8.0-dev.96/PRD.md)、[任务](product/releases/2.8.0-dev.96/TASKS.md)、[验收](product/releases/2.8.0-dev.96/ACCEPTANCE.md)。日常5175未更新，未提交、未发布。

dev.94同轮补充（2026-10-06）：飞书第14项将组件库接入与模型/MCP一致的前三行工具栏，搜索与筛选统计、导入、桌面坐标及窄屏主题已验证；[需求/验收](product/releases/2.8.0-dev.94/ACCEPTANCE.md)。根VERSION保持并行dev.95，本轮仅更新开发5173。

此前登记版本 **2.8.0-dev.94**（2026-10-05）：飞书第11–13项的目录对齐、统一拖入交互及用户消息气泡已实现，自动检查及专用页面桌面/窄屏实测通过。用途：第11承接第9的设计补修；状态：本机开发验收、待用户审阅；主依据：飞书revision404与实现，完成标记回读407。[需求](product/releases/2.8.0-dev.94/PRD.md) · [任务](product/releases/2.8.0-dev.94/TASKS.md) · [验收与截图](product/releases/2.8.0-dev.94/ACCEPTANCE.md)。未提交、未发布；日常5175仍为dev.93。

此前登记版本 **2.8.0-dev.93**（2026-10-05）：本机日常与开发隔离，日常入口5175，开发入口5173/8000。状态与证据见[需求](product/releases/2.8.0-dev.93/PRD.md)、[任务](product/releases/2.8.0-dev.93/TASKS.md)、[验收](product/releases/2.8.0-dev.93/ACCEPTANCE.md)。主依据：用户确认隔离；不改界面、不实现任务断线恢复。未提交、未正式发布。

此前版本 **2.8.0-dev.92**（2026-10-05）：开发者文档网页已实现，验收范围与限制见[需求](product/releases/2.8.0-dev.92/PRD.md)、[任务](product/releases/2.8.0-dev.92/TASKS.md)、[验收](product/releases/2.8.0-dev.92/ACCEPTANCE.md)。用途：阅读、检索并共同维护既有工程文档；主依据：用户截图、仓库文档与页面实现。未提交、未公网发布；并行dev.91工作保持独立。

节点右键删除（dev.91，2026-10-05）：删除及关联连线清理、分组级联、最近一次右键删除撤销已实现；5组DOM与排版通过，实屏待验收，最终整站构建受并行dev.92影响。状态：未提交；主依据：[需求](product/releases/2.8.0-dev.91/PRD.md) · [任务](product/releases/2.8.0-dev.91/TASKS.md) · [验收](product/releases/2.8.0-dev.91/ACCEPTANCE.md)。

dev.88第10项复测：分隔线变深已定位到开发服务缺少Tailwind颜色规则，改为显式workspace-divider并核对实际CSS和组件输出；实屏限制保留，见[验收修正](product/releases/2.8.0-dev.88/ACCEPTANCE.md)。

自动保存（dev.89，2026-10-05）：后台保存、恢复副本与冲突保护完成，本机刷新恢复/画布移动实测通过。按用户要求撤掉新增保存行，保持布局。[需求](product/releases/2.8.0-dev.89/PRD.md) · [任务](product/releases/2.8.0-dev.89/TASKS.md) · [验收与限制](product/releases/2.8.0-dev.89/ACCEPTANCE.md)。未提交，本机已更新；不改变并行dev.90状态。

dev.88第9–10项补充：模型/MCP工具区与分页统一，模型资料可预览后入库，工作区分隔线改用浅色divider；9组组件/导入、5组模型目录、5组MCP回归通过，整站构建已恢复通过，飞书第9–10项紫色删除线已回读确认。实屏限制见[同轮验收](product/releases/2.8.0-dev.88/ACCEPTANCE.md)。

dev.88同轮第8项：部署向导打开时聚焦标题，不再自动全选项目名称；DOM复现与修复检查通过；此次整站构建受并行自动保存TS2367阻塞，详见[同轮验收](product/releases/2.8.0-dev.88/ACCEPTANCE.md)。根VERSION的dev.89属于并行迭代，本次不变更其状态。

当前登记 dev.90（2026-10-05）：MCP产品内完整说明、工具参数、拖拽/添加与Fetch/Time首次Run独立安装完成，多工具选择与独立参数已补齐；真实安装、复用、Schema错误、完整图执行及1280/360px实屏通过。除Fetch/Time外的服务尚无安装配方；[需求](product/releases/2.8.0-dev.90/PRD.md) · [任务](product/releases/2.8.0-dev.90/TASKS.md) · [验收](product/releases/2.8.0-dev.90/ACCEPTANCE.md)。未提交、未发布。

当前版本dev.88（2026-10-05）：模型搜索分组与思考/强度真实请求设置、资源标题简化、搜索整行焦点、浅色工作台纯白表面已完成。后端287通过/8跳过，6种固定SDK本地协议、相关DOM、审计与构建通过；飞书第4–7项已加紫色删除线并回读。本机已加载，实屏因当前聊天工具限制待补；未提交、未做公网或正式发布。[需求](product/releases/2.8.0-dev.88/PRD.md) · [任务](product/releases/2.8.0-dev.88/TASKS.md) · [验收与限制](product/releases/2.8.0-dev.88/ACCEPTANCE.md)。模板补修仍归dev.87。

模板替换保护（dev.87，2026-10-05）：用户复测后补齐已有讨论/已保存但零节点的确认分支，23组请求回归及保存讨论/零节点pending的真实页面验证通过；网络拦截未调用模型。旧17:48归档不含补充修正。Studio 内确认、编排取消和迟到结果隔离已完成；20组请求/模板、21组项目导航、构建与审计通过，1280/360px浏览器验证通过。保留并行dev.86设计清单修改。[需求](product/releases/2.8.0-dev.87/PRD.md) · [任务](product/releases/2.8.0-dev.87/TASKS.md) · [验收](product/releases/2.8.0-dev.87/ACCEPTANCE.md)。本机已更新；未提交，未做公网或正式版发布。[本机更新与产物](product/releases/2.8.0-dev.87/DEPLOY.md)。

飞书设计清单（dev.86，2026-10-05）：三项界面修改与自动检查完成，飞书原文已加紫色删除线并回读验证；实屏待验收，见[需求](product/releases/2.8.0-dev.86/PRD.md)、[任务](product/releases/2.8.0-dev.86/TASKS.md)、[验收](product/releases/2.8.0-dev.86/ACCEPTANCE.md)。未提交、未发布。

2026-10-05 共创聊天时间（dev.85）：按时间段居中显示智能日期，连续对话合并，回复用时与实际操作可折叠，失败/中断和保存恢复保留准确边界；自动检查完成，浏览器被旧符号链接工作区阻塞，实屏待验收。[需求](product/releases/2.8.0-dev.85/PRD.md) · [任务](product/releases/2.8.0-dev.85/TASKS.md) · [验收](product/releases/2.8.0-dev.85/ACCEPTANCE.md)。未提交、未发布。

设计评审分批修正（dev.84，2026-10-03）：三批完成，保存对话折叠与真实时间、完整条件及能力说明分层、窄窗口完整资源面板与焦点隔离。5个DOM脚本、审计、构建及1280/720/360px浏览器抽样通过；未调用模型、未保存项目，未提交、未发布。[需求](product/releases/2.8.0-dev.84/PRD.md) · [任务](product/releases/2.8.0-dev.84/TASKS.md) · [验收](product/releases/2.8.0-dev.84/ACCEPTANCE.md)。

并行后台修复 dev.83（2026-10-03）：修复讨论入口普通文本结束后的结构化交付恢复，入口累计3次调用与只读边界保持。固定真实SDK本机协议通过；用户要求重新发送后，真实MiniMax截图原句经正式接口33.54秒、2次调用成功交付讨论，未保存项目；后端282通过/8跳过，本机健康检查通过。[需求](product/releases/2.8.0-dev.83/PRD.md) · [任务](product/releases/2.8.0-dev.83/TASKS.md) · [验收](product/releases/2.8.0-dev.83/ACCEPTANCE.md)。未提交、未发布。

2026-10-03 同轮修复：改名路径迁移脚本的 Markdown 链接正则误扫第三方 Hermes SDK，改动 8 份说明文档，触发编排入口的干净版本校验。已备份并恢复固定提交原文；同一 verify_runtime 检查由 503 转为通过，SDK Git 状态干净。未修改校验规则，未调用云端模型。

品牌改名（dev.82，2026-10-03）：统一OAKEgde Studio，技术标识oakegde/OAKEGDE；文件与两个根目录更名完成，旧路径兼容。构建、相关回归及真实HTTP检查通过；Codex后续需打开新工作区目录。[任务](<product/releases/2.8.0-dev.82/TASKS.md) · [验收](product/releases/2.8.0-dev.82/ACCEPTANCE.md>)。未提交、未发布。

标签页图标（dev.81，2026-10-03）：网站标签页图标采用用户指定 Figma 110:147 的黑色圆角底与白色四角标志；16/32/48px 直接导出；按清晰度反馈将主体等比放大25%并居中，保留透明圆角，新增多尺寸 ICO 兼容。原 logo.png 保留其他引用。 [任务与需求](<product/releases/2.8.0-dev.81/TASKS.md) · [验收](product/releases/2.8.0-dev.81/ACCEPTANCE.md>)。未提交、未发布。

Agent讨论入口（dev.80，2026-10-03）：新增只读对话主管，讨论可正常完成，结构化构建交接后才进入原团队；补齐主管历史上下文，失败显示阶段与已知原因。后端283项中275通过、8跳过，15组相关DOM、构建、真实SDK本机协议检查通过；真实MiniMax语义复验待外发授权。保留dev.79修改，未提交、未发布。[需求](<product/releases/2.8.0-dev.80/PRD.md) · [任务](<product/releases/2.8.0-dev.80/TASKS.md) · [验收](product/releases/2.8.0-dev.80/ACCEPTANCE.md>) · [架构决策](adr/0009-conversation-intake.md>)。

三路并行排查与修复（dev.79，2026-10-03）：3个子agent先只读，主agent核实后修复编排状态竞争、两类文件越界、项目ID错配及测试runner异常假成功，并更新2份过期测试。后端274项中266通过、8跳过；10份相关DOM、36项退出码检查和构建通过，原项目数据保持，本地服务健康。未提交、未发布。[需求](<product/releases/2.8.0-dev.79/PRD.md) · [任务](product/releases/2.8.0-dev.79/TASKS.md) · [发现、证据与验收](product/releases/2.8.0-dev.79/ACCEPTANCE.md>)。

Git开发基线（2026-10-03）：dev.77/78当前代码与协作规则整理为本地提交，恢复入口为 `baseline-20261003-dev78`，供后续分支和worktree使用；未推送、未发布。历史“未提交”描述保留为当时状态，详见[基线范围、验证与使用](product/releases/2.8.0-dev.78/BASELINE.md)。

异常路径调试（dev.78，2026-10-03）：修复编排进程清理覆盖业务错误、异常worker消息未受控失败，以及MCP连接失败原因被遮住的问题。后端268项中260通过、8跳过；相关DOM、本地化、排版及生产构建通过。未提交、未发布。[需求](<product/releases/2.8.0-dev.78/PRD.md) · [任务](product/releases/2.8.0-dev.78/TASKS.md) · [验收](product/releases/2.8.0-dev.78/ACCEPTANCE.md>)。

能力目录 MCP 绑定界面（dev.77，2026-10-01）：组件库导入能力详情页可绑定/检查/解绑已登记 MCP 工具，界面只提交 server_id/tool_name，绑定后仍不可拖入画布。DOM 测试、tsc、Vite 构建、本地化与排版审计通过，后端全量 264 项通过；kimi 独立复跑一致，360px 窄窗口排版已确认；真实后端端到端绑定操作未执行，未发布。[需求](<product/releases/2.8.0-dev.77/PRD.md) · [任务](product/releases/2.8.0-dev.77/TASKS.md) · [验收](product/releases/2.8.0-dev.77/ACCEPTANCE.md>)。

节点能力注册表单一来源（dev.76，2026-10-01）：`backend/app/services/node_capabilities.json` 为唯一来源，studio 副本由 `scripts/sync_node_capabilities.py` 生成，后端测试在副本缺失或漂移时失败。后端全量 264 项通过，kimi 独立复跑一致，前端构建未执行，未发布。[需求](<product/releases/2.8.0-dev.76/PRD.md) · [任务](product/releases/2.8.0-dev.76/TASKS.md) · [验收](product/releases/2.8.0-dev.76/ACCEPTANCE.md>)。

能力目录绑定已登记 MCP 工具（dev.75，2026-10-01）：confirmed 能力项可绑定/解绑已登记 server/tool 并做连接检查，接口仅接收 server_id/tool_name；check_connection 只做 live discovery，verification 保持未验证。新增 mock vehicle 与 lab 两个 MCP fixture；三层验收全绿（主 venv 263 项 skipped=8、scratch MCP runtime skipped=5 三方一致、live protocol skipped=0 仓库内 fixture 可复现），未发布。[需求](<product/releases/2.8.0-dev.75/PRD.md) · [任务](product/releases/2.8.0-dev.75/TASKS.md) · [验收](product/releases/2.8.0-dev.75/ACCEPTANCE.md>)。

密钥登录默认关闭（dev.74，2026-09-29）：网站访问密钥代码完整保留、默认不启用，设 OAKEGDE_SITE_ACCESS=1 恢复原有拦截；关闭时后端直通、前端探测自动解锁，模型服务商 API 密钥功能不变。后端全量测试、TestClient 双路径实测、前端构建与审计通过，未提交、未发布。[需求](<product/releases/2.8.0-dev.74/PRD.md) · [任务](product/releases/2.8.0-dev.74/TASKS.md) · [验收](product/releases/2.8.0-dev.74/ACCEPTANCE.md>)。

编排契约稳健性（dev.73，2026-09-29）：依据20场景评测的工具拒绝分布，多余字段反馈附修复提示，flowVersion无歧义写法归一化，宿主超时返回结构化诊断。后端全量测试通过；新代码对照复跑未执行，未提交、未发布。[需求](<product/releases/2.8.0-dev.73/PRD.md) · [任务](product/releases/2.8.0-dev.73/TASKS.md) · [验收](product/releases/2.8.0-dev.73/ACCEPTANCE.md>)。

英文遗漏修复（dev.72，2026-09-28）：补齐系统消息与内置节点显示，缓存组件响应语言切换；审计、DOM回归、构建和浏览器抽样通过。原文不外发，未提交、未发布。[需求](<product/releases/2.8.0-dev.72/PRD.md) · [任务](product/releases/2.8.0-dev.72/TASKS.md) · [验收](product/releases/2.8.0-dev.72/ACCEPTANCE.md>)。

MCP搜索栏（dev.71，2026-09-27）：紫色加号位于搜索框右侧、同排等高；窄栏保持单行。真实浏览器与字体审计通过，未提交、未发布。[需求](<product/releases/2.8.0-dev.71/PRD.md) · [任务](product/releases/2.8.0-dev.71/TASKS.md) · [验收](product/releases/2.8.0-dev.71/ACCEPTANCE.md>)。

动态英文范围最终确认（dev.70）：用户明确“不允许外发，保留原文”。已撤回本轮动态翻译显示层、队列与接口；仅保留固定界面英文，用户输入、项目名、模型回复和第三方资料保持原文。本轮未向外部提供商发送翻译内容，本机试验失败作为历史证据保留。

资源维护补充（2026-09-27）：按用户要求删除旧保时捷Taycan模型car-concept.glb及当前构建副本，清理GLTF加载、材质处理和预加载；旧空间组件使用已有程序化车辆，现用SU7资源未变。TypeScript与Vite构建通过；远程保时捷资源404、SU7资源200。历史交付包/实验快照保留；未提交、未发布。

全站界面语言（dev.70）：统一英文词典与响应式订阅，覆盖固定界面、内置节点说明、HMI和系统提示；语言刷新持久化，草稿/项目/模型及外部资料原文保留。构建、翻译/字体审计与相关DOM回归通过，浏览器抽样通过；外部原文、图片内文本与语音语言不改。未提交、未发布。 [需求](<product/releases/2.8.0-dev.70/PRD.md) · [任务](product/releases/2.8.0-dev.70/TASKS.md) · [验收](product/releases/2.8.0-dev.70/ACCEPTANCE.md>)。维护日期2026-09-27。

本地推理等待与视频展示（dev.69）：按模型设置期限，OpenSparX180秒加客户端5秒传输宽限；网页取消关闭本地上游；视觉输入保留原有2560上限与原图精度（1280实验因漏判撤回）。发送键复用取消，失败原因直接展示。浮窗无来源叠字、视频水印已处理，右侧保留演示来源。验证与限制见本轮验收，未提交、未发布。 [需求](<product/releases/2.8.0-dev.69/PRD.md) · [任务](product/releases/2.8.0-dev.69/TASKS.md) · [验收](product/releases/2.8.0-dev.69/ACCEPTANCE.md>)。维护日期2026-09-27。

儿童关怀宣传演示（2026-09-27）：更新用户指定录像，实际图片复验触发播放通过；首次超时与回放边界保留在[dev.68验收](product/releases/2.8.0-dev.68/ACCEPTANCE.md)。

同轮MiniMax续验：按用户指令改用MiniMax-M3。修复后的正式既有候选续作90.85秒、20次共享编排尝试，四角色有效成果、真实模型、两组隔离HMI、独立上下文内容核验与模型最终提交全部通过，can_apply=true。109项最终回归通过；21个既有项目保持。六次空图构图与前次续作失败保留，缺失设备单/多模式正确标注不可执行但未正式提交；不同代码/模型不混算成功率。版本仍2.8.0-dev.68，未提交、未发布。

最新分工编排：[dev.68需求](<product/releases/2.8.0-dev.68/PRD.md) · [任务](product/releases/2.8.0-dev.68/TASKS.md) · [验收](product/releases/2.8.0-dev.68/ACCEPTANCE.md>)。沿用固定 Hermes SDK，新增主管与需求、状态/路径设计、节点搭建、测试四个独立角色；同一配置模型，版本化提案由主管统一应用。现有图执行器、锁定验收和实际内容核验保持。单/多模式可切换，服务端默认 team。 87项相关本地检查通过；真实单/多对照已完成，更多调用尚未证明可靠性收益，耗时和Token代价已记录。缺失设备动作可交付明确不可执行的设计；未提交、未发布。维护日期2026-09-27。

 dev.68补充：主项目87项回归、本地HTTP鉴权与模式契约通过，21个项目保持。两项可运行用例team 2/2、single 1/2；缺失设备用例与安装后正式SSE成功生成因网关403余额/配额类限制待复验，未计为通过。

最新 HMI 分工：[dev.67 需求](<product/releases/2.8.0-dev.67/PRD.md) · [任务](product/releases/2.8.0-dev.67/TASKS.md) · [验收](product/releases/2.8.0-dev.67/ACCEPTANCE.md>)。左侧乘员交互与本机播报，右侧链路/节点/模型性能验证；已完成本地模型与浏览器验证，实车与准确率不在完成范围。

最新仿真连续性修复：[dev.66需求](<product/releases/2.8.0-dev.66/PRD.md) · [任务](product/releases/2.8.0-dev.66/TASKS.md) · [验收](product/releases/2.8.0-dev.66/ACCEPTANCE.md>)。同一场景切换编排/仿真不再终止请求；6组DOM、21项会话/执行测试及构建通过。真实浏览器复测因工具连续超时未完成；跨项目或关闭仍取消，不保证刷新/浏览器关闭后继续执行。

同轮Claude验证完成：用户明确授权配置的fucheers.top网关后，Claude自主修复并提交30节点可撤销设置图；原3组13步与构图前锁定的2组12步保留输入均通过真实模型运行和内容核验。6组异常数值/边界本地模型夹具及3种启动输入通过；已新增“Claude 临时座舱设置（撤销与恢复）”，原20个项目保持。核验证据错误定位与格式说明补充，85项相关检查通过；历史失败、保留测试首次网络受限及一次错误重核验均留档。版本仍2.8.0-dev.65，未提交、未发布；仅所列输入和模拟HMI，不代表实车、完整浏览器或任意场景可靠。 主依据：[dev.65验收](product/releases/2.8.0-dev.65/ACCEPTANCE.md)。维护日期2026-09-27。

最新动态HMI组合：[dev.65需求](<product/releases/2.8.0-dev.65/PRD.md) · [任务](product/releases/2.8.0-dev.65/TASKS.md) · [验收](product/releases/2.8.0-dev.65/ACCEPTANCE.md>)。通用流程的已登记HMI控制支持类型保持的controlValue.$ref绑定，JSON模型可经显式HMI配置组合状态与恢复；实际执行的类型、范围、整数、选项检查保持。92项后端、79项前端及生产构建通过。补充6个固定SDK终止原因码，未知值与原始错误文本仍不透出。真实API形成28节点草稿，后续三次试跑均在启动输入契约处失败，未保存示例；当时继续云端修复因自动审批要求具体外发授权而暂停；后续Claude授权与结果见本轮补充。 维护日期2026-09-27，状态为开发中，主依据为该轮验收。

同轮事件输入修复：无入边的事件入口先处理本次文本/JSON/图片载荷，事件元数据独立保留，解决text嵌套对象导致条件失败。104项前端、71项后端及构建通过；原28节点图三组启动步骤离线回放通过，0模型调用/0写入。完整计划使用显式模型夹具仍在撤销分支失败，未算真实API验收；当时外发授权待答复，后续见Claude补充。 主依据：[dev.65验收](product/releases/2.8.0-dev.65/ACCEPTANCE.md)，维护日期2026-09-27。

最新模型输出恢复：[dev.64需求](<product/releases/2.8.0-dev.64/PRD.md) · [任务](product/releases/2.8.0-dev.64/TASKS.md) · [验收](product/releases/2.8.0-dev.64/ACCEPTANCE.md>)。JSON模型节点新增显式jsonRepairAttempts=0–2（默认0）。仅格式/字段类型错误可请求同一模型修复；不重放上游、不提前执行下游，共用节点期限与试跑预算。80项相关前端、64项后端和生产构建通过；文字/数值两种真实API修复通过，首个错误响应为明确注入。未改输入过滤、未保存项目，完整浏览器及自然错误发生率未验收。 维护日期2026-09-27，状态为本地开发验证，主依据为该轮验收记录。补充正式自主构图两次均中断，无可提交候选；原因待定位，未计入通过。

同轮构图诊断补充：终止元数据进入结果/错误响应，仅允许阶段、计数、已知SDK错误分类等安全字段；不输出提供商错误原文、推理或密钥。真实正式构图发现set_data.data多包一层导致配置被忽略，现于改图入口明确拒绝并指出修复位置。54项相关检查通过，原失败保留；终止元数据不改变可应用门槛。 维护日期2026-09-27，主依据为[dev.64验收](product/releases/2.8.0-dev.64/ACCEPTANCE.md)。

同轮绑定预检补充：通用流程在执行前检查变量根/路径及输出节点引用；云端自动试跑检查固定模型服务绑定与配置。83项前端、78项后端及构建通过，8个既有通用项目未新增错误。正式API依据新反馈自行修复上一轮失败图，一次试跑通过原两组输入和内容核验；后续换行修复运行通过，但内容核验两次错误仍阻止应用，未保存项目。 维护日期2026-09-27，主依据为[dev.64验收](product/releases/2.8.0-dev.64/ACCEPTANCE.md)。

同轮核验格式反馈补充：同一证据允许的一次错误重核验附带安全字段/覆盖地址反馈，新增稳定契约错误码，预算与语义门槛保持。95项后端检查通过；三个新输入的真实API重核验与原两组正式SSE回归通过，节点/连线/坐标及锁定测试保持。新增实验示例“API 主题短句（预检与核验修复示例）”，正式接口回读一致；历史核验失败保留，完整浏览器/开放场景仍未验收。 维护日期2026-09-27，主依据为[dev.64验收](product/releases/2.8.0-dev.64/ACCEPTANCE.md)。

最新内容核验：[dev.63需求](<product/releases/2.8.0-dev.63/PRD.md) · [任务](product/releases/2.8.0-dev.63/TASKS.md) · [验收](product/releases/2.8.0-dev.63/ACCEPTANCE.md>)。Hermes实际输出的模型辅助核验已应用，证据引用和版本失效控制是否可应用；71项相关后端、8项前端门槛检查及正式SSE拒绝→修复验证通过。新输入的内容矛盾被拒绝并保留，候选并非全面通过；不代表独立事实认证或任意场景可靠。

同轮补充：修复删除节点及关联连线的事务误报，62项相关检查通过；API生成十节点动态片段分支图，5组正式、3组新输入的运行/内容核验及7组离线注入通过，新增实验示例并回读一致。初始失败、核验重试和编排超时保留；画布布局/完整浏览器未验收。普通英文输入误报修复仍待明确授权，未应用。

核验恢复同轮补充：同版本运行通过后复用执行证据；服务或契约错误限次重核验，passed/needs_changes不重抽，改图仍失效。70项相关检查、十节点真实模型调用计数和正式SSE executed→cached验证通过。保留错误历史，待授权输入过滤修改未应用。

最新外部工具：[dev.62需求](<product/releases/2.8.0-dev.62/PRD.md) · [任务](<product/releases/2.8.0-dev.62/TASKS.md) · [验收](product/releases/2.8.0-dev.62/ACCEPTANCE.md>) · [MCP接入说明](product/MCP_RUNTIME.md>)。已登记MCP的真实调用、返回值分支与模型组合已应用主工程；通用结果断言补充、独立数据变化及正式鉴权执行复验通过。早期失败与预算耗尽保留，具体计数/范围见验收；主工程未登记业务服务，测试夹具不代表真实业务数据。 同轮补充参数错误反馈；局部编辑配置保留通过，但新讲解候选形式通过、人工内容验收失败，通用内容核验仍需补齐。

最新执行恢复：[dev.61需求](<product/releases/2.8.0-dev.61/PRD.md) · [任务](product/releases/2.8.0-dev.61/TASKS.md) · [验收](product/releases/2.8.0-dev.61/ACCEPTANCE.md>)。已保存通用图的稳定事件快照、流程与模拟车辆恢复已应用；104项后端、134项既有核心前端与10项新恢复测试通过，正式HTTP/真实模型和双项目跨进程恢复通过。浏览器停在登录页，完整交互未验收。中途崩溃不自动重放，节点级续跑仍未完成。

最新持续互动：[dev.60需求](<product/releases/2.8.0-dev.60/PRD.md) · [任务](product/releases/2.8.0-dev.60/TASKS.md) · [验收](product/releases/2.8.0-dev.60/ACCEPTANCE.md>)。同组节点可按新事件反复执行并按配置退出；API自主心情循环及独立四轮、新会话复验通过。23文件已应用；正式HTTP模型循环、MiniMax正式SSE收藏循环及独立8轮通过，新增两个示例。该轮未纳入无等待自动环路和持久会话；稳定事件持久化后续见dev.61。

最新图片能力：[dev.59需求](<product/releases/2.8.0-dev.59/PRD.md) · [任务](product/releases/2.8.0-dev.59/TASKS.md) · [验收](product/releases/2.8.0-dev.59/ACCEPTANCE.md>)。通用图片消息、等待模态与实际动作回执已实现；API自主视觉图及独立图片/恢复回放已通过，24文件已应用；两家正式图片推理、MiniMax局部编辑通过，新增“看图调灯”示例。完整浏览器和广泛视觉质量未验收。

最新智能体接入：[dev.58需求](<product/releases/2.8.0-dev.58/PRD.md) · [任务](product/releases/2.8.0-dev.58/TASKS.md) · [验收与启用](product/releases/2.8.0-dev.58/ACCEPTANCE.md>)。官方 Hermes 通过工具局部构图与实际引擎试跑；支持调用方固定验收用例。已应用主工程并启用；正式SSE温控、JSON文字和MiniMax局部编辑通过，新增两项示例。验证仅覆盖列明输入；未完成的通用能力继续保留。

最新执行反馈：[dev.57](<product/releases/2.8.0-dev.57/PRD.md) · [任务](product/releases/2.8.0-dev.57/TASKS.md) · [验收](product/releases/2.8.0-dev.57/ACCEPTANCE.md>)。正式生成→真实图试跑→反馈修复已应用主工程；真实API比喻场景4组及安装后独立输入通过，新增可打开示例；车辆分支最新遇网关超时，未完成事项见验收。范围仅为所列输入/断言，不承诺任意场景可靠。

最新编排能力：[dev.56 通用编排](<product/releases/2.8.0-dev.56/PRD.md) · [任务](product/releases/2.8.0-dev.56/TASKS.md) · [验收](product/releases/2.8.0-dev.56/ACCEPTANCE.md>)。可恢复图与阶段视图已实现，Hermes正式服务接入属于后续阶段；保留dev.55布局修改。

最新编排布局：[dev.55](<product/releases/2.8.0-dev.55/PRD.md) · [验收](product/releases/2.8.0-dev.55/ACCEPTANCE.md>)。按用户截图居中模式组、移除工作台标题，两种桌面尺寸核对通过。

最新首页与主题：[dev.54 两行项目与蓝紫色强调](<product/releases/2.8.0-dev.54/PRD.md) · [验收](product/releases/2.8.0-dev.54/ACCEPTANCE.md>)。实现与检查以本轮记录为准。

最新首页视觉：[dev.53 电脑品牌图](<product/releases/2.8.0-dev.53/PRD.md) · [验收](product/releases/2.8.0-dev.53/ACCEPTANCE.md>)。用户参考图生成透明素材并替换首页Logo，标题样式保持。

最新 HMI 集成：[dev.52 需求](<product/releases/2.8.0-dev.52/PRD.md) · [任务](product/releases/2.8.0-dev.52/TASKS.md) · [验收](product/releases/2.8.0-dev.52/ACCEPTANCE.md>)。Tesla 设置/媒体/参考导航与 SU7 车模共存，53个控制项通过共享状态与节点回读联动。之前已授权的桌面组件文档随本轮补齐；并行dev.49–51的记录与未完成项保留。

Latest chat fix: [2.8.0-dev.51](<product/releases/2.8.0-dev.51/PRD.md) - [tasks](product/releases/2.8.0-dev.51/TASKS.md) - [acceptance](product/releases/2.8.0-dev.51/ACCEPTANCE.md>). Automated checks passed; browser two-project verification incomplete due to tool timeouts. Other parallel iterations retain their own status.

最新画布迭代：[dev.50 节点整理](<product/releases/2.8.0-dev.50/PRD.md) · [任务](product/releases/2.8.0-dev.50/TASKS.md) · [验收](product/releases/2.8.0-dev.50/ACCEPTANCE.md>)。真实自拍六节点整理后无重叠；完整交互验收仍有待补项。并行dev.49模型库迭代保留其独立进度。

最新目录界面：[dev.49](<product/releases/2.8.0-dev.49/PRD.md) · [验收](product/releases/2.8.0-dev.49/ACCEPTANCE.md>)。模型/MCP独立导航、抽屉与共创等宽、组件分层、MCP单列卡片。页面视觉验收尚未完成。

当前功能迭代：[dev.48 HMI氛围灯仿真](<product/releases/2.8.0-dev.48/PRD.md) · [任务](product/releases/2.8.0-dev.48/TASKS.md) · [验收](product/releases/2.8.0-dev.48/ACCEPTANCE.md>)。用户确认HMI颜色/亮度反馈与姿势展示即可完成本轮体验，不要求连接实车；两种衣物样例的真实模型推荐、HMI状态变化和退出恢复已验证。模拟事件输入不代表视觉识别精度；网关超时和旧快照差异见验收。

最新文字迭代：[dev.47 文本分类与可读性](<product/releases/2.8.0-dev.47/PRD.md) · [任务](<product/releases/2.8.0-dev.47/TASKS.md) · [验收](product/releases/2.8.0-dev.47/ACCEPTANCE.md>)。文字主依据：[TYPOGRAPHY](product/TYPOGRAPHY.md>)；标题、正文、标签、辅助说明等已接入统一角色；同轮修正画布初始为100%，避免少量节点被放大。

最新生成修复：[dev.46节点草稿](<product/releases/2.8.0-dev.46/PRD.md) · [任务](product/releases/2.8.0-dev.46/TASKS.md) · [验收](product/releases/2.8.0-dev.46/ACCEPTANCE.md>)。结构化输出、草稿展示与运行阻断已实现；真实自拍请求已在网页显示6节点不可执行草稿，语义与布局限制见验收。该版未接入自拍识别或氛围灯执行器；dev.48新增HMI氛围灯mock，详见当前迭代。

最新局部视觉调整：[dev.45 HMI背光与水面倒影](<product/releases/2.8.0-dev.45/PRD.md) · [任务](product/releases/2.8.0-dev.45/TASKS.md) · [验收](product/releases/2.8.0-dev.45/ACCEPTANCE.md>)。仅灯光/舞台氛围，dev.44节点规范继续有效。

最新界面迭代：[dev.44 节点规范与共创细化](<product/releases/2.8.0-dev.44/PRD.md) · [任务](<product/releases/2.8.0-dev.44/TASKS.md) · [验收](product/releases/2.8.0-dev.44/ACCEPTANCE.md>)。节点设计主依据：[NODE_DESIGN](product/NODE_DESIGN.md>)（2026-09-25，当前规范，公共框架已实施；复杂内部细节仍有迁移项）。并行dev.43 Claude接入记录继续有效。

产品编号以根 [VERSION](<../VERSION) 为唯一登记值；迭代历史见 [CHANGELOG](../CHANGELOG.md>)。本页文字验收见dev.47记录，节点框架见上述dev.44记录；dev.41模型目录与dev.42设计规范状态继续保留。

| 事项 | 当前状态 | 后续动作 / 依据 |
| --- | --- | --- |
| Claude编排接入 | 用户指定网关已接通，真实结构化输出和一次完整生成检查通过；同轮修复节点预览语法错误，工作台恢复；非全面质量验收 | [dev.43验收](product/releases/2.8.0-dev.43/ACCEPTANCE.md)；当前仅本地文档更新 |
| 高通模型目录 | AI模型分类接入官方235项目录与封面双列卡片；本机验证通过，未发布 | [dev.41验收](product/releases/2.8.0-dev.41/ACCEPTANCE.md)；Cybertools部署后续独立集成 |
| 项目文档管理 | 主入口、分类、维护规则已建立 | 后续每轮按第 5 节维护；不是后台自动同步服务 |
| 竞品调研 | Coze、Dify、Kiro 的公开机制与可借鉴建议已归档；未横向实测 | [AI 需求定义与工作流编排调研](research/AI_REQUIREMENTS_WORKFLOW_COMPETITORS.md)；后续采纳时进入独立需求与验收 |
| 节点定义 | v0.1 草案已写，尚未接入运行时 | 共同评审边界，再实现注册表与执行契约；[节点定义](product/NODE_CONTRACTS.md) |
| 设计规范 | 参数基线已提取；dev.47实施文字角色与源码清单 | [文字规范](product/TYPOGRAPHY.md)、[验收](product/releases/2.8.0-dev.47/ACCEPTANCE.md)；完整手机工作台与全站无障碍未验收 |
| 开放场景编排准确性 | 尚未达到任意愿望均可靠的目标 | 分开验证结构、实际运行与体验质量；[dev.33 验收](product/releases/2.8.0-dev.33/ACCEPTANCE.md) |
| 20 条基准 | 主要覆盖两个场景与局部能力，工作未收尾 | 后续补不同用户愿望，不能当作全场景通过；[dev.34 任务](product/releases/2.8.0-dev.34/TASKS.md) |
| HMI 多类型回复 | 部分数据层完成，生产接入与视觉验收未完成 | 保留明确未完成状态；[dev.29 验收](product/releases/2.8.0-dev.29/ACCEPTANCE.md) |
| 产品总 PRD | dev.4 历史评审稿，部分内容已过时 | 后续独立整理；当前范围先看 CONTEXT 与领域文档 |
| 交付与恢复 | dev.78本地Git开发基线；dev.79/80为未提交修改，未正式发布 | [基线与恢复范围](product/releases/2.8.0-dev.78/BASELINE.md)；[版本规则](product/VERSIONING.md) |

未完成事项保留原所属迭代；开启新迭代不表示上一轮全部完成。上表记录本次核对状态，后续发生变化时更新依据与日期，不凭编号推定完成。

## 3. 子文档台账：每类问题去哪里找

| 类别 | 主依据 | 管理什么 | 状态 / 更新时机 |
| --- | --- | --- | --- |
| 产品定位与术语 | [CONTEXT](../CONTEXT.md) | 产品边界、对象关系、已发生的范围变化 | 当前上下文；目标、术语或范围改变时更新 |
| 竞品调研与产品参考 | [AI 需求定义与工作流编排调研](research/AI_REQUIREMENTS_WORKFLOW_COMPETITORS.md) | 三家的需求定义、生成与检查机制，以及 OAKEgde Studio 可借鉴做法 | 2026-09-25官方资料调研；建议未直接成为产品规范，开始选型或新增实测时复核 |
| 产品总体需求 | [产品 PRD](product/PRD.md) | 产品目标、角色、范围与总体需求 | 历史评审稿待重整；不作为当前已实现清单 |
| 设计规范 | [DESIGN_GUIDELINES](product/DESIGN_GUIDELINES.md) | 各界面职责、视觉约定、交互规则与验收边界 | 当前约定汇总；界面原则或组件行为改变时更新 |
| 设计参数与组件基线 | [DESIGN_TOKENS](product/DESIGN_TOKENS.md) | 当前源码颜色、字体、尺寸、组件入口、响应式现状与差异 | 2026-09-25源码提取；非全站视觉验收；相关实现变更时维护 |
| 界面语言 | [LOCALIZATION](product/LOCALIZATION.md) | 中英文文案、原文边界、持久化与检查入口 | 2026-09-27 dev.70已实现；随UI文案维护 |
| 文字分类与密度 | [TYPOGRAPHY](<product/TYPOGRAPHY.md) / [源码清单](product/TYPOGRAPHY_INVENTORY.json>) | 字号、行高、文字角色、区域归类与特殊单位例外 | 2026-09-26 dev.47已实施；文字变更时更新清单与验证 |
| HMI 页面与共享控制 | [HMI_INTEGRATION](<product/HMI_INTEGRATION.md) + [HMI_WIDGETS](product/HMI_WIDGETS.md>) | 页面、节点控制项、服务扩展与验证边界 | 2026-09-26，dev.52实施与本机验证；用户新Figma为主依据 |
| 设计工具使用 | [Apple 设计技能约定](product/APPLE_DESIGN_SKILLS.md) | 技能选择、参考优先级、使用方法 | 工具约定；不覆盖用户选择和当前领域规范 |
| MCP实际工具接入 | [MCP_RUNTIME](product/MCP_RUNTIME.md) | 登记、权限、独立SDK与执行契约 | 2026-09-27当前实现；以dev.62实际验收为准 |
| 节点与执行契约 | [NODE_CONTRACTS](product/NODE_CONTRACTS.md) | 基础节点、输入输出、实现、依赖、失败与证据 | v0.1 草案，未全面实施；能力与契约变化时更新 |
| 场景定义 | [节点定义中的两类场景](product/NODE_CONTRACTS.md#5-两个场景按同一层级编排) + 对应迭代 PRD | 目标、触发、路径、异常、可验收结果 | 当前以设计示例/迭代规格管理；独立场景规范库待建立 |
| 模型分工与接入 | [高通模型目录](<product/QUALCOMM_MODEL_CATALOG.md) + [节点契约](product/NODE_CONTRACTS.md) + [dev.33 接入需求](product/releases/2.8.0-dev.33/PRD.md>) | 任务能力、提供商、云端/端侧边界及验证范围 | 设计与已实现分开；路由、提供商、模态改变时更新 |
| 架构决策 | [ADR 目录](<adr/) | 为什么选当前方案、影响及被替代关系；当前 0001–0009；新增[0009 对话主管与构建交接](<adr/0009-conversation-intake.md)，其余近期决策：[0005 多角色分工编排](adr/0005-multi-role-orchestration.md)、[0006 编排契约诊断](adr/0006-orchestration-contract-diagnostics.md)、[0007 站点门禁默认关闭](adr/0007-site-access-default-off.md>)、[0008 目标架构与实车接入](adr/0008-target-architecture-and-device-access.md>) | 决策记录；重要跨模块取舍改变时新增或标记替代 |
| 开发者文档 | [开发者入口](developer/README.md) / [维护记录](developer/MAINTENANCE.md) | 本地启动、概念、源码、配置、API、测试与排障 | 2026-10-05首版；依据当前源码与专题规范，验证和缺口单列；相关实现变化时同步 |
| 开发流程 | [PRODUCT_WORKFLOW](<product/PRODUCT_WORKFLOW.md) / [迭代模板](product/ITERATION_TEMPLATE.md>) | 需求→任务→验证→交付的工作方法 | 流程基线；协作方式改变时更新 |
| 版本与进展 | [VERSION](<../VERSION) / [版本规则](product/VERSIONING.md) / [变更记录](../CHANGELOG.md>) | 产品编号、发布条件、每轮交付摘要 | 编号只在 VERSION 登记；摘要必须符合实际结果 |
| Git开发基线 | [dev.78基线](product/releases/2.8.0-dev.78/BASELINE.md) | 本地提交、标签、覆盖范围与worktree起点 | 2026-10-03；开发快照，非完整业务数据备份或正式发布 |
| 验证与限制 | [迭代记录目录](product/releases/) 中的 ACCEPTANCE.md | 环境、用例、结果、证据与未完成项 | 历史证据，按版本适用；不能覆盖后来修改 |
| 启动、接口与交付 | 第 7 节工程文档 | 安装、运行、API、设备与部署步骤 | 按目标环境核验；接口资料不等于已接入能力 |

维护责任：用户决定产品目标和体验取舍；执行本轮修改的人或 AI 负责同步领域文档、迭代记录与本页。专门的模型、设计、设备负责人尚未指派，不虚构负责人。日常修订沿用已授权范围，无需为文档编号重复确认。

## 4. 文档冲突时以什么为准

- 用户最新明确要求先记录到受影响领域文档，并注明覆盖范围；旧提案不能撤销新决定。
- “希望做成什么”看对应领域规范及迭代需求；“实际上做到了什么”看实现与指定环境的验收记录。二者有差距就记录差距，不互相冒充。
- 同一主题选一份主依据；其他文档使用链接与简短摘要。主文档不复制整份 PRD、节点目录或设计细则。
- 只有同主题、同范围的明确替代说明才覆盖旧规则；日期更新不自动推翻不同环境或不同模块的约定。
- 无法从记录判断冲突时，先标为“待澄清”，继续无争议工作；不要自行恢复用户撤销的功能。
- 历史文档保留，开头标明适用版本和替代入口。归档是取消当前指导地位，不是删除文件、代码或项目数据。

## 5. 每轮如何持续维护

**开始前**：读本页、CONTEXT、VERSION/CHANGELOG、当前迭代记录及本任务相关领域文档；先确认哪些是草案、已实现或历史证据。

**修改时**：先更新受影响规则或需求，再实现；发现额外决策记录在对应文档，重要架构选择写 ADR。沿用既有文档，不为同一个主题反复新建“最终版”。

**结束前**：同步任务与验收，记录实际改动、检查、未完成和限制；更新本页状态/链接/维护日期及变更记录。没实测就写未实测；不把文档草案写成产品功能。

| 本次改了什么 | 至少同步哪些文档 |
| --- | --- |
| 产品目标或范围 | CONTEXT、相关 PRD；影响总方向时更新本页 |
| 视觉或交互 | DESIGN_GUIDELINES 对应规则、迭代需求/验收；跨模块取舍补 ADR |
| 节点或模型职责 | NODE_CONTRACTS、相关运行契约/实现说明、受影响用例和验收 |
| 场景行为 | 该场景规格或迭代 PRD、输入与异常用例、验收；通用能力变化再更新节点定义 |
| 接口、环境或启动方式 | 对应工程文档、实现/依赖限制和运行验证记录 |
| 新增/替代文档 | 本页台账、被替代文档的说明；检查所有受影响相对链接 |
| 开始独立迭代 | VERSION、CHANGELOG、迭代三件套、本页当前迭代链接；遵循版本规则 |

已有 [AGENTS.md](../AGENTS.md) 将这套要求纳入后续 AI 工作约定。它在任务执行时生效，不意味着未打开项目时持续监控，也不保证其他未遵守约定的工具会自动更新文档。

## 6. 新文档的最小要求

新增长期规范开头写：目的、状态、维护日期、适用范围、主文档返回链接；涉及替代时链接旧文档并说明改变范围。短小修正可留在已有文档，不强制拆文件。

状态按用途区分：**草案**（待讨论）、**当前规范**（指导后续工作）、**实施中**（有未完成项）、**验收记录**（具体版本与环境的事实）、**历史参考**（不再指导当前功能）。文档状态不代替功能状态；“规范已写完”不等于“代码已实现”。

每轮 PRD、TASKS、ACCEPTANCE 继续使用现有模板。文档更新与代码变更最终应进入同一可追溯提交；当前dev.78恢复入口见[Git基线](product/releases/2.8.0-dev.78/BASELINE.md)；早期迭代是否可独立恢复，以真实提交记录为准。

## 7. 工程与历史资料

- [macOS 本地启动与迁移](devops/05_macOS_Local.md)：当前 Mac 环境入口，操作前仍需核对服务与路径。
- [维护性说明](<devops/01_Maintainability_Guide.md)、[开发与 SA8397 交付](../README开发文档.md)、[SA8397 使用](../DELIVERY_README使用文档.md>)。
- [车控接口](../Atomic_service_car_control_http_api.md)、[OpenAPI](api/01_OpenAPI_Guide.md)、[FastVLM](api/02_FastVLM_Guide.md)：接口资料按实际服务核验，不默认都已接入。
- [SDK 导出](<devops/02_SDK_Export_Guide.md)、[SA8397 部署记录](<devops/03_SA8397_ADB_Deployment_Log.md)、[Web 部署](devops/04_Web_Studio_Production_Deployment.md>)、[桌面版](../desktop/README.md>)：目标环境与产物分别验收。
- [当前实现架构](architecture/02_Current_Implementation_Architecture.md)：原dev.74组件快照，第4节更新至dev.80对话入口；其余领域未全面复审，2026-10-03维护，依据代码与ADR 0005–0009。
- [目标架构](architecture/03_Target_Architecture.md)：MVP 方向与边界（单体、能力注册表、可插拔设备适配器、8397 三层验收），当前规范，2026-09-30 用户确认，主依据 ADR 0008。
- [历史架构规划](<architecture/01_System_Architecture.md)、[dev.4 产品评审](product/PRODUCT_REVIEW.md)、[维护清理记录](maintenance/CLEANUP_REPORT.md>)：历史参考，不自动形成当前需求。
- [Studio 历史说明](../studio/README.md)、根目录“如何启动”、旧 docker-compose 配置保留；其多领域、Linux 或缺失 web/nginx 路径描述不作为当前 Mac 工作台启动与范围依据。

本轮未移动或删除历史文件。后续要新增专题，先在本页登记用途与主依据；内容确实增长再拆子文档。


### 儿童关怀演示录像替换（2026-09-27）

用途：当前儿童关怀演示素材配置；状态：正式页面已验证；维护日期：2026-09-27。风险分支播放用户指定的新录像，仍标识演示回放。主依据：[dev.65验收](product/releases/2.8.0-dev.65/ACCEPTANCE.md)。


本轮进行中：用户20场景single/team对照，固定MiniMax-M3和源码，各场景两种模式首次结果分别留档。规程与进度见[dev.68验收](product/releases/2.8.0-dev.68/ACCEPTANCE.md)；当前不预告成功率。

运行资源交付补充（2026-10-10，版本仍dev.107）：源码仓库补齐本地图片、字体和SU7资源；按最新指示排除语音识别模型；取得方式见[快速开始](developer/QUICKSTART.md)，[资源清单](developer/RUNTIME_ASSETS.json)登记路径/字节/SHA-256。用途为可复核的资产交付清单，主依据为资源原文件与旁置来源声明；不代表日常5175或产品正式发布。
