"""Serve the packaged frontend and real backend on one origin; never serve bundle root."""
from pathlib import Path
import json
import os

# Keep existing deployment environment settings during the brand migration.
for _name, _value in tuple(os.environ.items()):
    if _name.startswith('CYBEREDGE_'):
        os.environ.setdefault(_name.replace('CYBEREDGE_', 'OAKEGDE_', 1), _value)
import sys

ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads((ROOT / 'config/server.json').read_text(encoding='utf-8-sig'))
PORT = int(os.environ.get('OAKEGDE_PORT', CONFIG.get('port', 5175)))
HOST = os.environ.get('OAKEGDE_HOST', CONFIG.get('host', '127.0.0.1'))
PUBLIC_URL = CONFIG.get('public_url', f'http://127.0.0.1:{PORT}').rstrip('/')
os.environ.setdefault('OAKEGDE_ACCESS_KEY_FILE', str(ROOT / 'config/access-key.txt'))
# Site key gate stays OFF unless the user sets OAKEGDE_SITE_ACCESS=1 (site_access.py).
os.environ.setdefault('WORKFLOW_LLM_API_KEY_FILE', str(ROOT / 'backend/API_KEY.txt'))
os.environ.setdefault('WORKFLOW_LLM_BASE_URL', CONFIG.get('workflow_base_url', 'https://api.minimaxi.com/v1'))
os.environ.setdefault('WORKFLOW_LLM_MODEL', CONFIG.get('workflow_model', 'MiniMax-M3'))
os.environ.setdefault('OPENSPARX_BASE_URL', CONFIG.get('opensparx_base_url', 'http://127.0.0.1:11435/v1'))
os.environ.setdefault('OLLAMA_BASE_URL', CONFIG.get('ollama_base_url', 'http://127.0.0.1:11435/v1'))
os.environ.setdefault('OAKEGDE_ALLOWED_ORIGINS', ','.join(dict.fromkeys([
    PUBLIC_URL, f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}', *CONFIG.get('extra_origins', [])])))
os.environ.setdefault('OAKEGDE_ASR_MODEL_DIR', str(ROOT / 'models/sensevoice-small-int8'))
sys.path.insert(0, str(ROOT / 'backend'))
os.chdir(ROOT / 'backend')
from main_host_lite import app as backend
from starlette.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import PlainTextResponse

static = StaticFiles(directory=str(ROOT / 'frontend'), html=True)

async def app(scope, receive, send):
    path = scope.get('path', '')
    if scope['type'] != 'http' or path in ('/v1', '/health', '/docs', '/redoc', '/openapi.json') or path.startswith(('/v1/', '/telemetry/')):
        return await backend(scope, receive, send)
    try:
        await static(scope, receive, send)
    except HTTPException as error:
        await PlainTextResponse('Not found' if error.status_code == 404 else 'Request rejected', status_code=error.status_code)(scope, receive, send)

if __name__ == '__main__':
    import uvicorn
    print(f'OAKEgde Studio: {PUBLIC_URL}/', flush=True)
    print('Frontend + API share this address. Keep this window open; Ctrl+C stops the server.', flush=True)
    uvicorn.run(app, host=HOST, port=PORT, workers=1, proxy_headers=False)
