from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Literal


class SSHConfig(BaseModel):
    """
    SSH Configuration Schema.
    Used for connecting to edge devices.
    """

    hostname: str = Field(..., description="IP address or hostname of the edge device")
    port: int = Field(22, description="SSH Port (default 22)")
    username: str = Field(..., description="SSH Username")
    password: str = Field(..., description="SSH Password")


class ProvisionConfig(SSHConfig):
    """
    Provision Configuration Schema.
    Includes SSH credentials and optional flow configuration to deploy.
    """

    flow_config: Optional[Dict[str, Any]] = Field(
        None, description="The graph JSON configuration to deploy"
    )


class DeviceStatusResponse(BaseModel):
    """
    Response schema for device connection/status checks.
    """

    status: str = Field(..., description="Success or error status")
    message: Optional[str] = Field(None, description="Detailed message")


class ProvisionResponse(BaseModel):
    """
    Response schema for provision operation.
    """

    status: str = Field(..., description="Status of provision (success/error)")
    logs: List[str] = Field(
        ..., description="List of execution logs from the edge device"
    )
    endpoint: Optional[str] = Field(
        None, description="The HTTP endpoint of the newly deployed service"
    )
    error: Optional[str] = Field(None, description="Error message if provision failed")
    bundle_dir: Optional[str] = Field(
        None, description="Absolute path to the generated local bundle directory"
    )
    archive_path: Optional[str] = Field(
        None, description="Absolute path to the generated local bundle archive"
    )
    manifest_path: Optional[str] = Field(
        None, description="Absolute path to the generated manifest.json"
    )
    device_dir: Optional[str] = Field(
        None, description="Target directory on the device where the bundle is deployed"
    )


class BundleBuildConfig(BaseModel):
    """
    Host-lite bundle build request.
    Used to package SA8397 runtime, scripts, docs, projects and optional model assets.
    """

    bundle_name: Optional[str] = Field(
        None, description="Human-readable bundle name used for the output folder/archive"
    )
    project_name: Optional[str] = Field(
        None, description="Logical project name for the current flow"
    )
    project_file_name: Optional[str] = Field(
        None, description="Desired JSON filename for the current flow inside the bundle"
    )
    flow_config: Optional[Dict[str, Any]] = Field(
        None, description="Current graph JSON to package as the bundle entry flow"
    )
    include_all_projects: bool = Field(
        True, description="Whether to include all saved backend project JSON files"
    )
    model_source: Optional[str] = Field(
        None,
        description="Local path or adb:/path source for Gemma4/QNN assets to include in the bundle",
    )
    package_models: bool = Field(
        True, description="Whether Gemma4/QNN assets must be copied into the bundle"
    )
    output_dir: Optional[str] = Field(
        None, description="Absolute local output directory for the generated bundle"
    )
    device_dir: str = Field(
        "/data/local/tmp/cyber_edge_agent_v25",
        description="Target directory on the SA8397 device",
    )
    adb_serial: Optional[str] = Field(
        None, description="Specific adb serial to use when multiple devices are connected"
    )
    car_ctrl_base_url: str = Field(
        "http://<device-ip>:8080",
        description="Default car control base URL embedded in the bundle manifest",
    )


class BundleBuildResponse(BaseModel):
    """
    Response returned after a local SA8397 bundle is generated.
    """

    status: str = Field(..., description="Status of bundle generation (success/error)")
    logs: List[str] = Field(..., description="Build logs")
    bundle_name: str = Field(..., description="Resolved bundle name")
    bundle_dir: str = Field(..., description="Absolute path to the generated bundle directory")
    archive_path: Optional[str] = Field(
        None, description="Absolute path to the generated bundle archive"
    )
    manifest_path: str = Field(..., description="Absolute path to the generated manifest.json")
    error: Optional[str] = Field(None, description="Error message if build failed")


class BundleProvisionConfig(BundleBuildConfig):
    """
    Host-lite provision request.
    Supports either local adb deployment or remote SSH deployment.
    """

    deploy_mode: Literal["adb", "ssh"] = Field(
        "adb", description="How the generated bundle should be deployed"
    )
    hostname: Optional[str] = Field(
        None, description="SSH hostname when deploy_mode=ssh"
    )
    port: int = Field(22, description="SSH port")
    username: Optional[str] = Field(
        None, description="SSH username when deploy_mode=ssh"
    )
    password: Optional[str] = Field(
        None, description="SSH password when deploy_mode=ssh"
    )
