"""Read-only, anonymous adapter for the public ModelScope MCP catalog."""
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
import json
import re
from threading import Lock
from time import monotonic
from urllib.parse import quote
import requests
from . import mcp_packages

BASE_URL = 'https://modelscope.cn/openapi/v1/mcp/servers'
CATEGORIES = {
    'browser-automation': '浏览器自动化', 'search': '搜索工具',
    'location-services': '位置服务', 'communication': '交流协作工具',
    'developer-tools': '开发者工具', 'entertainment-and-media': '娱乐与多媒体',
    'file-systems': '文件系统', 'finance': '金融',
}
PAGE_SIZE = 20
MAX_RESULTS = 100
_cache = OrderedDict()
_lock = Lock()

class CatalogError(Exception):
    def __init__(self, message='魔搭目录暂时不可用，请稍后重试。', status=502):
        super().__init__(message)
        self.status = status


def _request(path='', payload=None):
    key = (path, json.dumps(payload, sort_keys=True))
    with _lock:
        cached = _cache.get(key)
        if cached and cached[0] > monotonic():
            _cache.move_to_end(key)
            return cached[1]
    try:
        # PUT is ModelScope's documented catalog query; no deploy/write endpoint is exposed.
        response = requests.request('PUT' if payload is not None else 'GET', BASE_URL + path,
                                    json=payload, timeout=(4, 12), allow_redirects=False)
        if response.status_code == 404:
            raise CatalogError('该 MCP 服务已下架或暂不可访问。', 404)
        if response.status_code == 429:
            raise CatalogError('魔搭目录请求较多，请稍后重试。', 503)
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict) or body.get('success') is not True or not isinstance(body.get('data'), dict):
            raise CatalogError()
        data = body['data']
    except (requests.RequestException, ValueError) as exc:
        raise CatalogError() from exc
    with _lock:
        _cache[key] = (monotonic() + 120, data)
        _cache.move_to_end(key)
        while len(_cache) > 256:
            _cache.popitem(last=False)
    return data


def _text(value, limit=4000):
    return value[:limit] if isinstance(value, str) else ''


def _strings(value):
    return [_text(v, 100) for v in value[:20] if isinstance(v, str)] if isinstance(value, list) else []


def normalize(item):
    server_id = _text(item.get('id'), 250)
    if not server_id:
        raise CatalogError()
    return {
        'id': server_id, 'name': _text(item.get('chinese_name') or item.get('name'), 250) or server_id,
        'description': _text(item.get('description')),
        'provider': _text(item.get('author') or item.get('publisher'), 250),
        'categories': _strings(item.get('categories')), 'tags': _strings(item.get('tags')),
        'logo_url': _text(item.get('logo_url')) if _text(item.get('logo_url')).startswith('https://resources.modelscope.cn/') else '',
        'view_count': item.get('view_count') if type(item.get('view_count')) is int and item['view_count'] >= 0 else None,
        'is_hosted': item.get('is_hosted') if type(item.get('is_hosted')) is bool else None,
        'url': 'https://modelscope.cn/mcp/servers/' + quote(server_id, safe='/@'),
        'installation': mcp_packages.presentation(server_id),
    }


def _list_data(category='', q='', page=1, size=PAGE_SIZE):
    data = _request(payload={'page_number': page, 'page_size': size, 'search': q,
                             'filter': {'category': category} if category else {}})
    if not isinstance(data.get('mcp_server_list'), list) or type(data.get('total_count')) is not int or data['total_count'] < 0:
        raise CatalogError()
    return data


def list_catalog(category='', q='', page=1):
    if category and category not in CATEGORIES:
        raise CatalogError('不支持的 MCP 分类。', 422)
    if not 1 <= page <= MAX_RESULTS // PAGE_SIZE:
        raise CatalogError('分页超出公开目录查询范围。', 422)
    data = _list_data(category, q.strip(), page)
    if any(not isinstance(item, dict) for item in data['mcp_server_list']):
        raise CatalogError()
    total = data['total_count']
    return {'items': [normalize(item) for item in data['mcp_server_list']], 'total': total,
            'page': page, 'page_size': PAGE_SIZE, 'max_results': MAX_RESULTS,
            'has_next': page * PAGE_SIZE < min(total, MAX_RESULTS), 'source': 'modelscope'}


def category_counts():
    def count(key):
        try:
            return key, _list_data(key, size=1)['total_count']
        except CatalogError:
            return key, None  # A failed count is unknown, not zero.
    with ThreadPoolExecutor(max_workers=4) as pool:
        counts = dict(pool.map(count, ['', *CATEGORIES]))
    return {'total': counts.pop(''), 'categories': [
        {'id': key, 'name': name, 'count': counts[key]} for key, name in CATEGORIES.items()]}


def get_detail(server_id):
    if not re.fullmatch(r'@?[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', server_id) or any(p in ('.', '..') for p in server_id.split('/')):
        raise CatalogError('无效的 MCP 服务标识。', 422)
    data = _request('/' + quote(server_id, safe='/@'))
    result = normalize(data)
    # Return public metadata only: never relay operational URLs, config values or credentials.
    schema = data.get('env_schema')
    result['required_fields'] = _strings(schema.get('required')) if isinstance(schema, dict) else []
    result['connection_status'] = 'not_connected'
    result['readme'] = _text(data.get('readme'), 120000)
    result['readme_truncated'] = isinstance(data.get('readme'), str) and len(data['readme']) > 120000
    result['configuration_fields'] = [
        {'name': name, 'description': _text(value.get('description'), 1000),
         'required': name in result['required_fields']}
        for name, value in (schema.get('properties', {}) if isinstance(schema, dict) and isinstance(schema.get('properties', {}), dict) else {}).items()
        if isinstance(name, str) and isinstance(value, dict)][:40]
    result['installation_methods'] = list(dict.fromkeys(
        config.get('command') for block in (data.get('server_config') if isinstance(data.get('server_config'), list) else []) if isinstance(block, dict)
        for config in (block.get('mcpServers', {}) if isinstance(block.get('mcpServers', {}), dict) else {}).values()
        if isinstance(config, dict) and config.get('command') in ('uvx', 'npx', 'docker', 'python', 'python3')))

    return result
