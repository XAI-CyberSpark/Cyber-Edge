from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class SDKExportRequest(BaseModel):
    name: str = Field(..., description="Display name for the exported SDK")
    nodes: List[Dict[str, Any]] = Field(
        default_factory=list, description="List of visual nodes in the flow"
    )
    edges: List[Dict[str, Any]] = Field(
        default_factory=list, description="List of graph connections"
    )
    package_name: Optional[str] = Field(
        None, description="Optional Python package name override"
    )
    default_model: Optional[str] = Field(
        None, description="Fallback model to use in the exported SDK"
    )
