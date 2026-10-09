import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.schemas.edge_schema import BundleBuildConfig
from app.services.host_lite_edge_service import HostLiteEdgeService

# The host entry point creates relative directories on import. Isolate them too.
with TemporaryDirectory() as initial_dir:
    original_cwd = os.getcwd()
    try:
        os.chdir(initial_dir)
        import main_host_lite as host
    finally:
        os.chdir(original_cwd)


class ProjectFileBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.projects = self.base / "projects"
        self.pipelines = self.base / "pipelines"
        self.flow_dir = self.base / "flow"
        for directory in (self.projects, self.pipelines, self.flow_dir):
            directory.mkdir()
        for target, value in (("app.services.project_service.PROJECTS_DIR", str(self.projects)),
                              ("main_host_lite.PIPELINES_DIR", self.pipelines),
                              ("app.services.host_lite_edge_service.HostLiteEdgeService.PROJECTS_DIR", self.projects)):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.dict(os.environ, {"OAKEGDE_SITE_ACCESS": "0"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(host.app)
        self.addCleanup(self.client.close)
        self.victim = self.base / "victim.json"
        self.victim.write_text('{"preserve": true}')
        self.original = self.victim.read_bytes()

    def test_project_list_read_and_delete_preserve_exact_ids(self):
        names = ["draft.backup", "draft.json.backup", "draft", "draft.json", "draft.json.json"]
        for name in names:
            saved = self.client.post("/v1/projects/", json={"name": name, "file_name": name + ".json", "nodes": [], "edges": []})
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()["id"], name)
        listing = self.client.get("/v1/projects/").json()
        self.assertEqual({p["id"] for p in listing}, set(names))
        for name in names:
            loaded = self.client.get("/v1/projects/" + name)
            self.assertEqual(loaded.status_code, 200)
            self.assertEqual(loaded.json()["name"], name)
        # Updating with only an ID must not strip another extension either.
        saved = self.client.post("/v1/projects/", json={"id": "draft.json", "name": "updated", "nodes": [], "edges": []})
        self.assertEqual(saved.json()["id"], "draft.json")
        sibling_before = (self.projects / "draft.json").read_bytes()
        self.assertEqual(self.client.delete("/v1/projects/draft.json").status_code, 200)
        self.assertEqual(self.client.delete("/v1/projects/draft.json").status_code, 404)
        self.assertEqual((self.projects / "draft.json").read_bytes(), sibling_before)
        self.assertTrue((self.projects / "draft.json.json.json").exists())

    def test_pipeline_valid_id_and_rejected_escape_leave_data_untouched(self):
        valid = self.client.post("/v1/pipelines/save", json={"id": "普通-id.1", "name": "test", "data": "flow"})
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(json.loads((self.pipelines / "普通-id.1.json").read_text())["data"], "flow")
        for name in ("../victim", str(self.victim.with_suffix("")), "..\\victim", "", ".", "..", "bad\x00name"):
            with self.subTest(name=name):
                response = self.client.post("/v1/pipelines/save", json={"id": name, "name": "bad", "data": "overwrite"})
                self.assertEqual(response.status_code, 422)
                self.assertEqual(self.victim.read_bytes(), self.original)
        (self.pipelines / "linked.json").symlink_to(self.victim)
        response = self.client.post("/v1/pipelines/save", json={"id": "linked", "name": "bad", "data": "overwrite"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.victim.read_bytes(), self.original)

    def prepare(self, **kwargs):
        return HostLiteEdgeService._prepare_flow_json(BundleBuildConfig(**kwargs), "test", self.flow_dir)

    def test_bundle_accepts_plain_names_and_saved_project(self):
        path = self.prepare(flow_config={"nodes": [], "edges": [], "file_name": "流程.json"})
        self.assertEqual(path, self.flow_dir / "流程.json")
        self.assertEqual(json.loads(path.read_text())["nodes"], [])
        fallback = self.prepare(flow_config={"nodes": [], "edges": []}, project_file_name="fallback.json")
        self.assertEqual(fallback.name, "fallback.json")
        saved = self.projects / "saved.json"
        saved.write_text('{"nodes": [], "edges": []}')
        self.assertEqual(self.prepare(project_file_name="saved.json"), saved)

    def test_bundle_rejects_invalid_payload_names_without_writing(self):
        for name in ("../victim.json", str(self.victim), "nested/file.json", "..\\victim.json", "", None, [], 7, "bad\x00name"):
            with self.subTest(name=name), self.assertRaises(HTTPException) as raised:
                self.prepare(flow_config={"nodes": [], "edges": [], "file_name": name})
            self.assertEqual(raised.exception.status_code, 422)
            self.assertEqual(self.victim.read_bytes(), self.original)
        self.assertEqual(list(self.flow_dir.iterdir()), [])

    def test_bundle_checks_top_level_name_even_when_payload_overrides_it(self):
        for flow in (None, {"nodes": [], "file_name": "safe.json"}):
            for name in ("../victim.json", str(self.victim), ""):
                with self.subTest(flow=flow, name=name), self.assertRaises(HTTPException) as raised:
                    self.prepare(flow_config=flow, project_file_name=name)
                self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(self.victim.read_bytes(), self.original)

    def test_bundle_rejects_symlink_escape_on_read_and_write(self):
        for directory in (self.flow_dir, self.projects):
            (directory / "linked.json").symlink_to(self.victim)
        for kwargs in ({"flow_config": {"nodes": [], "file_name": "linked.json"}}, {"project_file_name": "linked.json"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(HTTPException) as raised:
                self.prepare(**kwargs)
            self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(self.victim.read_bytes(), self.original)


if __name__ == "__main__":
    unittest.main()
