from pydantic import BaseModel, Field
from typing import List, Optional


class ModelInfoSchema(BaseModel):
    id: str = Field(..., description="Model identifier")
    name: str = Field(..., description="Display name")
    size: str = Field(..., description="Model size label")
    path: str = Field("", description="Model source or local path")
    is_downloaded: bool = Field(..., description="Whether the model is available locally")
    category: Optional[str] = Field(None, description="Model category")
    provider: Optional[str] = Field(None, description="Model provider")
    format: Optional[str] = Field(None, description="Model file format")


class ModelListResponse(BaseModel):
    models: List[ModelInfoSchema]
