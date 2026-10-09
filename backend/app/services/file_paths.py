from pathlib import Path

from fastapi import HTTPException


def safe_child_path(directory: Path, name: str, *, suffix: str = "") -> Path:
    """Resolve an API filename inside its designated directory."""
    if (not isinstance(name, str) or not name.strip() or name in {".", ".."}
            or any(char in name for char in "/\\")
            or any(ord(char) < 32 for char in name)):
        raise HTTPException(status_code=422, detail="Expected a single non-empty filename")
    path = directory / f"{name}{suffix}"
    try:
        contained = path.resolve().parent == directory.resolve()
    except (OSError, RuntimeError):
        contained = False
    if not contained:
        raise HTTPException(status_code=422, detail="File must remain inside its designated directory")
    return path
