from fastapi import APIRouter, HTTPException, Query
from app.services import mcp_catalog as service

router = APIRouter()


def _call(fn, *args):
    try:
        return fn(*args)
    except service.CatalogError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.get('/catalog')
def catalog(category: str = Query('', max_length=80), q: str = Query('', max_length=200),
            page: int = Query(1, ge=1, le=5)):
    return _call(service.list_catalog, category, q, page)


@router.get('/categories')
def categories():
    return _call(service.category_counts)


@router.get('/detail')
def detail(server_id: str = Query(..., min_length=3, max_length=250)):
    return _call(service.get_detail, server_id)
