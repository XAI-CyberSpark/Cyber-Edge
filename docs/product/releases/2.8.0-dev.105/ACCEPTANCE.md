# dev.105 验收：JSON输入、测试前置检查与七次真实对照

维护日期：2026-10-09。状态：实现、所列自动验证与7次真实实验完成；整体编排可靠性仍未达标。未提交、未发布，不更新5175。主依据：[需求](PRD.md)、[任务](TASKS.md)、[精简证据与错误原文](EVIDENCE.json)、[测试结果](TESTS.txt)。

## 结论

可应用 **2/7**：C-Claude **2/2**，C-MiniMax **0/2**，复杂A-MiniMax **0/3**。两个Claude候选都使用JSON入口与直接对象测试输入，并通过真实编排、图执行断言及独立上下文内容核验；图中采用规则/仿真动作，没有图内LLM调用。此结果证明原C-Claude对象输入阻塞已消除，不证明任意场景稳定。

MiniMax简单组的直接阻塞为字符串断言与数字/布尔实际值不符、以及编排模型响应截断。复杂组三次主要失败在上游数据形状/字段、错误断言路径、同case记忆准备及多次修复后失去当前版本执行证据。不能把这些统称为模型输出JSON错误，也不能用本轮给出统计意义的成功率结论。

## 实现与边界

- 新增`inputContract.ts`，JSON入口支持对象、JSON字符串、text包装，严格校验outputFields并投影声明字段；具名事件使用同一解析器。后端trial运行生产TS引擎，不另写Python转换规则。
- `testPlanPreflight.ts`与只读Node/esbuild桥在test_plan提交、inspect及执行前定位输入形状、缺字段和类型错误。错误带case/step、入口节点、字段与错误码；拒绝的计划不锁定，不先调用模型。
- `contractErrors.ts`与运行事件保留input_contract/model_output/graph_logic类别及码；后端trial补assertion类和repair_hint。`contract_diagnostics`独立于既有参数归一化diagnostics，避免工具入口覆盖。有效waiting状态但值断言失败时不再误报状态不符。parseModelObject/validateModelFields剩余调用均位于实际模型响应处理；输入节点使用专用解析器。
- 能力主目录及生成副本、brief、test_plan工具说明、执行Schema明确直接对象推荐形状和outputFields作用。每case独立会话/车辆/state/记忆；准备和多轮读取放在同一个case的多个step。
- 等待检查按可达路径给出PLAN_WAITING_PATH警告（包括条件分支可能性），不执行表达式、不自动改status或断言。记忆检查按真实buffer读写角色和同case准备路径给PLAN_CASE_MEMORY_ISOLATION警告；不按名称或场景词猜测业务。

静态限制必须保留：动态条件、join/interrupt、循环、interaction内部阶段、任意模型语义不能静态证明。记忆警告仅覆盖可见buffer读写关系；没有全面追踪state模拟记忆或自然语言假设。A3的“已有记忆”用例仍漏报：图把信息存进state，名为memory_read的buffer节点下游没有llm，按实际契约是写入而非读取；检测器没有依据节点名字硬判读意图。等待警告仍指出可能停在录入节点。不能将本次静态检查称作完整路径/记忆证明。

计划锁定、三次trial、40次/720秒共享预算、780秒宿主预算、默认模式、Hermes SDK均保持。未加入场景特判或固定拓扑。

## 测试与收尾边界修正

初始对象输入/错误归因2项回归先失败再通过。新增前端10项、后端10项输入契约回归，覆盖对象/字符串/text包装、字段缺失及定位、分类、具名事件、提交原子性、inspect重查、waiting和跨case记忆警告。

七次实验完成后，修正复核中新发现的通用边界：JSON对象的`type="image"`/`content`是业务字段，不能先触发媒体检查或被具名事件注入text包装。仅调整GraphEngine与FlowSessions的JSON优先级，普通图片检查仍保留；新增前后端回归先红后绿。七次真实对照期间326份实现文件完全冻结；此收尾修正发生在实验后，两份文件最终哈希单列在EVIDENCE。未将七次云实验冒称最终补修后的重跑。

最终实现验证：

- 后端全量388项：379通过、9项既有可选测试跳过，41.737秒。
- 前端相关执行/输入/持久化/重复流程/MCP测试61项：59通过、2项托管MCP真实服务测试因未设置OAKEGDE_TEST_MCP_MANAGED_URL跳过；另通用流程13项全部通过。合计74项、72通过、2跳过。没有运行全部界面DOM套件，本轮无界面布局修改。
- `npx tsc -b`通过；排版审计148文件/2431条、0违规。错误文本继承已有动态展示槽文字角色，无新增字号。
- 两个成功Claude候选在最终引擎按原计划各重放3个case，均passed、0模型调用。此为最终执行器回放，不是再次真实编排或再次内容核验。
- 文档检查修改前后均42错误/24警告，既有问题未扩大；受影响链接另核对。

后端全量命令（backend目录）：

```sh
.venv_macos/bin/python -c 'import sys,unittest;sys.path.append("../.demo-runtime/mcp-venv/lib/python3.12/site-packages");unittest.main(module=None,argv=["unittest","discover","-s","tests","-q"])'
```

前端命令与测试范围见[TESTS](TESTS.txt)和[开发测试说明](../../../developer/TESTING.md)。仅自动验证与开发API实验，没有实车验证、完整浏览器UI验收或日常版本更新。

## 真实实验方法

顺序调用开发`127.0.0.1:8000/v1/orchestration/generate-stream`，single，save_on_success=false，不导入/保存任何项目。C无历史、current_project=null、project_name=null，原文：上车后根据当前车内温度自动调节空调，并用语音播报调节结果。不需要再确认，规则用合理默认值，请直接生成编排。

C-MiniMax请求SHA256为`fe0acad0dd8f06a903eadf1257d23d453b69d0752a47e5e8f47e64393e58f845`，与dev.104一致。复杂A从只读开发项目快照恢复，保留10条非空role/content历史，meta删除chat_messages，prompt=重新编排，project_name沿原A取项目名；请求SHA256为`139c310ca56c2f47d1c4b2dda395995ce7b0170dbfe69b320fc36a27b1667f37`，与dev.103完全一致。并非在用户项目文件上执行写入或保存。

MiniMax使用MiniMax-M3；Claude使用已配置Anthropic网关默认claude-sonnet-5。服务商名称指编排/核验服务商，不等于图内节点均调用该模型；无法独立证明网关后端模型实现。耗时为客户端monotonic请求至SSE结束。

## 逐次结果

类别顺序：input_contract / model_output / graph_logic / assertion。分布只统计最终阻塞错误，不累计已经修复的历史错误或警告。无显式分类的“候选尚未实际试跑通过”归入graph_logic，表示最终图缺当前执行证据；并非将历史运行根因抹除，下文保留最近失败trial。

| 实验 | can_apply | 编排调用 | 秒 | 节点/边 | 实际trial / 图内模型调用合计 | 最终错误类别分布 |
|---|---|---:|---:|---:|---:|---|
| C-MiniMax-1 | false | 31 | 364.544 | 7/6 | 3 / 10 | 0/0/0/13 |
| C-MiniMax-2 | false | 2† | 144.689 | 0/0 | 0 / 0 | 0/1/0/0 |
| C-Claude-1 | true | 17 | 234.772 | 20/21 | 3 / 0 | 0/0/0/0 |
| C-Claude-2 | true | 16 | 149.924 | 11/12 | 2 / 0 | 0/0/0/0 |
| A-MiniMax-1 | false | 34 | 246.589 | 29/39 | 3 / 6 | 0/0/1/0 |
| A-MiniMax-2 | false | 32 | 413.155 | 28/30 | 3 / 1 | 0/0/1/0 |
| A-MiniMax-3 | false | 34 | 274.936 | 17/23 | 2 / 0 | 0/0/0/5 |

† C-MiniMax-2仅返回失败作者阶段SDK api_calls=2，缺少共享CompletionBudget/入口计数；总编排次数未知，不补造。其他各行是共享CompletionBudget次数（含入口），图内模型调用单列。未返回候选的一次仅保存.error.json诊断，不冒充图文件。候选（含失败草稿）统一保存在`/tmp/oakegde-dev105-candidates/`。

## 与此前列表比较及归因

| 组别 | 此前 | dev.105 | 解释 |
|---|---:|---:|---|
| C-MiniMax | dev.104 1/2 | 0/2 | 输入类型错误被前置拦截并修复，但字符串断言被锁定；另一次模型响应截断。样本太少，不能断言退化。 |
| C-Claude | dev.104 0/2 | 2/2 | 两个直接对象JSON计划均运行通过，原“空串解析→误指模型”的阻塞已消除。 |
| 复杂A-MiniMax | dev.103 0/3 | 0/3 | 同模型同请求仍失败，主要为数据形状、测试断言与准备步骤，不是原对象输入故障。 |
| 复杂D-Claude | dev.104 0/2 | 本轮未运行 | 本轮复杂组换成MiniMax，不能将D与A的差异当作同模型因果对照。 |

零成功组的主因与下一步（只建议，未新增实现）：

1. **C-MiniMax：优先补通用测试契约/反馈流程。** C1最终13条全部是期望string、实际number/bool，例如"22"与22、"true"与true；实际动作结果正确却无法通过严格断言。前置校验已将temp字符串输入拒绝，模型修正输入后仍留下错误断言，后续两次改计划又被锁定。模型生成类型不正确是起因，反馈把两边显示成同一文字以及修订限制是持续阻塞；不能据此认定模型不会完成空调逻辑。C2在需求前响应截断，更像输出/服务可靠性问题，不能单独推出模型推理能力不足。建议从现有outputFields/HMI目录生成断言路径和期望类型校验，反馈显示JSON原值及类型；先前置阻断无效断言，再单独讨论受控计划修订，而不是自动转类型/放宽断言。未采集云API原始arguments，字符串来源不能进一步断言是模型还是SDK。
2. **A-MiniMax：主要体现复杂图与测试契约的生成/修复能力不足，框架反馈仍有可改善处。** A1三次失败均在board_check“数据运算需要标量”；A2前两次first_run读取缺失上游字段，第三次转为等待/输出缺失，后续改图时trial额度已用尽。A3实际car_control回执成功，但把`locks.child`/`seat.heat.1`/`seat.vent.1`错当car内嵌套对象；真实值位于`car.hmiSettings[完整controlId]`。第二case未自行准备且依赖记忆，仍停在ask_school_info。建议通用暴露每种节点实际输出/证据路径及类型、展示buffer按当前图确定的读写角色，增强state/等待前置条件诊断；再复跑同模型同请求。不得按“接小孩”等词加特判或固定节点图。

原有等待与跨case问题没有被一次性彻底消除：本轮A1/A2/A3在inspect/trial前分别返回12/16/6次等待警告（包括重复版本检查，非唯一问题数），但模型未完全遵守。跨case buffer警告的可证明模式由回归覆盖，本轮真实样本未命中；A3的state语义依赖仍漏报，范围限制已记录。

## 失败的最后三条错误原文

以下保留最终公开阻塞错误原文；不足三条按实际条数记录。成功轮次最终无错误。A1/A2最终仅“候选尚未实际试跑通过”，另列最近失败trial的最后三条（旧revision证据，不能冒充最终revision已运行）。完整诊断与字段类型证据见EVIDENCE。

### C-MiniMax-1

- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['outputs', 'decide', 'data', 'fan'] equals 3，实际3；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['car', 'ac', 'temp'] equals 23，实际23；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['car', 'ac', 'fan'] equals 3，实际3；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。

### C-MiniMax-2

- 本轮场景编排未完成。停止阶段：需求登记前。原因：模型输出被截断。当前项目未被替换。

### C-Claude-1

无，最终执行断言与内容核验passed。

### C-Claude-2

无，最终执行断言与内容核验passed。

### A-MiniMax-1

- 候选尚未实际试跑通过。

最近失败trial（revision 14）的最后三条：

- [graph_logic/GRAPH_EXECUTION] 节点board_check：判断条件执行失败：数据运算需要标量；修复方向：检查图的连线、条件、绑定、节点配置与服务/预算；按执行证据修图，不削弱测试。
- [assertion/ASSERTION_STATUS] 记忆已有且30分钟内放学→最短时间路线+上车触发舒适配置第3步：状态failed，期望not_failed；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- [graph_logic/GRAPH_EXECUTION] 节点board_check：判断条件执行失败：数据运算需要标量；修复方向：检查图的连线、条件、绑定、节点配置与服务/预算；按执行证据修图，不削弱测试。

### A-MiniMax-2

- 候选尚未实际试跑通过。

最近失败trial（revision 7）的最后三条：

- [assertion/ASSERTION_VALUE] 断言['nodes', 'first_run'] equals success，实际None；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- [assertion/ASSERTION_VALUE] 断言['nodes', 'read_event'] equals success，实际dormant；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- [assertion/ASSERTION_VALUE] 断言['nodes', 'first_run'] equals success，实际None；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。

### A-MiniMax-3

- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['car', 'seat', 'vent', '1'] equals 2，实际None；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['car', 'locks', 'child'] equals True，实际None；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['outputs', 'final_reply'] exists None，实际None；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。

## 交付与保护

成功候选：[C-Claude-1](/tmp/oakegde-dev105-candidates/C-Claude-1.json)（20节点/21边）、[C-Claude-2](/tmp/oakegde-dev105-candidates/C-Claude-2.json)（11节点/12边）。都只有所列3个case的证据，车控为Studio模拟，不是实车。

8项保护配置/项目文件哈希从开工到收尾一致（含5份项目，文件集合另核对），实验期326份实现文件一致；实验后仅上述2份执行器文件补JSON媒体字段边界。固定SDK源码未改；未运行prepare、未修改/重启5175或stable、未创建git commit、未写Desktop、未回显密钥。开发8000加载最终实现，日常版本保持。

仓库内保留需求、任务、验收、精简EVIDENCE及TESTS。仓库外保留指定候选目录；临时完整请求/历史、SSE与采集日志在收尾清理，不将未提交工作区称作可恢复版本快照。
