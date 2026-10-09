from pathlib import Path
import hashlib
import json
import sys
ROOT = Path(__file__).resolve().parents[2]
manifest = json.loads((ROOT / 'PACKAGE-MANIFEST.json').read_text(encoding='utf-8'))
failed = []
for relative, expected in manifest['files'].items():
    path = ROOT / relative
    if not path.is_file(): failed.append(relative); continue
    with path.open('rb') as file:
        actual = hashlib.file_digest(file, 'sha256').hexdigest()
    if actual != expected: failed.append(relative)
if failed:
    print('Missing or changed package files:', *failed, sep='\n')
    print('For an initial install, extract a fresh copy of the complete ZIP.')
    sys.exit(1)
print('Package integrity verified. OpenSparX weights excluded.')
