from __future__ import annotations
from app.services.catalog_model_guard import require_deployed_catalog_models
from app.services.file_paths import safe_child_path

import json
import os
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

try:
    import paramiko
except Exception:  # pragma: no cover - optional dependency in offline host-lite usage
    paramiko = None

from app.schemas.edge_schema import (
    BundleBuildConfig,
    BundleBuildResponse,
    BundleProvisionConfig,
)


class HostLiteEdgeService:
    """
    Real host-lite bundle/build/deploy service for SA8397 packaging.
    """

    PROJECT_ROOT = Path(__file__).resolve().parents[3]
    DIST_ROOT = PROJECT_ROOT / "dist" / "sa8397_bundle"
    PROJECTS_DIR = PROJECT_ROOT / "backend" / "projects"
    PACKAGE_SCRIPT = PROJECT_ROOT / "scripts" / "package_sa8397_bundle.sh"

    @classmethod
    def list_adb_devices(cls) -> Dict[str, Any]:
        devices: List[Dict[str, Any]] = [
            {
                "id": "local",
                "name": "Local ADB Device",
                "transport": "adb",
                "serial": None,
                "ip": "",
                "status": "ready",
            }
        ]
        try:
            result = subprocess.run(
                ["adb", "devices"],
                cwd=cls.PROJECT_ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            for line in result.stdout.splitlines()[1:]:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                serial = parts[0]
                status = parts[1] if len(parts) > 1 else "unknown"
                devices.append(
                    {
                        "id": serial,
                        "name": f"ADB {serial}",
                        "transport": "adb",
                        "serial": serial,
                        "ip": "",
                        "status": status,
                    }
                )
        except Exception as exc:
            devices[0]["status"] = f"adb unavailable: {exc}"
        return {"devices": devices}

    @classmethod
    def verify_ssh(cls, hostname: str, username: str, password: str, port: int = 22) -> Dict[str, str]:
        if paramiko is None:
            raise HTTPException(
                status_code=500,
                detail="paramiko is not installed. Install backend/requirements-host-lite.txt to enable SSH deployment.",
            )
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                hostname=hostname,
                port=port,
                username=username,
                password=password,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
                banner_timeout=60,
            )
            return {"status": "success", "message": "Connection established"}
        except paramiko.AuthenticationException:
            raise HTTPException(
                status_code=401,
                detail="Authentication failed. Please check username and password.",
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        finally:
            client.close()

    @classmethod
    def build_bundle(cls, config: BundleBuildConfig) -> BundleBuildResponse:
        logs: List[str] = []
        cls.DIST_ROOT.mkdir(parents=True, exist_ok=True)

        bundle_name = cls._resolve_bundle_name(config.bundle_name or config.project_name)
        output_dir = Path(config.output_dir).expanduser() if config.output_dir else cls.DIST_ROOT
        output_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="sa8397_bundle_flow_") as tmp_dir_str:
            tmp_dir = Path(tmp_dir_str)
            flow_json_path = cls._prepare_flow_json(config, bundle_name, tmp_dir)

            env = os.environ.copy()
            env["BUNDLE_NAME"] = bundle_name
            env["OUTPUT_DIR"] = str(output_dir)
            env["FLOW_JSON"] = str(flow_json_path)
            env["CURRENT_PROJECT_NAME"] = config.project_name or bundle_name
            env["CURRENT_PROJECT_FILE_NAME"] = config.project_file_name or flow_json_path.name
            env["DEVICE_DIR"] = config.device_dir
            env["INCLUDE_ALL_PROJECTS"] = "1" if config.include_all_projects else "0"
            env["PACKAGE_MODELS"] = "1" if config.package_models else "0"
            env["CAR_CTRL_BASE_URL"] = config.car_ctrl_base_url
            if config.model_source:
                env["MODEL_SOURCE"] = config.model_source
            if config.adb_serial:
                env["ADB_SERIAL"] = config.adb_serial

            logs.append(f"Building SA8397 bundle: {bundle_name}")
            logs.append(f"Flow entry: {flow_json_path}")
            if config.package_models:
                logs.append(
                    f"Model source: {config.model_source or '(missing - package will fail unless MODEL_SOURCE is set)'}"
                )

            result = subprocess.run(
                [str(cls.PACKAGE_SCRIPT)],
                cwd=cls.PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            if result.stdout.strip():
                logs.extend([line for line in result.stdout.splitlines() if line.strip()])
            if result.stderr.strip():
                logs.extend([f"stderr: {line}" for line in result.stderr.splitlines() if line.strip()])

            if result.returncode != 0:
                raise HTTPException(
                    status_code=500,
                    detail=json.dumps(
                        {
                            "status": "error",
                            "logs": logs,
                            "error": f"package script failed with exit code {result.returncode}",
                        },
                        ensure_ascii=False,
                    ),
                )

        bundle_dir = output_dir / bundle_name
        manifest_path = bundle_dir / "manifest.json"
        archive_path = output_dir / f"{bundle_name}.tar.gz"
        if not bundle_dir.exists():
            raise HTTPException(status_code=500, detail=f"bundle directory not found: {bundle_dir}")
        if not manifest_path.exists():
            raise HTTPException(status_code=500, detail=f"manifest not found: {manifest_path}")

        return BundleBuildResponse(
            status="success",
            logs=logs,
            bundle_name=bundle_name,
            bundle_dir=str(bundle_dir),
            archive_path=str(archive_path) if archive_path.exists() else None,
            manifest_path=str(manifest_path),
        )

    @classmethod
    def provision_bundle(cls, config: BundleProvisionConfig) -> Dict[str, Any]:
        build_result = cls.build_bundle(config)
        logs = list(build_result.logs)
        logs.append("Bundle built successfully. Starting deployment...")

        if config.deploy_mode == "ssh":
            if not config.hostname or not config.username or not config.password:
                raise HTTPException(
                    status_code=400,
                    detail="hostname, username and password are required for SSH deployment",
                )
            deploy_result = cls._deploy_via_ssh(
                bundle_dir=Path(build_result.bundle_dir),
                archive_path=Path(build_result.archive_path) if build_result.archive_path else None,
                hostname=config.hostname,
                username=config.username,
                password=config.password,
                port=config.port,
                device_dir=config.device_dir,
            )
        else:
            deploy_result = cls._deploy_via_adb(
                bundle_dir=Path(build_result.bundle_dir),
                device_dir=config.device_dir,
                adb_serial=config.adb_serial,
            )

        logs.extend(deploy_result["logs"])
        return {
            "status": "success",
            "logs": logs,
            "bundle_dir": build_result.bundle_dir,
            "archive_path": build_result.archive_path,
            "manifest_path": build_result.manifest_path,
            "device_dir": config.device_dir,
            "endpoint": deploy_result.get("endpoint"),
        }

    @classmethod
    def _prepare_flow_json(cls, config: BundleBuildConfig, bundle_name: str, tmp_dir: Path) -> Path:
        if config.project_file_name is not None:
            safe_child_path(tmp_dir, config.project_file_name)
        if config.flow_config:
            payload = dict(config.flow_config)
            require_deployed_catalog_models(payload)
            payload.setdefault("id", config.project_name or bundle_name)
            payload.setdefault("name", config.project_name or bundle_name)
            payload.setdefault(
                "file_name",
                config.project_file_name or f"{cls._resolve_bundle_name(config.project_name or bundle_name)}.json",
            )
            payload.setdefault("meta", {})
            payload["updated_at"] = time.time()
            flow_path = safe_child_path(tmp_dir, payload["file_name"])
            flow_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            return flow_path

        candidate = safe_child_path(cls.PROJECTS_DIR, config.project_file_name or "flow.json")
        if not candidate.exists():
            raise HTTPException(status_code=400, detail=f"flow file not found: {candidate}")
        require_deployed_catalog_models(json.loads(candidate.read_text(encoding="utf-8")))
        return candidate

    @classmethod
    def _deploy_via_adb(cls, bundle_dir: Path, device_dir: str, adb_serial: Optional[str]) -> Dict[str, Any]:
        logs: List[str] = []
        adb = cls._adb_base_command(adb_serial)
        cls._run_cmd(adb + ["get-state"], logs, "Checking adb connection")
        cls._run_cmd(adb + ["shell", "mkdir", "-p", device_dir], logs, f"Creating {device_dir}")
        cls._run_cmd(adb + ["push", f"{bundle_dir}/.", device_dir], logs, "Pushing bundle to device")
        chmod_cmd = cls._device_chmod_command(device_dir)
        cls._run_cmd(adb + ["shell", "sh", "-c", chmod_cmd], logs, "Fixing executable permissions")
        return {"logs": logs}

    @classmethod
    def _deploy_via_ssh(
        cls,
        bundle_dir: Path,
        archive_path: Optional[Path],
        hostname: str,
        username: str,
        password: str,
        port: int,
        device_dir: str,
    ) -> Dict[str, Any]:
        if paramiko is None:
            raise HTTPException(
                status_code=500,
                detail="paramiko is not installed. Install backend/requirements-host-lite.txt to enable SSH deployment.",
            )
        logs: List[str] = []
        archive_to_upload = archive_path
        if archive_to_upload is None or not archive_to_upload.exists():
            archive_to_upload = bundle_dir.with_suffix(".tar.gz")
            with tarfile.open(archive_to_upload, "w:gz") as tar:
                tar.add(bundle_dir, arcname=bundle_dir.name)

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            logs.append(f"Connecting to {username}@{hostname}:{port} ...")
            client.connect(
                hostname=hostname,
                port=port,
                username=username,
                password=password,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
                banner_timeout=60,
            )
            remote_archive = f"/tmp/{archive_to_upload.name}"
            logs.append(f"Uploading archive to {remote_archive}")
            sftp = client.open_sftp()
            sftp.put(str(archive_to_upload), remote_archive)
            sftp.close()

            commands = [
                f"mkdir -p {shlex.quote(device_dir)}",
                f"tar -xzf {shlex.quote(remote_archive)} -C {shlex.quote(device_dir)} --strip-components=1",
                cls._device_chmod_command(device_dir),
            ]
            for command in commands:
                logs.append(f"$ {command}")
                stdin, stdout, stderr = client.exec_command(command)
                exit_code = stdout.channel.recv_exit_status()
                stdout_text = stdout.read().decode().strip()
                stderr_text = stderr.read().decode().strip()
                if stdout_text:
                    logs.extend([line for line in stdout_text.splitlines() if line.strip()])
                if stderr_text:
                    logs.extend([f"stderr: {line}" for line in stderr_text.splitlines() if line.strip()])
                if exit_code != 0:
                    raise HTTPException(status_code=500, detail=f"remote command failed: {command}")
            return {"logs": logs, "endpoint": hostname}
        finally:
            client.close()

    @staticmethod
    def _resolve_bundle_name(raw_name: Optional[str]) -> str:
        base = (raw_name or f"sa8397_bundle_{int(time.time())}").strip().lower()
        cleaned = "".join(char if char.isalnum() or char in ("-", "_") else "-" for char in base)
        cleaned = cleaned.strip("-_")
        return cleaned or f"sa8397_bundle_{int(time.time())}"

    @staticmethod
    def _adb_base_command(adb_serial: Optional[str]) -> List[str]:
        command = ["adb"]
        if adb_serial and adb_serial != "local":
            command.extend(["-s", adb_serial])
        return command

    @staticmethod
    def _device_chmod_command(device_dir: str) -> str:
        quoted_dir = shlex.quote(device_dir)
        return (
            f"chmod 755 {quoted_dir}/sa8397_runtime "
            f"{quoted_dir}/action_adapter.sh "
            f"{quoted_dir}/llm_adapter.sh "
            f"{quoted_dir}/run_sa8397_runtime.sh "
            f"{quoted_dir}/deploy_sa8397_runtime.sh "
            f"{quoted_dir}/package_sa8397_bundle.sh "
            f"{quoted_dir}/models/gemma4-cpu-sa8397/litert_lm_main "
            f"{quoted_dir}/models/gemma4-cpu-sa8397/litert_lm_advanced_main "
            f"{quoted_dir}/models/gemma4-cpu-sa8397/common/litert_lm_main "
            f"{quoted_dir}/models/gemma4-cpu-sa8397/common/litert_lm_advanced_main || true"
        )

    @staticmethod
    def _run_cmd(command: List[str], logs: List[str], description: str) -> None:
        logs.append(description)
        logs.append("$ " + " ".join(shlex.quote(part) for part in command))
        result = subprocess.run(command, capture_output=True, text=True)
        if result.stdout.strip():
            logs.extend([line for line in result.stdout.splitlines() if line.strip()])
        if result.stderr.strip():
            logs.extend([f"stderr: {line}" for line in result.stderr.splitlines() if line.strip()])
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=json.dumps(
                    {
                        "status": "error",
                        "logs": logs,
                        "error": f"command failed with exit code {result.returncode}",
                    },
                    ensure_ascii=False,
                ),
            )
