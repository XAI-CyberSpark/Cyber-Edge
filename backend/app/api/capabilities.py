from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from urllib.parse import urlparse
from app.services import capability_library as service

router = APIRouter()

@router.get('')
def get_library():
    imports = service.library()
    for record in imports:
        for item in record['items']:
            # Always re-check stored bindings against current registration so a
            # de-registered server shows 绑定失效 after a page reload.
            item['binding_status'] = service.binding_status(item)
    return {'imports': imports}

@router.get('/recognizer')
def recognizer():
    from app.services.orchestration_service import OrchestrationService as Model
    return {'model': Model._resolve_model(), 'provider': urlparse(Model._resolve_base_url()).hostname,
            'configured': bool(Model._resolve_api_key())}

@router.post('/preview')
async def preview(file: UploadFile = File(...), platform: str = Form('', max_length=200), version: str = Form('', max_length=100), allow_ai: bool = Form(False)):
    data = await file.read(service.MAX_FILE + 1)
    await file.close()
    filename = (file.filename or '资料.txt').replace('\\', '/').split('/')[-1][:200]
    try:
        return await run_in_threadpool(service.preview, filename, data, platform.strip(), version.strip(), allow_ai)
    except service.ImportProblem as exc:
        raise HTTPException(422, str(exc))
    except Exception:
        raise HTTPException(422, '文件无法读取，请确认文件未损坏、未加密且格式正确。')

class Confirmation(BaseModel):
    selected_ids: list[str] = Field(min_length=1, max_length=5000)

@router.post('/{import_id}/confirm')
def confirm(import_id: str, body: Confirmation):
    try:
        return service.confirm(import_id, body.selected_ids)
    except service.ImportProblem as exc:
        raise HTTPException(422, str(exc))

class BindingRequest(BaseModel):
    server_id: str = Field(min_length=1, max_length=64)
    tool_name: str = Field(min_length=1, max_length=128)

@router.put('/{import_id}/items/{item_id}/binding')
def bind(import_id: str, item_id: str, body: BindingRequest):
    try:
        item = service.bind(import_id, item_id, body.server_id, body.tool_name)
        return {**item, 'binding_status': service.binding_status(item)}
    except service.ImportProblem as exc:
        raise HTTPException(422, str(exc))

@router.delete('/{import_id}/items/{item_id}/binding')
def unbind(import_id: str, item_id: str):
    try:
        return service.unbind(import_id, item_id)
    except service.ImportProblem as exc:
        raise HTTPException(422, str(exc))

@router.post('/{import_id}/items/{item_id}/binding/check')
async def check(import_id: str, item_id: str):
    try:
        item = await service.check_connection(import_id, item_id)
        return {**item, 'binding_status': service.binding_status(item)}
    except service.ImportProblem as exc:
        raise HTTPException(422, str(exc))
