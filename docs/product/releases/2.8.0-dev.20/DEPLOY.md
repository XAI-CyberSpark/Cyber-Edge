# 使用与部署

## 本机使用

打开 `http://127.0.0.1:5175/`，输入网站使用密钥并点击“验证并进入”。
密钥文件：项目根 `.demo-runtime/access-key.txt`。该目录已被Git忽略，服务首次启动自动生成32字符随机密钥，文件权限0600；不要放入studio/public或前端环境变量。没有复用现有云模型API Key。

首次进入或刷新页面显示弹窗，同一次页面内返回首页不重复弹出。会话有效8小时，浏览器通过HttpOnly、SameSite=Strict Cookie发送，HTTPS下附Secure。后端重启全部会话失效，前端在聚焦或可见时每分钟检查；重新输入保留已挂载工作区。页面刷新原本就不会保留未保存项目，不增加自动草稿恢复。

## 服务配置

- 优先读取 `OAKEGDE_ACCESS_KEY`；否则读取 `OAKEGDE_ACCESS_KEY_FILE`，默认上述本机文件。密钥1—256字符（2026-09-23按用户要求支持单字符）。
- 更换环境变量或文件后重启后端生效，并清除旧会话。不要直接覆盖或删除已有文件而不通知使用者。
- `OAKEGDE_ALLOWED_ORIGINS` 为逗号分隔的精确来源；默认允许localhost/127.0.0.1的5173与5175。远程部署需指定真实HTTPS来源，前后端应通过同源代理访问。未接入跨域VITE_API_URL的凭据传递。
- 本轮会话只适用于单进程运行；多worker需共享会话和限流存储。自定义脚本先POST `/v1/access/login` JSON `{ "key": "网站密钥" }`，然后携带返回Cookie请求接口。不要在URL里传密钥。
- GET `/health`公开；GET `/v1/access/session`返回是否登录；其它HTTP路由与WS握手必须通过验证。没有新增公开查看密钥的接口。
- 当前后端已按原脚本重启，日志 `.demo-runtime/logs/backend-dev20.log`。原独立Ollama11435与ASR模型不变。仅本地服务，不新增公网隧道。

## 恢复

`.demo-runtime/versions/before-dev20-access/`包含本轮修改前的backend/main.py、main_host_lite.py、studio/src/main.tsx、studio/vite.config.ts及版本文档。不是全量项目备份，恢复前比较后续差异。
新增：backend/app/core/site_access.py、test_site_access.py、studio/src/components/ui/SiteAccessGate.tsx、site-access.css及测试/本版文档。回退需同时撤销前后端引用并重启服务，不重置Git、不清除项目或模型。访问密钥文件可保留，但禁止发布到静态资源目录。
