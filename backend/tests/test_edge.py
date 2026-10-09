from unittest.mock import MagicMock, patch
import sys
import os

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mock missing dependencies
mock_chroma = MagicMock()
sys.modules["chromadb"] = mock_chroma
sys.modules["chromadb.utils"] = MagicMock()
sys.modules["chromadb.config"] = MagicMock()
sys.modules["sentence_transformers"] = MagicMock()

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


@patch("app.api.edge.paramiko.SSHClient")
def test_ssh_connection(mock_ssh):
    """Test SSH connection verification."""
    # Mock successful connection
    mock_instance = mock_ssh.return_value
    mock_instance.connect.return_value = None

    response = client.post(
        "/v1/edge/connect",
        json={"hostname": "192.168.1.100", "username": "user", "password": "password"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    mock_instance.connect.assert_called_once_with(
        hostname="192.168.1.100",
        port=22,
        username="user",
        password="password",
        timeout=5,
        look_for_keys=False,
        allow_agent=False,
    )


@patch("app.api.edge.paramiko.SSHClient")
def test_provision_device(mock_ssh):
    """Test the full provisioning flow with mocked SSH."""
    mock_instance = mock_ssh.return_value
    mock_instance.connect.return_value = None

    # Mock SFTP
    mock_sftp = MagicMock()
    mock_instance.open_sftp.return_value = mock_sftp

    # Mock Command Execution
    # exec_command returns (stdin, stdout, stderr)
    mock_stdout = MagicMock()
    mock_stdout.channel.recv_exit_status.return_value = 0
    mock_stderr = MagicMock()

    mock_instance.exec_command.return_value = (None, mock_stdout, mock_stderr)

    response = client.post(
        "/v1/edge/provision",
        json={"hostname": "192.168.1.100", "username": "user", "password": "password"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "Service started successfully!" in data["logs"][-1]
