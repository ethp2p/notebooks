"""
Fetch functions for column propagation analysis.

Each function executes SQL and returns the DataFrame and query string.
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
    network: str = "mainnet",
    num_columns: int = NUM_COLUMNS,
) -> tuple:
    """Fetch column first seen timing data.

    Returns (df, query).
    """
    event_date_filter = _get_date_filter(target_date, "event_date_time")
    slot_date_filter = _get_date_filter(target_date, "slot_start_date_time")

    col_selects = ",\n    ".join(
        [f"minIf(propagation_slot_start_diff, column_index = {i}) AS c{i}" for i in range(num_columns)]
    )

    query = f"""
SELECT
    slot,
    slot_start_date_time AS time,
    {col_selects}
FROM libp2p_gossipsub_data_column_sidecar
WHERE {event_date_filter}
  AND {slot_date_filter}
  AND meta_network_name = '{network}'
GROUP BY slot, slot_start_date_time
ORDER BY slot
"""

    df = client.query_df(query)
    return df, query
