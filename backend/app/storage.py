"""
Filesystem storage backend. Root = STORAGE_PATH + STORAGE_MAIN_FOLDER.
Storage location can be overridden from system_configuration (name='file_storage').
"""
from pathlib import Path
from typing import BinaryIO, Optional

from app.config import settings

# Optional override from system config (set per-request in files router)
_storage_override: Optional[tuple[str, str]] = None  # (path, main_folder) or None


def configure_storage(path: Optional[str] = None, main_folder: Optional[str] = None) -> None:
    """Set storage root from system config. Pass None to use env again."""
    global _storage_override
    if path is not None and main_folder is not None:
        _storage_override = (path.strip(), (main_folder or "").strip() or "assetflow-files")
    else:
        _storage_override = None


def _root() -> Path:
    if _storage_override is not None:
        path_str, folder = _storage_override
        base = Path(path_str).expanduser().resolve()
    else:
        base = Path(settings.STORAGE_PATH).expanduser().resolve()
        folder = (settings.STORAGE_MAIN_FOLDER or "assetflow-files").strip()
    if not folder:
        folder = "assetflow-files"
    root = (base / folder).resolve()
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
    """Read file content by logical path (e.g. assets/123/file.pdf)."""
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
