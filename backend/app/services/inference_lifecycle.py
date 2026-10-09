"""Local inference deadline, disconnect propagation and bounded image preparation."""
import asyncio
import base64
import copy
import io
import json
from pathlib import Path

import httpx
from fastapi import HTTPException

POLICY = json.loads((Path(__file__).resolve().parents[3] / 'studio/src/data/inferencePolicy.json').read_text())


def prepare_local_messages(messages, max_edge):
    from PIL import Image, ImageOps
    prepared = copy.deepcopy(messages)
    for message in prepared:
        content = message.get('content')
        if not isinstance(content, list):
            continue
        for part in content:
            if part.get('type') != 'image_url':
                continue
            url = part.get('image_url', {}).get('url', '')
            if not isinstance(url, str) or not url.startswith('data:image/'):
                continue
            try:
                header, encoded = url.split(',', 1)
                if ';base64' not in header or len(encoded) > 36_000_000:
                    raise ValueError('Invalid image payload')
                raw = base64.b64decode(encoded, validate=True)
                with Image.open(io.BytesIO(raw)) as original:
                    if original.width * original.height > 80_000_000:
                        raise ValueError('Image too large')
                    image = ImageOps.exif_transpose(original)
                    if max(image.size) <= max_edge:
                        continue
                    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                    if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
                        rgba = image.convert('RGBA')
                        image = Image.new('RGB', rgba.size, 'white')
                        image.paste(rgba, mask=rgba.getchannel('A'))
                    else:
                        image = image.convert('RGB')
                    output = io.BytesIO()
                    image.save(output, format='JPEG', quality=90)
                    part['image_url']['url'] = 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode()
            except (ValueError, OSError, Image.DecompressionBombError) as exc:
                raise HTTPException(422, '图片无法处理，请使用有效的 PNG、JPG 或 WebP 图片。') from exc
    return prepared


async def bounded_inference(operation, request, timeout_seconds):
    stopping = asyncio.Event()
    async def disconnected():
        while not stopping.is_set():
            if await request.is_disconnected():
                return
            # Starlette's disconnect probe uses a cancelled AnyIO scope and may
            # consume task cancellation. The explicit stop flag prevents cleanup
            # from waiting forever after a successful model response.
            if stopping.is_set():
                return
            await asyncio.sleep(.1)
    work = asyncio.create_task(operation())
    disconnect = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({work, disconnect}, timeout=timeout_seconds, return_when=asyncio.FIRST_COMPLETED)
        if disconnect in done:
            raise HTTPException(499, '本次执行已取消。')
        if work not in done:
            raise HTTPException(504, '模型响应超时，未获得判断结果。请稍后重试。')
        return await work
    finally:
        stopping.set()
        for task in (work, disconnect):
            if not task.done():
                task.cancel()
        await asyncio.gather(work, disconnect, return_exceptions=True)


async def local_chat(body, request):
    from app.services.opensparx_service import BASE_URL, MODEL_ID
    config = POLICY['models'][MODEL_ID]
    async def run():
        messages = await asyncio.to_thread(prepare_local_messages, body.messages, config['imageMaxEdge'])
        payload = {'model': MODEL_ID, 'messages': messages, 'temperature': body.temperature,
                   'max_tokens': body.max_tokens, 'stream': False}
        if body.json_mode:
            payload['response_format'] = {'type': 'json_object'}
        try:
            async with httpx.AsyncClient(trust_env=False, timeout=httpx.Timeout(config['timeoutMs']/1000, connect=3)) as client:
                response = await client.post(BASE_URL + '/chat/completions', json=payload)
                response.raise_for_status()
                result = response.json()
            choice = result['choices'][0]
            content = choice['message']['content']
            if result.get('model') != MODEL_ID or choice.get('finish_reason') == 'length' or not isinstance(content, str) or not content.strip():
                raise ValueError('Invalid model output')
            if body.json_mode and not isinstance(json.loads(content), dict):
                raise ValueError('Expected JSON object')
            return result
        except httpx.TimeoutException as exc:
            raise HTTPException(504, '图像或模型推理超时，未获得判断结果。请稍后重试。') from exc
        except httpx.HTTPStatusError as exc:
            # Preserve the existing actionable context-budget error, without raw provider data.
            import re
            match = re.search(r'request \((\d{1,9}) tokens\) exceeds the available context size \((\d{1,9}) tokens\)', exc.response.text) if exc.response.status_code == 400 else None
            if match:
                raise HTTPException(422, f'输入超出模型上下文上限（本次 {match[1]} tokens，上限 {match[2]} tokens）。请缩小图片或缩短提示词。') from exc
            raise HTTPException(503, '本地模型服务暂时不可用，未获得判断结果。') from exc
        except (httpx.RequestError, ValueError, KeyError, IndexError, TypeError) as exc:
            raise HTTPException(503, '本地模型推理失败或输出不完整，未使用模拟结果。') from exc
    return await bounded_inference(run, request, config['timeoutMs']/1000)
