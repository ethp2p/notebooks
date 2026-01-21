"""
Fetch functions for block propagation analysis from Contributoor database.

Contributoor collects beacon API events from community-run nodes (~875 nodes,
primarily data centers) - different from Sentries which use libp2p gossipsub.
"""


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_block_propagation_by_region_contributoor(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch regional propagation from Contributoor nodes with MEV and size.

    Returns same column structure as fetch_block_propagation_by_region (Sentries)
    for consistent downstream processing in notebooks.

    Note: Contributoor doesn't have proposer_entity mapping available,
    so we omit proposer_index and proposer_entity columns.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH
-- MEV slots (slots with relay payload delivery)
mev_slots AS (
    SELECT DISTINCT slot
    FROM {network}.fct_block_mev
    WHERE {date_filter}
),

-- Block metadata (size)
block_meta AS (
    SELECT
        slot,
        block_root,
        block_total_bytes,
        block_total_bytes_compressed
    FROM {network}.int_block_canonical
    WHERE {date_filter}
),

-- Regional propagation timing
propagation AS (
    SELECT
        slot,
        block_root,
        meta_client_geo_continent_code AS region,
        min(seen_slot_start_diff) AS first_seen_ms,
        max(seen_slot_start_diff) AS last_seen_ms,
        quantile(0.5)(seen_slot_start_diff) AS median_ms,
        count() AS node_count
    FROM {network}.fct_block_first_seen_by_node
    WHERE {date_filter}
      AND seen_slot_start_diff < 12000
      AND meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
    GROUP BY slot, block_root, region
)

SELECT
    p.slot AS slot,
    p.region AS region,
    bm.block_total_bytes AS uncompressed_bytes,
    bm.block_total_bytes_compressed AS compressed_bytes,
    -- Match Sentries column naming for consistency
    if(p.slot IN mev_slots, 'MEV', 'Local') AS builder_type,
    p.first_seen_ms AS first_seen_ms,
    p.last_seen_ms AS last_seen_ms,
    p.median_ms AS median_ms,
    p.node_count AS sentry_count
FROM propagation p
LEFT JOIN block_meta bm ON p.slot = bm.slot AND p.block_root = bm.block_root
WHERE bm.block_total_bytes IS NOT NULL
ORDER BY p.slot, p.region
"""
    df = client.query_df(query)
    return df, query
