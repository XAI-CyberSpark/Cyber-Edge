"""Authenticated by the application's SiteAccessMiddleware, like project APIs."""
from functools import lru_cache
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from app.services.execution_store import ExecutionStore, ExecutionConflict, MAX_BYTES

router = APIRouter()

@lru_cache(maxsize=1)
def store():
    return ExecutionStore(Path(__file__).resolve().parents[2] / 'state' / 'executions.sqlite3')

async def body(request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES + 4096:
            raise HTTPException(413, '执行快照超过请求预算。')
    import json
    try:
        value = json.loads(data)
        if not isinstance(value, dict):
            raise ValueError()
        revision = value.get('revision')
        if type(revision) is not int or not 0 <= revision <= 2**53 - 2:
            raise ValueError()
        return value
    except (ValueError, RecursionError):
        raise HTTPException(422, '请求需要有效 JSON 和非负整数 revision。')

def invoke(function, *args):
    try:
        return function(*args)
    except ExecutionConflict as exc:
        raise HTTPException(409, str(exc))
    except ValueError as exc:
        raise HTTPException(422, str(exc))

@router.get('/{key}')
def read(key: str):
    return invoke(store().read, key)

@router.post('/{key}/begin')
async def begin(key: str, request: Request):
    value = await body(request)
    if type(value.get('restart', False)) is not bool:
        raise HTTPException(422, 'restart 必须是布尔值。')
    return invoke(store().begin, key, value['revision'], value.get('restart', False))

@router.post('/{key}/{operation}')
async def update(key: str, operation: str, request: Request):
    if operation not in {'renew', 'finish'}:
        raise HTTPException(404)
    value = await body(request)
    token = value.get('token')
    if not isinstance(token, str) or not 1 <= len(token) <= 128:
        raise HTTPException(422, '执行凭据无效。')
    args = [key, value['revision'], token]
    if operation == 'finish':
        args.append(value.get('payload'))
    return invoke(getattr(store(), operation), *args)
