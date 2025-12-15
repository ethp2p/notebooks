#!/usr/bin/env python3
"""
Fetch PeerDAS data for a specific date and save to Parquet files.

This script runs independently of notebooks to fetch data from ClickHouse
and store it in date-organized directories.

Usage:
    python fetch_data.py [--date YYYY-MM-DD] [--output-dir PATH] [--max-days N]
"""
import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import clickhouse_connect
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from queries import (
    fetch_blobs_per_slot,
    fetch_blocks_blob_epoch,
    fetch_blob_popularity,
    fetch_slot_in_epoch,
    fetch_proposer_blobs,
    fetch_col_first_seen,
)

# List of (name, fetcher) tuples
FETCHERS = [
    ("blobs_per_slot", fetch_blobs_per_slot),
    ("blocks_blob_epoch", fetch_blocks_blob_epoch),
    ("blob_popularity", fetch_blob_popularity),
    ("slot_in_epoch", fetch_slot_in_epoch),
    ("proposer_blobs", fetch_proposer_blobs),
    ("col_first_seen", fetch_col_first_seen),
]


def fetch_all(client, target_date: str, output_dir: Path, network: str = "mainnet") -> None:
    """Fetch all datasets for a target date."""
    date_dir = output_dir / target_date

    for name, fetcher in FETCHERS:
        output_path = date_dir / f"{name}.parquet"
        print(f"  Fetching {name}...")
        try:
            row_count = fetcher(client, target_date, output_path, network)
            print(f"    -> {row_count} rows")
        except Exception as e:
            print(f"    -> ERROR: {e}")


def update_manifest(output_dir: Path, max_days: int | None = None) -> None:
    """Update manifest.json with available dates, optionally prune old data.

    Args:
        output_dir: Directory containing date-organized data.
        max_days: Maximum days to keep. None means no limit (keep all data).
    """
    manifest_path = output_dir / "manifest.json"

    # Find all date directories
    dates = sorted(
        [d.name for d in output_dir.iterdir() if d.is_dir() and d.name[0].isdigit()],
        reverse=True,
    )

    dates_to_keep = dates
    dates_to_remove = []

    # Only prune if max_days is specified
    if max_days is not None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=max_days)).strftime("%Y-%m-%d")
        dates_to_keep = [d for d in dates if d >= cutoff]
        dates_to_remove = [d for d in dates if d < cutoff]

        for date in dates_to_remove:
            shutil.rmtree(output_dir / date)
            print(f"  Pruned old data: {date}")

    # Write manifest
    manifest = {
        "dates": dates_to_keep,
        "latest": dates_to_keep[0] if dates_to_keep else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if max_days is not None:
        manifest["max_days"] = max_days

    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"  Manifest updated: {len(dates_to_keep)} dates available")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch data for a specific date")
    parser.add_argument(
        "--date",
        help="Target date (YYYY-MM-DD), default: yesterday",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Output directory for data files",
    )
    parser.add_argument(
        "--max-days",
        type=int,
        default=None,
        help="Maximum days of data to keep (default: no limit)",
    )
    parser.add_argument(
        "--network",
        default="mainnet",
        help="Network name (default: mainnet)",
    )
    args = parser.parse_args()

    load_dotenv()

    # Determine target date
    if args.date:
        target_date = args.date
    else:
        target_date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"Fetching data for: {target_date}")
    print(f"Output directory: {args.output_dir}")
    print(f"Network: {args.network}")
    print()

    # Create ClickHouse client
    client = clickhouse_connect.get_client(
        host=os.environ["CLICKHOUSE_HOST"],
        port=int(os.environ.get("CLICKHOUSE_PORT", 8443)),
        username=os.environ["CLICKHOUSE_USER"],
        password=os.environ["CLICKHOUSE_PASSWORD"],
        secure=True,
    )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Fetch and save data
    print("Fetching data from ClickHouse...")
    fetch_all(client, target_date, output_dir, args.network)

    print("\nUpdating manifest...")
    update_manifest(output_dir, args.max_days)

    print("\nDone!")


if __name__ == "__main__":
    main()
