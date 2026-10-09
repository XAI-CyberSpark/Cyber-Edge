#!/usr/bin/env python3
"""Restore the pre-HMI files only. Preview by default; --apply performs the rollback."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from datetime import datetime


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    versions = root / '.demo-runtime/versions'
    before = versions / '2.8.0-dev.7-before-hmi'
    after = versions / '2.8.0-dev.8-hmi'
    original = json.loads((before / 'manifest.json').read_text())
    expected = json.loads((after / 'manifest.json').read_text())
    # Validate the entire plan before changing any file.
    for name, sha in original.items():
        target = (root / name).resolve()
        if not target.is_relative_to(root) or Path(name).is_absolute():
            raise SystemExit('Invalid snapshot path')
        if digest(before / 'files' / name) != sha:
            raise SystemExit(f'备份校验失败：{name}')
        if not target.is_file() or digest(target) not in {sha, expected.get(name)}:
            raise SystemExit(f'发现备份之后的新修改，停止回滚以保护文件：{name}')
    print(f'校验通过：仅恢复 {len(original)} 个本轮文件，不修改项目、模型和车模资源。')
    if not args.apply:
        print('预览完成；加 --apply 执行回滚。')
        return
    rescue = versions / ('before-rollback-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    for name in original:
        saved = rescue / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / name, saved)
    for name in original:
        target = root / name
        fd, temp = tempfile.mkstemp(prefix='.hmi-restore-', dir=target.parent)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write((before / 'files' / name).read_bytes())
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temp, target.stat().st_mode)
            os.replace(temp, target)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    assert all(digest(root / name) == sha for name, sha in original.items())
    print('已恢复 dev.7 HMI。请重启前端并刷新页面。回滚前文件保存在：', rescue)


if __name__ == '__main__':
    main()
