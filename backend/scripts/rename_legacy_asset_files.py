"""
One-time backfill: rename existing asset_files rows + storage files to the
new {asset_id}_{N}.{ext} convention, and copy the previous file_name into
file_description so the original Hebrew/spaces name is preserved for display
and the automation file-list export.

Idempotent: rows whose file_name already matches {asset_id}_\\d+\\.\\w+ are
left alone (description is still backfilled if missing).

Usage from the backend root (/home/profilegroup/app/backend):
  ./venv/bin/python -m scripts.rename_legacy_asset_files            # dry run
  ./venv/bin/python -m scripts.rename_legacy_asset_files --apply    # apply
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from sqlalchemy import text

# Allow running as `python -m scripts.rename_legacy_asset_files` from
# /home/profilegroup/app/backend (which already has app/ on the path).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # type: ignore
from app.config import settings  # type: ignore


APPLY = "--apply" in sys.argv


def storage_root() -> Path:
    return Path(getattr(settings, "ASSET_FILES_STORAGE_PATH", settings.FILES_BASE_PATH))


def ext_of(name: str) -> str:
    if not name or "." not in name:
        return ""
    return "." + name.rsplit(".", 1)[1].lower()


def is_already_sanitized(asset_id: int, file_name: str) -> bool:
    if not file_name:
        return False
    return re.match(rf"^{asset_id}_\d+(\.|$)", file_name) is not None


def main() -> int:
    db = SessionLocal()
    root = storage_root()
    if not root.exists():
        print(f"[error] Storage root does not exist: {root}")
        return 1

    print(f"[info] mode={'APPLY' if APPLY else 'DRY-RUN'}  storage_root={root}")

    rows = db.execute(
        text(
            "SELECT id, asset_id, file_name, file_description, file_url "
            "FROM asset_files ORDER BY asset_id, id"
        )
    ).mappings().all()
    print(f"[info] {len(rows)} asset_files rows to inspect")

    # Per-asset next-N tracker, seeded from existing sanitized rows so we
    # don't collide with files already in the new format.
    next_n_by_asset: dict[int, int] = {}
    pattern_n = re.compile(r"_(\d+)(?:\.|$)")
    for row in rows:
        aid = int(row["asset_id"])
        fn = (row["file_name"] or "").strip()
        if is_already_sanitized(aid, fn):
            m = pattern_n.search(fn)
            if m:
                n = int(m.group(1))
                if n > next_n_by_asset.get(aid, 0):
                    next_n_by_asset[aid] = n

    stats = {
        "renamed": 0,
        "description_only": 0,
        "skipped_already_ok": 0,
        "skipped_no_file": 0,
        "skipped_no_asset": 0,
        "errors": 0,
    }

    for row in rows:
        try:
            aid = int(row["asset_id"]) if row["asset_id"] is not None else None
            if aid is None or aid <= 0:
                stats["skipped_no_asset"] += 1
                continue
            file_id = row["id"]
            old_name = (row["file_name"] or "").strip()
            old_url = (row["file_url"] or "").strip()
            desc_now = row["file_description"]

            # Idempotent: already sanitized → only backfill description if blank.
            if is_already_sanitized(aid, old_name):
                if not desc_now:
                    if APPLY:
                        db.execute(
                            text(
                                "UPDATE asset_files SET file_description = :d WHERE id = :id"
                            ),
                            {"d": old_name, "id": file_id},
                        )
                    stats["description_only"] += 1
                else:
                    stats["skipped_already_ok"] += 1
                continue

            # Resolve the physical file on disk via stored url/path.
            # url looks like "{asset_id}/{file}" (no scheme); strip any leading slashes/structure-drawings prefix.
            rel = old_url.replace("\\", "/").lstrip("/")
            if "structure-drawings/" in rel:
                rel = rel.split("structure-drawings/", 1)[1]
            old_disk = root / rel
            if not old_disk.exists():
                # Try {asset_id}/{file_name} layout.
                alt = root / str(aid) / old_name
                if alt.exists():
                    old_disk = alt
                else:
                    print(f"[warn] file missing on disk: id={file_id} asset={aid} url={old_url}")
                    stats["skipped_no_file"] += 1
                    continue

            # Compute next N for this asset.
            next_n = next_n_by_asset.get(aid, 0) + 1
            next_n_by_asset[aid] = next_n
            new_name = f"{aid}_{next_n}{ext_of(old_name)}"
            new_rel = f"{aid}/{new_name}"
            new_disk = root / new_rel

            print(
                f"[{'apply' if APPLY else 'dry '}] id={file_id} asset={aid}  "
                f"{old_name!r:40} -> {new_name!r}"
            )

            if APPLY:
                # Make sure target dir exists then rename file on disk
                new_disk.parent.mkdir(parents=True, exist_ok=True)
                if new_disk.exists() and new_disk.resolve() != old_disk.resolve():
                    # Should not happen because next_n is unique, but guard anyway.
                    raise FileExistsError(f"target already exists: {new_disk}")
                old_disk.rename(new_disk)
                # Update DB row
                db.execute(
                    text(
                        "UPDATE asset_files "
                        "SET file_name = :n, file_description = COALESCE(:d, file_description), file_url = :u "
                        "WHERE id = :id"
                    ),
                    {"n": new_name, "d": old_name, "u": new_rel, "id": file_id},
                )

            stats["renamed"] += 1
        except Exception as e:
            print(f"[error] row id={row.get('id')} asset={row.get('asset_id')}: {e}")
            stats["errors"] += 1

    if APPLY:
        db.commit()
    db.close()

    print("\n=== summary ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print(f"  mode: {'APPLY' if APPLY else 'DRY-RUN (pass --apply to commit)'}")
    return 0 if stats["errors"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
