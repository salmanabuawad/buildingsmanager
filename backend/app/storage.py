"""
Filesystem storage backend. Root = FILES_BASE_PATH from settings.
"""
from pathlib import Path
from typing import BinaryIO

from app.config import settings


def _root() -> Path:
    root = Path(settings.FILES_BASE_PATH).expanduser().resolve()
    if not root.is_dir():
        root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_path(logical_path: str) -> Path:
    """Resolve logical path (e.g. 'assets/123/file.pdf') under root; reject '..' and absolute."""
    logical_path = (logical_path or "").strip().replace("\\", "/")
    if not logical_path or logical_path.startswith("/") or ".." in logical_path:
        raise ValueError("Invalid path")
    parts = [p for p in logical_path.split("/") if p]
    return _root() / Path(*parts)


def read_file(logical_path: str) -> bytes:
    """Read file content by logical path."""
    path = _safe_path(logical_path)
    if not path.is_file():
        raise FileNotFoundError(str(path))
    return path.read_bytes()


def write_file(logical_path: str, content: bytes) -> None:
    """Write file by logical path; creates parent dirs."""
    path = _safe_path(logical_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def delete_file(logical_path: str) -> None:
    """Delete file by logical path. No-op if missing."""
    path = _safe_path(logical_path)
    if path.is_file():
        path.unlink()


def file_exists(logical_path: str) -> bool:
    return _safe_path(logical_path).is_file()


def open_file_read(logical_path: str) -> BinaryIO:
    """Open file for reading (binary). Caller must close."""
    path = _safe_path(logical_path)
    if not path.is_file():
        raise FileNotFoundError(str(path))
    return path.open("rb")
