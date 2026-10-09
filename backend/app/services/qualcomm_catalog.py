"""Read-only AI Hub Models release catalog. Never registers or runs models."""
from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from time import monotonic
import requests

VERSION = '0.63.0'
SOURCE_URL = f'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/releases/v{VERSION}/manifest.pb'
SNAPSHOT = Path(__file__).with_name('qualcomm_catalog_snapshot.json')
def _card_metadata():
    try:
        data = json.loads(Path(__file__).with_name('qualcomm_card_metadata.json').read_text())
        return data['models'] if data['version'] == VERSION else {}
    except (OSError, ValueError, KeyError, TypeError):
        return {}

CARD_METADATA = _card_metadata()
TTL = 6 * 60 * 60
RETRY_DELAY = 60
_lock = Lock()
_cached = None
_checked = 0.0
_warning = ''

class CatalogError(Exception):
    pass


def parse_manifest(raw: bytes):
    # Optional at startup: the bundled snapshot remains usable if unavailable.
    from qai_hub_models_cli.proto.manifest_pb2 import ReleaseManifest
    from qai_hub_models_cli.proto_helpers.platform_enums import (
        domain_proto_to_str, use_case_proto_to_str, runtime_proto_to_str, tag_proto_to_str,
    )
    manifest = ReleaseManifest()
    manifest.ParseFromString(raw)
    if manifest.version != VERSION or not 1 <= len(manifest.models) <= 10000:
        raise ValueError('Invalid catalog version or size')
    items = []
    ids = set()
    for item in manifest.models:
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,150}', item.id) or item.id in ids:
            raise ValueError('Invalid or duplicate model id')
        ids.add(item.id)
        items.append({
            'id': item.id, 'name': item.display_name or item.id,
            'domain': domain_proto_to_str(item.domain),
            'use_case': use_case_proto_to_str(item.use_case),
            'runtimes': [runtime_proto_to_str(v) for v in item.supported_runtimes],
            'chipsets': list(item.supported_chipsets),
            'tags': [tag_proto_to_str(v) for v in item.tags],
            'has_quantized': item.is_quantized,
            'url': 'https://aihub.qualcomm.com/models/' + item.id,
            'source': 'qualcomm', 'connection_status': 'not_connected',
            **CARD_METADATA.get(item.id, {}),
        })
    return {'version': VERSION, 'source_url': SOURCE_URL,
            'synced_at': datetime.now(timezone.utc).isoformat(),
            'items': sorted(items, key=lambda item: item['name'].casefold())}


def _fetch():
    # Only download public metadata from this fixed vendor endpoint.
    with requests.get(SOURCE_URL, timeout=(4, 10), stream=True, allow_redirects=False) as response:
        if response.status_code != 200:
            raise CatalogError('目录源暂不可用')
        data = bytearray()
        for chunk in response.iter_content(65536):
            data.extend(chunk)
            if len(data) > 8 * 1024 * 1024:
                raise CatalogError('目录数据过大')
    return parse_manifest(bytes(data))


def _snapshot():
    try:
        data = json.loads(SNAPSHOT.read_text())
        if data['version'] == VERSION and isinstance(data['items'], list) and data['items']:
            data['items'] = [{**item, **CARD_METADATA.get(item['id'], {})} for item in data['items']]
            return data
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def get_catalog(refresh=False):
    global _cached, _checked, _warning
    with _lock:
        now = monotonic()
        # Bound repeated retries during an upstream outage, including manual refresh.
        fresh = _cached is not None and now - _checked < (RETRY_DELAY if _warning else TTL)
        throttled = _checked > 0 and now - _checked < RETRY_DELAY
        if (fresh and not refresh) or (refresh and throttled and _cached is not None):
            return {**_cached, 'cache_status': 'stale' if _warning else 'cached', 'warning': _warning}
        try:
            _cached = _fetch()
            _warning = ''
            status = 'live'
        except Exception:
            # Keep a successful catalog; never replace it with a fabricated empty list.
            _cached = _cached or _snapshot()
            _warning = '在线同步暂不可用，正在显示上次目录。可稍后重试同步。'
            status = 'stale'
            if _cached is None:
                raise CatalogError('高通模型目录暂不可用，请稍后重试。')
        finally:
            _checked = monotonic()
        return {**_cached, 'cache_status': status, 'warning': _warning}
