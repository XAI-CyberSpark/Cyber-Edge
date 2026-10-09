"""Documented authoring controls, validated before any provider request.

Sources (2026-10-05): MiniMax text-openai-api, Claude effort/thinking,
OpenAI reasoning guide. Unknown model aliases expose no speculative controls.
"""
import re
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool
from typing import Literal

Effort = Literal['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

class ReasoningSettings(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: StrictBool
    effort: Effort | None = None


def capabilities(provider_id, model):
    result = dict(supported=False, can_disable=False, efforts=[], default_enabled=False, default_effort=None)
    if provider_id == 'minimax':
        if model == 'MiniMax-M3':
            result.update(supported=True, can_disable=True, default_enabled=True)
        elif model == 'MiniMax-M3.1-Flash-Preview':
            result.update(supported=True, default_enabled=True, efforts=['low','medium','high','xhigh','max'], default_effort='max')
        elif re.fullmatch(r'MiniMax-M2(?:\.[157])?(?:-highspeed)?', model):
            result.update(supported=True, default_enabled=True)
    elif provider_id == 'anthropic':
        if re.fullmatch(r'claude-(?:sonnet-5|sonnet-4-6|opus-4-6)(?:-\d{8})?', model):
            efforts=['low','medium','high','max']
            if re.fullmatch(r'claude-sonnet-5(?:-\d{8})?', model): efforts.insert(3,'xhigh')
            result.update(supported=True, can_disable=True, default_enabled=True, efforts=efforts, default_effort='high')
    elif provider_id == 'openai':
        if re.fullmatch(r'gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?', model):
            result.update(supported=True, default_enabled=True, efforts=['minimal','low','medium','high'], default_effort='medium')
        elif re.fullmatch(r'gpt-5\.(?:1|2|4|5)(?:-\d{4}-\d{2}-\d{2})?', model):
            efforts=['low','medium','high'] + ([] if model.startswith('gpt-5.1') else ['xhigh'])
            result.update(supported=True, can_disable=True, default_enabled=model.startswith('gpt-5.5'), efforts=efforts, default_effort='medium')
    return result


def validate_settings(provider_id, model, settings):
    if settings is None: return None
    settings = settings if isinstance(settings, ReasoningSettings) else ReasoningSettings.model_validate(settings)
    cap=capabilities(provider_id, model)
    if not cap['supported']:
        raise HTTPException(400, '当前模型尚未支持可配置思考，请使用默认设置。')
    if not settings.enabled and not cap['can_disable']:
        raise HTTPException(400, '当前模型必须开启思考。')
    if settings.effort and (not settings.enabled or settings.effort not in cap['efforts']):
        raise HTTPException(400, '当前模型不支持所选推理强度。')
    return settings


def request_fields(provider_id, model, settings):
    settings=validate_settings(provider_id, model, settings)
    if settings is None: return {}
    if provider_id == 'openai':
        return {'reasoning_effort':settings.effort or 'medium'} if settings.enabled else {'reasoning_effort':'none'}
    fields={'thinking':{'type':'adaptive' if settings.enabled else 'disabled'}}
    if settings.effort:
        if provider_id == 'anthropic': fields['output_config']={'effort':settings.effort}
        else: fields['reasoning_effort']=settings.effort
    return fields


def bind_hermes_reasoning(agent, provider, settings):
    """Apply validated fields after SDK conversion; never edit the pinned SDK."""
    fields=request_fields(provider['id'], provider['model'], settings)
    if not fields: return
    original=agent._interruptible_api_call
    def call(kwargs):
        payload=dict(kwargs)
        extra=dict(payload.get('extra_body') or {})
        for key in ('reasoning','thinking','reasoning_effort','output_config'):
            payload.pop(key,None); extra.pop(key,None)
        if provider['id']=='anthropic': payload.update(fields)
        else:
            if 'thinking' in fields: extra['thinking']=fields['thinking']
            if 'reasoning_effort' in fields: payload['reasoning_effort']=fields['reasoning_effort']
        if extra: payload['extra_body']=extra
        else: payload.pop('extra_body',None)
        # Adaptive thinking must choose tools itself; don't force an incompatible tool.
        if provider['id']=='anthropic' and fields.get('thinking',{}).get('type')=='adaptive' and isinstance(payload.get('tool_choice'),dict) and payload['tool_choice'].get('type') in ('tool','any'):
            payload['tool_choice']={'type':'auto'}
        return original(payload)
    agent._interruptible_api_call=call
