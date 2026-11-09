#!/usr/bin/env python3
"""Expire image payloads in the explicitly supplied Beike SQLite backup directories."""

import argparse
import os
from pathlib import Path
import sqlite3
import time

IMAGE_EXTENSIONS = frozenset(
    ".jpg .jpeg .png .webp .gif .avif .bmp .tif .tiff .heic .heif .svg .ico .jxl".split()
)
ASSET_COLUMNS = {
    "SceneAsset": ("coverUrl", "sourceImages"),
    "PersonaAsset": ("avatarUrl", "sourceImages"),
    "OutfitAsset": ("coverUrl", "sourceImages"),
    "ActionAsset": ("mediaUrl", "coverUrl", "sourceImages"),
    "FullPromptAsset": ("coverUrl", "sourceImages"),
}


def database_rules(db):
    def columns(table):
        return {row[1] for row in db.execute(f'PRAGMA table_info("{table}")')}

    tasks = columns("ImageTask")
    if {"mediaType", "status", "updatedAt"} <= tasks:
        # A snapshot cannot contain a task that will continue running.
        yield "ImageTask", """COALESCE("mediaType",'image') = 'image'
            AND julianday("updatedAt") <= julianday(?, 'unixepoch')"""
    for table, fields in ASSET_COLUMNS.items():
        available = columns(table)
        urls = [field for field in fields if field in available]
        if not urls or "createdAt" not in available:
            continue
        if table == "ActionAsset" and "mediaType" not in available:
            continue
        predicates = ['julianday("createdAt") <= julianday(?, \'unixepoch\')']
        if table == "ActionAsset":
            predicates.append('"mediaType" = \'image\'')
        if table == "FullPromptAsset":
            if "workspaceId" not in available:
                continue
            predicates.append('"workspaceId" <> \'official\'')
        has_image = " OR ".join(f"""COALESCE("{field}",'') NOT IN ('','[]')""" for field in urls)
        yield table, " AND ".join([*predicates, f"({has_image})"])


def expire_database(path, cutoff, apply):
    with path.open("rb") as stream:
        if stream.read(16) != b"SQLite format 3\0":
            return 0
    if path.stat().st_nlink != 1:
        raise ValueError("snapshot has multiple hard links")
    mode = "rw" if apply else "ro"
    db = sqlite3.connect(f"{path.resolve().as_uri()}?mode={mode}", uri=True, timeout=10)
    try:
        if apply:
            db.execute("PRAGMA foreign_keys = ON")
            db.execute("PRAGMA secure_delete = ON")
            db.execute("BEGIN IMMEDIATE")
        count = 0
        for table, predicate in database_rules(db):
            query = f'FROM "{table}" WHERE {predicate}'
            if apply:
                count += db.execute("DELETE " + query, (cutoff,)).rowcount
            else:
                count += db.execute("SELECT count(*) " + query, (cutoff,)).fetchone()[0]
        if apply:
            if count and db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise ValueError("SQLite integrity check failed")
            db.commit()
            if count:
                db.execute("VACUUM")
                busy, _, _ = db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
                if busy:
                    raise ValueError("SQLite checkpoint is busy")
        return count
    finally:
        db.close()


def walk(root):
    for directory, directories, files in os.walk(root):
        directories[:] = [name for name in directories if name not in {".git", "node_modules"}]
        folder = Path(directory)
        for name in files:
            path = folder / name
            if not path.is_symlink() and path.is_file():
                yield path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("roots", nargs="+", type=Path)
    args = parser.parse_args()
    cutoff = time.time() - 24 * 60 * 60
    records = images = errors = 0
    for root in args.roots:
        if root.is_symlink() or not root.is_dir():
            continue
        for path in walk(root):
            try:
                if path.suffix == ".db" or path.name.endswith(".db.catalog-reset"):
                    records += expire_database(path, cutoff, args.apply)
                elif "storage" in path.relative_to(root.parent).parts and path.suffix.lower() in IMAGE_EXTENSIONS:
                    if path.stat().st_mtime <= cutoff:
                        if args.apply:
                            path.unlink()
                        images += 1
            except (OSError, sqlite3.Error, ValueError) as error:
                print(f"{path}: {error}", flush=True)
                errors += 1
    print(f"{'applied' if args.apply else 'preview'}: images={images} records={records} errors={errors}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
