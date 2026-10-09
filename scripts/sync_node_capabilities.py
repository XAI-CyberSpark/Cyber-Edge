#!/usr/bin/env python3
"""Sync the node capability registry from its single source to the Studio copy.

Single source: backend/app/services/node_capabilities.json
Generated copy: studio/src/data/nodeCapabilities.json

The Studio copy stays committed because the Studio Docker build context is
./studio and cannot read ../backend. Never edit the Studio copy by hand:
edit the backend file, then run this script. `--check` exits 1 on drift.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'backend/app/services/node_capabilities.json'
TARGET = ROOT / 'studio/src/data/nodeCapabilities.json'


def main() -> int:
    parser = argparse.ArgumentParser(description='Sync node capability registry to the Studio copy.')
    parser.add_argument('--check', action='store_true', help='only verify the copy matches the source')
    args = parser.parse_args()

    source = SOURCE.read_bytes()
    catalog = json.loads(source)  # refuse to propagate an invalid registry
    controls = json.loads(SOURCE.with_name('hmi_controls.json').read_text())
    updated = False
    for node in catalog['nodes'].values():
        for field in node['fields'].values():
            if field.get('enum_source') == 'hmi_controls' and field.get('enum') != list(controls):
                field['enum'] = list(controls)
                updated = True
    if updated:
        if args.check:
            print('drift: node control enums differ from hmi_controls.json; run scripts/sync_node_capabilities.py', file=sys.stderr)
            return 1
        source = (json.dumps(catalog, ensure_ascii=False, indent=2)+'\n').encode()
        SOURCE.write_bytes(source)
    current = TARGET.read_bytes() if TARGET.exists() else None

    if current == source:
        print(f'in sync: {TARGET.relative_to(ROOT)}')
        return 0
    if args.check:
        state = 'missing' if current is None else 'differs from source'
        print(f'drift: {TARGET.relative_to(ROOT)} {state}; '
              f'edit {SOURCE.relative_to(ROOT)} and run scripts/sync_node_capabilities.py',
              file=sys.stderr)
        return 1
    TARGET.write_bytes(source)
    print(f'wrote {TARGET.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
