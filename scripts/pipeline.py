#!/usr/bin/env python3
"""
Pipeline coordinator for data fetching and notebook rendering.

Provides:
- Configuration loading from pipeline.yaml
- Date range resolution
- Query hash computation
- Staleness detection
"""

import argparse
import ast
import hashlib
import importlib
import inspect
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path

import yaml

# Add repo root to path for query imports
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Path to pipeline configuration
CONFIG_PATH = REPO_ROOT / "pipeline.yaml"


class StaleReason(Enum):
    """Reasons why a query/date combination might be stale."""

    QUERY_CHANGED = "query_changed"  # Query source code was modified
    DATA_MISSING = "data_missing"  # Parquet file doesn't exist


@dataclass
class StalenessReport:
    """Report of a stale query/date combination."""

    date: str
    query_id: str
    reason: StaleReason
    current_hash: str
    stored_hash: str | None


def load_config(config_path: Path | None = None) -> dict:
    """Load pipeline configuration from YAML file."""
    path = config_path or CONFIG_PATH
    with open(path) as f:
        return yaml.safe_load(f)


def resolve_dates(config: dict, override_date: str | None = None) -> list[str]:
    """
    Resolve date range from config.

    If override_date is provided, returns single date list.
    Otherwise resolves based on config mode: rolling, range, or list.

    Returns dates in reverse chronological order (newest first).
    """
    if override_date:
        return [override_date]

    dates_config = config["dates"]
    mode = dates_config["mode"]

    if mode == "rolling":
        window = dates_config["rolling"]["window"]
        today = datetime.now(timezone.utc).date()
        return [
            (today - timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(1, window + 1)  # Start from yesterday
        ]

    elif mode == "range":
        start = datetime.strptime(dates_config["range"]["start"], "%Y-%m-%d").date()
        end = datetime.strptime(dates_config["range"]["end"], "%Y-%m-%d").date()
        dates = []
        current = start
        while current <= end:
            dates.append(current.strftime("%Y-%m-%d"))
            current += timedelta(days=1)
        return sorted(dates, reverse=True)

    elif mode == "list":
        return sorted(dates_config["list"], reverse=True)

    raise ValueError(f"Unknown date mode: {mode}")


def compute_query_hash(module_name: str, function_name: str) -> str:
    """
    Compute a stable hash of a query function's source code.

    Algorithm:
    1. Import the module
    2. Get function source using inspect.getsource()
    3. Parse with AST to normalize whitespace/comments
    4. Remove docstrings for hash stability
    5. Hash the AST dump

    Returns first 12 characters of SHA256 hash.
    """
    module = importlib.import_module(module_name)
    func = getattr(module, function_name)
    source = inspect.getsource(func)

    # Parse to AST to normalize formatting
    tree = ast.parse(source)

    # Remove docstrings for hash stability (allows docstring changes without invalidating data)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if (
                node.body
                and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant)
                and isinstance(node.body[0].value.value, str)
            ):
                node.body = node.body[1:]

    ast_dump = ast.dump(tree, annotate_fields=True)
    return hashlib.sha256(ast_dump.encode()).hexdigest()[:12]


def compute_all_query_hashes(config: dict) -> dict[str, str]:
    """Compute hashes for all configured queries."""
    hashes = {}
    for query_id, query_config in config["queries"].items():
        try:
            hashes[query_id] = compute_query_hash(
                query_config["module"], query_config["function"]
            )
        except Exception as e:
            print(f"Warning: Could not hash query {query_id}: {e}", file=sys.stderr)
            hashes[query_id] = "error"
    return hashes


def load_data_manifest(config: dict) -> dict:
    """Load data manifest or return empty structure."""
    data_dir = config.get("settings", {}).get("data_dir", "notebooks/data")
    manifest_path = Path(data_dir) / "manifest.json"
    if manifest_path.exists():
        with open(manifest_path) as f:
            return json.load(f)
    return {
        "schema_version": "2.0",
        "dates": [],
        "latest": None,
        "query_hashes": {},
        "date_queries": {},
    }


def check_staleness(
    config: dict, manifest: dict, dates: list[str]
) -> list[StalenessReport]:
    """
    Check all queries for staleness across dates.

    Returns list of StalenessReport for each stale query/date combination.
    """
    reports = []
    current_hashes = compute_all_query_hashes(config)

    for date in dates:
        date_data = manifest.get("date_queries", {}).get(date, {})

        for query_id in config["queries"]:
            stored = date_data.get(query_id, {})
            stored_hash = stored.get("query_hash")
            current_hash = current_hashes[query_id]

            if not stored_hash:
                reports.append(
                    StalenessReport(
                        date=date,
                        query_id=query_id,
                        reason=StaleReason.DATA_MISSING,
                        current_hash=current_hash,
                        stored_hash=None,
                    )
                )
            elif stored_hash != current_hash:
                reports.append(
                    StalenessReport(
                        date=date,
                        query_id=query_id,
                        reason=StaleReason.QUERY_CHANGED,
                        current_hash=current_hash,
                        stored_hash=stored_hash,
                    )
                )

    return reports


def print_staleness_report(reports: list[StalenessReport], config: dict) -> None:
    """Print formatted staleness report."""
    if not reports:
        print("All data is up-to-date.")
        return

    # Group by query
    by_query: dict[str, list[StalenessReport]] = {}
    for r in reports:
        by_query.setdefault(r.query_id, []).append(r)

    print("\nStaleness Report")
    print("=" * 50)

    for query_id in sorted(by_query.keys()):
        query_reports = by_query[query_id]
        missing = [r for r in query_reports if r.reason == StaleReason.DATA_MISSING]
        changed = [r for r in query_reports if r.reason == StaleReason.QUERY_CHANGED]

        if changed:
            print(f"\nQuery '{query_id}' has been MODIFIED:")
            print(f"  Current hash: {changed[0].current_hash}")
            print(f"  Affected dates ({len(changed)}):")
            for r in sorted(changed, key=lambda x: x.date, reverse=True)[:5]:
                print(f"    - {r.date} (stored: {r.stored_hash})")
            if len(changed) > 5:
                print(f"    ... and {len(changed) - 5} more")

        if missing:
            print(f"\nQuery '{query_id}' - MISSING data:")
            print(f"  Current hash: {missing[0].current_hash}")
            print(f"  Dates without data ({len(missing)}):")
            for r in sorted(missing, key=lambda x: x.date, reverse=True)[:5]:
                print(f"    - {r.date}")
            if len(missing) > 5:
                print(f"    ... and {len(missing) - 5} more")

    # Check for queries that are OK
    all_query_ids = set(config["queries"].keys())
    stale_query_ids = set(by_query.keys())
    ok_query_ids = all_query_ids - stale_query_ids
    for query_id in sorted(ok_query_ids):
        print(f"\nQuery '{query_id}' - OK (no changes)")

    total = len(reports)
    print(f"\nSummary: {total} stale query/date combinations found")
    print("Run 'just fetch-regen' to re-fetch stale data")


def main() -> None:
    """CLI for pipeline coordination."""
    parser = argparse.ArgumentParser(description="Pipeline coordinator")
    parser.add_argument(
        "command",
        choices=["check-stale", "resolve-dates", "query-hashes"],
        help="Command to run",
    )
    parser.add_argument("--date", help="Override with specific date")
    args = parser.parse_args()

    config = load_config()

    if args.command == "check-stale":
        manifest = load_data_manifest(config)
        dates = resolve_dates(config, args.date)
        reports = check_staleness(config, manifest, dates)
        print_staleness_report(reports, config)
        sys.exit(1 if reports else 0)

    elif args.command == "resolve-dates":
        dates = resolve_dates(config, args.date)
        for d in dates:
            print(d)

    elif args.command == "query-hashes":
        hashes = compute_all_query_hashes(config)
        for query_id, h in sorted(hashes.items()):
            print(f"{query_id}: {h}")


if __name__ == "__main__":
    main()
