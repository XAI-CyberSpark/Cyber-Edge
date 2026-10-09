"""Serve a frozen Studio build and backend together, without a dev proxy or reload."""
from pathlib import Path
import os
import sys

from starlette.staticfiles import StaticFiles


class StudioApp:
    def __init__(self, backend, frontend):
        self.backend = backend
        self.static = StaticFiles(directory=str(frontend), html=True)

    async def __call__(self, scope, receive, send):
        path = scope.get('path', '')
        if (scope['type'] != 'http' or path in ('/health', '/openapi.json', '/redoc', '/v1')
                or path.startswith(('/v1/', '/telemetry'))):
            return await self.backend(scope, receive, send)
        # /docs is the Studio reader; API documentation remains at /redoc.
        if path in ('/docs', '/docs/'):
            scope = {**scope, 'path': '/index.html', 'raw_path': b'/index.html'}
        from starlette.exceptions import HTTPException
        from starlette.responses import PlainTextResponse
        try:
            await self.static(scope, receive, send)
        except HTTPException as exc:
            await PlainTextResponse('Not found', status_code=exc.status_code)(scope, receive, send)


def main():
    root = Path(__file__).resolve().parents[1]
    os.chdir(root / 'backend')
    sys.path.insert(0, str(root / 'backend'))
    os.environ.setdefault('OPENSPARX_BASE_URL', 'http://127.0.0.1:11435/v1')
    os.environ.setdefault('OLLAMA_BASE_URL', 'http://127.0.0.1:11435/v1')
    os.environ.setdefault('WORKFLOW_LLM_API_KEY_FILE', str(root / 'backend/API_KEY.txt'))
    from main_host_lite import app
    import uvicorn
    uvicorn.run(StudioApp(app, root / 'frontend'), host='127.0.0.1', port=5175,
                workers=1, proxy_headers=False)


if __name__ == '__main__':
    main()
