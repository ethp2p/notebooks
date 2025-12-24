"""
Fetch functions for column propagation analysis.

Each function executes SQL and writes directly to Parquet.
"""

from pathlib import Path

# Number of data columns in PeerDAS
NUM_COLUMNS = 128


def _get_date_filter(target_date: str, column: str = "event_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_col_first_seen(
    client,
    target_date: str,
    output_path: Path,
    network: str = "mainnet",
    num_columns: int = NUM_COLUMNS,
) -> int:
    """Fetch column first seen timing data and write to Parquet.

    Returns row count.
    """
    event_date_filter = _get_date_filter(target_date, "event_date_time")
    slot_date_filter = _get_date_filter(target_date, "slot_start_date_time")

    col_selects = ",\n    ".join(
        [f"minIf(propagation_slot_start_diff, column_index = {i}) AS c{i}" for i in range(num_columns)]
    )

    query = f"""
SELECT
    slot_start_date_time AS time,
    {col_selects}
FROM libp2p_gossipsub_data_column_sidecar
WHERE {event_date_filter}
  AND {slot_date_filter}
  AND meta_network_name = '{network}'
GROUP BY slot_start_date_time
ORDER BY time
"""

    df = client.query_df(query)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    return len(df)
