from fastapi import APIRouter
from app.schemas.system_schema import SystemStatusResponse
from app.services.system_service import SystemService

router = APIRouter()


@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status():
    """
    Get current hardware telemetry and device status.
    Uses jtop on Jetson devices, otherwise falls back to psutil/mocks.
    """
    return SystemService.get_system_status()
