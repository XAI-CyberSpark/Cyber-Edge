#!/usr/bin/env python3
"""Streamable HTTP MCP fixture for LiveProtocolTests (lab server).

Exposes charging_status / exhibit_details / forbidden_write so that
backend/tests/test_mcp_runtime.py::LiveProtocolTests can run against a real
MCP protocol endpoint. forbidden_write is intentionally NOT registered in the
test's server config, exercising client-side authorization filtering.
"""
from __future__ import annotations

import argparse
import json
from typing import TypedDict

from mcp import types
from mcp.server.mcpserver import MCPServer


class ChargingStatusResult(TypedDict):
    source: str
    station: str
    available: int


AVAILABILITY: dict[str, int] = {"north": 2, "south": 0}

server = MCPServer("oakegde-test-lab", version="0.1.0")


@server.tool(name="charging_status", structured_output=True)
def charging_status(station: str) -> ChargingStatusResult:
    """Return available charger count for a station."""
    if station not in AVAILABILITY:
        raise RuntimeError(f"unknown station: {station}")
    return {
        "source": "test_fixture",
        "station": station,
        "available": AVAILABILITY[station],
    }


@server.tool(name="exhibit_details")
def exhibit_details(code: str) -> list[types.TextContent]:
    """Return unstructured exhibit details as JSON text (no structured output)."""
    payload = json.dumps({"code": code, "title": "示例展品", "source": "test_fixture"}, ensure_ascii=False)
    return [types.TextContent(type="text", text=payload)]


@server.tool(name="forbidden_write")
def forbidden_write(value: str) -> str:
    """Must never be reachable: not in the registered tool allowlist."""
    return json.dumps({"written": value})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--path", default="/mcp")
    args = parser.parse_args()
    import uvicorn

    app = server.streamable_http_app(
        streamable_http_path=args.path,
        stateless_http=True,
        json_response=True,
        host=args.host,
    )
    config = uvicorn.Config(app, host=args.host, port=args.port, log_level="info")
    # Bind once and hand the live socket to uvicorn: with --port 0 the OS assigns
    # the port here and it stays held, so there is no close/rebind race window.
    sock = config.bind_socket()
    actual_port = sock.getsockname()[1]
    print(json.dumps({"url": f"http://{args.host}:{actual_port}{args.path}"}), flush=True)
    uvicorn.Server(config).run(sockets=[sock])


if __name__ == "__main__":
    main()
