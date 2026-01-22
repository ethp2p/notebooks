"""Copy parquet files to site/dist for R2 publishing.

Only copies data for dates that have rendered notebooks (from site/rendered/manifest.json).
This ensures data availability aligns with published notebook content.

Usage:
    uv run python scripts/copy_data_to_dist.py
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path


def load_rendered_dates(rendered_manifest_path: Path) -> list[str]:
    """Load list of rendered dates from manifest."""
    if not rendered_manifest_path.exists():
        return []

    manifest = json.loads(rendered_manifest_path.read_text())
    dates = manifest.get("dates", {})
    return list(dates.keys())


def copy_data_for_date(
    source_dir: Path, dest_dir: Path, date: str
) -> tuple[int, int]:
    """Copy parquet files for a single date. Returns (file_count, total_bytes)."""
    source_date_dir = source_dir / date
    dest_date_dir = dest_dir / date

    if not source_date_dir.exists():
        return 0, 0

    dest_date_dir.mkdir(parents=True, exist_ok=True)

    file_count = 0
    total_bytes = 0

    for parquet_file in source_date_dir.glob("*.parquet"):
        dest_file = dest_date_dir / parquet_file.name
        shutil.copy2(parquet_file, dest_file)
        file_count += 1
        total_bytes += parquet_file.stat().st_size

    return file_count, total_bytes


def format_size(size_bytes: int) -> str:
    """Format byte size for human-readable output."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


def main() -> None:
    project_root = Path(__file__).parent.parent
    data_source = project_root / "notebooks" / "data"
    data_dest = project_root / "site" / "dist" / "data"
    rendered_manifest = project_root / "site" / "rendered" / "manifest.json"
    data_manifest = data_source / "manifest.json"

    print("Copying parquet data to site/dist for R2 publishing...")

    rendered_dates = load_rendered_dates(rendered_manifest)
    if not rendered_dates:
        print("No rendered dates found in manifest. Nothing to copy.")
        return

    print(f"Found {len(rendered_dates)} rendered date(s): {', '.join(sorted(rendered_dates))}")

    data_dest.mkdir(parents=True, exist_ok=True)

    total_files = 0
    total_size = 0

    for date in sorted(rendered_dates):
        files, size = copy_data_for_date(data_source, data_dest, date)
        if files > 0:
            print(f"  {date}: {files} file(s), {format_size(size)}")
            total_files += files
            total_size += size
        else:
            print(f"  {date}: No parquet files found in source")

    if data_manifest.exists():
        dest_manifest = data_dest / "manifest.json"
        shutil.copy2(data_manifest, dest_manifest)
        print(f"  Copied manifest.json")

    print(f"\nTotal: {total_files} file(s), {format_size(total_size)}")
    print(f"Output: {data_dest}")


if __name__ == "__main__":
    main()
