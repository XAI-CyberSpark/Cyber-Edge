# 验收：2.8.0-dev.43

2026-09-25，macOS本地未提交工作区。只修改提供商路由、回归测试与文档；未改UI布局和已有项目文件。

- 网关/v1/models返回Claude列表；/v1/messages以claude-sonnet-5返回HTTP 200、end_turn及普通正文。
- configure验证后原子写入服务端私有文件，权限0600，git check-ignore确认忽略；API状态不返回凭据。
- 工具submit_scenario真实返回儿童关怀trigger/action/failure三个字段，JSON解析和字段检查通过。
- 32项tests.test_model_providers与tests.test_scenario_builder回归通过；新增4项覆盖授权网关、禁止跨地址复用密钥、失败不覆盖、环境密钥不泄露给网关及请求不能改地址。
- 已确认并重启本机8000后端；5175真实网页显示Claude（fucheers.top）· claude-sonnet-5且已选中。选择仅用于当前打开场景的后续创作；没有重生成或保存儿童关怀节点。
- 隔离真实场景：朵朵生日航海文字小游戏，83.8秒，understand/build/repair/review四次调用。首次experience字段格式不正确，自动修复一次后通过，生成2节点候选，4项生成检查通过。没有save_on_success，无项目写入。
- runtime_verified=false；生成检查和同模型审查不是独立业务验证，尚未跑此候选或测试实车。网关报告模型ID，未独立验证上游模型身份或长期可用性。

脱敏证据见[evidence.json](evidence.json)。完整隔离测试结果保存在任务工作目录outputs/claude-connect/live-build.json，不含凭据。

状态：本机接入可用，未提交未发布；没有前端源码修改，未重复前端构建。飞书未同步。


2026-09-25同轮修复：studio/ce-node-qa.tsx误拼接了不完整导入和第二份nodes声明，造成Vite语法报错。仅删除两行重复代码，保留17类节点预览。Babel解析、运行中Vite模块转换HTTP 200、前端生产构建通过；实际打开生日航海工作台确认错误遮罩消失，Claude选项可用。未修改或保存场景节点。
