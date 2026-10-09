# Windows完整包验证（2026-09-23）

交付当前dev.21未提交工作区，不新增产品功能编号，不声称正式发布。用户指定Windows且排除OpenSparX；此前明确授权随包包含现有API密钥继续有效。

- 新增同源服务入口：只对frontend目录提供静态文件，API与Telemetry转入真实Host-lite后端；项目/凭据/源码不作为静态目录。
- 含预构建前端与对应studio源码、backend、4个原项目、ASR、SU7、Windows依赖和INSTALL/START/CHECK脚本。
- 排除OpenSparX原始权重、ollama-opensparx模型数据、Ollama程序、Mac虚拟环境、node_modules和快照。
- 从已复制源码通过TypeScript/Vite构建，未拿过期dist充当最新网页。
- 39个Windows x64/Python3.12 wheel已下载；按Windows marker检查必要依赖及版本约束完整。Windows要求先安装Python3.12 x64及py启动器；其余Python依赖随包离线安装。
- 打包目录以独立5186端口实际启动：登录/项目列表/全部项目打开、SU7/ASR资源通过；未登录API401，私密文件404。原5175服务未修改。
- 真实浏览器登录密钥1→显示4项目→打开OpenSparX示例→进入仿真→SU7完整显示→空调22改23，验证工作台可操作；未执行收费云生成或真实录音。
- 原OpenSparX示例因dev.21节点检查提示cabin-vehicle配置待修正；保留原项目，没有把测试临时状态保存进项目。
- Windows批处理未在Windows实机执行，尚待同事验收；没有OpenSparX时其推理与依赖流程不可用，其他基础功能与ASR保留。

旧“只有主页”的准确原因没有远端日志无法确定。仓库旧静态Docker网页本身不带API，错误部署入口或把API回退到HTML是可见风险。本包明确采用单端口完整服务以避免这个遗漏。

最终产物：`OAKEgde-Studio-2.8.0-dev.21-Windows-full-no-OpenSparX-20260923-182231.zip`，244313959字节（约233.0MiB），876个清单文件。ZIP已重新解压并通过逐文件SHA256校验；OpenSparX权重/ollama模型数据不存在，三个CMD均CRLF格式。整体SHA256：`fe5366ede3aa645f5120328b3b6ac7af6b51d91bf4887dd1bc0e34f9eba462a9`。
