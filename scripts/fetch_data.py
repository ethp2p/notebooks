#!/usr/bin/env python3
"""
Fetch PeerDAS data from ClickHouse and save to Parquet files.

Reads query configuration from pipeline.yaml.
Tracks query hashes for staleness detection.

Usage:
    python fetch_data.py [--date YYYY-MM-DD] [--output-dir PATH] [--max-days N]
    python fetch_data.py --sync        # Fetch missing + re-fetch stale data
    python fetch_data.py --check-only  # Report staleness without fetching
"""

import argparse
import importlib
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

from scripts.pipeline import (
    load_config,
    resolve_dates,
    compute_all_query_hashes,
    load_data_manifest,
    check_staleness,
    print_staleness_report,
)


def get_fetcher(query_config: dict):
    """Dynamically import and return fetcher function."""
    module = importlib.import_module(query_config["module"])
    return getattr(module, query_config["function"])


def fetch_query(
    client,
    query_id: str,
    query_config: dict,
    target_date: str,
    output_dir: Path,
    network: str,
    query_hash: str,
) -> dict:
    """
    Fetch a single query and return metadata.

    Returns dict with fetched_at, query_hash, row_count, file_size_bytes.
    """
    date_dir = output_dir / target_date
    date_dir.mkdir(parents=True, exist_ok=True)
    output_path = date_dir / query_config["output_file"]

    fetcher = get_fetcher(query_config)
    row_count = fetcher(client, target_date, output_path, network)

    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "query_hash": query_hash,
        "row_count": row_count,
        "file_size_bytes": output_path.stat().st_size if output_path.exists() else 0,
    }


def fetch_date(
    client,
    config: dict,
    target_date: str,
    output_dir: Path,
    network: str,
    query_hashes: dict[str, str],
    queries_to_fetch: list[str] | None = None,
) -> dict:
    """
    Fetch all queries for a date.

    Returns dict of query_id -> metadata for manifest.
    """
    results = {}
    queries = config["queries"]

    for query_id, query_config in queries.items():
        if queries_to_fetch and query_id not in queries_to_fetch:
            continue

        print(f"  Fetching {query_id}...")
        try:
            metadata = fetch_query(
                client,
                query_id,
                query_config,
                target_date,
                output_dir,
                network,
                query_hashes[query_id],
            )
            results[query_id] = metadata
            print(f"    -> {metadata['row_count']} rows")
        except Exception as e:
            print(f"    -> ERROR: {e}")

    return results


def update_manifest(
    config: dict,
    output_dir: Path,
    date_results: dict[str, dict],
    query_hashes: dict[str, str],
    max_days: int | None = None,
) -> None:
    """Update manifest with fetch results."""
    manifest_path = output_dir / "manifest.json"

    # Load existing or create new
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        manifest = {
            "schema_version": "2.0",
            "dates": [],
            "latest": None,
            "query_hashes": {},
            "date_queries": {},
        }

    # Migrate v1 manifests
    if "schema_version" not in manifest:
        manifest["schema_version"] = "2.0"
        manifest["date_queries"] = {}

    # Update query hashes
    manifest["query_hashes"] = query_hashes

    # Update date_queries with new results
    for date, queries in date_results.items():
        if date not in manifest["date_queries"]:
            manifest["date_queries"][date] = {}
        manifest["date_queries"][date].update(queries)

    # Find all dates from directories
    all_dates = set()
    for d in output_dir.iterdir():
        if d.is_dir() and len(d.name) == 10 and d.name[0].isdigit():
            all_dates.add(d.name)
    dates = sorted(all_dates, reverse=True)

    # Prune old dates if max_days specified
    if max_days:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=max_days)).strftime(
            "%Y-%m-%d"
        )
        dates_to_remove = [d for d in dates if d < cutoff]
        dates = [d for d in dates if d >= cutoff]

        for date in dates_to_remove:
            date_dir = output_dir / date
            if date_dir.exists():
                shutil.rmtree(date_dir)
            manifest["date_queries"].pop(date, None)
            print(f"  Pruned: {date}")

    manifest["dates"] = dates
    manifest["latest"] = dates[0] if dates else None
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch data from ClickHouse")
    parser.add_argument("--date", help="Specific date (YYYY-MM-DD)")
    parser.add_argument("--output-dir", default="notebooks/data")
    parser.add_argument("--max-days", type=int, help="Max days to keep")
    parser.add_argument("--network", default="mainnet")
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Fetch missing data and re-fetch stale data",
    )
    parser.add_argument(
        "--check-only", action="store_true", help="Only check staleness, don't fetch"
    )
    parser.add_argument("--query", help="Fetch specific query only")
    args = parser.parse_args()

    load_dotenv()
    config = load_config()
    output_dir = Path(args.output_dir)

    # Compute current query hashes
    query_hashes = compute_all_query_hashes(config)

    # Resolve dates from config
    dates = resolve_dates(config, args.date)

    # Load manifest and check staleness
    manifest = load_data_manifest(config)
    stale_reports = check_staleness(config, manifest, dates)

    if args.check_only:
        print_staleness_report(stale_reports, config)
        sys.exit(1 if stale_reports else 0)

    # Determine what to fetch
    to_fetch: dict[str, list[str]] = {}  # date -> [query_ids]

    if args.sync and stale_reports:
        # Fetch stale query/date combinations
        for r in stale_reports:
            to_fetch.setdefault(r.date, []).append(r.query_id)
        print(f"Syncing {len(stale_reports)} stale items...")
    elif args.date:
        # Fetch all queries for specified date
        to_fetch = {args.date: list(config["queries"].keys())}
    else:
        # Default: fetch yesterday only (daily mode)
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%d"
        )
        to_fetch = {yesterday: list(config["queries"].keys())}

    if args.query:
        # Filter to specific query
        to_fetch = {
            d: [q for q in qs if q == args.query]
            for d, qs in to_fetch.items()
            if args.query in qs
        }

    if not to_fetch:
        print("Nothing to fetch.")
        return

    # Create ClickHouse client
    client = clickhouse_connect.get_client(
        host=os.environ["CLICKHOUSE_HOST"],
        port=int(os.environ.get("CLICKHOUSE_PORT", 8443)),
        username=os.environ["CLICKHOUSE_USER"],
        password=os.environ["CLICKHOUSE_PASSWORD"],
        secure=True,
    )

    output_dir.mkdir(parents=True, exist_ok=True)

    # Fetch data
    all_results: dict[str, dict] = {}
    for date, query_ids in sorted(to_fetch.items()):
        print(f"\nFetching {date} ({len(query_ids)} queries)...")
        results = fetch_date(
            client, config, date, output_dir, args.network, query_hashes, query_ids
        )
        all_results[date] = results

    # Update manifest
    print("\nUpdating manifest...")
    update_manifest(config, output_dir, all_results, query_hashes, args.max_days)

    print("\nDone!")


if __name__ == "__main__":
    main()
