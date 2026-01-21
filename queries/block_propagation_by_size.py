"""
Fetch functions for block propagation analysis by size.

Analyzes how block size affects propagation timing, comparing MEV vs local blocks.

Xatu captures both compressed and uncompressed block sizes:
- block_total_bytes: Uncompressed SSZ size
- block_total_bytes_compressed: Snappy-compressed size (wire size)
"""


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_block_propagation_by_size(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch block propagation data with size and MEV/local classification.

    Returns per-slot data including:
    - Block sizes (compressed and uncompressed)
    - Propagation timing (first seen, last seen, median)
    - Proposer entity
    - Builder type (MEV vs Local)

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH
-- Get MEV slot list (slots with relay payload delivery)
mev_slots AS (
    SELECT DISTINCT slot
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),

-- Block metadata (size, proposer)
block_meta AS (
    SELECT DISTINCT
        slot,
        block_root AS block,
        proposer_index,
        block_total_bytes,
        block_total_bytes_compressed
    FROM canonical_beacon_block FINAL
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),

-- Proposer entity mapping
proposer_entity AS (
    SELECT index, entity
    FROM ethseer_validator_entity FINAL
    WHERE meta_network_name = '{network}'
),

-- Propagation timing aggregated across all sentries
propagation AS (
    SELECT
        slot,
        block,
        min(propagation_slot_start_diff) AS first_seen_ms,
        max(propagation_slot_start_diff) AS last_seen_ms,
        quantile(0.5)(propagation_slot_start_diff) AS median_ms,
        count() AS sentry_count
    FROM libp2p_gossipsub_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
      AND propagation_slot_start_diff < 12000
    GROUP BY slot, block
)

SELECT
    p.slot AS slot,
    bm.block_total_bytes AS uncompressed_bytes,
    bm.block_total_bytes_compressed AS compressed_bytes,
    bm.proposer_index,
    coalesce(pe.entity, 'Unknown') AS proposer_entity,
    -- Use IN for reliable MEV detection on distributed tables
    if(p.slot GLOBAL IN mev_slots, 'MEV', 'Local') AS builder_type,
    p.first_seen_ms AS first_seen_ms,
    p.last_seen_ms AS last_seen_ms,
    p.median_ms AS median_ms,
    p.sentry_count AS sentry_count
FROM propagation p
GLOBAL LEFT JOIN block_meta bm ON p.slot = bm.slot AND p.block = bm.block
GLOBAL LEFT JOIN proposer_entity pe ON bm.proposer_index = pe.index
WHERE bm.block_total_bytes IS NOT NULL
ORDER BY p.slot
"""

    df = client.query_df(query)
    return df, query


def fetch_block_propagation_by_region(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch block propagation data broken down by sentry region.

    Returns per-slot-per-region data for analyzing geographic propagation patterns.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH
-- Get MEV slot list
mev_slots AS (
    SELECT DISTINCT slot
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),

-- Block metadata
block_meta AS (
    SELECT DISTINCT
        slot,
        block_root AS block,
        proposer_index,
        block_total_bytes,
        block_total_bytes_compressed
    FROM canonical_beacon_block FINAL
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),

-- Proposer entity mapping
proposer_entity AS (
    SELECT index, entity
    FROM ethseer_validator_entity FINAL
    WHERE meta_network_name = '{network}'
),

-- Propagation timing by sentry region
propagation_by_region AS (
    SELECT
        slot,
        block,
        meta_client_geo_continent_code AS region,
        min(propagation_slot_start_diff) AS first_seen_ms,
        max(propagation_slot_start_diff) AS last_seen_ms,
        quantile(0.5)(propagation_slot_start_diff) AS median_ms,
        count() AS sentry_count
    FROM libp2p_gossipsub_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
      AND propagation_slot_start_diff < 12000
      AND meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
    GROUP BY slot, block, region
)

SELECT
    pr.slot AS slot,
    pr.region AS region,
    bm.block_total_bytes AS uncompressed_bytes,
    bm.block_total_bytes_compressed AS compressed_bytes,
    bm.proposer_index AS proposer_index,
    coalesce(pe.entity, 'Unknown') AS proposer_entity,
    if(pr.slot GLOBAL IN mev_slots, 'MEV', 'Local') AS builder_type,
    pr.first_seen_ms AS first_seen_ms,
    pr.last_seen_ms AS last_seen_ms,
    pr.median_ms AS median_ms,
    pr.sentry_count AS sentry_count
FROM propagation_by_region pr
GLOBAL LEFT JOIN block_meta bm ON pr.slot = bm.slot AND pr.block = bm.block
GLOBAL LEFT JOIN proposer_entity pe ON bm.proposer_index = pe.index
WHERE bm.block_total_bytes IS NOT NULL
ORDER BY pr.slot, pr.region
"""

    df = client.query_df(query)
    return df, query
