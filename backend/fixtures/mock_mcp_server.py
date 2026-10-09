#!/usr/bin/env python3
"""Tiny stateful Streamable HTTP MCP fixture for OAKEgde Studio tests/demos."""
from __future__ import annotations

import argparse
import asyncio
import json
from typing import Literal, TypedDict

from mcp.server.mcpserver import MCPServer

WindowId = Literal["front_left", "front_right", "rear_left", "rear_right"]
Simulate = Literal["success", "timeout", "failure"]


class WindowSetResult(TypedDict):
    source: str
    status: str
    window: str
    position: int
    state: dict[str, int]


class WindowStatusResult(TypedDict):
    source: str
    status: str
    windows: dict[str, int]


STATE: dict[str, int] = {
    "front_left": 0,
    "front_right": 0,
    "rear_left": 0,
    "rear_right": 0,
}

server = MCPServer("oakegde-mock-vehicle", version="0.1.0")


@server.tool(name="window.set", structured_output=True)
async def window_set(window: WindowId, position: int, simulate: Simulate = "success") -> WindowSetResult:
    """Set a mock vehicle window and return an assertable action receipt."""
    if position < 0 or position > 100:
        raise ValueError("position must be between 0 and 100")
    if simulate == "timeout":
        await asyncio.sleep(0.01)
        raise TimeoutError("mock timeout")
    if simulate == "failure":
        raise RuntimeError("mock actuator failure")
    STATE[window] = position
    return {
        "source": "mock",
        "status": "completed",
        "window": window,
        "position": position,
        "state": dict(STATE),
    }


@server.tool(name="window.status", structured_output=True)
def window_status() -> WindowStatusResult:
    """Return the current mock vehicle window state."""
    return {"source": "mock", "status": "completed", "windows": dict(STATE)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
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
