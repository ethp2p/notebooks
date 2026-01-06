"""
Fetch functions for block production timeline analysis.

Each function executes SQL and returns the DataFrame and query string.
"""


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_block_production_timeline(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch block production timeline data from MEV bidding to column arrival.

    Includes:
    - MEV bid timing (first/last bid, winning bid)
    - Block gossip timing (first/last seen)
    - Column arrival timing (first/last column first-seen)

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)
    event_date_filter = _get_date_filter(target_date, "event_date_time")

    query = f"""
WITH
-- Base slots using proposer duty as the source of truth
slots AS (
    SELECT DISTINCT
        slot,
        slot_start_date_time,
        proposer_validator_index
    FROM canonical_beacon_proposer_duty
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),

-- Proposer entity mapping
proposer_entity AS (
    SELECT
        index,
        entity
    FROM ethseer_validator_entity
    WHERE meta_network_name = '{network}'
),

-- Blob count per slot
blob_count AS (
    SELECT
        slot,
        uniq(blob_index) AS blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot
),

-- Canonical block hash (to verify MEV payload was actually used)
canonical_block AS (
    SELECT
        slot,
        execution_payload_block_hash
    FROM canonical_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),

-- MEV bid timing using timestamp_ms
mev_bids AS (
    SELECT
        slot,
        slot_start_date_time,
        min(timestamp_ms) AS first_bid_timestamp_ms,
        max(timestamp_ms) AS last_bid_timestamp_ms
    FROM mev_relay_bid_trace
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot, slot_start_date_time
),

-- MEV payload delivery - join canonical block with delivered payloads
-- Note: Use is_mev flag because ClickHouse LEFT JOIN returns 0 (not NULL) for non-matching rows
-- Get value from proposer_payload_delivered (not bid_trace, which may not have the winning block)
mev_payload AS (
    SELECT
        cb.slot,
        cb.execution_payload_block_hash AS winning_block_hash,
        1 AS is_mev,
        max(pd.value) AS winning_bid_value,
        groupArray(DISTINCT pd.relay_name) AS relay_names,
        any(pd.builder_pubkey) AS winning_builder
    FROM canonical_block cb
    GLOBAL INNER JOIN mev_relay_proposer_payload_delivered pd
        ON cb.slot = pd.slot AND cb.execution_payload_block_hash = pd.block_hash
    WHERE pd.meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY cb.slot, cb.execution_payload_block_hash
),

-- Winning bid timing from bid_trace (may not exist for all MEV blocks)
winning_bid AS (
    SELECT
        bt.slot,
        bt.slot_start_date_time,
        argMin(bt.timestamp_ms, bt.event_date_time) AS winning_bid_timestamp_ms
    FROM mev_relay_bid_trace bt
    GLOBAL INNER JOIN mev_payload mp ON bt.slot = mp.slot AND bt.block_hash = mp.winning_block_hash
    WHERE bt.meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY bt.slot, bt.slot_start_date_time
),

-- Block gossip timing with spread
block_gossip AS (
    SELECT
        slot,
        min(event_date_time) AS block_first_seen,
        max(event_date_time) AS block_last_seen
    FROM libp2p_gossipsub_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot
),

-- Column arrival timing: first arrival per column, then min/max of those
column_gossip AS (
    SELECT
        slot,
        min(first_seen) AS first_column_first_seen,
        max(first_seen) AS last_column_first_seen
    FROM (
        SELECT
            slot,
            column_index,
            min(event_date_time) AS first_seen
        FROM libp2p_gossipsub_data_column_sidecar
        WHERE meta_network_name = '{network}'
          AND {date_filter}
          AND event_date_time > '1970-01-01 00:00:01'
        GROUP BY slot, column_index
    )
    GROUP BY slot
)

SELECT
    s.slot AS slot,
    s.slot_start_date_time AS slot_start_date_time,
    pe.entity AS proposer_entity,

    -- Blob count
    coalesce(bc.blob_count, 0) AS blob_count,

    -- MEV bid timing (absolute and relative to slot start)
    fromUnixTimestamp64Milli(mb.first_bid_timestamp_ms) AS first_bid_at,
    mb.first_bid_timestamp_ms - toInt64(toUnixTimestamp(mb.slot_start_date_time)) * 1000 AS first_bid_ms,
    fromUnixTimestamp64Milli(mb.last_bid_timestamp_ms) AS last_bid_at,
    mb.last_bid_timestamp_ms - toInt64(toUnixTimestamp(mb.slot_start_date_time)) * 1000 AS last_bid_ms,

    -- Winning bid timing (from bid_trace, may be NULL if block hash not in bid_trace)
    if(wb.slot != 0, fromUnixTimestamp64Milli(wb.winning_bid_timestamp_ms), NULL) AS winning_bid_at,
    if(wb.slot != 0, wb.winning_bid_timestamp_ms - toInt64(toUnixTimestamp(s.slot_start_date_time)) * 1000, NULL) AS winning_bid_ms,

    -- MEV payload info (from proposer_payload_delivered, always present for MEV blocks)
    if(mp.is_mev = 1, mp.winning_bid_value, NULL) AS winning_bid_value,
    if(mp.is_mev = 1, mp.relay_names, []) AS winning_relays,
    if(mp.is_mev = 1, mp.winning_builder, NULL) AS winning_builder,

    -- Block gossip timing with spread
    bg.block_first_seen,
    dateDiff('millisecond', s.slot_start_date_time, bg.block_first_seen) AS block_first_seen_ms,
    bg.block_last_seen,
    dateDiff('millisecond', s.slot_start_date_time, bg.block_last_seen) AS block_last_seen_ms,
    dateDiff('millisecond', bg.block_first_seen, bg.block_last_seen) AS block_spread_ms,

    -- Column arrival timing (NULL when no blobs)
    if(coalesce(bc.blob_count, 0) = 0, NULL, cg.first_column_first_seen) AS first_column_first_seen,
    if(coalesce(bc.blob_count, 0) = 0, NULL, dateDiff('millisecond', s.slot_start_date_time, cg.first_column_first_seen)) AS first_column_first_seen_ms,
    if(coalesce(bc.blob_count, 0) = 0, NULL, cg.last_column_first_seen) AS last_column_first_seen,
    if(coalesce(bc.blob_count, 0) = 0, NULL, dateDiff('millisecond', s.slot_start_date_time, cg.last_column_first_seen)) AS last_column_first_seen_ms,
    if(coalesce(bc.blob_count, 0) = 0, NULL, dateDiff('millisecond', cg.first_column_first_seen, cg.last_column_first_seen)) AS column_spread_ms

FROM slots s
GLOBAL LEFT JOIN proposer_entity pe ON s.proposer_validator_index = pe.index
GLOBAL LEFT JOIN blob_count bc ON s.slot = bc.slot
GLOBAL LEFT JOIN mev_bids mb ON s.slot = mb.slot
GLOBAL LEFT JOIN mev_payload mp ON s.slot = mp.slot
GLOBAL LEFT JOIN winning_bid wb ON s.slot = wb.slot
GLOBAL LEFT JOIN block_gossip bg ON s.slot = bg.slot
GLOBAL LEFT JOIN column_gossip cg ON s.slot = cg.slot

ORDER BY s.slot DESC
"""

    df = client.query_df(query)
    return df, query
