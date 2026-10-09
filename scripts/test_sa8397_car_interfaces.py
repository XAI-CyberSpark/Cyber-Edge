#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = PROJECT_ROOT / "studio" / "src" / "data" / "carControlCatalog.json"
ACTION_ADAPTER = PROJECT_ROOT / "scripts" / "sa8397_action_adapter.sh"


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def build_cases(catalog: dict) -> list[dict]:
    cases: list[dict] = [
        {
            "name": "list_signals",
            "endpoint": "signals",
            "module": "",
            "function": "",
            "signalKey": "",
            "level": "",
            "area": "",
            "status": "",
            "method": "GET",
            "path": "/api/vehicle/signals",
        }
    ]

    for module in catalog["modules"]:
        for signal in module["signals"]:
            for function_name in signal["functions"]:
                case = {
                    "name": f'{module["id"]}.{function_name}.{signal["id"]}',
                    "endpoint": "control",
                    "module": module["id"],
                    "function": function_name,
                    "signalKey": signal["id"],
                    "level": "",
                    "area": "",
                    "status": "",
                    "method": "POST",
                    "path": "/api/vehicle/control",
                }
                set_params = signal.get("setParams", {})
                if function_name == "set":
                    if "level" in set_params:
                        case["level"] = str(set_params["level"]["default"])
                    if "area" in set_params:
                        case["area"] = str(set_params["area"]["default"])
                    if "status" in set_params:
                        case["status"] = str(set_params["status"]["default"])
                cases.append(case)
    return cases


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate SA8397 car control payloads in placeholder mode.")
    parser.add_argument("--device-dir", default="/data/local/tmp/cyber_edge_agent_v25")
    parser.add_argument("--base-url", default="http://<device-ip>:8080")
    parser.add_argument("--mode", default="placeholder", choices=["placeholder", "http"])
    parser.add_argument("--report", default=str(PROJECT_ROOT / "dist" / "sa8397_runtime" / "car_interface_test_report.json"))
    args = parser.parse_args()

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    cases = build_cases(catalog)

    run(["adb", "shell", "mkdir", "-p", args.device_dir])
    push_proc = run(["adb", "push", str(ACTION_ADAPTER), f"{args.device_dir}/action_adapter.sh"])
    if push_proc.returncode != 0:
        raise SystemExit(push_proc.stderr or push_proc.stdout)
    run(["adb", "shell", "chmod", "755", f"{args.device_dir}/action_adapter.sh"])

    results: list[dict] = []
    failures = 0

    for case in cases:
        command = (
            f"export GEDGE_DEVICE_DIR={shell_quote(args.device_dir)}; "
            f"export GEDGE_CAR_CTRL_MODE={shell_quote(args.mode)}; "
            f"export GEDGE_CAR_CTRL_BASE_URL={shell_quote(args.base_url)}; "
            f"export GEDGE_ACTION_ENDPOINT={shell_quote(case['endpoint'])}; "
            f"export GEDGE_ACTION_MODULE={shell_quote(case['module'])}; "
            f"export GEDGE_ACTION_FUNCTION={shell_quote(case['function'])}; "
            f"export GEDGE_ACTION_SIGNAL_KEY={shell_quote(case['signalKey'])}; "
            f"export GEDGE_ACTION_LEVEL={shell_quote(case['level'])}; "
            f"export GEDGE_ACTION_AREA={shell_quote(case['area'])}; "
            f"export GEDGE_ACTION_STATUS={shell_quote(case['status'])}; "
            f"{shell_quote(str(Path(args.device_dir) / 'action_adapter.sh'))} car_control generic ''"
        )
        proc = run(["adb", "shell", command])
        raw_output = (proc.stdout or proc.stderr).strip()
        ok = False
        parsed: dict | None = None

        try:
            parsed = json.loads(raw_output)
            ok = (
                parsed.get("code") == 0
                and parsed.get("data", {}).get("method") == case["method"]
                and parsed.get("data", {}).get("path") == case["path"]
            )
        except Exception:
            ok = False

        if not ok:
            failures += 1

        results.append(
            {
                "case": case,
                "ok": ok,
                "returncode": proc.returncode,
                "output": raw_output,
                "parsed": parsed,
            }
        )

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            {
                "base_url": args.base_url,
                "mode": args.mode,
                "total": len(results),
                "failures": failures,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Report: {report_path}")
    print(f"Total: {len(results)}")
    print(f"Failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
