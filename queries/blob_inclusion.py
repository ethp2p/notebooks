"""
Fetch functions for blob inclusion analysis.

Each function executes SQL and returns the DataFrame and query string.
"""

from pathlib import Path


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_blobs_per_slot(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch blobs per slot data.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
SELECT
    s.slot,
    s.slot_start_date_time AS time,
    COALESCE(b.blob_count, 0) AS blob_count
FROM (
    SELECT DISTINCT slot, slot_start_date_time
    FROM default.canonical_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
) s
LEFT JOIN (
    SELECT
        slot,
        COUNT(*) AS blob_count
    FROM default.canonical_beacon_blob_sidecar
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot
) b ON s.slot = b.slot
ORDER BY s.slot ASC
"""

    df = client.query_df(query)
    return df, query


def fetch_blocks_blob_epoch(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch block counts by blob count per epoch.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH blob_counts_per_slot AS (
    SELECT
        slot,
        epoch,
        epoch_start_date_time,
        slot_start_date_time,
        toUInt64(max(blob_index) + 1) as blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot, epoch, epoch_start_date_time, slot_start_date_time
),
blocks_per_epoch AS (
    SELECT
        epoch,
        epoch_start_date_time,
        toUInt64(COUNT(*)) as total_blocks
    FROM canonical_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY epoch, epoch_start_date_time
),
epochs AS (
    SELECT DISTINCT epoch, epoch_start_date_time
    FROM blocks_per_epoch
),
all_blob_counts AS (
    SELECT arrayJoin(range(toUInt64(0), toUInt64(max(blob_count) + 1))) AS blob_count
    FROM blob_counts_per_slot
),
all_combinations AS (
    SELECT
        e.epoch,
        e.epoch_start_date_time,
        b.blob_count
    FROM epochs e
    CROSS JOIN all_blob_counts b
),
block_per_blob_count_per_epoch AS (
    SELECT
        epoch,
        epoch_start_date_time,
        blob_count,
        toUInt64(COUNT(*)) as block_count
    FROM blob_counts_per_slot
    GROUP BY epoch, epoch_start_date_time, blob_count
),
blocks_with_blobs_per_epoch AS (
    SELECT
        epoch,
        toUInt64(COUNT(*)) as blocks_with_blobs
    FROM blob_counts_per_slot
    GROUP BY epoch
)
SELECT
    a.epoch,
    a.epoch_start_date_time AS time,
    a.blob_count,
    CASE
        WHEN a.blob_count = 0 THEN
            toInt64(COALESCE(blk.total_blocks, toUInt64(0))) - toInt64(COALESCE(wb.blocks_with_blobs, toUInt64(0)))
        ELSE
            toInt64(COALESCE(b.block_count, toUInt64(0)))
    END as block_count
FROM all_combinations a
GLOBAL LEFT JOIN block_per_blob_count_per_epoch b
    ON a.epoch = b.epoch AND a.blob_count = b.blob_count
GLOBAL LEFT JOIN blocks_per_epoch blk
    ON a.epoch = blk.epoch
GLOBAL LEFT JOIN blocks_with_blobs_per_epoch wb
    ON a.epoch = wb.epoch
ORDER BY a.epoch ASC, a.blob_count ASC
"""

    df = client.query_df(query)
    return df, query


def fetch_blob_popularity(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch blob count popularity per epoch.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH blob_counts_per_slot AS (
    SELECT
        slot_start_date_time,
        epoch_start_date_time,
        toUInt64(max(blob_index) + 1) as blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot, slot_start_date_time, epoch_start_date_time
),
blocks AS (
    SELECT
        epoch,
        slot_start_date_time,
        epoch_start_date_time
    FROM canonical_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),
blocks_with_blob_count AS (
    SELECT
        b.epoch,
        b.epoch_start_date_time as time,
        COALESCE(bc.blob_count, toUInt64(0)) as blob_count
    FROM blocks b
    GLOBAL LEFT JOIN blob_counts_per_slot bc ON b.slot_start_date_time = bc.slot_start_date_time
)
SELECT
    epoch,
    time,
    blob_count,
    COUNT(*) as count
FROM blocks_with_blob_count
GROUP BY epoch, time, blob_count
ORDER BY epoch ASC, blob_count ASC
"""

    df = client.query_df(query)
    return df, query


def fetch_slot_in_epoch(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch blob count per slot within epoch.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH blob_counts_per_slot AS (
    SELECT
        slot,
        epoch,
        epoch_start_date_time,
        toUInt64(max(blob_index) + 1) as blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot, epoch, epoch_start_date_time
),
blocks AS (
    SELECT
        slot,
        epoch,
        epoch_start_date_time
    FROM canonical_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
),
blocks_with_blob_count AS (
    SELECT
        b.slot,
        b.epoch,
        b.epoch_start_date_time,
        b.slot - (b.epoch * 32) as slot_in_epoch,
        COALESCE(bc.blob_count, toUInt64(0)) as blob_count
    FROM blocks b
    GLOBAL LEFT JOIN blob_counts_per_slot bc
        ON b.slot = bc.slot AND b.epoch = bc.epoch
)
SELECT
    slot,
    epoch,
    epoch_start_date_time as time,
    slot_in_epoch,
    blob_count
FROM blocks_with_blob_count
ORDER BY epoch ASC, slot_in_epoch ASC
"""

    df = client.query_df(query)
    return df, query
