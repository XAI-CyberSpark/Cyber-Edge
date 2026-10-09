import os
import unittest
from unittest import mock
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from app.core.site_access import SiteAccessMiddleware, SESSION_SECONDS

KEY = "test-only-access-key-at-least-24"

class AccessTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000
        self.app = FastAPI()
        self.app.add_middleware(SiteAccessMiddleware, key=KEY, clock=lambda: self.now)
        @self.app.get("/health")
        def health(): return {"status": "ok"}
        @self.app.get("/v1/projects/")
        def projects(): return ["private-project"]
        @self.app.websocket("/telemetry/dag")
        async def socket(ws: WebSocket):
            await ws.accept(); await ws.send_text("private"); await ws.close()
        self.client = TestClient(self.app)

    def login(self):
        return self.client.post("/v1/access/login", json={"key": KEY})

    def test_anonymous_all_routes_and_websocket(self):
        self.assertEqual(self.client.get("/health").status_code, 200)
        for path in ["/v1/projects/", "/v1/inference/chat/completions", "/docs", "/openapi.json"]:
            self.assertEqual(self.client.get(path).status_code, 401)
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/telemetry/dag"): pass

    def test_wrong_key_does_not_create_cookie(self):
        response = self.client.post("/v1/access/login", json={"key": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("set-cookie", response.headers)
        self.assertNotIn(KEY, response.text)
        self.assertFalse(self.client.get("/v1/access/session").json()["authenticated"])

    def test_cookie_access_expiry_and_relogin(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        cookie = response.headers["set-cookie"]
        self.assertIn("HttpOnly", cookie); self.assertIn("SameSite=strict", cookie)
        self.assertNotIn(KEY, cookie)
        self.assertEqual(self.client.get("/v1/projects/").json(), ["private-project"])
        with self.client.websocket_connect("/telemetry/dag") as ws: self.assertEqual(ws.receive_text(), "private")
        self.now += SESSION_SECONDS + 1
        self.assertEqual(self.client.get("/v1/projects/").status_code, 401)
        self.assertEqual(self.login().status_code, 200)

    def test_rate_limit_and_recovery(self):
        for _ in range(5): self.client.post("/v1/access/login", json={"key": "wrong"})
        self.assertEqual(self.login().status_code, 429)
        self.now += 61
        self.assertEqual(self.login().status_code, 200)

    def test_cross_origin_is_rejected_even_with_cookie(self):
        self.login()
        self.assertEqual(self.client.get("/v1/projects/", headers={"Origin": "https://untrusted.example"}).status_code, 403)
        self.assertEqual(self.client.post("/v1/access/login", json={"key": KEY}, headers={"Origin": "https://untrusted.example"}).status_code, 403)
        self.assertEqual(self.client.get("/v1/projects/", headers={"Origin": "http://127.0.0.1:5175"}).status_code, 200)

    def test_invalid_payload_and_size(self):
        self.assertEqual(self.client.post("/v1/access/login", content="key=test").status_code, 415)
        self.assertEqual(self.client.post("/v1/access/login", content="[", headers={"Content-Type": "application/json"}).status_code, 401)
        self.assertEqual(self.client.post("/v1/access/login", json=[]).status_code, 401)
        self.assertEqual(self.client.post("/v1/access/login", json={"key": "x" * 5000}).status_code, 413)

    def test_https_cookie_secure_and_restart_invalidates(self):
        secure = TestClient(self.app, base_url="https://localhost")
        response = secure.post("/v1/access/login", json={"key": KEY})
        self.assertIn("Secure", response.headers["set-cookie"])
        self.client.cookies.set("oakegde_session", "invented-token")
        self.assertEqual(self.client.get("/v1/projects/").status_code, 401)

if __name__ == "__main__": unittest.main()

class DisabledAccessTests(unittest.TestCase):
    def build(self, **env):
        inner = FastAPI()
        @inner.get("/v1/projects/")
        def projects(): return ["private-project"]
        @inner.websocket("/telemetry/dag")
        async def socket(ws: WebSocket):
            await ws.accept(); await ws.send_text("private"); await ws.close()
        with mock.patch.dict(os.environ, env, clear=False):
            for name in ("OAKEGDE_SITE_ACCESS", "OAKEGDE_ACCESS_KEY"):
                if name not in env:
                    os.environ.pop(name, None)
            app = SiteAccessMiddleware(inner)  # Construct eagerly, inside the patched env.
        return TestClient(app)

    def test_default_off_allows_everything_without_key_or_keyfile(self):
        keyfile = "/tmp/oakegde-test-should-not-be-created.key"
        if os.path.exists(keyfile): os.remove(keyfile)
        client = self.build(OAKEGDE_ACCESS_KEY_FILE=keyfile)
        self.assertEqual(client.get("/v1/projects/").status_code, 200)
        self.assertEqual(client.get("/v1/projects/", headers={"Origin": "https://untrusted.example"}).status_code, 200)
        with client.websocket_connect("/telemetry/dag") as ws: self.assertEqual(ws.receive_text(), "private")
        self.assertFalse(os.path.exists(keyfile))

    def test_default_off_session_reports_not_required_and_login_404(self):
        client = self.build()
        data = client.get("/v1/access/session").json()
        self.assertEqual(data, {"authenticated": True, "expires_in": 0, "required": False})
        self.assertEqual(client.post("/v1/access/login", json={"key": "whatever"}).status_code, 404)

    def test_env_var_turns_the_gate_on(self):
        client = self.build(OAKEGDE_SITE_ACCESS="1", OAKEGDE_ACCESS_KEY=KEY)
        self.assertEqual(client.get("/v1/projects/").status_code, 401)
        self.assertEqual(client.get("/v1/access/session").json()["required"], True)
        self.assertEqual(client.post("/v1/access/login", json={"key": KEY}).status_code, 200)
        self.assertEqual(client.get("/v1/projects/").status_code, 200)
