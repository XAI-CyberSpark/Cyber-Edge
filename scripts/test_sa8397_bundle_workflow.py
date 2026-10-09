#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
DIST_DIR = PROJECT_ROOT / "dist" / "host_lite"
sys.path.insert(0, str(BACKEND_DIR))

import main_host_lite  # noqa: E402
from app.schemas.edge_schema import BundleBuildResponse  # noqa: E402
from app.services.host_lite_edge_service import HostLiteEdgeService  # noqa: E402


def main() -> int:
    sample_flow = json.loads(
        (PROJECT_ROOT / "backend" / "projects" / "seat_set+light_sub+veh_set.json").read_text(encoding="utf-8")
    )

    with tempfile.TemporaryDirectory(prefix="sa8397_bundle_test_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        fake_model_dir = tmp_dir / "fake_sa8397_qnn"
        (fake_model_dir / "common").mkdir(parents=True, exist_ok=True)
        (fake_model_dir / "common" / "litert_lm_main").write_text("fake", encoding="utf-8")
        (fake_model_dir / "common" / "litert_lm_advanced_main").write_text("fake", encoding="utf-8")
        (fake_model_dir / "model.litertlm").write_text("fake", encoding="utf-8")

        bundle_output_dir = tmp_dir / "bundle_out"
        client = TestClient(main_host_lite.app)

        package_payload = {
            "bundle_name": "sa8397_bundle_test",
            "project_name": "sa8397_bundle_test",
            "project_file_name": "sa8397_bundle_test.json",
            "flow_config": sample_flow,
            "include_all_projects": False,
            "model_source": str(fake_model_dir),
            "package_models": True,
            "output_dir": str(bundle_output_dir),
            "device_dir": "/data/local/tmp/sa8397_bundle_test",
        }

        package_res = client.post("/v1/edge/package", json=package_payload)
        assert package_res.status_code == 200, package_res.text
        package_data = package_res.json()
        bundle_dir = Path(package_data["bundle_dir"])
        manifest_path = Path(package_data["manifest_path"])
        archive_path = Path(package_data["archive_path"])

        assert bundle_dir.exists(), bundle_dir
        assert manifest_path.exists(), manifest_path
        assert archive_path.exists(), archive_path
        assert (bundle_dir / "README.md").exists()
        assert (bundle_dir / "flow.json").exists()
        assert (bundle_dir / "projects" / "sa8397_bundle_test.json").exists()
        assert (bundle_dir / "models" / "gemma4-cpu-sa8397").exists()

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["entry_project"]["file_name"] == "sa8397_bundle_test.json"
        assert manifest["models"][0]["included"] is True
        assert "sa8397_bundle_test.json" in manifest["projects"]

        build_result = BundleBuildResponse(**package_data)
        with patch.object(HostLiteEdgeService, "build_bundle", return_value=build_result), patch.object(
            HostLiteEdgeService, "_deploy_via_adb", return_value={"logs": ["mock adb deploy ok"]}
        ):
            provision_res = client.post(
                "/v1/edge/provision",
                json={
                    **package_payload,
                    "deploy_mode": "adb",
                    "adb_serial": "FAKE_SERIAL",
                },
            )
        assert provision_res.status_code == 200, provision_res.text
        provision_data = provision_res.json()
        assert provision_data["status"] == "success"
        assert "mock adb deploy ok" in "\n".join(provision_data["logs"])
        assert provision_data["device_dir"] == "/data/local/tmp/sa8397_bundle_test"

        DIST_DIR.mkdir(parents=True, exist_ok=True)
        report_path = DIST_DIR / "sa8397_bundle_workflow_report.json"
        report_path.write_text(
            json.dumps(
                {
                    "ok": True,
                    "package": package_data,
                    "provision": provision_data,
                    "manifest": manifest,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(report_path)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
