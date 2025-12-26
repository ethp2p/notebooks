"""
Fetch functions for blob flow analysis.

Each function executes SQL and returns the DataFrame and query string.
"""

from pathlib import Path


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_blob_flow(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch proposer blobs with MEV relay data.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH blocks AS (
    SELECT
        slot,
        epoch,
        slot_start_date_time,
        proposer_index,
        block_root,
        meta_network_name
    FROM canonical_beacon_block
    WHERE
        meta_network_name = '{network}'
      AND {date_filter}
),
blobs AS (
    SELECT
        slot,
        block_root,
        count(DISTINCT blob_index) AS blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE
        meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot, block_root
),
mev AS (
    SELECT
        slot,
        -- Use max() for deterministic selection when multiple relays deliver same slot
        max(builder_pubkey) AS builder_pubkey,
        max(relay_name) AS relay_name
    FROM mev_relay_proposer_payload_delivered
    WHERE
        meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot
)
SELECT
    b.slot,
    b.epoch,
    b.slot_start_date_time,
    b.proposer_index,
    e.entity AS proposer_entity,
    coalesce(bl.blob_count, 0) AS blob_count,
    m.builder_pubkey AS winning_builder_pubkey,
    m.relay_name AS winning_relay
FROM blocks b
GLOBAL LEFT JOIN ethseer_validator_entity e
    ON b.proposer_index = e.index
    AND b.meta_network_name = e.meta_network_name
LEFT JOIN blobs bl
    ON b.slot = bl.slot AND b.block_root = bl.block_root
LEFT JOIN mev m
    ON b.slot = m.slot
ORDER BY b.slot DESC
"""

    df = client.query_df(query)
    return df, query
