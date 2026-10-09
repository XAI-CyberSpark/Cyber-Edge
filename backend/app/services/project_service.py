import json
import os
import glob
import time
import re
import tempfile
from threading import RLock

_SAVE_LOCK = RLock()
from fastapi import HTTPException
from app.schemas.project_schema import ProjectSchema, ProjectSaveSchema

PROJECTS_DIR = "projects"

# Ensure projects dir exists
if not os.path.exists(PROJECTS_DIR):
    os.makedirs(PROJECTS_DIR)


class ProjectService:
    @staticmethod
    def _sanitize_project_id(raw_name: str, *, strip_extension: bool = True) -> str:
        normalized = (raw_name or "").strip()
        if strip_extension and normalized.lower().endswith(".json"):
            normalized = normalized[:-5]
        normalized = re.sub(r"[\\/\x00-\x1f]", "_", normalized)
        normalized = normalized.strip().strip(".")
        return normalized or str(int(time.time()))

    @staticmethod
    def list_projects() -> list:
        projects = []
        for filepath in glob.glob(os.path.join(PROJECTS_DIR, "*.json")):
            try:
                filename = os.path.basename(filepath)
                project_id = os.path.splitext(filename)[0]
                stat = os.stat(filepath)

                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    name = data.get("name", project_id)

                projects.append(
                    {
                        "id": project_id,
                        "name": name,
                        "file_name": filename,
                        "updated_at": stat.st_mtime,
                        "size": stat.st_size,
                    }
                )
            except Exception as e:
                print(f"Error reading project {filepath}: {e}")
                continue

        return sorted(projects, key=lambda x: x["updated_at"], reverse=True)

    @staticmethod
    def get_project(project_id: str) -> dict:
        filepath = os.path.join(PROJECTS_DIR, f"{ProjectService._sanitize_project_id(project_id, strip_extension=False)}.json")
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Project not found")

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data.setdefault("file_name", os.path.basename(filepath))
                if data.get("updated_at") is None:
                    data["updated_at"] = os.stat(filepath).st_mtime
                return data
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to load project: {str(e)}"
            )

    @staticmethod
    def save_project(project: ProjectSaveSchema) -> ProjectSchema:
        with _SAVE_LOCK:
            return ProjectService._save_project(project)

    @staticmethod
    def _save_project(project: ProjectSaveSchema) -> ProjectSchema:
        candidate = project.file_name or project.id or project.name
        project_id = ProjectService._sanitize_project_id(
            candidate, strip_extension=bool(project.file_name) or not project.id
        )
        filepath = os.path.join(PROJECTS_DIR, f"{project_id}.json")

        if project.autosave:
            existing = None
            if os.path.exists(filepath):
                with open(filepath, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                # A retry after a lost acknowledgement is idempotent.
                if all(existing.get(key, {}) == getattr(project, key) for key in ("name", "nodes", "edges", "meta")):
                    existing["id"] = project_id
                    existing["file_name"] = f"{project_id}.json"
                    existing["updated_at"] = existing.get("updated_at") or os.stat(filepath).st_mtime
                    return ProjectSchema(**existing)
            revision = (existing.get("updated_at") or os.stat(filepath).st_mtime) if existing else None
            if revision != project.expected_updated_at:
                raise HTTPException(status_code=409, detail={"message": "Project changed or was deleted", "code": "revision_conflict"})

        if os.path.exists(filepath) and not project.overwrite and project.id != project_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Project file already exists",
                    "project_id": project_id,
                    "file_name": f"{project_id}.json",
                },
            )

        project_payload = ProjectSchema(
            id=project_id,
            name=project.name,
            file_name=f"{project_id}.json",
            nodes=project.nodes,
            edges=project.edges,
            meta=project.meta or {},
            updated_at=time.time(),
        )

        try:
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=PROJECTS_DIR, suffix=".tmp", delete=False) as f:
                    temporary = f.name
                    json.dump(project_payload.model_dump(), f, indent=2, ensure_ascii=False)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(temporary, filepath)
            finally:
                if temporary and os.path.exists(temporary):
                    os.remove(temporary)
            return project_payload
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to save project: {str(e)}"
            )

    @staticmethod
    def delete_project(project_id: str) -> dict:
        filepath = os.path.join(PROJECTS_DIR, f"{ProjectService._sanitize_project_id(project_id, strip_extension=False)}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return {"status": "success"}
        raise HTTPException(status_code=404, detail="Project not found")
