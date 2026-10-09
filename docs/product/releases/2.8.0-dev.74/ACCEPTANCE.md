# 验收

2026-09-29｜2.8.0-dev.74｜未提交工作区、未发布

## 改动（Kimi）

用户群聊指令最终确定为"保留代码 改为默认关闭"（先于同轮"去除密钥登录限制"曾按整套移除执行，未提交即被用户修正；移除改动已全部 git 还原，无残留）。

后端：
- backend/app/core/site_access.py：中间件完整保留，新增 enabled 开关。默认关闭（enabled 未显式指定时由 OAKEGDE_SITE_ACCESS=1/true/on/yes 决定；显式传 key 视为启用，既有测试直挂方式不变）。关闭时：全部 HTTP/WebSocket 直通，不读取/创建密钥文件，GET /v1/access/session 返回 {"authenticated": true, "expires_in": 0, "required": false}，/v1/access/login 返回 404。开启时：原有密钥校验、会话 Cookie（HttpOnly/SameSite=strict/HTTPS Secure）、限流、来源白名单语义不变，session 响应增加 "required": true。
- backend/main.py、backend/main_host_lite.py：挂载不变，注释更新为默认关闭、环境变量启用。

前端：
- studio/src/components/ui/SiteAccessGate.tsx：新增挂载时会话探测。后端返回 required:false（或会话仍有效、端点不存在）时自动解锁并挂载内容、不弹窗；required:true 且无会话时维持原弹窗、错误反馈、到期重锁行为。
- studio/src/main.tsx、site-access.css、en.json 词条：维持原样（还原后无净变化）。

测试：
- backend/test_site_access.py：原 7 项开启模式用例不变；新增 3 项——默认关闭下匿名 HTTP/WebSocket 直通、跨来源不拦截、不创建密钥文件；session 报 required:false 且 login 404；OAKEGDE_SITE_ACCESS=1 后恢复 401→登录→200。
- studio/tests/site-access.dom.tsx：更新初始探测断言（挂载后 1 次 session 调用），新增第 5 场景：后端 required:false 时一次探测即解锁、无弹窗、无登录调用。

Windows 部署：
- deploy/windows/server.py：保留 OAKEGDE_ACCESS_KEY_FILE 注入（仅开启时消费），加注默认关闭注释；不设置 OAKEGDE_SITE_ACCESS。
- deploy/windows/check.py：先查 /v1/access/session 的 required——开启时走原"匿名 401＋密钥登录"自检，关闭时直接验证 /v1/projects/ 200；私有文件防直出检查保留。

## 验证（直接证据）

- 后端全量 `python -m unittest discover -s tests`：253 项通过（5 项跳过为既有条件跳过）。
- 专项 `python -m unittest test_site_access`：10 项全部通过（原 7＋新 3）。
- TestClient 实测真实 app（main.py）：默认（无环境变量）GET /v1/projects/ 200、session 返回 required:false、login 404；OAKEGDE_SITE_ACCESS=1 时匿名 401、错误密钥 401、正确密钥登录 200 后 200。
- 前端：npm run build（tsc -b + vite）成功（✓ built in 4.87s）；node scripts/test-site-access.mjs 5 个场景全过；audit-typography.mjs --write 后 0 violations（TYPOGRAPHY_INVENTORY.json 重新生成，门禁词条恢复在册）；audit-localization.mjs Missing 0、无裸 JSX 文本。

## 已知问题与限制（如实记录）

- 顶层 `python -m unittest discover`（backend 根目录 27 项）中 test_opensparx 的多模态用例 1 项 ERROR：合成 PNG（base64 "AAAA"）无法被 PIL 解码。调用链仅在 inference_lifecycle/PIL，与本轮改动文件无交集，判定为既有失败（推断：图像预处理先于转发导致旧夹具图片失效），按证据纪律保留计为失败、未改动该测试。
- 默认关闭后任何能访问后端地址的客户端均可调用全部 API 与遥测 WebSocket；适用本机/受信网络，公网部署应显式设 OAKEGDE_SITE_ACCESS=1。CORS 仍为 allow_origins=["*"]（既有配置，本轮未改）。
- 未做真实浏览器人工抽样；弹窗/直通两条路径由 DOM 测试与 TestClient 覆盖。
- .demo-runtime/ 历史快照、既有 Windows 交付包与 access-key.txt 原样保留；默认关闭时密钥文件不再被读取或新建，开启后仍按原逻辑使用。
- 模型服务商 API 密钥（WORKFLOW_LLM_API_KEY、模型设置页）与本轮无关，功能未动。
