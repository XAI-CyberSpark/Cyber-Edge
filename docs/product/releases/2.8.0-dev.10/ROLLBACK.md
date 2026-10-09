# 回滚

助手接入前的文件备份：.demo-runtime/versions/2.8.0-dev.9-before-assistant/files/；manifest.json 记录 SHA-256，已校验。

注意：开发期间另一轮布局更新已推进至 dev.11。不能直接批量复制 dev.9 备份，否则会覆盖后来确认的布局。建议单独撤回顶部助手接入，保留当前布局和数据：

```bash
cd /Users/Shared/sherry/OAKEgde Studio
backend/.venv_macos/bin/python scripts/rollback_cockpit_assistant.py --check
backend/.venv_macos/bin/python scripts/rollback_cockpit_assistant.py --apply
```

脚本只移除 CockpitHmi 中本轮新增的助手引用与挂载，不删除助手源码、测试、项目或模型，不改当前版本号；操作前自动备份当前 HMI 文件，可恢复。执行后刷新页面。完整恢复某个历史视觉版本需同时核对对应布局快照，避免混合不同轮次文件。
