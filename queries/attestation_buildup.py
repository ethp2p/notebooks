"""
Fetch functions for attestation buildup CDF analysis.

Tracks how attestations accumulate over slots after the attested slot.
Attestations for slot A can be included in blocks up to slot A+32.
"""

from pathlib import Path


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def fetch_attestation_buildup(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch attestation buildup CDF per slot.

    For each slot, shows cumulative attestation inclusion at each delay (1-32 slots).
    Includes blob count and block size (compressed) for correlation analysis.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    query = f"""
WITH attestation_counts AS (
    SELECT
        slot,
        epoch,
        slot_start_date_time,
        block_slot - slot AS inclusion_delay,
        sum(length(validators)) AS validators_at_delay
    FROM default.canonical_beacon_elaborated_attestation
    WHERE meta_network_name = '{network}'
      AND {date_filter}
      AND block_slot - slot BETWEEN 1 AND 32
    GROUP BY slot, epoch, slot_start_date_time, block_slot - slot
),

running_totals AS (
    SELECT
        slot,
        epoch,
        slot_start_date_time,
        inclusion_delay,
        validators_at_delay,
        sum(validators_at_delay) OVER (PARTITION BY slot ORDER BY inclusion_delay) AS cumulative_validators,
        sum(validators_at_delay) OVER (PARTITION BY slot) AS total_validators
    FROM attestation_counts
),

blobs AS (
    SELECT
        slot,
        count(DISTINCT blob_index) AS blob_count
    FROM default.canonical_beacon_blob_sidecar
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot
),

block_sizes AS (
    SELECT
        slot,
        min(message_size) AS block_size_bytes,
        min(propagation_slot_start_diff) AS block_first_seen_ms
    FROM default.libp2p_gossipsub_beacon_block
    WHERE meta_network_name = '{network}'
      AND {date_filter}
    GROUP BY slot
)

SELECT
    r.slot AS slot,
    r.epoch AS epoch,
    r.slot_start_date_time AS time,
    r.inclusion_delay AS inclusion_delay,
    r.validators_at_delay AS validators_at_delay,
    r.cumulative_validators AS cumulative_validators,
    r.total_validators AS total_validators,
    round(r.cumulative_validators * 100.0 / r.total_validators, 4) AS cumulative_pct,
    coalesce(b.blob_count, 0) AS blob_count,
    coalesce(bs.block_size_bytes, 0) AS block_size_bytes,
    coalesce(bs.block_first_seen_ms, 0) AS block_first_seen_ms
FROM running_totals r
LEFT JOIN blobs b ON r.slot = b.slot
LEFT JOIN block_sizes bs ON r.slot = bs.slot
ORDER BY r.slot, r.inclusion_delay
"""

    df = client.query_df(query)
    return df, query
