from app.services.catalog_model_guard import require_deployed_catalog_models
try:
    import paramiko
except ImportError:
    paramiko = None  # type: ignore[assignment]
import os
import tarfile
import io
import time
import json
from fastapi import HTTPException
from app.schemas.edge_schema import SSHConfig, ProvisionConfig


class EdgeService:
    """
    Business Logic Service for Edge Device Management.
    Handles SSH connections, provisioning, and remote execution.
    """

    @staticmethod
    def verify_ssh(config: SSHConfig) -> dict:
        """
        Synchronously verify SSH connection.
        """
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            print(
                f"DEBUG: Attempting paramiko connect to {config.username}@{config.hostname}:{config.port}"
            )
            client.connect(
                hostname=config.hostname,
                port=config.port,
                username=config.username,
                password=config.password,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
                banner_timeout=60,
            )
            print("DEBUG: Connection successful")
            return {"status": "success", "message": "Connection established"}
        except paramiko.AuthenticationException:
            print("DEBUG: Authentication failed")
            raise HTTPException(
                status_code=401,
                detail="Authentication failed. Please check username and password.",
            )
        except Exception as e:
            print(f"DEBUG: SSH Connect Error: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            client.close()

    @staticmethod
    def provision_device(config: ProvisionConfig) -> dict:
        """
        Pack current backend code and deploy to target device.
        """
        require_deployed_catalog_models(config.flow_config)
        print(f"Starting provision for {config.username}@{config.hostname}")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        logs = []

        try:
            logs.append("Connecting to device...")
            client.connect(
                hostname=config.hostname,
                port=config.port,
                username=config.username,
                password=config.password,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
                banner_timeout=60,
            )

            logs.append("Packing backend code...")
            file_obj = io.BytesIO()
            with tarfile.open(fileobj=file_obj, mode="w:gz") as tar:
                cwd = os.getcwd()

                def filter_tar(tarinfo):
                    if "__pycache__" in tarinfo.name:
                        return None
                    if "/venv" in tarinfo.name:
                        return None
                    if "/.git" in tarinfo.name:
                        return None
                    if "tests" in tarinfo.name:
                        return None
                    return tarinfo

                tar.add(cwd, arcname="cyber-agent", filter=filter_tar)

                if config.flow_config:
                    flow_data = {
                        "nodes": config.flow_config.get("nodes", []),
                        "edges": config.flow_config.get("edges", []),
                        "meta": {
                            "name": "provisioned_flow",
                            "deployed_at": time.time(),
                        },
                    }
                    flow_json_str = json.dumps(flow_data, indent=2).encode("utf-8")
                    tar_info = tarfile.TarInfo(name="cyber-agent/flow.json")
                    tar_info.size = len(flow_json_str)
                    tar.addfile(tar_info, io.BytesIO(flow_json_str))
                    logs.append("Packed current flow as flow.json...")

            file_obj.seek(0)

            logs.append("Uploading payload (cyber-agent.tar.gz)...")
            sftp = client.open_sftp()
            sftp.putfo(file_obj, "/tmp/cyber-agent.tar.gz")
            sftp.close()

            logs.append("Extracting and installing dependencies...")

            commands = [
                "mkdir -p ~/cyber-agent",
                "tar -xzf /tmp/cyber-agent.tar.gz -C ~/cyber-agent --strip-components=1",
                "which pip3 || echo 'WARNING: pip3 not found'",
                "python3 -c 'import torch; print(\"Torch version:\", torch.__version__)' || echo 'WARNING: Torch not found'",
                "cd ~/cyber-agent && pip3 install -r requirements.txt --user --break-system-packages || pip3 install -r requirements.txt --user",
                "pip3 install sentence-transformers --user --break-system-packages || pip3 install sentence-transformers --user",
                "pkill -f 'python3' || true",
                "cd ~/cyber-agent && nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &",
            ]

            for cmd in commands:
                stdin, stdout, stderr = client.exec_command(cmd)
                exit_status = stdout.channel.recv_exit_status()
                if exit_status != 0:
                    err = stderr.read().decode()
                    if "pkill" not in cmd:
                        if "pip" in cmd:
                            logs.append(f"Warning during install: {err[:100]}...")
                        else:
                            raise Exception(f"Command failed: {cmd}\nError: {err}")

            logs.append("Verifying service startup...")
            max_retries = 10
            startup_success = False

            for i in range(max_retries):
                time.sleep(2)
                check_cmd = "curl -s http://localhost:8000/health || echo 'FAIL'"
                stdin, stdout, stderr = client.exec_command(check_cmd)
                output = stdout.read().decode().strip()

                if "status" in output and "ok" in output:
                    startup_success = True
                    logs.append("Service verified: Health check passed.")
                    break
                else:
                    logs.append(f"Waiting for service... ({i + 1}/{max_retries})")

            if not startup_success:
                logs.append("Service failed to start. Fetching logs...")
                stdin, stdout, stderr = client.exec_command(
                    "tail -n 50 ~/cyber-agent/server.log"
                )
                server_log = stdout.read().decode()
                logs.append(f"REMOTE SERVER LOG:\n{server_log}")
                return {
                    "status": "error",
                    "logs": logs,
                    "error": "Remote service failed to start. See logs above.",
                }

            logs.append("Service started successfully!")
            return {
                "status": "success",
                "logs": logs,
                "endpoint": f"http://{config.hostname}:8000",
            }

        except Exception as e:
            if "logs" in locals():
                logs.append(f"Provisioning Exception: {str(e)}")
                return {"status": "error", "logs": logs, "error": str(e)}
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            client.close()

    @staticmethod
    def install_inference_engine() -> dict:
        """
        Trigger local installation script for Inference Engines (Ollama).
        Runs on the Edge Device itself.
        """
        import subprocess

        try:
            try:
                subprocess.run(["ollama", "--version"], check=True, capture_output=True)
                return {"status": "success", "message": "Ollama already installed"}
            except subprocess.CalledProcessError:
                pass

            print("Installing Ollama...")
            subprocess.run(
                "curl -fsSL https://ollama.com/install.sh | sh", shell=True, check=True
            )

            return {"status": "success", "message": "Inference Engine Installed"}
        except Exception as e:
            print(f"Install Error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
