#!/usr/bin/env python3
"""
Render notebooks to HTML.

Executes notebooks with papermill and converts to HTML with nbconvert.
Supports incremental rendering - only re-renders when source or data changes.
Generates a manifest for Astro to consume.

Notebooks within each date are rendered in parallel for faster builds.

Reads notebook configuration from pipeline.yaml.
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import nbformat
import papermill as pm
import yaml
from nbconvert import HTMLExporter
from traitlets.config import Config

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.pipeline import (
    load_config as load_pipeline_config,
    load_data_manifest,
    check_staleness,
    print_staleness_report,
)

DATA_ROOT = Path("notebooks/data")
OUTPUT_DIR = Path("site/public/rendered")
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
TEMPLATE_DIR = Path("notebooks/templates")


def load_config() -> dict:
    """Load notebooks configuration from pipeline.yaml."""
    pipeline_config = load_pipeline_config()
    return {"notebooks": pipeline_config["notebooks"]}


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


def inject_plotly_renderer(nb: nbformat.NotebookNode) -> nbformat.NotebookNode:
    """Inject a cell to configure Plotly renderer for HTML export."""
    # Create a setup cell that configures Plotly to output HTML
    setup_code = """# Auto-injected: Configure Plotly for HTML export
import plotly.io as pio
pio.renderers.default = "notebook"
"""
    setup_cell = nbformat.v4.new_code_cell(source=setup_code)
    # Use 'setup' tag - NOT 'injected-parameters' as papermill replaces that!
    setup_cell.metadata["tags"] = ["setup"]

    # Insert after parameters cell (or at start if no parameters cell)
    # Papermill will inject its parameters cell after the 'parameters' cell,
    # so we need to insert after where papermill's injection will go
    insert_idx = 0
    for i, cell in enumerate(nb.cells):
        if cell.cell_type == "code":
            tags = cell.metadata.get("tags", [])
            if "parameters" in tags:
                insert_idx = i + 1
                break

    nb.cells.insert(insert_idx, setup_cell)
    return nb


def render_notebook(
    notebook_id: str,
    notebook_source: Path,
    target_date: str,
    output_dir: Path,
) -> tuple[bool, str]:
    """Render a single notebook for a specific date using papermill + nbconvert."""
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{notebook_id}.html"

    # Use absolute paths
    abs_source = notebook_source.resolve()
    abs_template_dir = TEMPLATE_DIR.resolve()

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            executed_nb = tmp_path / f"{notebook_id}_executed.ipynb"
            prepared_nb = tmp_path / f"{notebook_id}_prepared.ipynb"

            # Read notebook and inject Plotly renderer config
            with open(abs_source) as f:
                nb = nbformat.read(f, as_version=4)
            nb = inject_plotly_renderer(nb)

            # Write prepared notebook
            with open(prepared_nb, "w") as f:
                nbformat.write(nb, f)

            # Execute notebook with papermill
            pm.execute_notebook(
                str(prepared_nb),
                str(executed_nb),
                parameters={"target_date": target_date},
                cwd=str(abs_source.parent),  # Run from notebooks/ directory
                kernel_name="python3",
            )

            # Convert to HTML with custom template
            c = Config()
            c.HTMLExporter.extra_template_basedirs = [str(abs_template_dir)]
            c.HTMLExporter.template_name = "minimal"
            c.HTMLExporter.exclude_input_prompt = True
            c.HTMLExporter.exclude_output_prompt = True

            exporter = HTMLExporter(config=c)

            # Read executed notebook
            with open(executed_nb) as f:
                nb = nbformat.read(f, as_version=4)

            # Export to HTML
            html_content, resources = exporter.from_notebook_node(nb)

            # Write HTML
            with open(output_file, "w") as f:
                f.write(html_content)

            # Handle any extracted resources (images, etc.)
            if resources.get("outputs"):
                files_dir = output_dir / f"{notebook_id}_files"
                files_dir.mkdir(exist_ok=True)
                for filename, data in resources["outputs"].items():
                    with open(files_dir / filename, "wb") as f:
                        f.write(data)

        return True, str(output_file)

    except Exception as e:
        return False, str(e)[:500]


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
    parser.add_argument(
        "--allow-stale",
        action="store_true",
        help="Render even if data is stale (skip staleness check)",
    )
    args = parser.parse_args()

    config = load_config()
    manifest = load_manifest()
    notebooks = config["notebooks"]

    # Check for stale data before rendering
    pipeline_config = load_pipeline_config()
    data_manifest = load_data_manifest(pipeline_config)

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

    # Check for stale data
    stale_reports = check_staleness(pipeline_config, data_manifest, dates_to_render)
    if stale_reports and not args.allow_stale:
        print("WARNING: Data is stale for some queries!")
        print("Run 'just fetch-regen' first, or use --allow-stale to proceed anyway")
        print()
        for r in stale_reports[:5]:
            print(f"  - {r.date}/{r.query_id}: {r.reason.value}")
        if len(stale_reports) > 5:
            print(f"  ... and {len(stale_reports) - 5} more")
        sys.exit(1)
    elif stale_reports:
        print(f"Note: Proceeding with {len(stale_reports)} stale query/date combinations")
        print()

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
