# OAKEgde Studio Desktop

这是第一阶段桌面版打包尝试。

当前方案：

- 使用 Electron 作为桌面壳
- 使用 `studio` 的静态构建产物作为前端
- 使用 `backend/.venv` + `backend/main.py` 作为本地运行时
- 启动桌面应用时自动拉起本地 FastAPI backend
- 前端通过 `http://127.0.0.1:8000` 访问 backend

## 本地打包准备

先确保以下条件成立：

- `backend/.venv` 已经可用
- `studio` 依赖已安装
- 本机已经安装并可使用 Ollama（如果需要真实模型）

## 开发测试

```bash
cd /home/xailab/data/Cyber-Edge-Agent-release-v2.0/desktop
npm install
npm run start
```

## 生成 Linux 包

```bash
cd /home/xailab/data/Cyber-Edge-Agent-release-v2.0/desktop
npm install
npm run dist:linux
```

生成产物位于：

- `desktop/dist/`

## 当前阶段限制

- 当前桌面版优先支持 Linux
- 当前仍依赖本机 Ollama 提供模型推理
- `backend/.venv` 会被一起打包，因此体积较大
- 前端 `studio` 本身仍存在仓库历史 TypeScript / ESLint 问题，所以桌面打包流程暂时使用 `vite build` 而不是 `npm run build`
