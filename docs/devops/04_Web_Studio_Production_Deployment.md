# OAKEgde Studio Web Studio 生产部署

这份文档面向“长期稳定网址”部署，不再依赖临时隧道。

## 目标

- 对外提供一个固定网址，例如 `https://oakegde.example.com/`
- 页面就是完整的 `OAKEgde Studio`
- 支持拖拽、连线、保存项目、打开项目、Models、Mock 运行
- 前端和后端走同一域名，不需要访问者自己配置 `localhost`

## 部署形态

生产部署使用 3 个容器：

- `frontend`
  - 构建 `studio/` 生产静态页面
- `backend`
  - 运行 `main_host_lite.py`
  - 提供 `/v1/*`
- `caddy`
  - 对外监听 `80/443`
  - 自动申请和续期 HTTPS 证书
  - 反向代理前端和后端

对应文件：

- `deploy/production/docker-compose.yml`
- `deploy/production/Caddyfile`
- `backend/Dockerfile.host-lite`
- `backend/docker-entrypoint.host-lite.sh`
- `scripts/deploy_web_studio_prod.sh`

## 前置条件

需要你准备 1 台公网 Linux 主机，以及 1 个域名。

要求：

- Linux 主机可以访问公网
- 域名已经解析到该主机公网 IP
- 防火墙已放行 `80` 和 `443`
- 主机已安装：
  - Docker
  - Docker Compose v2

## 第一步：配置域名

进入：

```bash
cd /path/to/Cyber-Edge-Agent-release-v2.5/deploy/production
```

复制环境文件：

```bash
cp .env.example .env
```

修改 `.env`：

```bash
DOMAIN=oakegde.example.com
HTTP_PORT=80
HTTPS_PORT=443
```

## 第二步：启动生产环境

在仓库根目录执行：

```bash
cd /path/to/Cyber-Edge-Agent-release-v2.5
./scripts/deploy_web_studio_prod.sh
```

脚本会自动完成：

- 创建持久化目录
- 首次拷贝默认项目 JSON
- 构建前端镜像
- 构建 host-lite 后端镜像
- 启动 `caddy + frontend + backend`

如果 DNS 已生效，最终访问：

```text
https://你的域名/
```

## 持久化数据

以下目录会被长期保留：

- `deploy/production/data/projects`
  - 保存的项目 JSON
- `deploy/production/data/pipelines`
  - pipeline 记录
- `deploy/production/data/state`
  - 模型注册表
  - 短期记忆

## 常用运维命令

查看状态：

```bash
docker compose --env-file deploy/production/.env -f deploy/production/docker-compose.yml ps
```

查看日志：

```bash
docker compose --env-file deploy/production/.env -f deploy/production/docker-compose.yml logs -f
```

重新部署：

```bash
./scripts/deploy_web_studio_prod.sh
```

停止服务：

```bash
docker compose --env-file deploy/production/.env -f deploy/production/docker-compose.yml down
```

## 适用范围

这套生产部署适合：

- 产品经理网页体验
- 内部评审
- 外部方案演示
- 长期稳定访问

它目前不等同于：

- 真实 SA8397 板端执行
- 真机 ADB 运行
- 真车接口真实调用

这些仍然属于设备侧流程。
