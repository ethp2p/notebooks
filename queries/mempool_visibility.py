"""
Fetch functions for mempool visibility analysis.

Analyzes transaction visibility in the public mempool before block inclusion.
"""


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_tx_per_slot(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch transaction counts per slot per type.

    Fast query - no mempool join.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    slot,
    slot_start_date_time,
    type AS tx_type,
    count() AS total_txs
FROM canonical_beacon_block_execution_transaction
WHERE meta_network_name = '{network}'
  AND {date_filter}
GROUP BY slot, slot_start_date_time, type
ORDER BY slot, type
"""

    df = client.query_df(query)
    return df, query


def fetch_mempool_coverage(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch hourly mempool coverage stats.

    Uses GLOBAL IN semi-join for performance.
    Returns coverage counts per hour per type.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    toStartOfHour(slot_start_date_time) AS hour,
    type AS tx_type,
    count() AS total_txs,
    countIf(hash GLOBAL IN (
        SELECT DISTINCT hash
        FROM mempool_transaction
        WHERE meta_network_name = '{network}'
          AND event_date_time >= '{target_date}'::date - INTERVAL 1 HOUR
          AND event_date_time < '{target_date}'::date + INTERVAL 1 DAY
    )) AS seen_in_mempool
FROM canonical_beacon_block_execution_transaction
WHERE meta_network_name = '{network}'
  AND {date_filter}
GROUP BY hour, tx_type
ORDER BY hour, tx_type
"""

    df = client.query_df(query)
    return df, query


def fetch_sentry_coverage(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch per-sentry coverage rates.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH canonical_hashes AS (
    SELECT DISTINCT hash
    FROM canonical_beacon_block_execution_transaction
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),
total_canonical AS (
    SELECT count() AS total FROM canonical_hashes
)
SELECT
    meta_client_name AS sentry,
    count(DISTINCT hash) AS txs_seen,
    round(count(DISTINCT hash) * 100.0 / (SELECT total FROM total_canonical), 2) AS coverage_pct
FROM mempool_transaction
WHERE meta_network_name = '{network}'
  AND event_date_time >= '{target_date}'::date - INTERVAL 1 HOUR
  AND event_date_time < '{target_date}'::date + INTERVAL 1 DAY
  AND hash GLOBAL IN (SELECT hash FROM canonical_hashes)
GROUP BY meta_client_name
ORDER BY txs_seen DESC
"""

    df = client.query_df(query)
    return df, query
