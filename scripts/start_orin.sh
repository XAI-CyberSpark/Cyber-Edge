#!/bin/bash
set -e

echo "Building OAKEgdeStudioAgent for Orin (CUDA Enabled)..."

# Ensure Rust environment is loaded
source "$HOME/.cargo/env" 2>/dev/null || true

# Export CUDA paths just in case
export PATH=/usr/local/cuda/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH

# Run with release optimizations and CUDA features
cargo run --release --features cuda -- --port 8080
