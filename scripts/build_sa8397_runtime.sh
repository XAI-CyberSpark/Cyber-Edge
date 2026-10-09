#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
SOURCE_FILE="${PROJECT_ROOT}/runtime/sa8397/minimal_runtime.cpp"
DIST_DIR="${PROJECT_ROOT}/dist/sa8397_runtime"

ANDROID_NDK_ROOT=${ANDROID_NDK_ROOT:-/media/xai/DATA/android-ndk-r29-linux/android-ndk-r29}
ANDROID_API_LEVEL=${ANDROID_API_LEVEL:-34}
HOST_CXX=${HOST_CXX:-g++}
ANDROID_CXX="${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android${ANDROID_API_LEVEL}-clang++"
ANDROID_SYSROOT_LIB="${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android"

mkdir -p "${DIST_DIR}"

"${HOST_CXX}" -std=c++17 -O2 -Wall -Wextra -pedantic \
  "${SOURCE_FILE}" -o "${DIST_DIR}/sa8397_runtime_host"

"${ANDROID_CXX}" -std=c++17 -O2 -Wall -Wextra -pedantic \
  "${SOURCE_FILE}" -o "${DIST_DIR}/sa8397_runtime"

cp "${PROJECT_ROOT}/examples/sa8397/minimal_vehicle_flow.json" "${DIST_DIR}/flow.json"
cp "${PROJECT_ROOT}/examples/sa8397/minimal_vehicle_input.json" "${DIST_DIR}/input.json"
cp "${ANDROID_SYSROOT_LIB}/libc++_shared.so" "${DIST_DIR}/libc++_shared.so"

echo "Built host runtime: ${DIST_DIR}/sa8397_runtime_host"
echo "Built Android runtime: ${DIST_DIR}/sa8397_runtime"
