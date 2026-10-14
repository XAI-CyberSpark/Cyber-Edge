"""Explicit, server-owned authoring providers. Secrets never enter project JSON.

Settings are for this local single-access-key workspace, not a multi-tenant vault.
"""
from __future__ import annotations
from contextvars import ContextVar
# Request-local opt-in observer; receives numerical usage only, never messages or credentials.
COMPLETION_USAGE_OBSERVER = ContextVar('oakegde_completion_usage_observer', default=None)
COMPLETION_METADATA_OBSERVER = ContextVar('oakegde_completion_metadata_observer', default=None)
COMPLETION_CALL_OBSERVER = ContextVar('oakegde_completion_call_observer', default=None)
COMPLETION_CALL_CONTEXT = ContextVar('oakegde_completion_call_context', default=None)
COMPLETION_BUDGET_HOOK = ContextVar('oakegde_completion_budget_hook', default=None)
FAILURE_CODES = frozenset(('output_truncated', 'refused_response', 'empty_response', 'invalid_json',
                          'invalid_response', 'tool_protocol', 'timeout', 'upstream_http', 'transport_error', 'cancelled'))
FINISH_REASONS = frozenset(('stop', 'tool_calls', 'length', 'content_filter', 'end_turn', 'tool_use',
                           'max_tokens', 'refusal', 'pause_turn', 'insufficient_system_resource'))


class ProviderResponseError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def completion_metadata(data, max_tokens, failure_code=None, *, provider_id=None):
    """Only fixed labels and nonnegative counts may leave the provider boundary."""
    data = data if isinstance(data, dict) else {}
    choices = data.get('choices')
    choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
    reason = data.get('stop_reason') or choice.get('finish_reason')
    usage = data.get('usage')
    usage = usage if isinstance(usage, dict) else {}
    details = usage.get('completion_tokens_details')
    details = details if isinstance(details, dict) else {}
    prompt_details = usage.get('prompt_tokens_details')
    prompt_details = prompt_details if isinstance(prompt_details, dict) else {}
    def count(raw):
        return raw if type(raw) is int and raw >= 0 else None
    read = count(usage.get('cache_read_input_tokens', usage.get('prompt_cache_hit_tokens',
                 prompt_details.get('cached_tokens'))))
    input_tokens = count(usage.get('input_tokens', usage.get('prompt_tokens')))
    uncached, input_lower_bound = None, input_tokens
    if provider_id == 'anthropic':
        # Claude's raw input excludes cache reads and writes. Missing fields are
        # not proof of zero caching, including on a compatible gateway.
        # https://platform.claude.com/docs/en/build-with-claude/prompt-caching
        uncached = count(usage.get('input_tokens'))
        parts = (uncached, count(usage.get('cache_read_input_tokens')),
                 count(usage.get('cache_creation_input_tokens')))
        input_lower_bound = sum(part for part in parts if part is not None) if any(
            part is not None for part in parts) else None
        input_tokens = input_lower_bound if all(part is not None for part in parts) else None
    result = {'finish_reason':reason if isinstance(reason, str) and reason in FINISH_REASONS else 'other',
            'requested_max_tokens':count(max_tokens),
            'input_tokens':input_tokens, 'input_uncached_tokens':uncached,
            'input_tokens_lower_bound':input_lower_bound,
            'output_tokens':count(usage.get('output_tokens', usage.get('completion_tokens'))),
            'reasoning_tokens':count(details.get('reasoning_tokens')),
            'cache_read_tokens':read, 'cache_hit_tokens':read,
            'cache_write_tokens':count(usage.get('cache_creation_input_tokens')),
            'cache_miss_tokens':count(usage.get('prompt_cache_miss_tokens')),
            'failure_code':failure_code if failure_code in FAILURE_CODES else None}
    known = [result[field] is not None for field in ('input_tokens', 'output_tokens')]
    result['usage_status'] = 'known' if all(known) else ('partial' if any(known) else 'unknown')
    result['cache_status'] = 'known' if any(result[field] is not None for field in
        ('cache_hit_tokens', 'cache_miss_tokens', 'cache_write_tokens')) else 'unknown'
    return result


def _notify(observer, metadata):
    if observer:
        try:
            observer(metadata)
        except Exception:
            pass


def _observe_completion(data, max_tokens, failure_code, *, provider_id=None):
    # Compatibility for existing adapters which supply a completed response.
    _notify(COMPLETION_METADATA_OBSERVER.get(), completion_metadata(data, max_tokens, failure_code,
                                                                  provider_id=provider_id))


def _observe_usage(data, provider_id=None):
    metadata = completion_metadata(data, None, provider_id=provider_id)
    _notify(COMPLETION_USAGE_OBSERVER.get(), {field: metadata[field] for field in
        ('input_tokens', 'input_uncached_tokens', 'input_tokens_lower_bound',
         'output_tokens', 'reasoning_tokens', 'cache_read_tokens',
         'cache_write_tokens', 'cache_hit_tokens', 'cache_miss_tokens')})


def safe_call_context(raw):
    """Accept labels and component measurements, never the measured content."""
    raw = raw if isinstance(raw, dict) else {}
    safe = {}
    if raw.get('stage') in ('understand', 'select', 'build', 'repair', 'review', 'runtime'):
        safe['stage'] = raw['stage']
    if raw.get('call_scope') in ('authoring', 'graph_inference'):
        safe['call_scope'] = raw['call_scope']
    if type(raw.get('attempt')) is int and raw['attempt'] > 0:
        safe['attempt'] = raw['attempt']
    version = raw.get('policy_version')
    if isinstance(version, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,79}', version):
        safe['policy_version'] = version
    sizes = raw.get('context_sizes')
    if isinstance(sizes, dict):
        safe['context_sizes'] = {}
        for component in ('system', 'schema', 'catalog', 'project', 'history', 'evidence', 'feedback'):
            values = sizes.get(component)
            if not isinstance(values, dict): continue
            counts = {field: values[field] for field in ('bytes', 'characters', 'estimated_tokens')
                      if type(values.get(field)) is int and values[field] >= 0}
            if counts: safe['context_sizes'][component] = counts
    return safe

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
from uuid import uuid4

import httpx
from fastapi import HTTPException

PROVIDERS = {
    'minimax': {'label':'MiniMax', 'base_url':'https://api.minimaxi.com/v1', 'model':'MiniMax-M3'},
    'openai': {'label':'GPT', 'base_url':'https://api.openai.com/v1', 'model':'gpt-4.1'},
    'anthropic': {'label':'Claude', 'base_url':'https://api.anthropic.com/v1', 'model':'claude-sonnet-5'},
    'deepseek': {'label':'DeepSeek', 'base_url':'https://api.deepseek.com', 'model':'deepseek-flash'},
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
        key = key or os.getenv({'openai':'OPENAI_API_KEY', 'anthropic':'ANTHROPIC_API_KEY', 'deepseek':'DEEPSEEK_API_KEY'}[provider_id], '')
    model = (model or saved.get('model') or default_model).strip()
    prefix = {'minimax':'MiniMax-', 'openai':'gpt-', 'anthropic':'claude-', 'deepseek':'deepseek-'}[provider_id]
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,149}', model) or not model.startswith(prefix):
        raise HTTPException(400, f'请输入 {spec["label"]} 的有效模型 ID。')
    if require_key and not key.strip():
        raise HTTPException(503, f'请先在模型选项中接入 {spec["label"]}，当前项目已保留。')
    label = spec['label'] if base == spec['base_url'] or provider_id != 'anthropic' else 'Claude（fucheers.top）'
    return Provider(provider_id, label, base, model, key.strip())


def statuses():
    return [{'id':p.id, 'label':p.label, 'model':p.model, 'configured':bool(p.api_key),'reasoning':capabilities(p.id,p.model)}
            for p in (resolve(id, require_key=False) for id in PROVIDERS)]


def authoring_options(provider, stage, reasoning=None):
    options = {'max_tokens':14000}
    if provider.id == 'deepseek' and capabilities(provider.id, provider.model)['supported']:
        options['max_tokens'] = {'understand':16384, 'select':16384, 'build':32768, 'repair':32768, 'review':8192}.get(stage, 14000)
    if reasoning is not None:
        options['reasoning'] = reasoning
    return options


def authoring_timeout(provider):
    # Full graph delivery plus bounded repair/trials must fit the host deadline.
    return 720 if provider.id == 'deepseek' and capabilities(provider.id, provider.model)['supported'] else 240


def runtime_options(provider, max_tokens):
    options = {'max_tokens':min(max_tokens or 2048, 14000)}
    # Runtime nodes have a short result budget and no authoring reasoning option.
    if provider.id == 'deepseek' and capabilities(provider.id, provider.model)['can_disable']:
        options['reasoning'] = {'enabled':False}
    return options


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
    elif provider.id == 'deepseek':
        payload['max_tokens'] = max_tokens
    else:
        payload.update(max_tokens=max_tokens, temperature=0.3, reasoning_split=True)
        if provider.model == 'MiniMax-M3': payload['thinking']={'type':'disabled'}
    if schema:
        payload.update(tools=[{'type':'function','function':{**tool,'parameters':schema}}], tool_choice='auto')
    payload.update(fields)
    return '/chat/completions', {'Authorization':f'Bearer {provider.api_key}'}, payload


def _result(provider, data, schema):
    if not isinstance(data, dict): raise ProviderResponseError('invalid_response')
    if provider.id == 'anthropic':
        reason = data.get('stop_reason')
        if reason == 'max_tokens': raise ProviderResponseError('output_truncated')
        if reason == 'refusal': raise ProviderResponseError('refused_response')
        if reason not in ('end_turn','tool_use'): raise ProviderResponseError('invalid_response')
        blocks = data.get('content', [])
        if not isinstance(blocks, list) or any(not isinstance(b, dict) for b in blocks):
            raise ProviderResponseError('invalid_response')
        calls = [b for b in blocks if b.get('type') == 'tool_use']
        if schema and calls:
            if len(calls)!=1 or calls[0].get('name')!='submit_scenario': raise ProviderResponseError('tool_protocol')
            if not isinstance(calls[0].get('input'), dict): raise ProviderResponseError('invalid_response')
            return json.dumps(calls[0]['input'], ensure_ascii=False)
        content = '\n'.join(b['text'] for b in blocks if b.get('type') == 'text')
    else:
        choices = data.get('choices')
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            raise ProviderResponseError('invalid_response')
        choice = choices[0]
        reason = choice.get('finish_reason')
        if reason == 'length': raise ProviderResponseError('output_truncated')
        if reason == 'content_filter': raise ProviderResponseError('refused_response')
        if reason not in ('stop','tool_calls'): raise ProviderResponseError('invalid_response')
        message = choice.get('message')
        if not isinstance(message, dict): raise ProviderResponseError('invalid_response')
        if message.get('refusal'): raise ProviderResponseError('refused_response')
        calls = message.get('tool_calls') or []
        if schema and calls:
            if not isinstance(calls, list) or len(calls)!=1 or not isinstance(calls[0], dict):
                raise ProviderResponseError('tool_protocol')
            function = calls[0].get('function')
            if not isinstance(function, dict) or function.get('name')!='submit_scenario':
                raise ProviderResponseError('tool_protocol')
            arguments = function.get('arguments')
            if not isinstance(arguments, str): raise ProviderResponseError('invalid_response')
            try:
                parsed = json.loads(arguments)
            except ValueError:
                raise ProviderResponseError('invalid_json') from None
            if not isinstance(parsed, dict): raise ProviderResponseError('invalid_response')
            return arguments
        content = message.get('content')
    if not isinstance(content,str) or not content.strip(): raise ProviderResponseError('empty_response')
    return content


def _failure(provider, exc):
    if isinstance(exc, HTTPException): return exc
    if isinstance(exc, ProviderResponseError):
        code = exc.code
        explanation = {'output_truncated':'输出被截断，思考与结果共用输出额度；请提高输出预算或降低思考强度后重试',
                       'refused_response':'拒绝了本次输出，请检查输入与模型限制',
                       'empty_response':'未返回有效内容，请重试',
                       'invalid_json':'返回的工具参数不是完整有效的 JSON 对象，请重试',
                       'invalid_response':'返回的响应结构无效，请重试',
                       'tool_protocol':'未按本阶段工具契约提交结果，请重试'}[code]
        detail=f'{provider.label} {explanation}；未切换到其他模型。'
    elif isinstance(exc, httpx.TimeoutException):
        code = 'timeout'
        detail=f'{provider.label} 响应超时，请重试；未切换到其他模型。'
    elif isinstance(exc, httpx.HTTPStatusError):
        code = 'upstream_http'
        detail=f'{provider.label} 调用失败（HTTP {exc.response.status_code}），请检查 API 密钥、模型权限或额度；未切换到其他模型。'
    elif isinstance(exc, json.JSONDecodeError):
        code = 'invalid_json'
        detail=f'{provider.label} 返回的响应不是有效 JSON，请重试；未切换到其他模型。'
    else:
        code = 'transport_error' if isinstance(exc, httpx.TransportError) else 'invalid_response'
        detail=f'{provider.label} 连接失败或未返回完整结果，请检查配置后重试；未切换到其他模型。'
    result=HTTPException(503, detail)
    result.provider_failure_code = code
    if isinstance(exc,httpx.HTTPStatusError):result.upstream_status_code=exc.response.status_code
    return result


async def complete(provider, messages, schema=None, max_tokens=14000, reasoning=None):
    path, headers, payload = _request(provider,messages,schema,max_tokens,reasoning)
    hook = COMPLETION_BUDGET_HOOK.get()
    if hook is not None: hook()
    context = safe_call_context(COMPLETION_CALL_CONTEXT.get())
    context.setdefault('call_scope', 'authoring')
    call = {**context, 'call_id':uuid4().hex, 'requested_max_tokens':max_tokens}
    started = time.monotonic()
    _notify(COMPLETION_CALL_OBSERVER.get(), {**call, 'event':'started'})
    data, failure_code = None, None
    try:
        async with httpx.AsyncClient(trust_env=False,follow_redirects=False,timeout=httpx.Timeout(90,connect=15)) as client:
            response = await client.post(provider.base_url+path,headers=headers,json=payload)
            response.raise_for_status()
            data=response.json()
            _observe_usage(data, provider.id)
            return _result(provider,data,schema)
    except asyncio.CancelledError:
        failure_code = 'cancelled'
        raise
    except Exception as exc:
        failure = _failure(provider, exc)
        failure_code = getattr(failure, 'provider_failure_code', None)
        failure.provider_completion_metadata = {**call, **completion_metadata(data, max_tokens, failure_code, provider_id=provider.id),
            'duration_ms':round((time.monotonic() - started) * 1000)}
        raise failure from None
    finally:
        metadata = {**call, **completion_metadata(data, max_tokens, failure_code, provider_id=provider.id),
                    'duration_ms':round((time.monotonic() - started) * 1000)}
        _notify(COMPLETION_CALL_OBSERVER.get(), {**metadata, 'event':'completed'})
        _notify(COMPLETION_METADATA_OBSERVER.get(), metadata)


def runtime_chat(request):
    provider = resolve(request.provider_id, request.model)
    path,headers,payload = _request(provider,request.messages,**runtime_options(provider, request.max_tokens))
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
    validation_options = {'max_tokens':512}
    if provider.id == 'deepseek' and capabilities(provider.id,provider.model)['can_disable']:
        validation_options['reasoning'] = {'enabled':False}
    await complete(provider,[{'role':'user','content':'Reply with OK.'}],**validation_options)
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
