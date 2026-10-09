from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from app.services.asr_service import ASRService, MAX_BYTES

router = APIRouter()

@router.get('/status')
def status():
    return ASRService.status()

@router.post('/transcriptions')
async def transcribe(request: Request):
    if request.headers.get('content-type', '').split(';')[0] not in ('audio/wav', 'audio/x-wav'):
        raise HTTPException(415, '请使用PCM WAV录音。')
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, '录音过大，请控制在30秒以内。')
        data.extend(chunk)
    return await run_in_threadpool(ASRService.transcribe, bytes(data))
