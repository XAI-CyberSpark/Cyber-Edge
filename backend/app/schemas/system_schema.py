from pydantic import BaseModel, Field


class DeviceStatusSchema(BaseModel):
    device_id: str = Field(..., description="Unique device identifier")
    status: str = Field(..., description="Online or offline status")
    mode: str = Field(..., description="Power/Performance mode")


class TelemetrySchema(BaseModel):
    source: str = "unknown"
    memory_total_bytes: int | None = None
    memory_used_bytes: int | None = None
    cpu_usage: float = Field(..., description="CPU Usage percentage")
    memory_usage: float = Field(..., description="Memory Usage percentage")
    gpu_usage: float | None = Field(None, description="GPU Usage percentage")
    npu_usage: float | None = Field(None, description="NPU/DLA Usage percentage")
    temperature: float | None = Field(None, description="Device temperature")
    power: float | None = Field(None, description="Power draw in Watts (if available)")


class SystemStatusResponse(BaseModel):
    device: DeviceStatusSchema
    telemetry: TelemetrySchema
