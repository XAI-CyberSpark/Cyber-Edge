# MCP场景工具接入

2026-10-05｜当前实现与配置说明；HTTP基础见dev.62，目录详情及托管安装配方见[dev.90验收](releases/2.8.0-dev.90/ACCEPTANCE.md)。

## 安装与登记

使用Python3.10+运行`<后端Python> scripts/setup_mcp_runtime.py`（本机为`backend/.venv_macos/bin/python`），在`.demo-runtime/mcp-venv`安装官方MCP SDK2.2.0，生成独立运行配置。主后端不导入SDK，不升级其FastAPI/模型依赖。已有运行配置保留；本机验证也可使用显式python与sdk_path的独立目录。版本固定于`backend/requirements-mcp-runtime.txt`。

在`.demo-runtime/mcp-servers.json`登记服务。参考`backend/config/mcp-servers.example.json`，将示例端点和工具名替换成已授权的实际服务；示例文件本身不会启用连接。headers_env的值是环境变量名称，变量值包含完整请求头值（如Authorization的Bearer前缀），不填写到节点或提交项目文件。Hermes只接收这些显式配置引用的凭据，Node试跑进程没有凭据。

每个工具只有登记后才能执行。allow_trials默认false；仅在允许生成器重复测试该工具时设true，尤其需要区分查询与写入服务。远端readOnlyHint不授予权限。未提供业务服务地址或授权，不把魔搭目录条目当成已连接服务。

## 节点与接口

`tool`节点字段：`tool_id:"mcp"`、固定`serverId`、固定`toolName`、`arguments`对象。动态字段可用`{"$ref":"input.data.query"}`或`{"$ref":"state.code"}`。参数按发现的JSON Schema校验；不同于模型节点的outputFields。前后端阻止节点写入url、headers、command、apiKey、endpoint、env。

返回`source:"mcp"`、server_id、tool_name、`data`（structuredContent，可能null）、`content`原始内容块、`text`合并文字及is_error。模型不能把只含text的结果假定为data对象；可将原文传下游模型解析或讲解。调用失败进入error出口且图状态保持failed，兜底提示不等于业务成功。

工具后模型的input.text来自工具，不再是起始输入。需要原始编码时引用对应输入节点输出；避免在提示词中把整段JSON标作编码，或将data=null解释为原文中没有资料。结果断言可用satisfies检查实际字段关系与格式，见[NODE_CONTRACTS](NODE_CONTRACTS.md)。这不替代独立换数据和内容核验。

既有站点认证保护`GET /v1/mcp/connections`与`POST /v1/mcp/invoke`。前者只披露已登记工具的Schema、可用状态与试跑权限，不披露端点/凭据；后者只接受server_id/tool_name/arguments。Hermes能力工具与bounded生成器获取同一真实目录。试跑最多12次MCP调用，父进程校验图绑定与试跑授权。

## 边界与验证

已登记远端服务使用Streamable HTTP；dev.90增加后端审核登记配方的隔离stdio客户端。不执行目录返回的任意命令，不自动执行OAuth授权、sampling或elicitation。工具调用不自动重发，SDK断线结果流恢复不表示新的业务调用。发现15秒/调用60秒预算，IPC2MB，单响应流4MB，编排目录1MB；超限或Schema外部引用明确拒绝，不伪造简化返回。外部工具是否实现事务和幂等需另行核对；dev.61持久化也不能替代外部动作对账。

真实协议测试可启动证据目录fixture.py，并设置OAKEGDE_TEST_MCP_URL和OAKEGDE_TEST_MCP_SDK运行tests.test_mcp_runtime。普通单测没有夹具时明确skip live protocol类；不把skip计为协议通过。当前夹具明确test_fixture，不能作为真实充电站/博物馆数据。

参考：[官方SDK](https://github.com/modelcontextprotocol/python-sdk)、[客户端传输](https://py.sdk.modelcontextprotocol.io/client/transports/)。本轮根据2.2.0实际源码与协议测试实现，未来升级需重新验证。

## 产品内详情与首次Run安装（dev.90）

用户明确要求在Studio内完成了解、配置和运行，取代跳转魔搭查看说明的流程。目录详情读取公开README、配置字段名/描述/必填与安装方式名称；不转发环境变量默认值、原始server_config或operational_urls。README按Markdown展示，HTML不执行，外部链接和图片转为文本；超过120000字符明确提示截断。来源保留为文字。目录数据不进入安装执行指令。

`mcp_packages.RECIPES`维护后端固定配方，当前为`@modelcontextprotocol/fetch`→`catalog-fetch/fetch`（`mcp-server-fetch==2026.8.18`），以及`@modelcontextprotocol/time`→`catalog-time/get_current_time|convert_time`（`mcp-server-time==2026.8.18`）。每个工具独立登记标题、参数和试跑权限，服务独立登记运行条件说明。服务自身MCP1.x依赖与客户端`mcp==2.2.0`分开安装到`.demo-runtime/mcp-packages/`，不修改主后端环境或HTTP登记文件。固定的是顶层包版本；本轮没有锁定所有传递依赖。

目录与拖拽只携带服务/工具标识、参数与表单元数据。首次实际invoke才通过venv/pip准备环境；包管理器使用独立配置与PyPI，不使用shell。OS文件锁合并并发安装，安装成功并核对版本才写就绪标记，重复Run复用环境。每个环境安装最长180秒（服务和SDK分别计时），调用仍60秒；失败可由用户再次Run重试，不自动重发工具调用。客户端断开取消任务；先用SIGTERM让SDK清理其独立stdio子进程，10秒后才使用强制终止后备，安装进程直接清理进程组；macOS已测，Windows进程树清理分支未实测。

只有配方明确声明`input_ref`的字段自动绑定（Fetch的url为`input.text`）；Time必填字段初始为空，用户填写时区/时间或选择上游引用，可选无默认值的字段不提交；属性面板支持固定值、上游字段和JSON，错误JSON保留前一个有效值并提示尚未应用。返回仍为MCP原始text/content及可选data，不把文本包装成虚假结构化数据。工具失败使用现有withFlowPorts失败出口，不改已有坐标。

Fetch与Time均无需凭证。Time读取主机时钟并使用IANA时区名称和24小时HH:MM时间；卡片和详情均可先选择工具，参数说明随之变化，拖拽和添加携带同一工具与其参数。Fetch可访问运行主机可达的网络，包括内网，详情明确说明；并非容器或网络沙箱。浏览/自动编排发现不安装该包，配方默认`allow_trials=false`，不会因为目录可见而自动授权生成器反复访问网站。其他目录条目仍可阅读完整说明；缺少经过核对的配方时明确不可添加，不声称全目录一键安装、云端托管已连接或OAuth已授权。

官方依据：[Time包](https://pypi.org/project/mcp-server-time/)、[Time目录](https://www.modelscope.cn/mcp/servers/@modelcontextprotocol/time)、[Fetch包](https://pypi.org/project/mcp-server-fetch/)、[用户指定ModelScope详情](https://www.modelscope.cn/mcp/servers/@modelcontextprotocol/fetch)。本轮真实安装、stdio调用和完整图执行已验证，详见本轮验收。

## 目录交互补修（dev.94，2026-10-05）

MCP已封装卡片直接拖入画布，移除列表及详情独立添加按钮；Alt+Enter保留键盘等效操作，多工具选择和参数载荷仍使用既有mcpNodeSpec。无安装配方、运行中不可拖入；首次Run安装契约不变。此次只验证前端拖拽与守卫，不替代dev.90真实安装/调用证据。见[dev.94验收](releases/2.8.0-dev.94/ACCEPTANCE.md)。

## 接口资料随源码交付（2026-10-19）

473条接口说明保存为`backend/config/capability-library.seed.json`，后端启动时向空库事务初始化；已有任何导入记录则保留原库。条目仍全部“未接入、未验证”，不附带MCP绑定、凭据或已安装环境。完整规则见[开发者配置](../developer/CONFIGURATION.md#随仓库交付的接口目录2026-10-19)。目录交付不代表真实业务工具已实现。
