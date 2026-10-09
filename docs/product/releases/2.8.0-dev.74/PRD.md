# 网站密钥登录改为默认关闭（保留代码）

2026-09-29｜2.8.0-dev.74

用户群聊指令演进：先要求"去除密钥登录限制"（@codex 建议按整套移除解读，曾短暂按移除执行、未提交），随后用户明确修正为"保留代码 改为默认关闭"——密钥登录功能完整保留，默认不启用，可用环境变量再开启。本条用户最新明确要求优先。

范围：
- 后端：SiteAccessMiddleware 保留并新增开关，默认关闭（OAKEGDE_SITE_ACCESS=1/true/on/yes 启用）；关闭时全部请求直通、不创建密钥文件，/v1/access/session 返回 required:false，/v1/access/login 返回 404。开启时行为与之前完全一致（密钥校验、会话 Cookie、限流、来源白名单）。显式传入 key 的构造视为启用（既有测试直挂方式不变）。
- 前端：SiteAccessGate 保留，新增挂载时会话探测：后端关闭门禁（或会话仍有效）时自动解锁、不弹窗；开启且无会话时维持原弹窗行为。
- 测试：backend/test_site_access.py 保留原有 7 项开启模式用例，新增 3 项（默认关闭直通且不建密钥文件、session 报 required:false 且 login 404、环境变量开启后恢复拦截）；studio/tests/site-access.dom.tsx 更新初始探测断言并新增"后端关闭时自动解锁"场景。
- Windows 部署：server.py 保留密钥文件路径注入但不默认开启门禁（加注注释）；check.py 按 /v1/access/session 的 required 自动适配两种模式。
- 版本与主文档同步登记。

非目标：不动模型 API 密钥（WORKFLOW_LLM_API_KEY 等服务商密钥）相关功能；不改 .demo-runtime 历史快照与既有交付包；不处理 CORS 策略本身；不为开启模式改任何既有安全语义。

安全影响（如实记录）：默认关闭后，任何能访问后端地址的客户端均可调用全部 API，适用于本机/受信网络；需要拦截时设 OAKEGDE_SITE_ACCESS=1 即可恢复原有完整门禁。公网部署应显式开启。

验收：后端全量 unittest 通过；TestClient 实测默认关闭直通与开启后拦截两条路径；前端 tsc、Vite 构建、DOM 测试、字体与本地化审计通过。
