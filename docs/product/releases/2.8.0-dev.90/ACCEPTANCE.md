# MCP详情与Run安装验收

2026-10-05｜2.8.0-dev.90｜未提交工作区；本机实现和所列验证完成，未做公网或正式版发布。

## 结果

| 用例 | 结果与证据 |
| --- | --- |
| 公开详情 | 真实ModelScope API返回README、配置Schema与安装方式；当前8000主后端回读Fetch的2459字符说明及installed配方成功 |
| 产品内阅读 | 无外跳链接；README Markdown、参数、运行条件、完整说明展开均真实页面检查；外部HTML/链接/图片仅作为数据，DOM回归覆盖 |
| 添加与拖拽 | 实际点击添加1节点、从详情按钮拖拽再次添加1节点；安装未在浏览/拖拽时触发；DOM核对仅传固定标识与参数 |
| 参数编辑 | 真实页面解除上游绑定并输入example.com；DOM覆盖JSON有效/无效、上游引用与保留有效值；MCP不再显示仿真动作菜单 |
| 首次安装 | 真实PyPI安装Fetch 2026.8.18及独立MCP SDK2.2.0，未更改主venv；随后stdio访问公开example.com成功 |
| 重复运行/错误参数 | mock安装命令断言未被调用时仍成功返回真实内容；url=12被真实Schema拒绝，见[协议记录](evidence/fetch-protocol.json) |
| 完整执行链 | `OAKEGDE_TEST_MCP_MANAGED_URL=http://127.0.0.1:8011/v1/mcp/invoke node scripts/test-scenario-execution.mjs mcp-flow.test`：6/6通过；最终改为主后端8000复跑6/6通过；其中1条正式GraphEngine→真实后端→官方Fetch→下游，1次工具、0次模型；其余为模拟回归 |
| 安装并发/取消/失败 | 后端tests.test_mcp_packages、test_mcp_runtime、test_mcp_catalog、test_capability_binding共37项，31通过/6跳过；覆盖并发复用、失败无就绪标记、OS锁释放、真实睡眠子进程取消、HTTP断开取消及真实MCP2 stdio服务的取消/超时回收 |
| 前端 | MCP目录/参数5组DOM通过；最终TypeScript/Vite构建通过；字体审计145文件2340条0违规，本地化Missing 0/Raw 0；git diff --check通过 |
| 实屏 | 1280×900与360×800；窄屏document.scrollWidth=innerWidth=360，详情链接数0；完整文档可滚动、点击/拖拽/表单可用 |

## 截图

- [桌面详情](evidence/mcp-detail-desktop.jpg)
- [360px详情](evidence/mcp-detail-360.jpg)
- [实际拖拽后](evidence/mcp-drag-desktop.jpg)
- [参数编辑](evidence/mcp-arguments-desktop.jpg)：最终MCP配置标题、清晰能力说明与参数表单已实屏确认。

## 环境与边界

- macOS，后端Python3.12，Node24，浏览器真实页面；隔离后端8011与前端5175，测试项目在`/tmp/oakegde-mcp89-ui`，未保存/改写用户真实项目。名称中的89为更名前临时目录，不是当前产品版本。
- 先回读确认当前主后端已加载新详情；收尾取消修复后确认8000无活动连接/子进程、PPID=1，再优雅重启，并用新主服务完成真实图执行验证。5173沿用源码热更新。临时验证服务结束时关闭。
- 6个跳过属于既有HTTP MCP fixture和绑定协议环境缺省；没有将其算为通过。本轮另有真实官方Fetch stdio/HTTP invoke/图执行证据，不能替代所有历史HTTP回归协议。
- 安装取消真实终止测试使用本机睡眠进程；首轮另用真实MCP2服务验证调用取消和3秒超时后SDK独立进程组中的服务均退出。HTTP断开与安装失败/并发使用可控夹具，未断开真实公网下载或在真实业务写入中测试取消。
- 已核对安装配方为Fetch与Time，其他服务显示原文及缺失状态；尚未实现任意魔搭服务自动封装、凭据录入/OAuth、Docker/npx、跨平台打包及Windows/Linux实机验收。已安装不等于服务已连接或业务已验证。
- 顶层包固定版本，传递依赖未全部锁定；独立venv不是网络/文件系统沙箱，Fetch可访问运行主机可达网络，详情已说明。
- 构建仍有既有大包与Browserslist数据过期警告。临时5176构建预览被浏览器阻止访问，实际页面验收在5175完成，没有规避浏览器限制。
- 并行自动保存属于dev.89，目录工具栏/部署聚焦等其他改动归相应并行任务；本轮保留其修改，未创建提交、标签或声称存在完整可恢复快照。

## 同轮继续：Time与多工具（2026-10-05）

范围：在已有Fetch基础上增加Time固定配方2026.8.18；卡片/详情选择工具，参数说明与拖拽/添加携带所选身份一致；节点标题区分工具；运行说明由服务配方提供。只有显式input_ref字段自动绑定，上游固定值默认行为不再混用于所有字符串参数。Time无需密钥，凭据录入/OAuth与其他安装器仍未实现。

| 用例 | 结果与依据 |
| --- | --- |
| 真实来源 | 公开ModelScope Time详情确认两工具、空凭据Schema与uvx方式；官方PyPI核对2026.8.18，实际安装保持独立venv |
| 首次安装与复用 | 安装前状态on_first_run；真实invoke后installed；禁止安装命令的mock下仍可发现并换算时间，证明复用；[协议记录](evidence/time-protocol.json) |
| 真实工具与错误参数 | 当前上海时间返回成功；上海09:30→UTC01:30；数值timezone、无效时区、25:99时间均被真实Schema或服务拒绝 |
| 正式图执行 | mcp-flow.test 7/7：5项模拟、Fetch真实调用、Time通过真实目录生成节点后换算及错误出口；Time两用例2次工具/0次模型。8011通过，重载主后端8000后再测7/7 |
| 后端回归 | 同四模块38项，32通过/6历史HTTP协议环境缺省跳过，启用真实SDK stdio生命周期测试 |
| 前端 | DOM6组通过；最终构建通过；文字145文件2342条0违规，本地化Missing0/Raw0，diff空白检查通过 |
| 实屏 | 1280×900选择convert_time，实际拖拽到画布；节点标签与三个参数一致，填写Asia/Shanghai、09:30、UTC成功；360×800文档宽360、外跳链接0 |

实屏证据：[桌面工具选择](evidence/time-detail-desktop.png)、[360px详情](evidence/time-detail-360.png)、[实际拖拽后的参数表单](evidence/time-parameters-desktop.png)。测试仅使用`/tmp/oakegde-mcp90-ui`中的临时项目；没有修改真实用户项目。

复验中保留的失败：原生命周期测试3秒期限与并行构建争抢CPU，超时先于服务写入PID，不能证明调用阶段回收。将该测试期限改为10秒以容纳SDK启动，保留工具睡眠60秒、必须实际进入工具、超时错误和进程不存在的全部断言；生产超时未修改，复跑通过。不将该失败算作通过。

本机主后端确认无活动连接/子进程后优雅重启，真实目录与图执行已核对；前端源码热更新。仍为dev.90同轮补充，未提交、未发布。全部第三方说明仅作资料，未把其中安装命令直接执行。
