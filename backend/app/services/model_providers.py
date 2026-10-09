"""Explicit, server-owned authoring providers. Secrets never enter project JSON.

Settings are for this local single-access-key workspace, not a multi-tenant vault.
"""
from __future__ import annotations
from contextvars import ContextVar
# Request-local opt-in observer; receives numerical usage only, never messages or credentials.
COMPLETION_USAGE_OBSERVER = ContextVar('oakegde_completion_usage_observer', default=None)

def _observe_usage(data):
    observer=COMPLETION_USAGE_OBSERVER.get()
    if observer is None:return
    raw=data.get('usage') or {}
    def count(*keys):
        value=next((raw[k] for k in keys if k in raw),None)
        return value if type(value) is int and value>=0 else None
    observer({'input_tokens':count('input_tokens','prompt_tokens'),
              'output_tokens':count('output_tokens','completion_tokens'),
              'cache_read_tokens':count('cache_read_input_tokens'),
              'cache_write_tokens':count('cache_creation_input_tokens')})

import asyncio
import json
import os
import re
import tempfile
import threading
import time
from dataclasses import dataclass, field
from app.services.model_reasoning import capabilities, request_fields
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

PROVIDERS = {
    'minimax': {'label':'MiniMax', 'base_url':'https://api.minimaxi.com/v1', 'model':'MiniMax-M3'},
    'openai': {'label':'GPT', 'base_url':'https://api.openai.com/v1', 'model':'gpt-4.1'},
    'anthropic': {'label':'Claude', 'base_url':'https://api.anthropic.com/v1', 'model':'claude-sonnet-5'},
}
# Endpoint/model capability verified with a real minimal tool submission (dev.57).
# Unverified models retain auto selection; forced-tool support is not universal.
FORCED_STRUCTURED_BINDINGS = {('anthropic', 'https://www.fucheers.top/v1', 'claude-sonnet-5')}

SETTINGS_PATH = Path(__file__).resolve().parents[3] / '.demo-runtime' / 'model-providers.json'
_LOCK = threading.RLock()

# Endpoint changes are server-owned, never accepted from a generation request.
# This gateway was explicitly supplied by the workspace owner.
CLAUDE_BASE_URLS = frozenset({PROVIDERS['anthropic']['base_url'], 'https://www.fucheers.top/v1'})


def _claude_base_url(value):
    base = str(value).rstrip('/')
    if base not in CLAUDE_BASE_URLS:
        raise HTTPException(400, 'Claude 服务地址未获本机授权。')
    return base

@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    base_url: str
    model: str
    api_key: str = field(repr=False)


def _read():
    try:
        data = json.loads(SETTINGS_PATH.read_text())
        if not isinstance(data, dict): raise ValueError()
        return data
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        raise HTTPException(503, '模型配置无法读取，请检查服务端配置文件。') from None


def resolve(provider_id='minimax', model=None, *, require_key=True):
    from app.services.orchestration_service import OrchestrationService as Legacy
    if provider_id not in PROVIDERS:
        raise HTTPException(400, '不支持的模型服务，请重新选择。')
    spec = PROVIDERS[provider_id]
    saved = _read().get(provider_id, {})
    key = saved.get('api_key', '')
    default_model = spec['model']
    base = spec['base_url']
    if provider_id == 'anthropic':
        base = _claude_base_url(saved.get('base_url') or base)
    if provider_id == 'minimax':
        # Never reuse OPENAI_API_KEY for MiniMax, even in a legacy environment.
        legacy_base = Legacy._resolve_base_url()
        if urlparse(legacy_base).hostname in ('api.minimaxi.com', 'api.minimax.io'):
            base = legacy_base
        key = key or os.getenv('MINIMAX_API_KEY', '') or (os.getenv('WORKFLOW_LLM_API_KEY', '') if urlparse(legacy_base).hostname in ('api.minimaxi.com', 'api.minimax.io') else '') or Legacy._resolve_api_key_from_files()
        legacy_model = Legacy._resolve_model()
        if legacy_model.startswith('MiniMax-'): default_model = legacy_model
    elif base == spec['base_url']:
        # Official environment credentials must never be inherited by a gateway.
        key = key or os.getenv('OPENAI_API_KEY' if provider_id == 'openai' else 'ANTHROPIC_API_KEY', '')
    model = (model or saved.get('model') or default_model).strip()
    prefix = {'minimax':'MiniMax-', 'openai':'gpt-', 'anthropic':'claude-'}[provider_id]
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,149}', model) or not model.startswith(prefix):
        raise HTTPException(400, f'请输入 {spec["label"]} 的有效模型 ID。')
    if require_key and not key.strip():
        raise HTTPException(503, f'请先在模型选项中接入 {spec["label"]}，当前项目已保留。')
    label = spec['label'] if base == spec['base_url'] or provider_id != 'anthropic' else 'Claude（fucheers.top）'
    return Provider(provider_id, label, base, model, key.strip())


def statuses():
    return [{'id':p.id, 'label':p.label, 'model':p.model, 'configured':bool(p.api_key),'reasoning':capabilities(p.id,p.model)}
            for p in (resolve(id, require_key=False) for id in PROVIDERS)]


def _request(provider, messages, schema=None, max_tokens=14000, reasoning=None):
    fields = request_fields(provider.id, provider.model, reasoning)
    if not provider.api_key:
        raise HTTPException(503, f'请先接入 {provider.label}。')
    from app.services.multimodal_messages import provider_messages
    messages = provider_messages(messages, provider.id)
    tool = {'name':'submit_scenario','description':'提交本阶段的结构化结果，不执行任何操作。'}
    if provider.id == 'anthropic':
        payload = {'model':provider.model, 'max_tokens':max_tokens,
                   'system':'\n\n'.join(m['content'] for m in messages if m['role']=='system'),
                   'messages':[m for m in messages if m['role']!='system']}
        if schema:
            choice = {'type':'tool','name':tool['name'],'disable_parallel_tool_use':True} if (provider.id,provider.base_url,provider.model) in FORCED_STRUCTURED_BINDINGS else {'type':'auto'}
            payload.update(tools=[{**tool,'input_schema':schema}], tool_choice=choice)
        payload.update(fields)
        if fields.get('thinking',{}).get('type') == 'adaptive' and schema: payload['tool_choice']={'type':'auto'}
        return '/messages', {'x-api-key':provider.api_key,'anthropic-version':'2023-06-01'}, payload
    payload = {'model':provider.model,'messages':messages,'stream':False}
    if provider.id == 'openai':
        payload['max_completion_tokens'] = max_tokens
        # Omit sampling parameters: reasoning GPT families restrict temperature.
    else:
        payload.update(max_tokens=max_tokens, temperature=0.3, reasoning_split=True)
        if provider.model == 'MiniMax-M3': payload['thinking']={'type':'disabled'}
    if schema:
        payload.update(tools=[{'type':'function','function':{**tool,'parameters':schema}}], tool_choice='auto')
    payload.update(fields)
    return '/chat/completions', {'Authorization':f'Bearer {provider.api_key}'}, payload


def _result(provider, data, schema):
    if provider.id == 'anthropic':
        if data.get('stop_reason') not in ('end_turn','tool_use'):
            raise ValueError('incomplete or refused response')
        blocks = data.get('content', [])
        calls = [b for b in blocks if b.get('type') == 'tool_use']
        if schema and calls:
            if len(calls)!=1 or calls[0].get('name')!='submit_scenario': raise ValueError('unexpected tool')
            return json.dumps(calls[0]['input'], ensure_ascii=False)
        content = '\n'.join(b['text'] for b in blocks if b.get('type') == 'text')
    else:
        choice = data.get('choices', [])[0]
        if choice.get('finish_reason') not in ('stop','tool_calls'): raise ValueError('incomplete or refused response')
        message = choice['message']
        if message.get('refusal'): raise ValueError('refused response')
        calls = message.get('tool_calls') or []
        if schema and calls:
            if len(calls)!=1 or calls[0]['function']['name']!='submit_scenario': raise ValueError('unexpected tool')
            return calls[0]['function']['arguments']
        content = message.get('content')
    if not isinstance(content,str) or not content.strip(): raise ValueError('empty response')
    return content


def _failure(provider, exc):
    if isinstance(exc, HTTPException): return exc
    if isinstance(exc, httpx.TimeoutException):
        detail=f'{provider.label} 响应超时，请重试；未切换到其他模型。'
    elif isinstance(exc, httpx.HTTPStatusError):
        code=exc.response.status_code
        detail=f'{provider.label} 调用失败（HTTP {code}），请检查 API 密钥、模型权限或额度；未切换到其他模型。'
    else:
        detail=f'{provider.label} 连接失败或未返回完整结果，请检查配置后重试；未切换到其他模型。'
    result=HTTPException(503, detail)
    if isinstance(exc,httpx.HTTPStatusError):result.upstream_status_code=exc.response.status_code
    return result


async def complete(provider, messages, schema=None, max_tokens=14000, reasoning=None):
    path, headers, payload = _request(provider,messages,schema,max_tokens,reasoning)
    try:
        async with httpx.AsyncClient(trust_env=False,follow_redirects=False,timeout=httpx.Timeout(90,connect=15)) as client:
            response = await client.post(provider.base_url+path,headers=headers,json=payload)
            response.raise_for_status()
            data=response.json()
            _observe_usage(data)
            return _result(provider,data,schema)
    except Exception as exc:
        raise _failure(provider, exc) from None


def runtime_chat(request):
    provider = resolve(request.provider_id, request.model)
    path,headers,payload = _request(provider,request.messages,max_tokens=min(request.max_tokens or 2048,14000))
    try:
        with httpx.Client(trust_env=False,follow_redirects=False,timeout=httpx.Timeout(55,connect=10)) as client:
            response=client.post(provider.base_url+path,headers=headers,json=payload)
            response.raise_for_status()
            data=response.json();content=_result(provider,data,None)
        usage=data.get('usage') or {}
        input_tokens=usage.get('prompt_tokens',usage.get('input_tokens',0))
        output_tokens=usage.get('completion_tokens',usage.get('output_tokens',0))
        return {'id':data.get('id','provider-response'),'created':int(time.time()),'model':data.get('model',provider.model),
                'choices':[{'index':0,'message':{'role':'assistant','content':content},'finish_reason':'stop'}],
                'usage':{'prompt_tokens':input_tokens,'completion_tokens':output_tokens,'total_tokens':input_tokens+output_tokens}}
    except Exception as exc:
        raise _failure(provider,exc) from None


async def configure(provider_id, model, api_key, *, base_url=None):
    current=resolve(provider_id, model, require_key=False)
    base = current.base_url
    if base_url is not None:
        if provider_id != 'anthropic':
            raise HTTPException(400, '此服务不支持修改连接地址。')
        base = _claude_base_url(base_url)
    if base != current.base_url and not (api_key and api_key.strip()):
        raise HTTPException(400, '切换服务地址时必须提供该服务的 API 密钥。')
    provider=Provider(current.id,current.label,base,current.model,api_key.strip() if api_key else current.api_key)
    # Validate the requested model with a minimal text call before replacing settings.
    await complete(provider,[{'role':'user','content':'Reply with OK.'}],max_tokens=512)
    def save():
        with _LOCK:
            data=_read();data[provider_id]={'model':provider.model,'api_key':provider.api_key}
            if provider_id == 'anthropic': data[provider_id]['base_url'] = provider.base_url
            SETTINGS_PATH.parent.mkdir(parents=True,exist_ok=True)
            fd,name=tempfile.mkstemp(prefix='.providers-',dir=SETTINGS_PATH.parent)
            try:
                os.fchmod(fd,0o600)
                with os.fdopen(fd,'w') as f:
                    json.dump(data,f);f.flush();os.fsync(f.fileno())
                os.replace(name,SETTINGS_PATH)
            finally:
                if os.path.exists(name):os.unlink(name)
    await asyncio.to_thread(save)
    return next(x for x in statuses() if x['id']==provider_id)
