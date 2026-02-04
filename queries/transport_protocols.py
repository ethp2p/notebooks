"""Fetch functions for transport protocol (QUIC vs TCP) analysis.

Queries the libp2p_connected table from Xatu sentries to analyze
transport protocol distribution across the Ethereum P2P network.
"""

from __future__ import annotations


def _get_lookback_filter(target_date: str, days: int = 7) -> str:
    """Generate SQL filter for N days ending on target_date (inclusive)."""
    return (
        f"event_date_time >= '{target_date}'::date - INTERVAL {days - 1} DAY "
        f"AND event_date_time < '{target_date}'::date + INTERVAL 1 DAY"
    )


def fetch_transport_overall(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch overall transport protocol distribution.

    Returns 7-day rolling stats as of target_date.
    """
    date_filter = _get_lookback_filter(target_date, days=7)

    query = f"""
SELECT
    remote_transport_protocol as transport,
    count(*) as connections,
    round(count(*) * 100.0 / sum(count(*)) OVER (), 2) as percentage
FROM default.libp2p_connected
WHERE meta_network_name = '{network}'
  AND {date_filter}
GROUP BY remote_transport_protocol
ORDER BY connections DESC
"""

    df = client.query_df(query)
    return df, query


def fetch_transport_daily(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch daily transport protocol breakdown.

    Returns daily stats for 7 days ending on target_date.
    """
    date_filter = _get_lookback_filter(target_date, days=7)

    query = f"""
SELECT
    toDate(event_date_time) as date,
    remote_transport_protocol as transport,
    count(*) as connections,
    uniqExact(remote_peer_id_unique_key) as unique_peers
FROM default.libp2p_connected
WHERE meta_network_name = '{network}'
  AND {date_filter}
GROUP BY date, transport
ORDER BY date, transport
"""

    df = client.query_df(query)
    return df, query


def fetch_transport_peers(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch unique peer breakdown by transport protocol capability.

    Categorizes peers as TCP-only, QUIC-only, or supporting both.
    """
    date_filter = _get_lookback_filter(target_date, days=7)

    query = f"""
WITH peer_protocols AS (
    SELECT
        remote_peer_id_unique_key,
        groupUniqArray(remote_transport_protocol) as protocols
    FROM default.libp2p_connected
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY remote_peer_id_unique_key
)
SELECT
    countIf(has(protocols, 'tcp') AND NOT has(protocols, 'udp')) as tcp_only,
    countIf(has(protocols, 'udp') AND NOT has(protocols, 'tcp')) as quic_only,
    countIf(has(protocols, 'tcp') AND has(protocols, 'udp')) as both,
    count(*) as total
FROM peer_protocols
"""

    df = client.query_df(query)
    return df, query


def fetch_transport_by_client(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch transport protocol breakdown by client implementation.

    Shows QUIC adoption rates per consensus client.
    """
    date_filter = _get_lookback_filter(target_date, days=7)

    query = f"""
WITH peer_protocols AS (
    SELECT
        remote_agent_implementation as client,
        remote_peer_id_unique_key,
        groupUniqArray(remote_transport_protocol) as protocols
    FROM default.libp2p_connected
    WHERE meta_network_name = '{network}'
      AND {date_filter}
      AND remote_agent_implementation NOT IN ('', 'unknown')
    GROUP BY client, remote_peer_id_unique_key
)
SELECT
    client,
    countIf(has(protocols, 'tcp') AND NOT has(protocols, 'udp')) as tcp_only,
    countIf(has(protocols, 'udp') AND NOT has(protocols, 'tcp')) as quic_only,
    countIf(has(protocols, 'tcp') AND has(protocols, 'udp')) as both,
    count(*) as total,
    round(countIf(has(protocols, 'udp')) * 100.0 / count(*), 1) as quic_capable_pct
FROM peer_protocols
GROUP BY client
HAVING total > 30
ORDER BY total DESC
"""

    df = client.query_df(query)
    return df, query


def fetch_transport_connection_patterns(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch connection frequency patterns by transport protocol."""
    date_filter = _get_lookback_filter(target_date, days=7)

    query = f"""
SELECT
    remote_transport_protocol as transport,
    count(*) as total_connections,
    uniqExact(remote_peer_id_unique_key) as unique_peers,
    round(count(*) / uniqExact(remote_peer_id_unique_key), 1) as connections_per_peer
FROM default.libp2p_connected
WHERE meta_network_name = '{network}'
  AND {date_filter}
GROUP BY transport
ORDER BY transport
"""

    df = client.query_df(query)
    return df, query
