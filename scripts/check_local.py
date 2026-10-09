"""Read-only migration checks. Run with backend/.venv_macos/bin/python."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def get(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)

if __name__ == '__main__':
    assert get('http://127.0.0.1:8000/health')['status'] == 'ok'
    projects = get('http://127.0.0.1:5173/v1/projects/')
    assert len(projects) == len(list((ROOT/'backend/projects').glob('*.json')))
    print(f'前后端代理正常，项目数 {len(projects)}')
    for path in ['models/su7/sm_car.glb', 'models/su7/t_env_light.hdr']:
        with urllib.request.urlopen('http://127.0.0.1:5173/'+path, timeout=30) as response:
            served = hashlib.sha256(response.read()).hexdigest()
        expected = hashlib.sha256((ROOT/'studio/public'/path).read_bytes()).hexdigest()
        assert served == expected, path
    print('SU7 车模和环境光 HTTP 内容校验通过')
    models = get('http://127.0.0.1:11435/api/tags')['models']
    assert any(m['name'] == 'opensparx-cabin-intent:3b' for m in models)
    print('Ollama 独立服务已发现 opensparx-cabin-intent:3b')
