# 模型菜单、资源面板与白色工作台

2026-10-05｜2.8.0-dev.88｜实现完成，自动检查通过；实屏验证受工具限制。

依据：飞书清单第4–7项及用户明确确认思考开关/推理强度必须进入真实请求。

- 模型菜单参考Hermes：搜索、供应商分组、选中标记、刷新、默认模型与配置入口；仅展示实际已登记模型。
- 思考与强度按供应商/模型能力开放，后端拒绝不支持的组合。项目保存恢复设置，单代理、团队与bounded请求生效；不展示私有思维链。
- 删除资源面板标题下的通用说明；保留运行记录等面板用于识别项目的上下文。
- 搜索框的边框、焦点和点击区域覆盖图标与输入整行，沿用语义字号和紫色焦点。
- 浅色模式基础表面统一纯白；保留文字、边框、紫色状态、深色模式及独立HMI主题。首页Prism和玻璃效果沿用既定例外。
- 用模拟网络/固定SDK的本地协议验证参数；不为测试读取或外发用户项目、不更换全局模型或密钥。

已回读飞书最新文本并给第4–7项添加紫色删除线，revision 190；验证边界见同目录ACCEPTANCE.md。

支持范围按官方文档和模型ID登记，不猜测自定义别名。MiniMax-M3支持开关但不提供强度；不同GPT/Claude型号分别开放对应强度。配置入口沿用每供应商一个自定义模型，不引入新的模型目录存储。

依据：[MiniMax协议](https://platform.minimax.io/docs/api-reference/text-openai-api)、[Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort)、[Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5)、[OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning)。

同轮补充（2026-10-05，飞书第8项）：部署弹窗打开时聚焦标题，避免默认自动选中项目名称；保留输入编辑、焦点约束与关闭行为。不修改部署请求与导出命名。

同轮第9项：模型库与MCP库统一为搜索/添加、筛选、统计/来源三行，统一底部分页与边距；卡片内容保持。模型添加入口默认复用现有资料预览/确认流程，只将AI模型类资料放入模型库，不新增下载安装或模型服务注册协议。

同轮第10项：依据Hermes参考图，浅色工作区分隔线改为独立的浅色divider；保留1px宽度与控件边框/焦点。深色主题沿用原分区对比。
