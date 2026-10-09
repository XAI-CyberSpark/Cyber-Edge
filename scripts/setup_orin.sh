#!/bin/bash
set -e

echo "Starting OAKEgdeStudioAgent Setup for NVIDIA Jetson Orin..."

# Check if running on Linux
if [[ "$(uname)" != "Linux" ]]; then
    echo "Error: This script is designed for Linux (Jetson Orin)."
    exit 1
fi

echo "Installing System Dependencies..."
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev espeak-ng alsa-utils curl git

# Install Rust if not present
if ! command -v cargo &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "Rust is already installed."
fi

# Check for CUDA
if command -v nvcc &> /dev/null; then
    echo "CUDA found: $(nvcc --version | grep release)"
else
    echo "Warning: CUDA (nvcc) not found in PATH. Please ensure JetPack is installed correctly."
    echo "You may need to run: export PATH=/usr/local/cuda/bin:\$PATH"
fi

echo "Setup Complete! You can now run ./scripts/start_orin.sh"
