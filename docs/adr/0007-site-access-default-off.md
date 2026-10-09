# 网站密钥门禁保留代码、默认关闭

日期：2026-09-29（dev.74）。状态：用户确认；未提交、未发布。依据：docs/product/releases/2.8.0-dev.74/PRD.md。

## 决策

用户先要求“去除密钥登录限制”，随后明确修正为“保留代码，改为默认关闭”。按最新要求：SiteAccessMiddleware（backend/app/core/site_access.py）与前端 SiteAccessGate 完整保留，默认不启用。

- 设置 OAKEGDE_SITE_ACCESS=1/true/on/yes 开启；开启后行为与之前一致：密钥校验、HttpOnly SameSite=strict 会话 Cookie、登录限流、来源白名单。
- 关闭时所有请求直通，不创建密钥文件；/v1/access/session 返回 required:false，/v1/access/login 返回 404。前端探测到 required:false 后自动解锁。
- 构造时显式传入 key 视为开启，保持既有测试的直挂方式。

## 安全影响

默认关闭后，任何能访问后端地址的客户端都能调用全部 API，只适用于本机或受信网络。公网或共享网络部署必须显式开启门禁。关闭门禁时，WebSocket 和 Origin 白名单检查也一并跳过。

## 影响

- 不影响模型服务商密钥（WORKFLOW_LLM_API_KEY 等）。
- Windows 部署 server.py 保留密钥文件路径注入但不默认开启；check.py 按 required 字段适配两种模式。
- 若以后要改为默认开启或彻底移除，需新增 ADR 替代本条。
