"""Real, read-only deployment checks. Never prints keys or calls paid models."""
from pathlib import Path
import http.cookiejar
import json
import urllib.request
import urllib.error
import urllib.parse
import sys
import os

# Keep existing deployment environment settings during the brand migration.
for _name, _value in tuple(os.environ.items()):
    if _name.startswith('CYBEREDGE_'):
        os.environ.setdefault(_name.replace('CYBEREDGE_', 'OAKEGDE_', 1), _value)

ROOT = Path(__file__).resolve().parents[2]
config = json.loads((ROOT / 'config/server.json').read_text(encoding='utf-8-sig'))
base = f"http://127.0.0.1:{os.environ.get('OAKEGDE_PORT', os.environ.get('CYBEREDGE_PORT', config.get('port', 5175)))}"
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def request(path, data=None):
    req = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None,
                                 headers={'Content-Type': 'application/json', 'Origin': base})
    try:
        with client.open(req, timeout=15) as response: return response.status, response.read()
    except urllib.error.HTTPError as error: return error.code, error.read()

try:
    assert request('/')[0] == 200, 'Frontend not served'
    assert request('/health')[0] == 200, 'Backend not available'
    code, body = request('/v1/access/session')
    gate_on = code == 200 and json.loads(body).get('required', True)
    if gate_on:
        assert request('/v1/projects/')[0] == 401, 'Anonymous API not protected'
    for path in ['/backend/API_KEY.txt', '/config/access-key.txt', '/.demo-runtime/access-key.txt', '/deploy/windows/server.py']:
        assert request(path)[0] == 404, 'Private file must not be served: ' + path
    if gate_on:
        key = (ROOT / 'config/access-key.txt').read_text(encoding='utf-8').strip()
        assert request('/v1/access/login', {'key': key})[0] == 200, 'Access key rejected'
    code, body = request('/v1/projects/')
    assert code == 200, 'Project API unavailable'
    projects = json.loads(body)
    for project in projects:
        assert request('/v1/projects/' + urllib.parse.quote(project['id'], safe=''))[0] == 200, 'Cannot open project'
    for path in ['/models/su7/sm_car.glb', '/models/su7/t_env_light.hdr', '/hmi/voice-capture.js', '/fonts/maple/maple.css']:
        assert request(path)[0] == 200, 'Asset missing: ' + path
    code, body = request('/v1/audio/status')
    assert code == 200 and json.loads(body)['available'], 'ASR dependencies/model missing'
    gate = 'access key on' if gate_on else 'site gate off (default)'
    print(f'PASS: frontend, API, {gate}, {len(projects)} projects, SU7, voice worklet and ASR ready.')
    print('OpenSparX weights are deliberately excluded. Its inference needs a separately configured service.')
except Exception as error:
    print(f'FAIL: {error}')
    print('Keep START.cmd running, check its error message and config/server.json.')
    sys.exit(1)
