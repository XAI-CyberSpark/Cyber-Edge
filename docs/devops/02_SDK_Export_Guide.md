# SDK 导出说明

OAKEgde Studio Agent 后端现在支持将当前编排图导出为一个可复用的 Python SDK 压缩包。

导出接口：

- `POST /v1/sdk/export`

请求体示例：

```json
{
  "name": "smart_cabin_agent",
  "package_name": "smart_cabin_sdk",
  "default_model": "qwen2.5:0.5b",
  "nodes": [],
  "edges": []
}
```

本地导出示例：

```bash
curl -X POST http://127.0.0.1:8000/v1/sdk/export \
  -H "Content-Type: application/json" \
  -d @payload.json \
  --output smart_cabin_sdk.zip
```

解压后目录中会包含：

- `pyproject.toml`
- `README.md`
- `your_package/__init__.py`
- `your_package/runner.py`
- `your_package/graph.json`

SDK 使用方式：

```python
from smart_cabin_sdk import ExportedAgent

agent = ExportedAgent(
    inference_base_url="http://127.0.0.1:11434/v1",
    default_model="qwen2.5:0.5b",
)

result = agent.run("打开车窗")
print(result["final_output"])
print(result["execution_log"])
```

当前导出的 SDK 适合做：

- 本地 Python 集成
- 二次开发封装
- 服务端内嵌调用

当前导出的 SDK 还不等同于免安装桌面 App，它仍需要 Python 运行环境以及一个可访问的推理接口。
