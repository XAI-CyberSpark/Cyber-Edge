#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = PROJECT_ROOT / "dist" / "sa8397_runtime"
DEVICE_DIR = "/data/local/tmp/cyber_edge_agent_v25"


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def ensure_ok(proc: subprocess.CompletedProcess[str], step: str) -> None:
    if proc.returncode != 0:
        raise RuntimeError(f"{step} failed:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")


def main() -> int:
    graph = {
        "name": "llm_action_routing_test",
        "nodes": [
            {"id": "input_1", "type": "input", "data": {"label": "Input"}},
            {"id": "llm_1", "type": "llm", "data": {"label": "LLM", "systemPrompt": "Return vehicle actions in JSON only."}},
            {
                "id": "car_windows",
                "type": "car_control",
                "data": {
                    "label": "Windows",
                    "action": "vehicleControl.set.WINDOW_POSITION",
                    "endpoint": "control",
                    "module": "vehicleControl",
                    "function": "set",
                    "signalKey": "WINDOW_POSITION",
                    "area": 0,
                    "status": 0,
                    "baseUrlTemplate": "http://<device-ip>:8080"
                }
            },
            {
                "id": "car_seat",
                "type": "car_control",
                "data": {
                    "label": "Seat Heat",
                    "action": "seat.set.SEAT_HEAT_STATUS_0",
                    "endpoint": "control",
                    "module": "seat",
                    "function": "set",
                    "signalKey": "SEAT_HEAT_STATUS_0",
                    "level": 1,
                    "baseUrlTemplate": "http://<device-ip>:8080"
                }
            },
            {"id": "output_1", "type": "output", "data": {"label": "Output"}},
        ],
        "edges": [
            {"id": "e1", "source": "input_1", "target": "llm_1"},
            {"id": "e2", "source": "llm_1", "target": "car_windows"},
            {"id": "e3", "source": "llm_1", "target": "car_seat"},
            {"id": "e4", "source": "car_windows", "target": "output_1"},
            {"id": "e5", "source": "car_seat", "target": "output_1"},
        ],
    }
    plan = {
        "reply": "已为你关闭所有车窗并打开主驾座椅加热。",
        "actions": [
            {"node_id": "car_windows", "args": "关闭所有车窗"},
            {"node_id": "car_seat", "args": "主驾座椅加热3档"},
        ],
    }
    input_payload = {"text": "请关闭所有车窗，并将主驾座椅加热调到3档", "source": "voice_command"}

    graph_path = DIST_DIR / "llm_action_test_flow.json"
    input_path = DIST_DIR / "llm_action_test_input.json"
    plan_path = DIST_DIR / "llm_action_test_plan.json"
    report_path = DIST_DIR / "llm_action_test_report.json"

    DIST_DIR.mkdir(parents=True, exist_ok=True)
    graph_path.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    input_path.write_text(json.dumps(input_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    ensure_ok(run(["adb", "shell", "mkdir", "-p", DEVICE_DIR]), "mkdir device dir")
    ensure_ok(run(["adb", "push", str(DIST_DIR / "sa8397_runtime"), f"{DEVICE_DIR}/sa8397_runtime"]), "push runtime")
    ensure_ok(run(["adb", "push", str(DIST_DIR / "libc++_shared.so"), f"{DEVICE_DIR}/libc++_shared.so"]), "push libc++")
    ensure_ok(run(["adb", "push", str(graph_path), f"{DEVICE_DIR}/flow.json"]), "push graph")
    ensure_ok(run(["adb", "push", str(input_path), f"{DEVICE_DIR}/input.json"]), "push input")
    ensure_ok(run(["adb", "push", str(plan_path), f"{DEVICE_DIR}/llm_mock_plan.json"]), "push mock plan")
    ensure_ok(run(["adb", "push", str(PROJECT_ROOT / "scripts" / "sa8397_action_adapter.sh"), f"{DEVICE_DIR}/action_adapter.sh"]), "push action adapter")
    ensure_ok(run(["adb", "push", str(PROJECT_ROOT / "scripts" / "llm_mock_adapter.sh"), f"{DEVICE_DIR}/llm_mock_adapter.sh"]), "push llm mock adapter")
    ensure_ok(run(["adb", "shell", "chmod", "755", f"{DEVICE_DIR}/sa8397_runtime", f"{DEVICE_DIR}/action_adapter.sh", f"{DEVICE_DIR}/llm_mock_adapter.sh"]), "chmod")

    shell_cmd = (
        f"cd {DEVICE_DIR} && "
        f"export GEDGE_DEVICE_DIR='{DEVICE_DIR}' && "
        f"export GEDGE_CAR_CTRL_MODE='placeholder' && "
        f"export GEDGE_CAR_CTRL_BASE_URL='http://<device-ip>:8080' && "
        f"export GEDGE_LLM_MOCK_PLAN_PATH='{DEVICE_DIR}/llm_mock_plan.json' && "
        f"export LD_LIBRARY_PATH='{DEVICE_DIR}':$LD_LIBRARY_PATH && "
        f"./sa8397_runtime --graph '{DEVICE_DIR}/flow.json' --input '{DEVICE_DIR}/input.json' "
        f"--output '{DEVICE_DIR}/llm_action_test_result.json' --llm-script '{DEVICE_DIR}/llm_mock_adapter.sh' "
        f"--action-script '{DEVICE_DIR}/action_adapter.sh'"
    )
    ensure_ok(run(["adb", "shell", shell_cmd]), "run routing test")

    result_proc = run(["adb", "shell", "cat", f"{DEVICE_DIR}/llm_action_test_result.json"])
    ensure_ok(result_proc, "read result")
    result = json.loads(result_proc.stdout)

    execution_log = result.get("execution_log", [])
    car_windows = next((entry for entry in execution_log if entry.get("node_id") == "car_windows"), None)
    car_seat = next((entry for entry in execution_log if entry.get("node_id") == "car_seat"), None)
    windows_output = json.loads(car_windows["output"]) if car_windows else {}
    seat_output = json.loads(car_seat["output"]) if car_seat else {}
    windows_adapter = json.loads(windows_output.get("adapter_output", "{}")) if windows_output.get("adapter_output") else {}
    seat_adapter = json.loads(seat_output.get("adapter_output", "{}")) if seat_output.get("adapter_output") else {}
    windows_payload = windows_adapter.get("data", {}).get("payload", {})
    seat_payload = seat_adapter.get("data", {}).get("payload", {})

    ok = bool(
        car_windows and car_seat
        and windows_payload.get("params", {}).get("status") == 0
        and windows_payload.get("params", {}).get("area") == 0
        and seat_payload.get("params", {}).get("level") == 3
    )
    report = {
        "ok": ok,
        "result": result,
        "checks": {
            "windows_executed": car_windows is not None,
            "seat_executed": car_seat is not None,
            "windows_payload": windows_payload,
            "seat_payload": seat_payload,
        },
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(report_path)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
