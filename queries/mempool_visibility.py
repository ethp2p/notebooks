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


def fetch_mempool_availability(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch per-slot mempool availability with age percentiles and histograms.

    Categorizes transactions into:
    - seen_before_slot: Available in mempool before inclusion (public)
    - seen_after_slot: First appeared in mempool after block propagation
    - neither: Truly private (never seen in mempool)

    Returns per slot per tx type:
    - age/delay percentiles (p50, p75, p80, p85, p90, p95, p99)
    - age/delay histograms (log2 buckets in seconds)

    Histogram buckets (log2 seconds):
      0: <0.5s, 1: 0.5-1s, 2: 1-2s, 3: 2-4s, 4: 4-8s, 5: 8-16s,
      6: 16-32s, 7: 32-64s, 8: 64-128s, 9: 128-256s, 10: 256-512s, 11: >=512s

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    # Define reusable condition fragments
    seen_before = """
        m.first_event_time IS NOT NULL
        AND m.first_event_time > '2020-01-01'
        AND m.first_event_time < c.slot_start_date_time"""
    seen_after = """
        m.first_event_time IS NOT NULL
        AND m.first_event_time > '2020-01-01'
        AND m.first_event_time >= c.slot_start_date_time"""

    # Age = time from first seen to slot start (for seen_before)
    age_ms = "dateDiff('millisecond', m.first_event_time, c.slot_start_date_time)"
    # Delay = time from slot start to first seen (for seen_after)
    delay_ms = "dateDiff('millisecond', c.slot_start_date_time, m.first_event_time)"

    # Log2 bucket boundaries in milliseconds (up to 1 hour)
    # Buckets: <0.5s, 0.5-1s, 1-2s, 2-4s, 4-8s, 8-16s, 16-32s, 32-64s (32s-1m),
    #          64-128s (1-2m), 128-256s (2-4m), 256-512s (4-8m), 512-1024s (8-17m),
    #          1024-2048s (17-34m), 2048-3600s (34-60m), >=3600s (>=1h)
    bounds_ms = [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000, 1024000, 2048000, 3600000]

    # Generate histogram countIf expressions
    def hist_columns(value_expr: str, condition: str, prefix: str) -> str:
        cols = []
        # Bucket 0: < 0.5s
        cols.append(f"countIf({value_expr} < {bounds_ms[0]} AND {condition}) AS {prefix}_0")
        # Buckets 1-10: range buckets
        for i in range(len(bounds_ms) - 1):
            cols.append(
                f"countIf({value_expr} >= {bounds_ms[i]} AND {value_expr} < {bounds_ms[i+1]} AND {condition}) AS {prefix}_{i+1}"
            )
        # Bucket 11: >= 512s
        cols.append(f"countIf({value_expr} >= {bounds_ms[-1]} AND {condition}) AS {prefix}_{len(bounds_ms)}")
        return ",\n    ".join(cols)

    age_hist = hist_columns(age_ms, seen_before, "age_hist")
    delay_hist = hist_columns(delay_ms, seen_after, "delay_hist")

    query = f"""
WITH first_seen AS (
    SELECT
        hash,
        min(event_date_time) AS first_event_time
    FROM mempool_transaction
    WHERE meta_network_name = '{network}'
      AND event_date_time >= '{target_date}'::date - INTERVAL 1 DAY
      AND event_date_time < '{target_date}'::date + INTERVAL 2 DAY
    GROUP BY hash
)
SELECT
    c.slot,
    c.slot_start_date_time,
    c.type AS tx_type,
    count() AS total_txs,
    -- Seen BEFORE slot start (public, available for inclusion)
    countIf({seen_before}) AS seen_before_slot,
    -- Seen AFTER slot start (appeared after block propagation)
    countIf({seen_after}) AS seen_after_slot,
    -- Age percentiles for transactions seen BEFORE (how long in mempool)
    quantilesIf(0.50, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99)(
        {age_ms}, {seen_before}
    ) AS age_percentiles_ms,
    -- Delay percentiles for transactions seen AFTER (propagation delay)
    quantilesIf(0.50, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99)(
        {delay_ms}, {seen_after}
    ) AS delay_percentiles_ms,
    -- Age histogram (log2 buckets in seconds)
    {age_hist},
    -- Delay histogram (log2 buckets in seconds)
    {delay_hist}
FROM canonical_beacon_block_execution_transaction c
GLOBAL LEFT JOIN first_seen m ON c.hash = m.hash
WHERE c.meta_network_name = '{network}'
  AND {date_filter}
GROUP BY c.slot, c.slot_start_date_time, c.type
ORDER BY c.slot, c.type
"""

    df = client.query_df(query)
    return df, query


# Histogram bucket labels for visualization
AGE_HIST_LABELS = [
    "<0.5s", "0.5-1s", "1-2s", "2-4s", "4-8s", "8-16s",
    "16-32s", "32s-1m", "1-2m", "2-4m", "4-8m", "8-17m",
    "17-34m", "34-60m", ">=1h"
]
