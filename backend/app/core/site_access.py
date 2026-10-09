"""Shared-key access for the Studio backend. No model credentials are reused.

The gate is OFF by default: every request passes through and no key file is
created. Set OAKEGDE_SITE_ACCESS=1 (or true/on/yes) to require the key.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from app.core.branding import brand_env
import secrets
import time
from collections import defaultdict, deque
from http.cookies import SimpleCookie
from pathlib import Path

from starlette.responses import JSONResponse

COOKIE = "oakegde_session"
SESSION_SECONDS = 8 * 60 * 60
ROOT = Path(__file__).resolve().parents[3]


def site_access_enabled(env=None) -> bool:
    value = brand_env("OAKEGDE_SITE_ACCESS", "", env=env)
    return value.strip().lower() in ("1", "true", "on", "yes")


def load_key() -> str:
    key = brand_env("OAKEGDE_ACCESS_KEY", "").strip()
    if not key:
        path = Path(brand_env("OAKEGDE_ACCESS_KEY_FILE", str(ROOT / ".demo-runtime/access-key.txt")))
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "w") as file:
                file.write(secrets.token_urlsafe(24) + "\n")
        key = path.read_text().strip()
    if not 1 <= len(key) <= 256:
        raise RuntimeError("网站访问密钥需要1至256个字符，请检查 OAKEGDE_ACCESS_KEY 或密钥文件。")
    return key


class SiteAccessMiddleware:
    def __init__(self, app, key: str | None = None, clock=time.time, enabled: bool | None = None):
        self.app = app
        # Default off. An explicit key implies enforcement (tests, direct wiring);
        # otherwise OAKEGDE_SITE_ACCESS decides.
        self.enabled = enabled if enabled is not None else (key is not None or site_access_enabled())
        self.digest = hashlib.sha256((key if key is not None else load_key()).encode()).digest() if self.enabled else b""
        self.clock = clock
        self.sessions: dict[str, float] = {}
        self.attempts = defaultdict(deque)
        self.global_attempts = deque()
        self.origins = {value.strip() for value in brand_env(
            "OAKEGDE_ALLOWED_ORIGINS", "http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:5173,http://localhost:5173"
        ).split(",") if value.strip()}

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        path = scope["path"]
        if not self.enabled:
            # Gate off: report "not required" so the frontend unlocks itself,
            # and let everything else straight through.
            if scope["type"] == "http" and path == "/v1/access/session" and scope.get("method", "GET") in ("GET", "HEAD"):
                response = JSONResponse({"authenticated": True, "expires_in": 0, "required": False},
                                        headers={"Cache-Control": "no-store"})
                return await response(scope, receive, send)
            if scope["type"] == "http" and path == "/v1/access/login":
                response = JSONResponse({"detail": "网站密钥登录未启用。"}, status_code=404,
                                        headers={"Cache-Control": "no-store"})
                return await response(scope, receive, send)
            return await self.app(scope, receive, send)
        headers = {key.decode().lower(): value.decode() for key, value in scope.get("headers", [])}
        method = scope.get("method", "GET")
        now = self.clock()
        self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
        cookies = SimpleCookie()
        try:
            cookies.load(headers.get("cookie", ""))
        except Exception:
            pass
        token = cookies[COOKIE].value if COOKIE in cookies else cookies["cyberedge_session"].value if "cyberedge_session" in cookies else ""
        expiry = self.sessions.get(token, 0)
        origin = headers.get("origin")
        # Cross-site requests cannot use another site's valid browser session.
        origin_ok = not origin or origin in self.origins

        async def reply(status, data, cookie=None):
            response = JSONResponse(data, status_code=status, headers={"Cache-Control": "no-store"})
            if cookie:
                response.set_cookie(COOKIE, cookie, httponly=True, samesite="strict",
                                    secure=scope.get("scheme") == "https", path="/", max_age=SESSION_SECONDS)
            await response(scope, receive, send)

        if scope["type"] == "websocket":
            if not expiry or not origin_ok:
                return await send({"type": "websocket.close", "code": 1008})
            return await self.app(scope, receive, send)
        if path == "/health" and method in ("GET", "HEAD"):
            return await self.app(scope, receive, send)
        if not origin_ok:
            return await reply(403, {"detail": "此网站来源未获授权。"})
        if method == "OPTIONS":
            return await self.app(scope, receive, send)
        if path == "/v1/access/session" and method == "GET":
            return await reply(200, {"authenticated": bool(expiry), "expires_in": max(0, int(expiry - now)), "required": True})
        if path == "/v1/access/login" and method == "POST":
            # Bound both the request and brute-force tracking memory.
            client = (scope.get("client") or ("unknown",))[0]
            for address in list(self.attempts):
                queue = self.attempts[address]
                while queue and queue[0] <= now - 60:
                    queue.popleft()
                if not queue:
                    del self.attempts[address]
            while self.global_attempts and self.global_attempts[0] <= now - 60:
                self.global_attempts.popleft()
            if len(self.attempts.get(client, ())) >= 5 or len(self.global_attempts) >= 60:
                return await reply(429, {"detail": "尝试次数过多，请一分钟后重试。"})
            self.attempts[client].append(now)
            self.global_attempts.append(now)
            if headers.get("content-type", "").split(";")[0] != "application/json":
                return await reply(415, {"detail": "请使用密钥弹窗验证。"})
            body = bytearray()
            while True:
                event = await receive()
                if event["type"] == "http.disconnect":
                    return
                body.extend(event.get("body", b""))
                if len(body) > 4096:
                    return await reply(413, {"detail": "密钥输入过长。"})
                if not event.get("more_body"):
                    break
            try:
                value = json.loads(body).get("key")
                valid = isinstance(value, str) and hmac.compare_digest(hashlib.sha256(value.encode()).digest(), self.digest)
            except (ValueError, AttributeError):
                valid = False
            if not valid:
                return await reply(401, {"detail": "使用密钥不正确，请重新输入。"})
            self.attempts.pop(client, None)
            self.sessions.pop(token, None)
            if len(self.sessions) >= 1000:
                self.sessions.pop(next(iter(self.sessions)))
            token = secrets.token_urlsafe(32)
            self.sessions[token] = now + SESSION_SECONDS
            return await reply(200, {"authenticated": True, "expires_in": SESSION_SECONDS}, token)
        if not expiry:
            return await reply(401, {"detail": "请先输入网站使用密钥。", "code": "access_required"})
        return await self.app(scope, receive, send)
