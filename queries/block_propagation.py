"""
Fetch functions for block propagation latency analysis.

Each function executes SQL and returns the DataFrame and query string.
"""


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_block_propagation(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch block propagation latency data aggregated by epoch.

    Returns per-epoch percentiles (p50, p75, p80, p85, p90, p95, p99) of block
    arrival times, plus spread metrics (max-min across sentry nodes per slot).

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH first_seen_per_node AS (
    -- Get first observation of each block per sentry node
    SELECT
        slot,
        slot_start_date_time,
        epoch,
        meta_client_name AS node_name,
        MIN(propagation_slot_start_diff) AS arrival_ms
    FROM libp2p_gossipsub_beacon_block FINAL
    WHERE {date_filter}
      AND meta_network_name = '{network}'
      AND startsWith(meta_client_name, 'ethpandaops/{network}/')
    GROUP BY slot, slot_start_date_time, epoch, meta_client_name
),
slot_stats AS (
    -- Per-slot: first arrival (fastest node) and spread (slowest - fastest)
    SELECT
        slot,
        slot_start_date_time,
        epoch,
        MIN(arrival_ms) AS first_arrival_ms,
        MAX(arrival_ms) AS last_arrival_ms,
        MAX(arrival_ms) - MIN(arrival_ms) AS spread_ms,
        COUNT(DISTINCT node_name) AS node_count
    FROM first_seen_per_node
    GROUP BY slot, slot_start_date_time, epoch
)
SELECT
    epoch,
    MIN(slot_start_date_time) AS epoch_start,
    COUNT(*) AS slot_count,
    AVG(node_count) AS avg_nodes,

    -- Arrival time percentiles (time from slot start to first observation)
    quantile(0.50)(first_arrival_ms) AS p50_ms,
    quantile(0.75)(first_arrival_ms) AS p75_ms,
    quantile(0.80)(first_arrival_ms) AS p80_ms,
    quantile(0.85)(first_arrival_ms) AS p85_ms,
    quantile(0.90)(first_arrival_ms) AS p90_ms,
    quantile(0.95)(first_arrival_ms) AS p95_ms,
    quantile(0.99)(first_arrival_ms) AS p99_ms,

    -- Spread percentiles (time for all nodes to see the block)
    quantile(0.50)(spread_ms) AS spread_p50_ms,
    quantile(0.75)(spread_ms) AS spread_p75_ms,
    quantile(0.90)(spread_ms) AS spread_p90_ms,
    quantile(0.95)(spread_ms) AS spread_p95_ms,
    quantile(0.99)(spread_ms) AS spread_p99_ms,

    -- Tail analysis
    MAX(first_arrival_ms) AS max_arrival_ms,
    MAX(spread_ms) AS max_spread_ms

FROM slot_stats
GROUP BY epoch
ORDER BY epoch
"""

    df = client.query_df(query)
    return df, query
