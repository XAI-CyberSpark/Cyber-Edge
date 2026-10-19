from app.api import audio
from app.core.site_access import SiteAccessMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import system, inference, deployment, edge, projects, memory, telemetry, models, sdk, orchestration
import uvicorn

app = FastAPI(
    title="OAKEgde Studio Agent Backend",
    description="Edge AI Agent Runtime for NVIDIA Orin",
    version="1.0.0",
)

# CORS (Allow Frontend to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Site key gate, OFF by default (OAKEGDE_SITE_ACCESS=1 enables); when on it protects every HTTP API and telemetry WebSocket before routing.
app.add_middleware(SiteAccessMiddleware)

from app.api import executions
from app.api import capabilities
from app.api import mcp_runtime
from app.api import mcp_catalog
from app.api import qualcomm_catalog
app.router.add_event_handler('startup', capabilities.service.initialize_library)
app.include_router(qualcomm_catalog.router, prefix='/v1/catalog/qualcomm', tags=['Qualcomm model catalog'])

app.include_router(mcp_runtime.router, prefix="/v1/mcp", tags=["Registered MCP tools"])
app.include_router(mcp_catalog.router, prefix="/v1/mcp", tags=["MCP catalog"])
app.include_router(executions.router, prefix="/v1/executions", tags=["Execution checkpoints"])
app.include_router(capabilities.router, prefix="/v1/capabilities", tags=["Capability library"])

app.include_router(audio.router, prefix="/v1/audio", tags=["Local speech recognition"])

# Routes
app.include_router(system.router, prefix="/v1/system", tags=["System"])
app.include_router(inference.router, prefix="/v1/inference", tags=["Inference"])
app.include_router(deployment.router, prefix="/v1/agent", tags=["Deployment"])
app.include_router(edge.router, prefix="/v1/edge", tags=["Edge Provisioning"])
app.include_router(projects.router, prefix="/v1/projects", tags=["Projects"])
app.include_router(memory.router, prefix="/v1/memory", tags=["Memory"])
app.include_router(models.router, prefix="/v1/models", tags=["Models"])
app.include_router(sdk.router, prefix="/v1/sdk", tags=["SDK"])
app.include_router(orchestration.router, prefix="/v1/orchestration", tags=["Orchestration"])
app.include_router(telemetry.router, prefix="/telemetry", tags=["Telemetry (WebSocket)"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "device": "Orin Nano (Simulated)"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
