#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import subprocess
from pathlib import Path


def run_command(command: str) -> str:
    proc = subprocess.run(command, shell=True, text=True, capture_output=True)
    output = (proc.stdout or "") + (proc.stderr or "")
    output = output.rstrip() or "<no output>"
    if proc.returncode != 0:
        output += f"\n[exit_code={proc.returncode}]"
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Run commands and append outputs to a markdown log.")
    parser.add_argument("--log", required=True, help="Markdown log file path")
    parser.add_argument("--title", required=True, help="Section title, for example: Step 2. Env Check")
    parser.add_argument("--note", action="append", default=[], help="Extra bullet note")
    parser.add_argument("commands", nargs="+", help="Shell commands to execute")
    args = parser.parse_args()

    log_path = Path(args.log)
    lines = [f"## {args.title}", "", f"- 操作时间：{dt.datetime.now():%F %T}"]
    for note in args.note:
        lines.append(f"- {note}")
    lines.extend(["- 命令与结果：", "", "```text"])

    print(lines[0])
    print()
    for line in lines[2:]:
        print(line)

    for command in args.commands:
        lines.append(f"$ {command}")
        output = run_command(command)
        lines.append(output)
        lines.append("")
        print(f"$ {command}")
        print(output)
        print()

    lines.append("```")
    with log_path.open("a", encoding="utf-8") as f:
        f.write("\n\n" + "\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
