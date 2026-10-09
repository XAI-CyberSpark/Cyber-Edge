from fastapi import APIRouter
from typing import List
from app.schemas.project_schema import ProjectSchema, ProjectSummarySchema, ProjectSaveSchema
from app.services.project_service import ProjectService

router = APIRouter()


@router.get("/", response_model=List[ProjectSummarySchema])
async def list_projects():
    """List all saved projects."""
    return ProjectService.list_projects()


@router.get("/{project_id}", response_model=ProjectSchema)
async def get_project(project_id: str):
    """Load a specific project."""
    return ProjectService.get_project(project_id)


@router.post("/autosave", response_model=ProjectSchema)
async def autosave_project(project: ProjectSaveSchema):
    """Revision-checked autosave; older servers fail closed at this endpoint."""
    return ProjectService.save_project(project.model_copy(update={"autosave": True}))


@router.post("/", response_model=ProjectSchema)
async def save_project(project: ProjectSaveSchema):
    """Save or update a project."""
    return ProjectService.save_project(project)


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    return ProjectService.delete_project(project_id)
