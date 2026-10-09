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
        "name": "camera_logic_test",
        "nodes": [
            {"id": "camera_in", "type": "systemInput", "data": {"label": "Cabin Camera", "inputType": "camera"}},
            {
                "id": "check_attention",
                "type": "logic",
                "data": {
                    "label": "Need Attention Check?",
                    "condition": "camera.occupied == true and confidence >= 0.8",
                },
            },
            {
                "id": "vision_llm",
                "type": "llm",
                "data": {"label": "Vision Inspector", "systemPrompt": "Describe the camera scene briefly."},
            },
            {"id": "normal_exit", "type": "output", "data": {"label": "No Attention Needed"}},
        ],
        "edges": [
            {"id": "e1", "source": "camera_in", "target": "check_attention"},
            {"id": "e2", "source": "check_attention", "target": "vision_llm", "sourceHandle": "true"},
            {"id": "e3", "source": "check_attention", "target": "normal_exit", "sourceHandle": "false"},
        ],
    }

    true_input = {
        "text": "请检查驾驶员状态",
        "image_path": "/tmp/cabin_true.jpg",
        "confidence": 0.95,
        "camera": {"occupied": True, "eyes_closed": True},
    }
    false_input = {
        "text": "请检查驾驶员状态",
        "image_path": "/tmp/cabin_false.jpg",
        "confidence": 0.35,
        "camera": {"occupied": False, "eyes_closed": False},
    }

    with tempfile.TemporaryDirectory(prefix="sa8397_camera_logic_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        graph_path = tmp_dir / "flow.json"
        true_input_path = tmp_dir / "true_input.json"
        false_input_path = tmp_dir / "false_input.json"
        true_output_path = tmp_dir / "true_result.json"
        false_output_path = tmp_dir / "false_result.json"
        llm_script_path = tmp_dir / "mock_llm.sh"

        write_json(graph_path, graph)
        write_json(true_input_path, true_input)
        write_json(false_input_path, false_input)
        llm_script_path.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "mode=\"${1:-text}\"\n"
            "printf 'mock-%s\\n' \"${mode}\"\n",
            encoding="utf-8",
        )
        os.chmod(llm_script_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

        ensure_ok(
            run(
                [
                    str(HOST_RUNTIME),
                    "--graph",
                    str(graph_path),
                    "--input",
                    str(true_input_path),
                    "--output",
                    str(true_output_path),
                    "--llm-script",
                    str(llm_script_path),
                ]
            ),
            "run true branch",
        )
        ensure_ok(
            run(
                [
                    str(HOST_RUNTIME),
                    "--graph",
                    str(graph_path),
                    "--input",
                    str(false_input_path),
                    "--output",
                    str(false_output_path),
                    "--llm-script",
                    str(llm_script_path),
                ]
            ),
            "run false branch",
        )

        true_result = json.loads(true_output_path.read_text(encoding="utf-8"))
        false_result = json.loads(false_output_path.read_text(encoding="utf-8"))

        true_logs = execution_log_map(true_result)
        false_logs = execution_log_map(false_result)
        true_logic = json.loads(true_logs["check_attention"]["output"])
        false_logic = json.loads(false_logs["check_attention"]["output"])
        true_llm = json.loads(true_logs["vision_llm"]["output"])

        ok = all(
            [
                "vision_llm" in true_logs,
                "normal_exit" not in true_logs,
                true_logic.get("condition_result") is True,
                true_logic.get("image_path") == "/tmp/cabin_true.jpg",
                true_llm.get("llm_mode") == "vision",
                "vision_llm" not in false_logs,
                "normal_exit" in false_logs,
                false_logic.get("condition_result") is False,
                false_logic.get("image_path") == "/tmp/cabin_false.jpg",
            ]
        )

        DIST_DIR.mkdir(parents=True, exist_ok=True)
        report = {
            "ok": ok,
            "true_nodes": list(true_logs.keys()),
            "false_nodes": list(false_logs.keys()),
            "true_logic": true_logic,
            "false_logic": false_logic,
            "true_llm": true_llm,
        }
        report_path = DIST_DIR / "camera_logic_report.json"
        write_json(report_path, report)
        print(report_path)
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
