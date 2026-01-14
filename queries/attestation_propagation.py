"""
Fetch functions for attestation arrival latency analysis.

Each function executes SQL and returns the DataFrame and query string.
"""


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_attestation_propagation(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch attestation arrival latency data aggregated by hour.

    Returns per-hour percentiles (p50, p75, p80, p85, p90, p95, p99) of
    attestation arrival times across all committees (subnets).

    Uses hourly aggregation for efficient processing of massive attestation data.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    toStartOfHour(slot_start_date_time) AS hour,
    COUNT(*) AS attestation_count,
    uniqExact(slot) AS slot_count,

    -- Arrival time percentiles (using propagation_slot_start_diff directly)
    quantile(0.50)(propagation_slot_start_diff) AS p50_ms,
    quantile(0.75)(propagation_slot_start_diff) AS p75_ms,
    quantile(0.80)(propagation_slot_start_diff) AS p80_ms,
    quantile(0.85)(propagation_slot_start_diff) AS p85_ms,
    quantile(0.90)(propagation_slot_start_diff) AS p90_ms,
    quantile(0.95)(propagation_slot_start_diff) AS p95_ms,
    quantile(0.99)(propagation_slot_start_diff) AS p99_ms,

    -- Distribution stats
    AVG(propagation_slot_start_diff) AS avg_ms,
    stddevSamp(propagation_slot_start_diff) AS std_ms,
    MIN(propagation_slot_start_diff) AS min_ms,
    MAX(propagation_slot_start_diff) AS max_ms

FROM libp2p_gossipsub_beacon_attestation
WHERE {date_filter}
  AND meta_network_name = '{network}'
  AND startsWith(meta_client_name, 'ethpandaops/{network}/')
GROUP BY hour
ORDER BY hour
"""

    df = client.query_df(query)
    return df, query


def fetch_attestation_by_committee(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch attestation arrival latency summarized by committee (subnet).

    Returns per-committee percentiles for the entire day, useful for
    identifying slow or problematic subnets.

    Uses 10% sampling to handle the massive attestation data volume efficiently.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    attesting_validator_committee_index AS committee,
    COUNT(*) AS attestation_count,
    uniqExact(slot) AS slot_count,

    -- Arrival time percentiles
    quantile(0.50)(propagation_slot_start_diff) AS p50_ms,
    quantile(0.75)(propagation_slot_start_diff) AS p75_ms,
    quantile(0.90)(propagation_slot_start_diff) AS p90_ms,
    quantile(0.95)(propagation_slot_start_diff) AS p95_ms,
    quantile(0.99)(propagation_slot_start_diff) AS p99_ms,

    -- Stats for comparison
    AVG(propagation_slot_start_diff) AS avg_ms,
    MAX(propagation_slot_start_diff) AS max_ms

FROM libp2p_gossipsub_beacon_attestation
WHERE {date_filter}
  AND meta_network_name = '{network}'
  AND startsWith(meta_client_name, 'ethpandaops/{network}/')
  AND attesting_validator_committee_index != ''
GROUP BY attesting_validator_committee_index
ORDER BY toInt32OrNull(attesting_validator_committee_index)
"""

    df = client.query_df(query)
    return df, query
