# FastVLM 最小接口说明

当前 backend 已接入本地 `apple/FastVLM-0.5B`，默认模型目录：

- `/home/xailab/data/models/apple/FastVLM-0.5B`

可通过环境变量覆盖：

- `FASTVLM_MODEL_DIR`

## 1. 专用 VLM 接口

接口：

- `POST /v1/inference/vlm/describe`

请求体：

```json
{
  "image_url": "data:image/png;base64,...",
  "prompt": "Describe this image in one sentence.",
  "model": "apple/FastVLM-0.5B",
  "max_new_tokens": 64
}
```

返回示例：

```json
{
  "id": "vlm-1712345678",
  "created": 1712345678,
  "model": "apple/FastVLM-0.5B",
  "text": "A red rectangle is shown in the center of a light background.",
  "usage": {
    "prompt_tokens": 6,
    "completion_tokens": 12,
    "total_tokens": 18
  }
}
```

## 2. 兼容现有 chat/completions

如果请求：

- `model = "apple/FastVLM-0.5B"`
- `messages` 中用户消息为 multimodal list

backend 会自动路由到 FastVLM。

请求示例：

```json
{
  "model": "apple/FastVLM-0.5B",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe this image in one sentence." },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ],
  "max_tokens": 64
}
```

## 3. 当前限制

- 当前环境中 FastVLM 已验证可在 CPU 上运行
- 若要启用 GPU，需要进一步解决 Jetson 上 PyTorch/CUDA 驱动兼容问题
- 第一次调用会触发模型加载，耗时会明显更长
