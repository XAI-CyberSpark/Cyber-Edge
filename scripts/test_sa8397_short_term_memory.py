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
        "name": "short_term_memory_test",
        "nodes": [
            {"id": "user_input", "type": "input", "data": {"label": "User Input"}},
            {"id": "memory_read", "type": "memory", "data": {"label": "Short-term Mem Read", "type": "buffer", "window": 5}},
            {"id": "assistant", "type": "llm", "data": {"label": "Assistant", "systemPrompt": "Use short-term memory if available."}},
            {"id": "memory_write", "type": "memory", "data": {"label": "Short-term Mem Write", "type": "buffer", "window": 5}},
            {"id": "reply", "type": "output", "data": {"label": "Final Response"}},
        ],
        "edges": [
            {"id": "e1", "source": "user_input", "target": "memory_read"},
            {"id": "e2", "source": "memory_read", "target": "assistant"},
            {"id": "e3", "source": "assistant", "target": "memory_write"},
            {"id": "e4", "source": "memory_write", "target": "reply"},
        ],
    }

    with tempfile.TemporaryDirectory(prefix="sa8397_short_term_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        graph_path = tmp_dir / "flow.json"
        llm_script_path = tmp_dir / "memory_llm.sh"
        write_json(graph_path, graph)

        llm_script_path.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "prompt_path=\"${2}\"\n"
            "prompt=\"$(cat \"${prompt_path}\")\"\n"
            "if printf '%s' \"${prompt}\" | grep -q 'Alice'; then\n"
            "  printf 'I remember your name is Alice.\\n'\n"
            "else\n"
            "  printf 'ACK\\n'\n"
            "fi\n",
            encoding="utf-8",
        )
        os.chmod(llm_script_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

        first_input_path = tmp_dir / "input_first.json"
        first_output_path = tmp_dir / "result_first.json"
        second_input_path = tmp_dir / "input_second.json"
        second_output_path = tmp_dir / "result_second.json"

        write_json(first_input_path, {"text": "My name is Alice."})
        write_json(second_input_path, {"text": "What is my name?"})

        ensure_ok(
            run(
                [
                    str(HOST_RUNTIME),
                    "--graph",
                    str(graph_path),
                    "--input",
                    str(first_input_path),
                    "--output",
                    str(first_output_path),
                    "--llm-script",
                    str(llm_script_path),
                ]
            ),
            "run first memory pass",
        )
        ensure_ok(
            run(
                [
                    str(HOST_RUNTIME),
                    "--graph",
                    str(graph_path),
                    "--input",
                    str(second_input_path),
                    "--output",
                    str(second_output_path),
                    "--llm-script",
                    str(llm_script_path),
                ]
            ),
            "run second memory pass",
        )

        second_result = json.loads(second_output_path.read_text(encoding="utf-8"))
        second_logs = execution_log_map(second_result)
        llm_output = json.loads(second_logs["assistant"]["output"])
        memory_read_output = json.loads(second_logs["memory_read"]["output"])
        memory_file = tmp_dir / "short_term_memory.json"
        memory_entries = json.loads(memory_file.read_text(encoding="utf-8"))

        ok = all(
            [
                llm_output.get("llm_output") == "I remember your name is Alice.",
                memory_read_output.get("short_term_memory_count", 0) >= 1,
                len(memory_entries) >= 2,
            ]
        )

        DIST_DIR.mkdir(parents=True, exist_ok=True)
        report_path = DIST_DIR / "short_term_memory_report.json"
        report_path.write_text(
            json.dumps(
                {
                    "ok": ok,
                    "llm_output": llm_output,
                    "memory_read_output": memory_read_output,
                    "memory_entries": memory_entries,
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        print(report_path)
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
