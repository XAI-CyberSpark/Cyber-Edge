from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from app.schemas.edge_schema import (
    SSHConfig,
    ProvisionConfig,
    DeviceStatusResponse,
    ProvisionResponse,
)
from app.services.edge_service import EdgeService

router = APIRouter()

# In-memory mock storage for edge devices
mock_devices = [
    {
        "id": "orin-nano-01",
        "name": "Orin Nano (Simulated)",
        "ip": "192.168.1.100",
        "status": "offline",
        "last_error": None
    }
]

@router.get("/devices")
async def get_devices():
    """
    Get a list of configured edge devices.
    """
    return {"devices": mock_devices}

@router.post("/devices/{device_id}/check")
async def check_device_connection(device_id: str):
    """
    Mock connection check for a specific device.
    """
    for dev in mock_devices:
        if dev["id"] == device_id:
            dev["status"] = "online"
            return {"status": "online"}
    return {"status": "device not found"}

@router.post("/devices/{device_id}/config")
async def config_device(device_id: str, config: dict):
    """
    Update device configuration (e.g. IP address).
    """
    for dev in mock_devices:
        if dev["id"] == device_id:
            if "ip" in config:
                dev["ip"] = config["ip"]
            return {"status": "success"}
    return {"status": "error", "message": "device not found"}


@router.post("/connect", response_model=DeviceStatusResponse)
async def verify_ssh(config: SSHConfig):
    """
    Verify SSH connection to the target device.
    Uses credentials provided to attempt a connection and returns status.
    """
    return await run_in_threadpool(EdgeService.verify_ssh, config)


@router.post("/provision", response_model=ProvisionResponse)
async def provision_device(config: ProvisionConfig):
    """
    Pack current backend code and deploy to target device.
    Optionally includes the current graph configuration as flow.json.
    """
    return await run_in_threadpool(EdgeService.provision_device, config)


@router.post("/install_inference_engine")
async def install_inference_engine():
    """
    Trigger installation script for Inference Engines (Ollama, vLLM).
    This runs LOCALLY on the backend (which is assumed to be running on the Edge device).
    """
    return await run_in_threadpool(EdgeService.install_inference_engine)
