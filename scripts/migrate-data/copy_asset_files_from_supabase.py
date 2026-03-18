#!/usr/bin/env python3
"""
Copy asset file binaries from Supabase storage to the new server's local storage.

Reads asset_files from the TARGET database (already migrated metadata with file_url/file_path
pointing to Supabase). For each row that has a Supabase URL, downloads the file and writes
it to ASSET_FILES_STORAGE_PATH under the same relative path: {asset_id}/{filename}.

Run on the new server (or any machine with network access to Supabase and the target DB):

  export TARGET_DATABASE_URL="postgresql://user:pass@host:5432/dbname"
  export ASSET_FILES_STORAGE_PATH="/home/profilegroup/app/asset_files_storage"
  pip install psycopg2-binary requests
  python3 scripts/migrate-data/copy_asset_files_from_supabase.py [--dry-run] [--update-db]

Options:
  --dry-run    Only print what would be downloaded; do not write files.
  --update-db  After writing each file, set asset_files.file_path to the relative path (e.g. 123/file.pdf).
"""

import argparse
import os
import re
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("Install: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)
try:
    import requests
except ImportError:
    print("Install: pip install requests", file=sys.stderr)
    sys.exit(1)

TARGET_URL = os.environ.get("TARGET_DATABASE_URL")
STORAGE_ROOT = os.environ.get("ASSET_FILES_STORAGE_PATH", "/home/profilegroup/app/asset_files_storage")

# Supabase URL pattern: .../structure-drawings/{asset_id}/{filename}
STRUCTURE_DRAWINGS_PREFIX = "structure-drawings/"


def extract_rel_path(url_or_path: str) -> str | None:
    """Extract relative path {asset_id}/{filename} from Supabase URL or path."""
    if not url_or_path or not isinstance(url_or_path, str):
        return None
    val = url_or_path.replace("\\", "/").strip()
    if STRUCTURE_DRAWINGS_PREFIX not in val:
        return None
    tail = val.split(STRUCTURE_DRAWINGS_PREFIX, 1)[1]
    return tail.split("?")[0].strip()


def is_supabase_url(s: str) -> bool:
    return isinstance(s, str) and (s.startswith("http://") or s.startswith("https://")) and "supabase" in s


def main():
    ap = argparse.ArgumentParser(description="Copy asset files from Supabase storage to local server path")
    ap.add_argument("--dry-run", action="store_true", help="Do not download or write files")
    ap.add_argument("--update-db", action="store_true", help="Update asset_files.file_path to relative path after copy")
    args = ap.parse_args()

    if not TARGET_URL:
        print("Set TARGET_DATABASE_URL", file=sys.stderr)
        sys.exit(1)

    storage_path = Path(STORAGE_ROOT)
    if not args.dry_run and not storage_path.exists():
        print(f"Storage path does not exist: {storage_path}", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(TARGET_URL)
    cur = conn.cursor()

    # Discover columns (target may have file_path only, or file_url + file_path).
    # Supabase has file_url; some targets have only file_path, sometimes with the full URL stored in it.
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'asset_files' ORDER BY ordinal_position"
    )
    cols = [r[0] for r in cur.fetchall()]
    select_cols_list = ["id", "asset_id", "file_name"]
    if "file_url" in cols:
        select_cols_list.append("file_url")
    if "file_path" in cols:
        select_cols_list.append("file_path")
    select_cols = ", ".join(select_cols_list)

    cur.execute(f"SELECT {select_cols} FROM asset_files")
    rows = cur.fetchall()
    col_names = [d[0] for d in cur.description]
    row_dicts = [dict(zip(col_names, r)) for r in rows]

    to_download = []
    for row in row_dicts:
        url = row.get("file_url") or row.get("file_path")
        if not url or not is_supabase_url(str(url)):
            continue
        rel = extract_rel_path(str(url))
        if not rel:
            continue
        # Sanitize: rel should be like "123/filename.pdf"
        if re.search(r"\.\.[/\\]", rel) or rel.startswith("/"):
            continue
        to_download.append({"id": row["id"], "asset_id": row["asset_id"], "url": url, "rel_path": rel})

    print(f"Found {len(to_download)} asset files to copy from Supabase (of {len(row_dicts)} total rows).")

    if args.dry_run:
        for item in to_download[:10]:
            print(f"  Would download: {item['url']} -> {STORAGE_ROOT}/{item['rel_path']}")
        if len(to_download) > 10:
            print(f"  ... and {len(to_download) - 10} more")
        return

    copied = 0
    errors = 0
    for item in to_download:
        full_path = storage_path / item["rel_path"]
        full_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            resp = requests.get(item["url"], timeout=60)
            resp.raise_for_status()
            full_path.write_bytes(resp.content)
            copied += 1
            if args.update_db and "file_path" in cols:
                cur.execute("UPDATE asset_files SET file_path = %s WHERE id = %s", (item["rel_path"], item["id"]))
            if copied % 10 == 0:
                print(f"  Copied {copied} files...")
        except Exception as e:
            errors += 1
            print(f"  Error {item['url']}: {e}", file=sys.stderr)

    if args.update_db and copied:
        conn.commit()
    conn.close()

    print(f"Done. Copied {copied} files to {STORAGE_ROOT}. Errors: {errors}.")
    if args.update_db and copied:
        print("Updated asset_files.file_path to relative paths.")


if __name__ == "__main__":
    main()
