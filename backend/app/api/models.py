from fastapi import APIRouter

from app.schemas.model_schema import ModelListResponse
from app.services.model_service import ModelService


router = APIRouter()


@router.get("/", response_model=ModelListResponse)
async def list_models():
    return ModelService.list_models()
