#!/usr/bin/env python3
"""
Render notebooks to HTML.

Renders Quarto notebooks with incremental support - only re-renders when
notebook source or data changes. Generates a manifest for Astro to consume.

Notebooks within each date are rendered in parallel for faster builds.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import yaml

CONFIG_PATH = Path("site/config/notebooks.yaml")
DATA_ROOT = Path("notebooks/data")
OUTPUT_DIR = Path("site/public/rendered")
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"


def load_config() -> dict:
    """Load notebooks configuration."""
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def load_manifest() -> dict:
    """Load existing manifest or return empty structure."""
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH) as f:
            return json.load(f)
    return {"latest_date": "", "dates": {}, "updated_at": ""}


def save_manifest(manifest: dict) -> None:
    """Save manifest to disk."""
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)


def hash_file(path: Path) -> str:
    """Compute SHA256 hash of a file."""
    if not path.exists():
        return ""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def get_available_dates() -> list[str]:
    """Get list of available dates from data directory."""
    data_manifest = DATA_ROOT / "manifest.json"
    if data_manifest.exists():
        with open(data_manifest) as f:
            return json.load(f).get("dates", [])
    # Fallback: scan directories
    dates = []
    for d in DATA_ROOT.iterdir():
        if d.is_dir() and len(d.name) == 10 and d.name[4] == "-":
            dates.append(d.name)
    return sorted(dates, reverse=True)


def should_render(
    notebook_id: str,
    notebook_source: Path,
    date: str,
    manifest: dict,
    force: bool = False,
) -> bool:
    """Check if a notebook needs to be re-rendered."""
    if force:
        return True

    existing = manifest.get("dates", {}).get(date, {}).get(notebook_id)
    if not existing:
        return True  # Never rendered

    # Check if notebook source changed
    current_hash = hash_file(notebook_source)
    if current_hash != existing.get("notebook_hash"):
        return True

    return False


def render_notebook(
    notebook_id: str,
    notebook_source: Path,
    target_date: str,
    output_dir: Path,
) -> tuple[bool, str]:
    """Render a single notebook for a specific date."""
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{notebook_id}.html"

    # Use absolute paths
    abs_source = notebook_source.resolve()

    # Quarto has issues with --output-dir and --output together
    # Render to a temp directory and move the result
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)

        cmd = [
            "quarto",
            "render",
            str(abs_source),
            "--no-clean",
            "-P",
            f"target_date:{target_date}",
            "--output-dir",
            str(tmp_path),
            "--output",
            f"{notebook_id}.html",
            "--execute",
            # Minimal output - we embed in Astro
            "-M",
            "sidebar:false",
            "-M",
            "bread-crumbs:false",
            "-M",
            "toc:false",
            # Code folding - collapse by default
            "-M",
            "code-fold:true",
            "-M",
            "code-summary:Show code",
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return False, result.stderr[:500]

        # Find the rendered HTML file (might be in tmpdir or parent due to Quarto quirks)
        rendered_html = tmp_path / f"{notebook_id}.html"
        if not rendered_html.exists():
            # Check parent directory (Quarto sometimes outputs there)
            parent_html = tmp_path.parent / f"{notebook_id}.html"
            if parent_html.exists():
                rendered_html = parent_html

        if not rendered_html.exists():
            return False, f"Output file not found after render"

        # Move to final destination
        shutil.copy2(rendered_html, output_file)

        # Also copy any _files directory (for supporting assets)
        files_dir = tmp_path / f"{notebook_id}_files"
        if files_dir.exists():
            dest_files = output_dir / f"{notebook_id}_files"
            if dest_files.exists():
                shutil.rmtree(dest_files)
            shutil.copytree(files_dir, dest_files)

    return True, str(output_file)


def render_notebook_task(
    notebook_id: str,
    notebook_source_str: str,
    target_date: str,
    output_dir_str: str,
) -> dict:
    """
    Worker function for parallel rendering.

    Takes string paths (for pickling across processes) and returns a result dict.
    """
    notebook_source = Path(notebook_source_str)
    output_dir = Path(output_dir_str)

    ok, result = render_notebook(notebook_id, notebook_source, target_date, output_dir)

    return {
        "notebook_id": notebook_id,
        "date": target_date,
        "success": ok,
        "result": result,
        "notebook_hash": hash_file(notebook_source) if ok else "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Render notebooks to HTML")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help="Output directory for rendered HTML",
    )
    parser.add_argument(
        "--date",
        help="Specific date to render (YYYY-MM-DD). If not specified, renders all dates.",
    )
    parser.add_argument(
        "--notebook",
        help="Specific notebook ID to render. If not specified, renders all notebooks.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-render even if unchanged",
    )
    parser.add_argument(
        "--latest-only",
        action="store_true",
        help="Only render the latest date",
    )
    args = parser.parse_args()

    config = load_config()
    manifest = load_manifest()
    notebooks = config["notebooks"]

    # Determine dates to process
    available_dates = get_available_dates()
    if not available_dates:
        print("No data available to render")
        return

    if args.date:
        if args.date not in available_dates:
            print(f"Date {args.date} not available. Available: {available_dates}")
            sys.exit(1)
        dates_to_render = [args.date]
    elif args.latest_only:
        dates_to_render = [available_dates[0]]
    else:
        dates_to_render = available_dates

    # Filter notebooks if specified
    if args.notebook:
        notebooks = [nb for nb in notebooks if nb["id"] == args.notebook]
        if not notebooks:
            print(f"Notebook {args.notebook} not found in config")
            sys.exit(1)

    latest_date = available_dates[0]

    print(f"Rendering {len(notebooks)} notebook(s) for {len(dates_to_render)} date(s)")
    print(f"Latest date: {latest_date}")
    print()

    success_count = 0
    skip_count = 0
    failed = []

    # Use process pool for parallel rendering (one process per notebook)
    max_workers = min(len(notebooks), 4)  # Cap at 4 to avoid overwhelming system

    for date in dates_to_render:
        # Determine output path
        if date == latest_date:
            date_output_dir = args.output_dir / "latest"
        else:
            date_output_dir = args.output_dir / "archive" / date

        if date not in manifest["dates"]:
            manifest["dates"][date] = {}

        # Collect notebooks that need rendering for this date
        to_render = []
        for nb in notebooks:
            notebook_id = nb["id"]
            notebook_source = Path(nb["source"])

            if not should_render(
                notebook_id, notebook_source, date, manifest, args.force
            ):
                print(f"  SKIP: {notebook_id} @ {date} (unchanged)")
                skip_count += 1
                continue

            to_render.append((notebook_id, str(notebook_source)))

        if not to_render:
            continue

        # Render notebooks in parallel
        print(f"  Rendering {len(to_render)} notebook(s) @ {date} in parallel...")

        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    render_notebook_task,
                    notebook_id,
                    notebook_source_str,
                    date,
                    str(date_output_dir),
                ): notebook_id
                for notebook_id, notebook_source_str in to_render
            }

            for future in as_completed(futures):
                result = future.result()
                notebook_id = result["notebook_id"]

                if result["success"]:
                    print(f"    {notebook_id}: OK")
                    success_count += 1

                    # Update manifest
                    if date == latest_date:
                        html_path = f"latest/{notebook_id}.html"
                    else:
                        html_path = f"archive/{date}/{notebook_id}.html"

                    manifest["dates"][date][notebook_id] = {
                        "rendered_at": datetime.now(timezone.utc).isoformat(),
                        "notebook_hash": result["notebook_hash"],
                        "html_path": html_path,
                    }
                else:
                    print(f"    {notebook_id}: FAILED")
                    failed.append((date, notebook_id, result["result"]))

    # Update latest date
    manifest["latest_date"] = latest_date

    # Save manifest
    save_manifest(manifest)

    print()
    print(f"Rendered: {success_count}, Skipped: {skip_count}, Failed: {len(failed)}")

    if failed:
        print("\nFailed renders:")
        for date, notebook_id, err in failed:
            print(f"  {date}/{notebook_id}: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
