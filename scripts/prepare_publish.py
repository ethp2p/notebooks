#!/usr/bin/env python3
"""
Pre-render script for notebooks site.

Generates:
  - _quarto.yml sidebar with .qmd links (dev default)
  - _quarto-publish.yml profile with .html links (for publishing)
  - {YYYYMMDD}/index.qmd listing pages for historical dates

Usage:
  Called automatically by Quarto as pre-render script.
  Or manually: uv run python scripts/prepare_publish.py
"""
import json
from pathlib import Path

import yaml

NOTEBOOKS = [
    ("01-blob-inclusion", "Blob inclusion"),
    ("02-blob-flow", "Blob flow"),
    ("03-column-propagation", "Column propagation"),
    ("04-network-overview", "Network overview"),
]

DATA_ROOT = Path("notebooks/data")
QUARTO_CONFIG = Path("_quarto.yml")
QUARTO_PUBLISH_PROFILE = Path("_quarto-publish.yml")


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


def generate_listing(date: str) -> None:
    """Generate an index.qmd listing page for a date directory."""
    date_path = date_to_path(date)
    listing_dir = Path(date_path)
    listing_dir.mkdir(parents=True, exist_ok=True)

    notebook_links = "\n".join(
        f"- [{title}]({filename}.html)" for filename, title in NOTEBOOKS
    )

    listing_file = listing_dir / "index.qmd"
    content = f'''---
title: "{date}"
---

Notebooks for {date}:

{notebook_links}
'''
    listing_file.write_text(content)
    print(f"  Created listing: {listing_file}")


def build_sidebar(dates: list[str], ext: str = ".html") -> list[dict]:
    """Build sidebar contents list."""
    latest = dates[0] if dates else None
    older_dates = dates[1:] if dates else []

    sidebar_contents = [
        {
            "section": "Home",
            "contents": [{"text": "Introduction", "href": "index.qmd"}],
        }
    ]

    if latest:
        sidebar_contents.append({
            "section": f"{latest}",
            "contents": [
                {"text": title, "href": f"notebooks/{filename}.qmd"}
                for filename, title in NOTEBOOKS
            ],
        })

    if older_dates:
        historical_contents = [
            {"text": date, "href": f"{date_to_path(date)}/index{ext}"}
            for date in older_dates
        ]
        sidebar_contents.append({
            "section": "Historical",
            "contents": historical_contents,
        })

    return sidebar_contents


def main() -> None:
    """Generate config files and listing pages."""
    dates = get_dates()
    older_dates = dates[1:] if dates else []

    # Generate listing pages for older dates only
    print("Generating date listing pages...")
    for date in older_dates:
        generate_listing(date)

    # Read existing config
    config = yaml.safe_load(QUARTO_CONFIG.read_text())

    # Update main config with .qmd links (development default)
    config["website"]["sidebar"]["contents"] = build_sidebar(dates, ext=".qmd")

    QUARTO_CONFIG.write_text(
        yaml.dump(config, default_flow_style=False, sort_keys=False, allow_unicode=True)
    )
    print(f"Updated _quarto.yml with {len(older_dates)} historical dates")

    # Generate publish profile with .html links
    if older_dates:
        publish_config = {
            "website": {
                "sidebar": {
                    "contents": build_sidebar(dates, ext=".html")
                }
            }
        }
        QUARTO_PUBLISH_PROFILE.write_text(
            yaml.dump(publish_config, default_flow_style=False, sort_keys=False, allow_unicode=True)
        )
        print(f"Updated _quarto-publish.yml (publish profile)")


if __name__ == "__main__":
    main()
