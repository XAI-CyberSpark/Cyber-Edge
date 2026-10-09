from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class ProjectSchema(BaseModel):
    """
    Project model for a visual agent flow.
    """

    id: str = Field(..., description="Unique project ID")
    name: str = Field(..., description="Project name")
    file_name: Optional[str] = Field(None, description="Project JSON file name")
    nodes: List[Dict[str, Any]] = Field(
        default_factory=list, description="List of visual nodes in the flow"
    )
    edges: List[Dict[str, Any]] = Field(
        default_factory=list, description="List of connections between nodes"
    )
    meta: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Additional project metadata"
    )
    updated_at: Optional[float] = Field(None, description="Last modification timestamp")


class ProjectSaveSchema(BaseModel):
    autosave: bool = False
    expected_updated_at: Optional[float] = None
    id: Optional[str] = Field(None, description="Unique project ID")
    name: str = Field(..., description="Project name")
    file_name: Optional[str] = Field(None, description="Desired JSON file name")
    overwrite: bool = Field(False, description="Whether to overwrite an existing project file")
    nodes: List[Dict[str, Any]] = Field(
        default_factory=list, description="List of visual nodes in the flow"
    )
    edges: List[Dict[str, Any]] = Field(
        default_factory=list, description="List of connections between nodes"
    )
    meta: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Additional project metadata"
    )
    updated_at: Optional[float] = Field(None, description="Last modification timestamp")


class ProjectSummarySchema(BaseModel):
    """
    Summary of a project for list views.
    """

    id: str
    name: str
    file_name: str
    updated_at: float
    size: int
