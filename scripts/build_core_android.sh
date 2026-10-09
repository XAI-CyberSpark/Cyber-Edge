#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
CORE_DIR="${PROJECT_ROOT}/core"
DIST_DIR="${PROJECT_ROOT}/dist/sa8397"

ANDROID_NDK_ROOT=${ANDROID_NDK_ROOT:-/media/xai/DATA/android-ndk-r29-linux/android-ndk-r29}
QNN_SDK_ROOT=${QNN_SDK_ROOT:-/media/xai/DATA/v2.44.0.260225}
ANDROID_TARGET=${ANDROID_TARGET:-aarch64-linux-android}
ANDROID_API_LEVEL=${ANDROID_API_LEVEL:-34}

if [[ -d "${QNN_SDK_ROOT}/qairt/2.44.0.260225" ]]; then
  QAIRT_ROOT="${QNN_SDK_ROOT}/qairt/2.44.0.260225"
else
  QAIRT_ROOT="${QNN_SDK_ROOT}"
fi

TOOLCHAIN_BIN="${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/bin"
LINKER="${TOOLCHAIN_BIN}/aarch64-linux-android${ANDROID_API_LEVEL}-clang"
AR="${TOOLCHAIN_BIN}/llvm-ar"

if [[ ! -x "${LINKER}" ]]; then
  echo "Linker not found: ${LINKER}" >&2
  exit 1
fi

rustup target add "${ANDROID_TARGET}"

export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="${LINKER}"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_AR="${AR}"
export CC_aarch64_linux_android="${LINKER}"
export AR_aarch64_linux_android="${AR}"

pushd "${CORE_DIR}" >/dev/null
cargo build --release --target "${ANDROID_TARGET}"
popd >/dev/null

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/bin" "${DIST_DIR}/manifests" "${DIST_DIR}/lib"

cp "${CORE_DIR}/target/${ANDROID_TARGET}/release/g-edge-core" "${DIST_DIR}/bin/"
cp "${PROJECT_ROOT}/manifests/smart_cabin_v2.yaml" "${DIST_DIR}/manifests/"

for lib in libQnnCpu.so libQnnSystem.so libQnnHtp.so; do
  if [[ -f "${QAIRT_ROOT}/lib/aarch64-android/${lib}" ]]; then
    cp "${QAIRT_ROOT}/lib/aarch64-android/${lib}" "${DIST_DIR}/lib/"
  fi
done

if [[ -f "${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" ]]; then
  cp "${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" "${DIST_DIR}/lib/"
fi

echo "Android build completed."
echo "Staged runtime directory: ${DIST_DIR}"
