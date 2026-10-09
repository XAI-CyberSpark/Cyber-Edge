import asyncio
from contextlib import suppress
from fastapi import APIRouter,HTTPException,Request
from pydantic import BaseModel,Field,ConfigDict,ValidationError
from app.services import mcp_runtime as service
router=APIRouter()
class Invocation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    server_id:str=Field(min_length=1,max_length=64)
    tool_name:str=Field(min_length=1,max_length=128)
    arguments:dict=Field(default_factory=dict)

@router.get('/connections')
async def connections():
    try:return {'servers':await service.catalog()}
    except service.MCPRuntimeError as error:raise HTTPException(422,str(error)) from None

@router.post('/invoke')
async def invoke(request:Request):
    raw=bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw)>service.MAX_BYTES:raise HTTPException(413,'MCP请求超过2MB预算。')
    try:body=Invocation.model_validate_json(raw)
    except ValidationError:raise HTTPException(422,'MCP请求字段无效；仅接受server_id、tool_name和arguments。') from None
    task = asyncio.create_task(service.invoke(body.server_id,body.tool_name,body.arguments))
    try:
        while not task.done():
            await asyncio.wait({task}, timeout=.1)
            if not task.done() and await request.is_disconnected():
                raise HTTPException(499, 'MCP调用已取消。')
        return await task
    except service.MCPRuntimeError as error:
        raise HTTPException(422,str(error)) from None
    finally:
        if not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
