from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List

from app.api import audio
from app.services.file_paths import safe_child_path
from app.core.site_access import SiteAccessMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.api import telemetry
from app.schemas.edge_schema import (
    SSHConfig,
    DeviceStatusResponse,
    ProvisionResponse,
    BundleBuildConfig,
    BundleBuildResponse,
    BundleProvisionConfig,
)
from app.schemas.project_schema import ProjectSchema, ProjectSaveSchema, ProjectSummarySchema
from app.schemas.sdk_schema import SDKExportRequest
from app.schemas.system_schema import SystemStatusResponse
from app.api import orchestration
from app.services.host_lite_edge_service import HostLiteEdgeService
from app.services.project_service import ProjectService
from app.services.sdk_service import SDKService
from app.services.system_service import SystemService


# Host-lite is intended to run the authoring and deployment APIs without the
# heavyweight local inference stack (torch/transformers). Keep that optional
# endpoint available whenever its dependencies are installed, but do not block
# workflow orchestration when they are not.
try:
    from app.api import inference
except ModuleNotFoundError as exc:
    if exc.name != "torch":
        raise
    inference = None


app = FastAPI(
    title="OAKEgde Studio Host Lite Backend",
    description="Minimal host backend for Studio authoring/export on developer machines",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Site key gate, OFF by default (OAKEGDE_SITE_ACCESS=1 enables); when on it protects every HTTP API and telemetry WebSocket before routing.
app.add_middleware(SiteAccessMiddleware)

from app.api import rear_media
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

app.include_router(rear_media.router, prefix="/v1/media", tags=["Rear seat video"])
app.include_router(audio.router, prefix="/v1/audio", tags=["Local speech recognition"])

if inference is not None:
    app.include_router(inference.router, prefix="/v1/inference", tags=["Inference"])
app.include_router(orchestration.router, prefix="/v1/orchestration", tags=["Orchestration"])
app.include_router(telemetry.router, prefix="/telemetry", tags=["Telemetry"])

PIPELINES_DIR = Path("pipelines")
PIPELINES_DIR.mkdir(exist_ok=True)
STATE_DIR = Path("state")
STATE_DIR.mkdir(exist_ok=True)
MODEL_REGISTRY_PATH = STATE_DIR / "models.json"
SHORT_TERM_MEMORY_PATH = STATE_DIR / "short_term_memory.json"


DEFAULT_MODELS = [
    {
        "id": "gemma4-cpu-sa8397",
        "name": "Gemma4 CPU (SA8397)",
        "type": "llm",
        "category": "llm",
        "size": "local",
        "path": "/data/local/tmp/sa8397-qnn",
        "status": "active",
        "is_downloaded": True,
        "provider": "Local",
    }
]


class PipelineRecord(BaseModel):
    id: str
    name: str
    data: str
    created_at: float | None = None


class HostedModel(BaseModel):
    id: str
    name: str
    type: str = "llm"
    category: str = "llm"
    size: str = "local"
    path: str = ""
    status: str = "active"
    is_downloaded: bool = True
    provider: str = "Local"


class HostedModelStatusUpdate(BaseModel):
    status: str


class MemoryItem(BaseModel):
    content: str
    metadata: Dict[str, Any] | None = None


class MemoryQuery(BaseModel):
    query: str = ""
    limit: int = 5


def _edge_error_response(exc: Exception):
    if isinstance(exc, HTTPException):
        detail = exc.detail
        if isinstance(detail, dict):
            return JSONResponse(status_code=exc.status_code, content=detail)
        if isinstance(detail, str):
            try:
                payload = json.loads(detail)
                if isinstance(payload, dict):
                    return JSONResponse(status_code=exc.status_code, content=payload)
            except Exception:
                pass
            return JSONResponse(status_code=exc.status_code, content={"status": "error", "error": detail})
    return JSONResponse(status_code=500, content={"status": "error", "error": str(exc)})


def _read_json_file(path: Path, fallback: Any):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _write_json_file(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _load_models() -> List[Dict[str, Any]]:
    if not MODEL_REGISTRY_PATH.exists():
        _write_json_file(MODEL_REGISTRY_PATH, DEFAULT_MODELS)
    payload = _read_json_file(MODEL_REGISTRY_PATH, DEFAULT_MODELS)
    return payload if isinstance(payload, list) else DEFAULT_MODELS


def _save_models(models: List[Dict[str, Any]]) -> None:
    _write_json_file(MODEL_REGISTRY_PATH, models)


def _load_short_term_memory() -> List[Dict[str, Any]]:
    payload = _read_json_file(SHORT_TERM_MEMORY_PATH, [])
    return payload if isinstance(payload, list) else []


def _save_short_term_memory(entries: List[Dict[str, Any]]) -> None:
    _write_json_file(SHORT_TERM_MEMORY_PATH, entries[-200:])


def _load_pipeline_records() -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for file_path in sorted(PIPELINES_DIR.glob("*.json"), reverse=True):
        try:
            payload = json.loads(file_path.read_text())
            records.append(payload)
        except Exception as exc:
            print(f"Failed to load pipeline {file_path}: {exc}")
    return records


@app.get("/health")
async def health_check():
    return {"status": "ok", "mode": "host-lite"}


@app.get("/v1/system/status", response_model=SystemStatusResponse)
async def get_system_status():
    return SystemService.get_system_status()


@app.get("/v1/projects/", response_model=List[ProjectSummarySchema])
async def list_projects():
    return ProjectService.list_projects()


@app.get("/v1/projects/{project_id}", response_model=ProjectSchema)
async def get_project(project_id: str):
    return ProjectService.get_project(project_id)


@app.post("/v1/projects/autosave", response_model=ProjectSchema)
async def autosave_project(project: ProjectSaveSchema):
    return ProjectService.save_project(project.model_copy(update={"autosave": True}))


@app.post("/v1/projects/", response_model=ProjectSchema)
async def save_project(project: ProjectSaveSchema):
    return ProjectService.save_project(project)


@app.delete("/v1/projects/{project_id}")
async def delete_project(project_id: str):
    return ProjectService.delete_project(project_id)


@app.post("/v1/sdk/export")
async def export_sdk(request: SDKExportRequest):
    filename, archive_bytes = SDKService.build_sdk_archive(
        name=request.name,
        nodes=request.nodes,
        edges=request.edges,
        package_name=request.package_name,
        default_model=request.default_model,
    )
    return Response(
        content=archive_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/v1/models")
async def list_models():
    return {"models": _load_models()}


@app.post("/v1/models", response_model=HostedModel)
async def save_model(model: HostedModel):
    models = _load_models()
    payload = model.model_dump()
    existing_index = next((index for index, item in enumerate(models) if item.get("id") == model.id), None)
    if existing_index is None:
        models.append(payload)
    else:
        models[existing_index] = payload
    _save_models(models)
    return model


@app.post("/v1/models/{model_id}/status")
async def update_model_status(model_id: str, update: HostedModelStatusUpdate):
    models = _load_models()
    for item in models:
        if item.get("id") == model_id:
            item["status"] = update.status
            _save_models(models)
            return {"status": "ok", "model_id": model_id, "model_status": update.status}
    raise HTTPException(status_code=404, detail="Model not found")


@app.delete("/v1/models/{model_id}")
async def delete_model(model_id: str):
    models = _load_models()
    filtered = [item for item in models if item.get("id") != model_id]
    if len(filtered) == len(models):
        raise HTTPException(status_code=404, detail="Model not found")
    _save_models(filtered)
    return {"status": "ok", "model_id": model_id}


@app.post("/v1/memory/add")
async def add_memory(item: MemoryItem):
    entries = _load_short_term_memory()
    entries.append(
        {
            "content": item.content,
            "metadata": item.metadata or {},
            "timestamp": time.time(),
        }
    )
    _save_short_term_memory(entries)
    return {"status": "success", "count": len(entries)}


@app.post("/v1/memory/query")
async def query_memory(query: MemoryQuery):
    entries = _load_short_term_memory()
    normalized_query = query.query.strip().lower()
    ranked: List[Dict[str, Any]] = []
    for item in entries:
        content = str(item.get("content", ""))
        haystack = content.lower()
        score = 0
        if not normalized_query:
            score = 1
        else:
            for token in [part for part in normalized_query.split() if part]:
                if token in haystack:
                    score += 1
        if score > 0:
            ranked.append(
                {
                    "content": content,
                    "metadata": item.get("metadata", {}),
                    "distance": max(0.0, 1.0 - min(score, 10) / 10.0),
                    "timestamp": item.get("timestamp", 0),
                    "score": score,
                }
            )
    ranked.sort(key=lambda item: (-item["score"], -item["timestamp"]))
    return {"results": ranked[: max(1, query.limit)]}


@app.get("/v1/memory/short_term")
async def list_short_term_memory():
    return {"entries": list(reversed(_load_short_term_memory()))}


@app.delete("/v1/memory/short_term")
async def clear_short_term_memory():
    _save_short_term_memory([])
    return {"status": "ok"}


@app.get("/v1/lora")
async def list_loras():
    return []


@app.get("/v1/skills")
async def list_skills():
    return []


@app.post("/v1/skills/import")
async def import_skill():
    return {"status": "placeholder"}


@app.get("/v1/edge/devices")
async def list_devices():
    return HostLiteEdgeService.list_adb_devices()


@app.post("/v1/edge/connect", response_model=DeviceStatusResponse)
async def connect_device(config: SSHConfig):
    try:
        return HostLiteEdgeService.verify_ssh(
            hostname=config.hostname,
            username=config.username,
            password=config.password,
            port=config.port,
        )
    except Exception as exc:
        return _edge_error_response(exc)


@app.post("/v1/edge/package", response_model=BundleBuildResponse)
async def package_device_bundle(config: BundleBuildConfig):
    try:
        return HostLiteEdgeService.build_bundle(config)
    except Exception as exc:
        return _edge_error_response(exc)


@app.post("/v1/edge/provision", response_model=ProvisionResponse)
async def provision_device(config: BundleProvisionConfig):
    try:
        return HostLiteEdgeService.provision_bundle(config)
    except Exception as exc:
        return _edge_error_response(exc)


@app.get("/v1/pipelines")
async def list_pipelines():
    return _load_pipeline_records()


@app.post("/v1/pipelines/save")
async def save_pipeline(record: PipelineRecord):
    payload = record.model_dump()
    if not payload.get("created_at"):
        payload["created_at"] = time.time()
    path = safe_child_path(PIPELINES_DIR, record.id, suffix=".json")
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    return {"status": "ok", "id": record.id}
