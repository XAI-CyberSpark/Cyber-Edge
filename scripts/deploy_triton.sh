#!/bin/bash
set -e

# Configuration
TRITON_VERSION="24.03"
MODEL_REPO_PATH="/opt/triton/model_repository"
CONTAINER_NAME="triton_server"
IMAGE_NAME="nvcr.io/nvidia/tritonserver:${TRITON_VERSION}-trtllm-python-py3"

echo "=== Deploying NVIDIA Triton Inference Server on Orin ==="
echo "Target Image: ${IMAGE_NAME}"

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check for NVIDIA Runtime
if ! docker info | grep -q "Runtimes.*nvidia"; then
    echo "Error: NVIDIA Container Runtime not found. Is JetPack installed correctly?"
    exit 1
fi

# Create Model Repository Directory
echo "Creating Model Repository at ${MODEL_REPO_PATH}..."
sudo mkdir -p ${MODEL_REPO_PATH}
sudo chown -R $USER:$USER ${MODEL_REPO_PATH}

# Pull Image
echo "Pulling Triton Server Image (this may take a while)..."
docker pull ${IMAGE_NAME}

# Run Container
echo "Starting Triton Server Container..."
# Stop existing container if any
if [ "$(docker ps -aq -f name=${CONTAINER_NAME})" ]; then
    docker rm -f ${CONTAINER_NAME}
fi

docker run -d --name ${CONTAINER_NAME} \
    --runtime=nvidia \
    --gpus all \
    --net=host \
    -v ${MODEL_REPO_PATH}:/models \
    -p 8000:8000 \
    -p 8001:8001 \
    -p 8002:8002 \
    ${IMAGE_NAME} \
    tritonserver \
    --model-repository=/models \
    --disable-auto-complete-config \
    --log-verbose=1

echo "=== Triton Server Deployed Successfully! ==="
echo "HTTP API: http://localhost:8000"
echo "gRPC API: http://localhost:8001"
echo "Metrics:  http://localhost:8002"
echo "Use 'docker logs -f ${CONTAINER_NAME}' to monitor logs."
