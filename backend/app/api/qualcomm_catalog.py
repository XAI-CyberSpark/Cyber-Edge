from fastapi import APIRouter, HTTPException
from app.services.qualcomm_catalog import CatalogError, get_catalog

router = APIRouter()

@router.get('/catalog')
def catalog(refresh: bool = False):
    try:
        return get_catalog(refresh=refresh)
    except CatalogError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
