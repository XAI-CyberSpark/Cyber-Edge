# 任务

- [x] 撤销本轮早些时候"整套移除"的未提交改动，完整还原 site_access.py、SiteAccessGate 及相关测试、词条（Kimi）。
- [x] 后端 site_access.py 新增 enabled 开关：默认关闭，OAKEGDE_SITE_ACCESS 或显式 key 启用；关闭时直通且不创建密钥文件，session 端点新增 required 字段（Kimi）。
- [x] main.py、main_host_lite.py 挂载点注释更新为"默认关闭、环境变量启用"（Kimi）。
- [x] 前端 SiteAccessGate 新增初始会话探测：required:false 或会话有效时自动解锁不弹窗（Kimi）。
- [x] 后端 test_site_access.py 新增 3 项关闭/开关用例；前端 DOM 测试更新并新增第 5 场景（Kimi）。
- [x] deploy/windows：server.py 注释说明默认关闭；check.py 按 required 自动适配开启/关闭两种自检路径（Kimi）。
- [x] 后端全量 253 项通过；TestClient 实测默认关闭 200/required:false/login 404，开启后 401→登录→200（Kimi）。
- [x] 前端 tsc、Vite 构建、site-access DOM 测试 5 场景、audit-typography --write、audit-localization 通过（Kimi）。
- [x] 登记 2.8.0-dev.74：VERSION、CHANGELOG、CONTEXT、主文档当前状态；未提交、未发布。
