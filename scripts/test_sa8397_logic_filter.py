#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = PROJECT_ROOT / "dist" / "sa8397_runtime"
HOST_RUNTIME = DIST_DIR / "sa8397_runtime_host"


def run(command: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False, cwd=cwd)


def ensure_ok(proc: subprocess.CompletedProcess[str], step: str) -> None:
    if proc.returncode != 0:
        raise RuntimeError(f"{step} failed:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def execution_log_map(result: dict) -> dict[str, dict]:
    return {entry["node_id"]: entry for entry in result.get("execution_log", [])}


def main() -> int:
    if not HOST_RUNTIME.exists():
        ensure_ok(run(["bash", "scripts/build_sa8397_runtime.sh"], cwd=PROJECT_ROOT), "build runtime")

    graph = {
        "name": "logic_filter_test",
        "nodes": [
            {"id": "user_input", "type": "input", "data": {"label": "User Input"}},
            {"id": "planner", "type": "llm", "data": {"label": "Planner", "systemPrompt": "Return seat level plan."}},
            {
                "id": "seat_filter",
                "type": "logic",
                "data": {
                    "label": "Seat Heat Guard",
                    "logic_type": "filter",
                    "condition": "level <= 1",
                    "true_update": "level=2",
                    "false_update": "level=level",
                },
            },
            {
                "id": "seat_heat",
                "type": "car_control",
                "data": {
                    "label": "Passenger seat heating",
                    "action": "seat.set.SEAT_HEAT_STATUS_1",
                    "endpoint": "control",
                    "module": "seat",
                    "function": "set",
                    "signalKey": "SEAT_HEAT_STATUS_1",
                    "baseUrlTemplate": "http://<device-ip>:8080",
                },
            },
        ],
        "edges": [
            {"id": "e1", "source": "user_input", "target": "planner"},
            {"id": "e2", "source": "planner", "target": "seat_filter"},
            {"id": "e3", "source": "seat_filter", "target": "seat_heat"},
        ],
    }

    with tempfile.TemporaryDirectory(prefix="sa8397_logic_filter_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        graph_path = tmp_dir / "flow.json"
        llm_script_path = tmp_dir / "mock_llm.sh"
        write_json(graph_path, graph)

        llm_script_path.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "prompt_path=\"${2}\"\n"
            "prompt=\"$(cat \"${prompt_path}\")\"\n"
            "level=\"$(printf '%s' \"${prompt}\" | grep -o 'set passenger seat heat level [0-9]' | tail -n 1 | awk '{print $6}')\"\n"
            "if [ -z \"${level}\" ]; then level=0; fi\n"
            "printf '{\"reply\":\"seat level %s\",\"actions\":[{\"node_id\":\"seat_heat\",\"level\":%s}]}\n' \"${level}\" \"${level}\"\n",
            encoding="utf-8",
        )
        os.chmod(llm_script_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

        results: dict[str, dict] = {}
        for level in [0, 1, 2, 3]:
            input_path = tmp_dir / f"input_{level}.json"
            output_path = tmp_dir / f"result_{level}.json"
            write_json(input_path, {"text": f"set passenger seat heat level {level}"})
            ensure_ok(
                run(
                    [
                        str(HOST_RUNTIME),
                        "--graph",
                        str(graph_path),
                        "--input",
                        str(input_path),
                        "--output",
                        str(output_path),
                        "--llm-script",
                        str(llm_script_path),
                    ]
                ),
                f"run level {level}",
            )
            result = json.loads(output_path.read_text(encoding="utf-8"))
            logs = execution_log_map(result)
            logic_output = json.loads(logs["seat_filter"]["output"])
            car_output = json.loads(logs["seat_heat"]["output"])
            normalized = car_output.get("normalized_config", {})
            results[str(level)] = {
                "logic_output": logic_output,
                "normalized_level": normalized.get("level"),
                "planned_action": car_output.get("planned_action"),
            }

        expected = {"0": 2, "1": 2, "2": 2, "3": 3}
        ok = all(results[level]["normalized_level"] == expected[level] for level in expected)

        DIST_DIR.mkdir(parents=True, exist_ok=True)
        report_path = DIST_DIR / "logic_filter_report.json"
        report_path.write_text(json.dumps({"ok": ok, "results": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(report_path)
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
