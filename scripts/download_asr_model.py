"""Download the pinned SenseVoice INT8 release; never execute archive contents."""
from pathlib import Path
import hashlib
import json
import tarfile
import requests

ROOT = Path(__file__).resolve().parents[1]
NAME = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
URL = f'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{NAME}.tar.bz2'
DEST = ROOT / 'models' / 'sensevoice-small-int8'

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = DEST / 'SOURCE.json'
    if manifest.exists():
        info = json.loads(manifest.read_text())
        if all((DEST / name).is_file() and hashlib.sha256((DEST / name).read_bytes()).hexdigest() == digest for name, digest in info['sha256'].items()):
            print('SenseVoice model already installed and verified.')
            return
        raise SystemExit('Existing ASR files differ from SOURCE.json; inspect before replacing.')
    archive = DEST / 'download.tar.bz2.part'
    try:
        with requests.Session() as session:
            with session.get(URL, stream=True, timeout=(15, 60)) as response:
                response.raise_for_status()
                size = 0
                with archive.open('wb') as out:
                    for chunk in response.iter_content(1024 * 1024):
                        size += len(chunk)
                        if size > 300 * 1024 * 1024:
                            raise RuntimeError('Unexpected archive size')
                        out.write(chunk)
        allowed = ['model.int8.onnx', 'tokens.txt', 'LICENSE', 'README.md', 'test_wavs/zh.wav']
        hashes = {}
        with tarfile.open(archive, 'r:bz2') as tar:
            for name in allowed:
                item = tar.getmember(f'{NAME}/{name}')
                if not item.isfile() or item.size > 260 * 1024 * 1024:
                    raise RuntimeError('Unexpected model archive member')
                data = tar.extractfile(item).read()
                target = DEST / name
                if target.exists() and target.read_bytes() != data:
                    raise RuntimeError(f'Will not overwrite different existing file: {target}')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                hashes[name] = hashlib.sha256(data).hexdigest()
        manifest.write_text(json.dumps({'source': URL, 'runtime': 'sherpa-onnx==1.13.8', 'sha256': hashes}, indent=2) + '\n')
        print('Installed SenseVoice INT8:', DEST)
    finally:
        archive.unlink(missing_ok=True)

if __name__ == '__main__':
    main()
