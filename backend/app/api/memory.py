from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
memory_service = None


def _get_memory_service():
    global memory_service
    if memory_service is None:
        try:
            from app.core.memory import MemoryService
            memory_service = MemoryService()
        except Exception as e:
            logger.warning(f"MemoryService init failed (model download issue?): {e}")
            return None
    return memory_service


class MemoryItem(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = {}


class MemoryQuery(BaseModel):
    query: str
    limit: int = 3


@router.post("/add")
async def add_memory(item: MemoryItem):
    """Add a new memory to the vector database."""
    svc = _get_memory_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Memory service unavailable (model not downloaded)")
    success = svc.add(item.content, item.metadata)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add memory")
    return {"status": "success", "message": "Memory added"}


@router.post("/query")
async def query_memory(q: MemoryQuery):
    """Semantic search for memories."""
    svc = _get_memory_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Memory service unavailable (model not downloaded)")
    results = svc.query(q.query, q.limit)
    return {"results": results}
