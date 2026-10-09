import platform
import psutil
from app.schemas.system_schema import SystemStatusResponse

class SystemService:
    @staticmethod
    def get_real_metrics() -> dict:
        memory = psutil.virtual_memory()
        return {"cpu_usage": psutil.cpu_percent(interval=None), "memory_usage": memory.percent,
                "memory_total_bytes": memory.total, "memory_used_bytes": memory.used,
                "gpu_usage": None, "npu_usage": None, "temperature": None, "source": "psutil"}

    @staticmethod
    def get_jetson_metrics() -> dict:
        try:
            from jtop import jtop
            with jtop() as jetson:
                if jetson.ok():
                    metrics = SystemService.get_real_metrics()
                    metrics.update(gpu_usage=jetson.stats.get("GPU"), temperature=jetson.stats.get("Temp AO"), source="psutil+jtop")
                    return metrics
        except Exception:
            pass
        return None

    @staticmethod
    def get_system_status() -> SystemStatusResponse:
        metrics = SystemService.get_jetson_metrics() if platform.machine() == "aarch64" else None
        return SystemStatusResponse(device={"device_id": platform.node() or "local-host", "status": "online", "mode": "host"}, telemetry=metrics or SystemService.get_real_metrics())
