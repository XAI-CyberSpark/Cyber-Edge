#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
DIST_DIR = PROJECT_ROOT / "dist" / "host_lite"
sys.path.insert(0, str(BACKEND_DIR))

import main_host_lite  # noqa: E402
from app.services import project_service  # noqa: E402


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="host_lite_features_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        state_dir = tmp_dir / "state"
        projects_dir = tmp_dir / "projects"
        state_dir.mkdir(parents=True, exist_ok=True)
        projects_dir.mkdir(parents=True, exist_ok=True)

        main_host_lite.STATE_DIR = state_dir
        main_host_lite.MODEL_REGISTRY_PATH = state_dir / "models.json"
        main_host_lite.SHORT_TERM_MEMORY_PATH = state_dir / "short_term_memory.json"
        main_host_lite._save_models(main_host_lite.DEFAULT_MODELS)

        project_service.PROJECTS_DIR = str(projects_dir)
        os.makedirs(project_service.PROJECTS_DIR, exist_ok=True)

        client = TestClient(main_host_lite.app)

        first_project = {
            "name": "seat_demo",
            "file_name": "seat_demo.json",
            "overwrite": False,
            "nodes": [{"id": "n1", "type": "input", "data": {"label": "User Input"}}],
            "edges": [],
            "meta": {"source": "test"},
        }
        first_save = client.post("/v1/projects/", json=first_project)
        conflict_save = client.post("/v1/projects/", json=first_project)
        overwrite_save = client.post("/v1/projects/", json={**first_project, "overwrite": True})
        project_list = client.get("/v1/projects/")

        model_create = client.post(
            "/v1/models",
            json={
                "id": "future-vlm",
                "name": "Future VLM",
                "type": "vlm",
                "category": "vlm",
                "size": "1.5B",
                "path": "/models/future-vlm",
                "status": "inactive",
                "provider": "Lab",
                "is_downloaded": True,
            },
        )
        model_status = client.post("/v1/models/future-vlm/status", json={"status": "active"})
        model_list = client.get("/v1/models")
        model_delete = client.delete("/v1/models/future-vlm")

        memory_add_1 = client.post("/v1/memory/add", json={"content": "User: 我喜欢偏暖风格\nAgent: 已记住", "metadata": {"type": "conversation"}})
        memory_add_2 = client.post("/v1/memory/add", json={"content": "User: 请记住我叫 Alice\nAgent: 已记录", "metadata": {"type": "conversation"}})
        memory_query = client.post("/v1/memory/query", json={"query": "Alice", "limit": 5})

        ok = all(
            [
                first_save.status_code == 200,
                conflict_save.status_code == 409,
                overwrite_save.status_code == 200,
                project_list.status_code == 200,
                any(item.get("file_name") == "seat_demo.json" for item in project_list.json()),
                model_create.status_code == 200,
                model_status.status_code == 200,
                model_list.status_code == 200,
                any(item.get("id") == "gemma4-cpu-sa8397" for item in model_list.json().get("models", [])),
                any(item.get("id") == "future-vlm" and item.get("status") == "active" for item in model_list.json().get("models", [])),
                model_delete.status_code == 200,
                memory_add_1.status_code == 200,
                memory_add_2.status_code == 200,
                memory_query.status_code == 200,
                any("Alice" in item.get("content", "") for item in memory_query.json().get("results", [])),
            ]
        )

        DIST_DIR.mkdir(parents=True, exist_ok=True)
        report_path = DIST_DIR / "host_lite_features_report.json"
        report = {
            "ok": ok,
            "first_save": first_save.status_code,
            "conflict_save": conflict_save.status_code,
            "overwrite_save": overwrite_save.status_code,
            "projects": project_list.json(),
            "models_after_create": model_list.json(),
            "memory_query": memory_query.json(),
        }
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(report_path)
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
