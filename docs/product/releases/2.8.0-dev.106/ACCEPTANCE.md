# dev.106 验收

维护日期：2026-10-09；状态：实现、所列自动验证及七次真实实验完成；复杂A可靠性目标未达。未提交、未发布。主依据：[需求](PRD.md)、[任务](TASKS.md)。

## 实现与边界

- assertionContract.ts 从 initialVehicle、HMI_CONTROLS.path/type 与当前图建立已知证据形状。car无显式目录path时使用hmiSettings下的完整controlId；JSON节点按outputFields检查data字段；output/tts按字符串、logic/state/memory及显式HMI回执按已知合并形状推导。nodes按通用/旧执行器状态区分。路径错误给PLAN_ASSERTION_PATH及3个最接近的目录/图候选；已知值类型或状态枚举不符给PLAN_ASSERTION_TYPE。
- 同一预检在test_plan提交、inspect和执行前运行，错误带case/step/assertion位置；无效计划不锁定、不先消耗trial。后端Node桥显式使用Studio tsconfig，避免从backend工作目录无法解析目录依赖。
- trial反馈显示JSON原值、类型以及missing；严格equals未增加任何自动转换。AI锁定计划仅允许equals字符串变为类型证据支持的等值数字/布尔，或非法路径改为预检候选；其他输入、条件、操作符、覆盖均保持。返回revision_kind，失效原执行/核验缓存，不重置次数。调用方计划仍锁定。补齐Python True==1不能绕过计划锁的类型比较。
- state警告由values/increments写字段及配置中的input/state/outputs字段引用推导。此前case写入同名state、当前case读取前无可达写入准备时提示PLAN_CASE_MEMORY_ISOLATION。dev.105 A3的memory_check已命中；不按case名称、节点名称或业务关键词猜测。
- CompletionBudget在我们自己的适配层检查长度终止标志；整次请求最多一次重试，丢弃第一次部分内容/工具参数，重试计入原40次/720秒预算。该次token上限翻倍至最多64000。剩余调用不足或不足150秒（现有单次超时）时不重试；第二次仍截断后阻止SDK继续发实际请求。诊断保留truncation_retries与call_budget/time_budget/retry_limit原因，含入口阶段和无候选失败。

静态限制：未声明的动态模型/工具内容、object内部字段和数组元素形状保留unknown，无法声称任意路径都可证明；已知封闭形状才拒绝不存在字段。路径存在不保证本case实际执行过该节点，尤其nodes[id] exists不足以证明success。条件分支、动态引用、模型语义及自然语言记忆假设仍需trial和内容核验；state警告是可能性推断，不能当作完整路径证明。

## 自动验证

- 最终后端402项：393通过、9项既有可选测试跳过，45.825秒。
- 最终前端执行器67项（65通过、2项缺托管MCP服务跳过），通用流程13项通过；合计80项（78通过、2跳过）。类型检查通过。冻结实验前为后端398项（9跳过）、前端78项（2跳过）；新增边界回归先失败，再补修通过。
- 固定Hermes SDK本地协议：MiniMax/OpenAI/Anthropic首次截断后第二次成功，均准确计2次调用、1次重试并翻倍token上限；另一次持续截断只发2次请求并返回retry_limit。无云调用、无SDK源码修改。
- dev.105证据回放静态检查：C-MiniMax-1的13项字符串/数字布尔错误全部命中PLAN_ASSERTION_TYPE；A-MiniMax-2命中5项非法路径；A-MiniMax-3命中4项非法车控路径，并对memory_check命中state跨case警告。此为静态回放，不是重新调用编排模型。

## 测试依赖隔离

共享解释器中缺少jsonschema、attrs、jsonschema-specifications、referencing、rpds-py。只在/tmp/oakegde-test-deps保留：attrs 26.1.0、jsonschema 4.26.0、jsonschema-specifications 2025.9.1、referencing 0.37.0、rpds-py 2026.9.1。pip解析时另下载typing-extensions 4.16.0到临时目录；确认共享解释器已有相同版本后删除该临时副本，沿用原版本。没有向.venv_macos/site-packages安装或升级包。安装前后pip freeze逐字一致（43行）。

安装命令（仓库根目录）：

```sh
backend/.venv_macos/bin/python -m pip install --target /tmp/oakegde-test-deps -r backend/requirements-test.txt --no-cache-dir
```

测试命令（backend目录）：

```sh
PYTHONPATH=/tmp/oakegde-test-deps .venv_macos/bin/python -m unittest discover -s tests -q
```

前端命令（仓库根目录，最后两项在studio目录）：

```sh
node studio/scripts/test-scenario-execution.mjs assertion-contract.test input-contract.test scenario-execution.test repeated-flow.test durable-flow.test mcp-flow.test
node studio/scripts/test-general-flow.mjs
npx tsc -b
node scripts/audit-typography.mjs --write
```

排版148文件/2431条、0违规；未改界面布局，无浏览器/实车验收。文档检查42项错误/24项警告，与dev.105既有基线相同；本轮迭代链接检查无缺失。git diff --check通过，仅既有SOURCE.md的CRLF提示。

## 真实实验方法

开发8000、single、save_on_success=false，候选存/tmp/oakegde-dev106-candidates。原开发项目只读为请求快照，从未保存。A请求和C请求的MiniMax形状hash分别与dev.105完全一致；Claude仅替换provider_id/model。当前配置Claude为claude-sonnet-5，MiniMax为MiniMax-M3，网关后端实现不可独立确认。记录共享CompletionBudget含入口调用；图内模型调用另计，不能以SDK单角色调用数代替总数。

顺序：A-Claude×3、C-MiniMax×2、C-Claude×1、A-MiniMax×1。实现文件冻结期间禁止为某次结果加入业务特判。七次实验已完成，结果如下。

## 七次真实结果

可应用2/7。复杂A-Claude为0/3，未达到2/3目标。统计不是开放场景成功率，不能从七个样本推出提供商整体能力排名。

类别顺序：input_contract / model_output / graph_logic / assertion；按最终公开阻塞消息逐条计数，已修复历史错误不累计。内容核验的ReviewProtocolError在本表映射为model_output，未实际试跑/未最终提交映射graph_logic；不是声称这些消息原本都带有trial错误码。详细历史和归因保留在[EVIDENCE](EVIDENCE.json)。

| 实验 | can_apply | 编排调用 | 秒 | 最终类别分布 | PATH/TYPE命中 | revision_kind | truncation_retries/跳过原因 |
|---|---|---:|---:|---|---|---|---|
| A-Claude-1 | false | 38 | 736.925 | 0/1/1/0 | 1/0 | initial | 0/— |
| A-Claude-2 | false | 39 | 745.215 | 0/0/2/0 | 0/0 | —（未登记） | 0/— |
| A-Claude-3 | false | 33 | 605.263 | 0/0/3/0 | 3/0 | initial | 0/— |
| C-MiniMax-1 | true | 10 | 159.661 | 0/0/0/0 | 12/0 | initial | 0/— |
| C-MiniMax-2 | false | 34 | 304.699 | 0/0/0/13 | 13/20 | initial | 0/— |
| C-Claude-1 | true | 22 | 329.086 | 0/0/0/0 | 9/0 | initial | 0/— |
| A-MiniMax-1 | false | 28 | 665.350 | 0/0/1/0 | 0/0 | —（未登记） | 0/— |

PATH/TYPE命中为PLAN_ASSERTION_PATH/PLAN_ASSERTION_TYPE诊断项累计，包含重复提交/检查，不能理解为唯一字段数。initial表示首次有效计划登记；本轮没有锁定后的窄修订，也没有自然截断，故没有跳过原因。受限修订和截断恢复由自动回归、固定SDK本地协议验证，不冒称已在本轮真实模型自然错误中触发。

| 实验 | 节点/边 | 实际trial次数 | 图内模型调用合计 |
|---|---:|---:|---:|
| A-Claude-1 | 25/31 | 2 | 0 |
| A-Claude-2 | 23/24 | 0 | 0 |
| A-Claude-3 | 24/31 | 1 | 1 |
| C-MiniMax-1 | 7/9 | 1 | 3 |
| C-MiniMax-2 | 9/12 | 3 | 0 |
| C-Claude-1 | 17/18 | 3 | 9 |
| A-MiniMax-1 | 31/40 | 0 | 0 |

## 与dev.105比较

| 组别 | dev.105 | dev.106 | 解释 |
|---|---:|---:|---|
| C-MiniMax | 0/2 | 1/2 | 一次路径纠正后通过；另一次类型/路径已前置拦截，最后阻塞转为事件输入未触发。不能由小样本认定总体成功率提升。 |
| C-Claude | 2/2 | 1/1 | 本轮仍通过；9项路径错误在登记前修复。样本量不同。 |
| 复杂A-MiniMax | 0/3 | 0/1 | 新一轮结构修正后没有登记计划及实际试跑，不能视为已修复旧运行错误。 |
| 复杂A-Claude | 未运行 | 0/3 | 本轮主目标未达；dev.104 D-Claude 0/2只作历史背景，其请求并非本轮A的完全同形对照。 |

## 失败归因与下一步

**A-Claude-1：核验契约阻塞，同时存在图/验收计划的语义覆盖问题。** 38次调用、736.925秒；先修正1项车控路径，两个trial中的最终一次断言通过。最终内容核验返回invalid_evidence_quote（checks.1.findings.0.observed_quote），没有有效核验或最终提交。当前保存的诊断不足以区分是模型复制引用错误还是引用校验呈现问题，不能单归因推理能力。更重要的是“最短时间路线”用例只断言nodes.nav_shortest_time exists；实际该节点skipped、nav_shortest_distance success，exists仍通过。因此不能说只修核验引用就已满足业务。建议：用结构化证据定位并提供可直接引用的原值；给nodes[id] exists这种不证明执行的断言通用提示，建议用success及动作回执；在现有预算内更早进入trial并保留核验纠错时间。

**A-Claude-2：复杂构图/修复效率不足，契约反馈仍可更精确。** 39次调用、745.215秒；23次patch、8次inspect反复处理文字/JSON模型可达普通工具的契约、汇合与需求覆盖，最后仍没有计划和trial。没有本轮断言或截断阻塞，不能把失败算在新断言预检上。模型未有效推进既有反馈是直接证据；宿主只报告上游LLM、未列出具体阻塞的下游动作路径，增加了修复成本。建议从图推导并显示“上游节点→具体下游不兼容节点/连线”及可用输入契约，避免重复改错位置；不是加入固定图模板。

**A-Claude-3：生成的输出格式与下游动作契约不一致，修复后又失去可执行性。** 33次调用、605.263秒；登记前纠正3项路径错误。实际trial在llm_extract_onboarding得到MODEL_ACTION_INVALID（真正调用了模型），后续改JSON输出后，三个LLM仍可达不兼容的普通工具，最终3项graph_logic阻塞。主要证据是模型生成/配置和定向修复未正确遵循契约，不是JSON入口误报。建议将数据提取、动作决策、显式HMI/MCP绑定的输出与连接约束做成同一份机器可读说明，并给出具体不兼容路径；先用通用最小图验证该契约，再复跑完整A。

**C-MiniMax-2：测试输入配置错误，加上入口匹配预检的遗漏。** 13项路径、20项类型诊断发生在登记前；模型最终使用satisfies的严格表达式（如input === 24），并非将equals自动转类型或放宽。随后三个case实际传入的是text包装内的JSON事件字符串，eventOf把它视为普通message，具名enter_car入口保持dormant，所有动作pending、最终waiting，车辆保持默认值。最终13项断言失败显示真实数值/类型和missing，已不是dev.105“同文案的字符串/数字差异”。模型生成了错误事件包，框架没有在锁定前提示入口不匹配。建议基于eventOf与入口/等待配置增加通用未匹配事件提醒；不自动解包，不放开任意输入修订。

**A-MiniMax-1：结构配置修复后未完成验收计划和试跑。** 28次调用、665.350秒；31节点/40连线，10次patch、5次inspect。曾有绑定根、joinMode/端口和模型到工具的契约错误；唯一trial调用被inspect拦截为not_run，不计实际trial。最终inspect结构通过，但没有计划，提交的是未实际试跑草稿。时间较长本身不能证明SDK按预算强制停止；日志是主动submit后的返回。建议对“结构通过但无计划/无执行证据”明确提示下一必需步骤，优化在既有预算中的推进顺序；不替模型生成场景专用计划。

两次成功只证明所列用例：C-MiniMax-1三个case一次trial通过，C-Claude-1经三次trial通过，均完成内容核验；车控为Studio模拟，不是实车。复杂A的0/3不能单归因模型能力，也不能把全部问题称作框架错误；需要同时改善通用契约反馈、证据质量与模型修复推进。

## 最后三条错误原文

以下为最终公开阻塞错误；不足三条按实际条数记录。最终图未执行的轮次不把旧revision的错误冒充当前运行结果。最近失败trial另列，完整历史在EVIDENCE。

### A-Claude-1

- 实际内容核验：内容核验未完成或证据引用无效，不能将该候选标记为可应用。
- 智能体未完成最终提交；保留最新图与执行证据供继续修复。

### A-Claude-2

- 候选尚未实际试跑通过。
- 智能体未完成最终提交；保留最新图与执行证据供继续修复。

### A-Claude-3

- llm_extract_onboarding（llm_extract_onboarding）：文字或数据输出不能直接驱动车控/工具。模型负责决策动作时配置set_data.outputFormat=actions；保留json输出时，只能按已支持的显式HMI字段/$ref或MCP参数绑定组合，不得将原文当普通工具/车控动作。检查所有可达下游动作节点，不只是下一跳；不要只改systemPrompt而遗漏outputFormat。
- llm_extract_memory（llm_extract_memory）：文字或数据输出不能直接驱动车控/工具。模型负责决策动作时配置set_data.outputFormat=actions；保留json输出时，只能按已支持的显式HMI字段/$ref或MCP参数绑定组合，不得将原文当普通工具/车控动作。检查所有可达下游动作节点，不只是下一跳；不要只改systemPrompt而遗漏outputFormat。
- llm_route_decision（llm_route_decision）：文字或数据输出不能直接驱动车控/工具。模型负责决策动作时配置set_data.outputFormat=actions；保留json输出时，只能按已支持的显式HMI字段/$ref或MCP参数绑定组合，不得将原文当普通工具/车控动作。检查所有可达下游动作节点，不只是下一跳；不要只改systemPrompt而遗漏outputFormat。

最近失败trial（旧revision）的最后三条：

- [assertion/ASSERTION_VALUE] 断言['outputs', 'state_profile', 'data', 'school'] equals：期望 "阳光小学"(string)，实际 undefined(missing)；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- [assertion/ASSERTION_VALUE] 断言['outputs', 'state_profile', 'data', 'home_address'] contains：期望 "幸福小区"(string)，实际 undefined(missing)；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- [assertion/ASSERTION_VALUE] 断言['outputs', 'memory_write', 'short_term_memory_written'] equals：期望 true(boolean)，实际 undefined(missing)；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。

### C-MiniMax-1

无；最终can_apply=true。

### C-MiniMax-2

- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['car', 'ac', 'fan'] satisfies：期望 "input === 4"(string)，实际 3(number)；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['car', 'hmiSettings', 'ac.frontDefrost'] satisfies：期望 "input === false"(string)，实际 undefined(missing)；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。
- 实际试跑未通过；[assertion/ASSERTION_VALUE] 断言['hmi', 'message'] contains：期望 "制热"(string)，实际 undefined(missing)；修复方向：比较断言与真实状态/输出；测试表达有误时修测试计划，图行为违背需求时修图。遵守计划锁定规则，不自动放宽断言。

### C-Claude-1

无；最终can_apply=true。

### A-MiniMax-1

- 候选尚未实际试跑通过。

## 实验后边界补修与保护

七次真实实验期间271份实现文件哈希不变。之后只修改assertionContract.ts和authoring_session.py：静态路径排除原型继承属性（运行时原已屏蔽）；buffer输出字段按实际读/写角色推导；允许同一断言同时进行“非法路径→合法候选”和“等义字符串→有证据类型”的两种修正，仍拒绝其他变化。补充前后端红绿回归。五份有计划的候选在冻结/最终预检下结果逐项一致；两份无计划候选明确跳过比较。未重新进行七次云编排，不将其冒称最终补修后的重新实测。

共享解释器pip freeze从安装前到最终保持一致。受保护配置和backend/projects文件哈希/集合未变；固定SDK仍为登记的干净提交。只使用开发5173/8000，未操作stable、5175、prepare、日常项目、SDK源码、Desktop或Git提交。未发布，未提交工作区不等于可恢复版本快照。

候选保存在[/tmp/oakegde-dev106-candidates](/tmp/oakegde-dev106-candidates/)，成功候选为[C-MiniMax-1](/tmp/oakegde-dev106-candidates/C-MiniMax-1.json)和[C-Claude-1](/tmp/oakegde-dev106-candidates/C-Claude-1.json)。
