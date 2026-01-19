"""
Fetch functions for network overview analysis.

Analyzes overall network connectivity using Xatu sentry node observations.
"""


def _get_date_filter(target_date: str, column: str = "event_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_xatu_client_connectivity(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch peer connectivity data from Xatu sentry nodes.

    Uses libp2p_connected_local to capture all peers connected to Xatu nodes,
    including their client type, transport protocol, and geographic location.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    toStartOfInterval(event_date_time, INTERVAL 1 hour) AS hour_bucket,
    remote_peer_id_unique_key AS peer_id,
    remote_protocol AS protocol,
    remote_transport_protocol AS transport_protocol,
    remote_port AS port,
    remote_agent_implementation AS client_name,
    meta_client_name AS local_name,
    remote_geo_country_code AS geo_country_code
FROM libp2p_connected_local
WHERE meta_network_name = '{network}'
  AND {date_filter}
ORDER BY hour_bucket ASC
"""

    df = client.query_df(query)
    return df, query
