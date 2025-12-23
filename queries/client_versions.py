"""
Fetch functions for client versions analysis.

Each function executes SQL and writes directly to Parquet.
Aggregation is pushed to ClickHouse for efficiency.
"""

from pathlib import Path

# Known consensus clients to track individually (others grouped as "Others")
KNOWN_CLIENTS_SQL = """
CASE
    WHEN lower(remote_agent_implementation) IN (
        'lighthouse', 'teku', 'nimbus', 'erigon', 'grandine', 'lodestar', 'prysm'
    ) THEN remote_agent_implementation
    WHEN remote_agent_implementation IS NULL
      OR remote_agent_implementation = ''
      OR remote_agent_implementation = 'unknown'
    THEN 'unknown'
    ELSE 'Others'
END
""".strip()


def _get_date_filter(target_date: str, column: str = "event_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_client_hourly(
    client,
    target_date: str,
    output_path: Path,
    network: str = "mainnet",
) -> int:
    """Fetch hourly connection counts by client implementation.

    Used for time series visualization and deriving total counts.

    Returns row count.
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    toStartOfHour(event_date_time) AS hour,
    {KNOWN_CLIENTS_SQL} AS client,
    count() AS connections
FROM default.libp2p_connected FINAL
WHERE {date_filter}
  AND meta_network_name = '{network}'
GROUP BY hour, client
ORDER BY hour, client
"""

    df = client.query_df(query)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    return len(df)


def fetch_client_version_dist(
    client,
    target_date: str,
    output_path: Path,
    network: str = "mainnet",
) -> int:
    """Fetch version distribution per client.

    Returns top versions per client with connection counts.
    Used for version distribution bar charts.

    Returns row count.
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    client,
    version,
    connections
FROM (
    SELECT
        {KNOWN_CLIENTS_SQL} AS client,
        coalesce(remote_agent_version, 'unknown') AS version,
        count() AS connections,
        row_number() OVER (PARTITION BY client ORDER BY count() DESC) AS rn
    FROM default.libp2p_connected FINAL
    WHERE {date_filter}
      AND meta_network_name = '{network}'
    GROUP BY client, version
)
WHERE rn <= 15
ORDER BY client, connections DESC
"""

    df = client.query_df(query)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    return len(df)


def fetch_client_summary(
    client,
    target_date: str,
    output_path: Path,
    network: str = "mainnet",
) -> int:
    """Fetch summary statistics per client.

    Includes unique peer counts (properly deduplicated per client).
    Used for summary table.

    Returns row count.
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    {KNOWN_CLIENTS_SQL} AS client,
    count() AS connections,
    uniqExact(remote_peer_id_unique_key) AS unique_peers,
    count(DISTINCT coalesce(remote_agent_version, 'unknown')) AS version_count,
    argMax(coalesce(remote_agent_version, 'unknown'), cnt) AS top_version
FROM (
    SELECT
        remote_agent_implementation,
        remote_agent_version,
        remote_peer_id_unique_key,
        count() OVER (
            PARTITION BY
                {KNOWN_CLIENTS_SQL},
                coalesce(remote_agent_version, 'unknown')
        ) AS cnt
    FROM default.libp2p_connected FINAL
    WHERE {date_filter}
      AND meta_network_name = '{network}'
)
GROUP BY client
ORDER BY connections DESC
"""

    df = client.query_df(query)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    return len(df)
