"""Independent local OpenSparX service; never substitutes simulated inference."""
import json
import os
import re
import requests
from fastapi import HTTPException

MODEL_ID = 'opensparx-cabin-intent:3b'
BASE_URL = os.getenv('OPENSPARX_BASE_URL', 'http://127.0.0.1:11435/v1').rstrip('/')


class OpenSparXService:
    @staticmethod
    def _post(url, payload, timeout):
        with requests.Session() as session:
            session.trust_env = False
            response = session.post(url, json=payload, timeout=timeout)
            response.raise_for_status()
            return response.json()

    @staticmethod
    def status():
        try:
            data = OpenSparXService._post(BASE_URL.removesuffix('/v1') + '/api/show', {'model': MODEL_ID}, (3, 5))
            if not isinstance(data, dict):
                raise ValueError('Invalid model status')
            return {'model': MODEL_ID, 'available': True, 'capabilities': data.get('capabilities', []), 'mode': 'local'}
        except (requests.RequestException, ValueError):
            return {'model': MODEL_ID, 'available': False, 'capabilities': [], 'mode': 'local', 'message': '本地 OpenSparX 不可用，请启动独立模型服务。'}

    @staticmethod
    def chat(request):
        from app.services.inference_lifecycle import POLICY, prepare_local_messages
        config = POLICY['models'][MODEL_ID]
        messages = prepare_local_messages(request.messages, config['imageMaxEdge'])
        payload = {'model': MODEL_ID, 'messages': messages, 'temperature': request.temperature, 'max_tokens': request.max_tokens, 'stream': False}
        if request.json_mode:
            payload['response_format'] = {'type': 'json_object'}
        try:
            result = OpenSparXService._post(BASE_URL + '/chat/completions', payload, (3, config['timeoutMs'] / 1000))
            if not isinstance(result, dict) or result.get('model') != MODEL_ID:
                raise ValueError('Unexpected model')
            choice = result['choices'][0]
            if choice.get('finish_reason') == 'length':
                raise ValueError('Truncated response')
            content = choice['message']['content']
            if not isinstance(content, str) or not content.strip():
                raise ValueError('Empty response')
            if request.json_mode and not isinstance(json.loads(content), dict):
                raise ValueError("Expected JSON object")
            return result
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as exc:
            # Preserve the actionable context error without exposing raw upstream data.
            if isinstance(exc, requests.HTTPError) and exc.response is not None and exc.response.status_code == 400:
                match = re.search(
                    r"request \((\d{1,9}) tokens\) exceeds the available context size \((\d{1,9}) tokens\)",
                    exc.response.text,
                )
                if match:
                    used, limit = match.groups()
                    raise HTTPException(
                        status_code=422,
                        detail=f"输入超出模型上下文上限（本次 {used} tokens，上限 {limit} tokens）。请缩小图片或缩短提示词，或调大模型上下文后重试。",
                    ) from exc
            raise HTTPException(status_code=503, detail='本地 OpenSparX 推理失败或输出不完整。请检查模型服务后重试；未使用模拟结果。') from exc
