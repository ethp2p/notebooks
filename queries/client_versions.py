"""
Fetch functions for client versions analysis.

Each function executes SQL and writes directly to Parquet.
"""

from pathlib import Path


def _get_date_filter(target_date: str, column: str = "event_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_client_versions(
    client,
    target_date: str,
    output_path: Path,
    network: str = "mainnet",
) -> int:
    """Fetch client versions data from libp2p_connected and write to Parquet.

    This captures the clients and versions connected to xatu nodes.

    Returns row count.
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    meta_client_name AS node_name,
    meta_client_geo_country AS node_country,
    meta_client_version AS node_client_version,
    meta_client_implementation AS node_client_implementation,
    meta_client_id AS node_client_id,
    remote_agent_implementation,
    remote_agent_version,
    remote_agent_version_major,
    remote_agent_version_minor,
    remote_agent_version_patch,
    event_date_time,
    remote_peer_id_unique_key AS remote_peer_id
FROM default.libp2p_connected FINAL
WHERE {date_filter}
  AND meta_network_name = '{network}'
"""

    df = client.query_df(query)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    return len(df)

