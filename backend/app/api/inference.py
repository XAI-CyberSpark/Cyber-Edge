from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool
from app.schemas.inference_schema import (
    ChatRequestSchema,
    ChatResponseSchema,
    VLMRequestSchema,
    VLMResponseSchema,
)
from app.services.inference_service import InferenceService

router = APIRouter()


@router.post("/chat/completions", response_model=ChatResponseSchema)
async def chat_completions(request: ChatRequestSchema, http_request: Request):
    """
    Proxy to vLLM or Ollama.
    Returns a failure if the service is unavailable; never substitutes a mock.
    """
    from app.services.opensparx_service import MODEL_ID
    if request.model == MODEL_ID and not request.provider_id:
        from app.services.inference_lifecycle import local_chat
        return await local_chat(request, http_request)
    return await run_in_threadpool(InferenceService.chat_completions, request)


@router.post("/vlm/describe", response_model=VLMResponseSchema)
async def vlm_describe(request: VLMRequestSchema):
    return InferenceService.vlm_describe(request)


@router.get('/local-model')
def local_model_status():
    from app.services.opensparx_service import OpenSparXService
    return OpenSparXService.status()
