import json
from contextlib import aclosing
import re
import time
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.orchestration_schema import (
    WorkflowGenerateRequestSchema,
    WorkflowGenerateResponseSchema,
)
from app.services.orchestration_service import OrchestrationService
from app.services.scenario_builder import build_events
from app.services.orchestration_logging import OrchestrationRunLog

router = APIRouter()


@router.post("/generate", response_model=WorkflowGenerateResponseSchema)
async def generate_workflow(request: WorkflowGenerateRequestSchema):
    """Generate, validate, test, and optionally save a workflow from natural language."""
    async with aclosing(build_events(request)) as events:
        async for event, data in events:
            if event == "result":
                return WorkflowGenerateResponseSchema.model_validate(data)
    raise RuntimeError("场景构建未返回结果")


@router.post("/generate-stream")
async def generate_workflow_stream(request: WorkflowGenerateRequestSchema):
    """Stream workflow generation with thinking chain via SSE."""
    run = OrchestrationRunLog(request)
    return StreamingResponse(
        _stream_orchestration(request, run),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Orchestration-Run-ID": run.fields["run_id"],
        },
    )


def _sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _strip_reasoning_from_model_content(raw_text: str) -> str:
    """Keep only the final model content when a provider embeds <think> blocks."""
    without_complete_blocks = re.sub(
        r"<think(?:\s[^>]*)?>[\s\S]*?</think\s*>\s*", "", raw_text or "", flags=re.IGNORECASE
    )
    return re.sub(
        r"<think(?:\s[^>]*)?>[\s\S]*$", "", without_complete_blocks, flags=re.IGNORECASE
    ).strip()


async def _stream_orchestration(request: WorkflowGenerateRequestSchema, run=None) -> AsyncGenerator[str, None]:
    """Public progress only; never expose model reasoning or provider error bodies."""
    try:
        source = build_events(request) if run is None else build_events(request, run=run)
        async with aclosing(source) as events:
            async for event, data in events:
                yield _sse_event(event, data)
    except Exception as exc:
        from fastapi import HTTPException
        message = "场景构建未完成，当前项目未被替换。请重试或补充需求。"
        diagnostics = None
        checkpoint = None
        if isinstance(exc, HTTPException) and exc.status_code in (400, 503):
            if isinstance(exc.detail,dict) and exc.detail.get('code')=='hermes_incomplete':
                from app.services.authoring_diagnostics import sanitize_run_diagnostics, public_failure_message
                diagnostics = sanitize_run_diagnostics(exc.detail.get('diagnostics'))
                message = public_failure_message(diagnostics)
                if exc.detail.get('checkpoint') is not None:
                    from app.services.authoring_checkpoint import AuthoringCheckpoint
                    checkpoint=AuthoringCheckpoint.model_validate(exc.detail['checkpoint']).model_dump()
            elif isinstance(exc.detail,str):
                message = exc.detail
        from app.services.model_providers import FAILURE_CODES
        code = getattr(exc, 'provider_failure_code', None)
        safe_code = code if isinstance(code, str) and code in FAILURE_CODES else None
        yield _sse_event("error", {"message": message, **({'code':safe_code} if safe_code else {}), **({'diagnostics':diagnostics} if diagnostics is not None else {}), **({'checkpoint':checkpoint} if checkpoint is not None else {})})


# Config endpoints share the application's authenticated SiteAccessMiddleware.
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError
from typing import Literal
from fastapi import HTTPException, Response, Request
from app.services import model_providers

class ProviderSettings(BaseModel):
    model_config = ConfigDict(extra='forbid')
    model: str = Field(min_length=1,max_length=150,pattern=r'^[A-Za-z0-9][A-Za-z0-9._:-]*$')
    api_key: SecretStr | None = None

@router.get('/providers')
def list_providers(response: Response):
    response.headers['Cache-Control']='no-store'
    return {'providers':model_providers.statuses()}

@router.put('/providers/{provider_id}')
async def configure_provider(provider_id: Literal['minimax','openai','anthropic','deepseek'], request: Request, response: Response):
    response.headers['Cache-Control']='no-store'
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 16384: raise HTTPException(413,'模型配置内容过长。')
    try:
        settings = ProviderSettings.model_validate_json(raw)
    except (ValueError, ValidationError):
        raise HTTPException(400,'请输入有效的模型 ID 和 API 密钥。') from None
    key=settings.api_key.get_secret_value().strip() if settings.api_key else None
    if key and (len(key)>4096 or any(c.isspace() for c in key)):
        raise HTTPException(400,'API 密钥格式无效。')
    return await model_providers.configure(provider_id,settings.model,key)


@router.get('/engine')
def authoring_engine_status(response: Response):
    """Expose the selected engine, never runtime paths or credentials."""
    from app.services.hermes_authoring import configured_engine, SDK_COMMIT
    config = configured_engine()
    response.headers['Cache-Control'] = 'no-store'
    return {'engine':config.engine, 'configured':config.engine=='bounded' or bool(config.runtime_root and config.python),
            'sdk_commit':SDK_COMMIT if config.engine=='hermes' else None}



@router.get('/providers/{provider_id}/reasoning')
def provider_reasoning(provider_id: Literal['minimax','openai','anthropic','deepseek'], response: Response, model: str | None = None):
    from app.services.model_reasoning import capabilities
    response.headers['Cache-Control']='no-store'
    provider=model_providers.resolve(provider_id,model,require_key=False)
    return capabilities(provider.id,provider.model)
