from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import inference, models

app = FastAPI(
    title="OAKEgde Studio Agent Backend (FastVLM Minimal)",
    description="Minimal runtime for FastVLM experiments",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import qualcomm_catalog
app.include_router(qualcomm_catalog.router, prefix='/v1/catalog/qualcomm', tags=['Qualcomm model catalog'])

app.include_router(inference.router, prefix="/v1/inference", tags=["Inference"])
app.include_router(models.router, prefix="/v1/models", tags=["Models"])
from app.api import edge
app.include_router(edge.router, prefix="/v1/edge", tags=["Edge Provisioning"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "mode": "fastvlm-minimal"}

