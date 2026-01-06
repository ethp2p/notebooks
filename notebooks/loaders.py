"""Data loading utilities."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

_DATA_DIR = Path(__file__).parent / "data"


def _get_data_root() -> Path:
    """Get data directory (DATA_ROOT env var or local fallback)."""
    if data_root := os.environ.get("DATA_ROOT"):
        return Path(data_root)
    return _DATA_DIR


def get_target_date() -> str:
    """Get target date from TARGET_DATE env var or manifest.

    Priority:
    1. TARGET_DATE environment variable
    2. Latest date from manifest.json

    Returns:
        Date string in YYYY-MM-DD format

    Raises:
        FileNotFoundError: If no date available
    """
    if target_date := os.environ.get("TARGET_DATE"):
        return target_date

    data_root = _get_data_root()
    manifest_path = data_root / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if latest := manifest.get("latest"):
            return latest

    raise FileNotFoundError("No data available (set TARGET_DATE or ensure manifest exists)")


def load_parquet(name: str, target_date: str | None = None) -> pd.DataFrame:
    """Load a parquet file from the data directory.

    Args:
        name: Dataset name (without .parquet extension)
        target_date: YYYY-MM-DD format, or None to auto-detect

    Raises:
        FileNotFoundError: If data doesn't exist
    """
    import pandas as pd

    data_root = _get_data_root()

    if target_date is None:
        target_date = get_target_date()

    parquet_path = data_root / target_date / f"{name}.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(f"Data not found: {parquet_path}")

    return pd.read_parquet(parquet_path)


def get_parquet_sql(name: str, target_date: str | None = None) -> str | None:
    """Extract SQL metadata from a parquet file."""
    import pyarrow.parquet as pq

    data_root = _get_data_root()
    if target_date is None:
        target_date = get_target_date()

    parquet_path = data_root / target_date / f"{name}.parquet"
    if not parquet_path.exists():
        return None

    meta = pq.read_metadata(parquet_path)
    if meta.metadata and b"sql" in meta.metadata:
        return meta.metadata[b"sql"].decode("utf-8")
    return None


def display_sql(name: str, target_date: str | None = None):
    """Display SQL for a dataset.

    The rendering (e.g. folding) is handled by the nbconvert template
    based on the 'sql-fold' cell tag.
    """
    from IPython.display import display, Code

    sql = get_parquet_sql(name, target_date)
    if not sql:
        return

    display(Code(sql, language="sql"))

