#ifndef HAL_INTERFACE_H
#define HAL_INTERFACE_H

#include <stdint.h>

typedef struct {
    const char* platform_id;
    uint32_t npu_tops;
    uint64_t total_memory;
} platform_info_t;

typedef struct hal_device_t hal_device_t;

// Detects whether running on NVIDIA Orin, Qualcomm Snapdragon, or Mock Simulator
platform_info_t hal_detect_platform(void);

// Open a specific hardware device (e.g. "npu", "can0", "csi_camera")
hal_device_t* hal_auto_open(const char* device_type);

#endif // HAL_INTERFACE_H
