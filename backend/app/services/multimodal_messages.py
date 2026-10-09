"""Translate the Studio image-message contract without fetching URLs or hiding errors."""
from __future__ import annotations
import base64
import binascii
import json
from urllib.parse import urlsplit
from fastapi import HTTPException

# Match Studio's prepared-image ceiling; aggregate budget stays below the
# smallest configured provider request ceiling including base64 overhead.
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_MESSAGE_BYTES = 24 * 1024 * 1024
FORMATS = {'image/png','image/jpeg','image/webp','image/gif'}


def image_source(url):
    if not isinstance(url,str) or not url:
        raise HTTPException(400,'图片地址缺失。')
    if url.startswith('data:'):
        header, separator, encoded=url.partition(',')
        mime=header[5:-7] if header.endswith(';base64') else ''
        if not separator or mime not in FORMATS:
            raise HTTPException(400,'图片需使用 PNG、JPEG、WebP 或 GIF 的 base64 数据。')
        if len(encoded)>4*((MAX_IMAGE_BYTES+2)//3):
            raise HTTPException(413,'准备后的单张图片超过4MB，请缩小后上传。')
        try:raw=base64.b64decode(encoded,validate=True)
        except (binascii.Error,ValueError):raise HTTPException(400,'图片base64数据无效。') from None
        if len(raw)>MAX_IMAGE_BYTES:raise HTTPException(413,'准备后的单张图片超过4MB，请缩小后上传。')
        signatures={'image/png':raw.startswith(b'\x89PNG\r\n\x1a\n'),'image/jpeg':raw.startswith(b'\xff\xd8\xff'),
                    'image/webp':raw.startswith(b'RIFF') and raw[8:12]==b'WEBP','image/gif':raw[:6] in (b'GIF87a',b'GIF89a')}
        if not signatures[mime]:raise HTTPException(400,'图片内容与声明格式不符。')
        return {'type':'base64','media_type':mime,'data':encoded}
    try:
        parsed=urlsplit(url)
        valid=parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password
        # Trigger validation for malformed ports too. No request is made here.
        parsed.port
    except ValueError:valid=False
    if not valid:raise HTTPException(400,'图片需使用上传的数据或有效HTTPS地址，不接受本地文件路径。')
    return {'type':'url','url':url}


def provider_messages(messages,provider_id):
    if not isinstance(messages,list) or not messages:
        raise HTTPException(400,'模型消息不能为空。')
    if len(json.dumps(messages,ensure_ascii=False).encode())>MAX_MESSAGE_BYTES:
        raise HTTPException(413,'模型消息超过24MB传输预算，请减少或缩小图片。')
    normalized=[]
    for message in messages:
        if not isinstance(message,dict) or message.get('role') not in ('system','user','assistant'):
            raise HTTPException(400,'模型消息角色无效。')
        role=message['role'];content=message.get('content')
        if isinstance(content,str):normalized.append({'role':role,'content':content});continue
        if not isinstance(content,list) or not content:raise HTTPException(400,'消息内容需为文字或非空图片/文字列表。')
        blocks=[]
        for part in content:
            if not isinstance(part,dict):raise HTTPException(400,'消息内容块格式无效。')
            if part.get('type')=='text' and isinstance(part.get('text'),str):
                blocks.append({'type':'text','text':part['text']});continue
            if part.get('type')!='image_url':raise HTTPException(400,'此连接支持文字和图片内容块，其他模态尚未接入。')
            if role!='user':raise HTTPException(400,'图片需放在用户输入消息中。')
            spec=part.get('image_url')
            if not isinstance(spec,dict):raise HTTPException(400,'图片内容块缺少image_url对象。')
            source=image_source(spec.get('url'))
            detail=spec.get('detail','auto')
            if detail not in ('auto','default','low','high'):raise HTTPException(400,'图片detail字段无效。')
            if provider_id=='anthropic':blocks.append({'type':'image','source':source})
            else:
                out={'url':spec['url']}
                if 'detail' in spec:out['detail']=('default' if detail=='auto' else detail) if provider_id=='minimax' else ('auto' if detail=='default' else detail)
                blocks.append({'type':'image_url','image_url':out})
        normalized.append({'role':role,'content':'\n'.join(p['text'] for p in blocks) if role=='system' else blocks})
    return normalized
