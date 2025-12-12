#!/usr/bin/env python3
"""
Render historical notebooks.

Renders notebooks for all historical dates (excluding latest) into _site/{YYYYMMDD}/.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

NOTEBOOKS = [
    "01-blob-inclusion",
    "02-blob-flow",
    "03-column-propagation",
    "04-client-versions",
]

DATA_ROOT = Path("notebooks/data")
OUTPUT_DIR = Path("_site")


def date_to_path(date: str) -> str:
    """Convert YYYY-MM-DD to YYYYMMDD for paths."""
    return date.replace("-", "")


def get_dates() -> list[str]:
    """Get list of dates from manifest."""
    manifest_path = DATA_ROOT / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        return manifest.get("dates", [])
    return []


def render_notebook(notebook: str, target_date: str, output_dir: str) -> tuple[bool, str]:
    """Render a single notebook for a specific date."""
    qmd_path = Path("notebooks") / f"{notebook}.qmd"

    cmd = [
        "quarto", "render", str(qmd_path),
        "--no-clean",
        "-P", f"target_date:{target_date}",
        "--output-dir", output_dir,
        "--output", f"{notebook}.html",
        "--execute",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False, result.stderr[:200]
    return True, ""


def create_latest_symlink(latest_date: str | None) -> None:
    """Create latest symlink pointing to notebooks/."""
    if latest_date:
        latest_link = OUTPUT_DIR / "latest"
        if latest_link.exists() or latest_link.is_symlink():
            latest_link.unlink()
        latest_link.symlink_to("notebooks")
        print(f"Created 'latest' symlink -> notebooks (date: {latest_date})")


def main() -> None:
    """Render historical notebooks."""
    dates = get_dates()
    latest = dates[0] if dates else None
    historical_dates = dates[1:]

    if not historical_dates:
        print("No historical dates to render")
        create_latest_symlink(latest)
        return

    # Create output dirs
    for date in historical_dates:
        (OUTPUT_DIR / date_to_path(date)).mkdir(parents=True, exist_ok=True)

    total = len(NOTEBOOKS) * len(historical_dates)
    print(f"Rendering {total} historical notebooks across {len(historical_dates)} dates")
    print()

    success = 0
    failed = []

    for notebook in NOTEBOOKS:
        print(f"[{notebook}]")
        for date in historical_dates:
            output_dir = str(OUTPUT_DIR / date_to_path(date))
            ok, err = render_notebook(notebook, date, output_dir)
            if ok:
                print(f"  OK: {date}")
                success += 1
            else:
                print(f"  FAILED: {date}")
                failed.append((date, notebook, err))

    # Clean up per-date site_libs
    for date in historical_dates:
        date_site_libs = OUTPUT_DIR / date_to_path(date) / "site_libs"
        if date_site_libs.exists():
            shutil.rmtree(date_site_libs)

    create_latest_symlink(latest)

    print()
    print(f"Rendered {success}/{total} notebooks")

    if failed:
        print("\nFailed renders:")
        for date, notebook, err in failed:
            print(f"  {date}/{notebook}: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
