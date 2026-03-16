"""
Fetch functions for attestation buildup CDF analysis.

Tracks how attestations accumulate over slots after the attested slot.
Attestations for slot A can be included in blocks up to slot A+32.
"""

from pathlib import Path
import pandas as pd


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def _manual_date_filter(
    target_date: str,
    base_h: int = 0,
    h_interval: int = 1,
    column: str = "slot_start_date_time",
) -> str:

    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' + INTERVAL {base_h} hour AND {column} < '{target_date}'::date + INTERVAL {base_h+h_interval} hour"



def fetch_attestation_arrivals(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch attestation arrivals from all the exisisting .

    Returns (df, query).
    """
    query=""
    df = []
    hour_interval = 1
    first_seen_interval = 0.1  # s
    p50_seen_interval = 0.1  # s
    for base_h in range(0, 24, hour_interval):
        date_filter = _manual_date_filter(
            target_date,
            base_h=14,
            h_interval=1,
        )

        query = f"""
        WITH
            attestation_arrivals as (
                SELECT
                    slot,
                    attesting_validator_index as val_idx,
                    committee_index as com_idx,
                    min(slot_start_date_time) as slot_start_time,
                    min(event_date_time) as att_first_seen,
                    min(event_date_time) - min(slot_start_date_time) as att_first_seen_wb,
                    quantiles(0.50)(event_date_time)[1] - min(event_date_time) AS att_broadcast_p50,
                    quantiles(0.90)(event_date_time)[1] - min(event_date_time) AS att_broadcast_p90,
                    quantiles(0.95)(event_date_time)[1] - min(event_date_time) AS att_broadcast_p95
                FROM beacon_api_eth_v1_events_attestation
                PREWHERE {date_filter}
                WHERE meta_network_name = '{network}'
                GROUP BY slot, com_idx, val_idx
                ORDER BY slot, com_idx, val_idx
            ),
            attestation_inclusion AS (
                SELECT
                    slot,
                    block_slot,
                    block_slot_start_date_time,
                    arrayJoin(validators) AS val_idx,
                    block_slot - slot AS inclusion_delay
                FROM canonical_beacon_elaborated_attestation
                PREWHERE {date_filter}
                WHERE meta_network_name = '{network}'
            )
        SELECT
            a.slot,
            ai.block_slot,
            a.val_idx,
            a.com_idx,
            a.slot_start_time,
            ai.block_slot_start_date_time,
            a.att_first_seen,
            a.att_first_seen_wb,
            a.att_broadcast_p50,
            a.att_broadcast_p90,
            a.att_broadcast_p95,
            ai.inclusion_delay,
            floor(a.att_first_seen_wb / {first_seen_interval}) * {first_seen_interval} AS latency_bucket,
            floor((a.att_broadcast_p50 + a.att_first_seen_wb) / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p50_bucket_wfs,
            floor((a.att_broadcast_p90 + a.att_first_seen_wb) / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p90_bucket_wfs,
            floor(a.att_broadcast_p50 / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p50_bucket,
            floor(a.att_broadcast_p90 / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p90_bucket,
            CASE
                WHEN a.att_broadcast_p50 = 0 THEN '0'
                WHEN a.att_broadcast_p50 < 0.150 THEN '0.150'
                WHEN a.att_broadcast_p50 <= 0.300 THEN '0.300'
                WHEN a.att_broadcast_p50 <= 0.500 THEN '0.500'
                WHEN a.att_broadcast_p50 <= 0.750 THEN '0.750'
                WHEN a.att_broadcast_p50 <= 1 THEN '1'
                WHEN a.att_broadcast_p50 <= 1.5 THEN '1.5'
                WHEN a.att_broadcast_p50 <= 2 THEN '2'
                ELSE '+2'
            END AS broadcast_p50_bucket_g,
            CASE
                WHEN a.att_broadcast_p90 = 0 THEN '0'
                WHEN a.att_broadcast_p90 < 0.150 THEN '0.150'
                WHEN a.att_broadcast_p90 <= 0.300 THEN '0.300'
                WHEN a.att_broadcast_p90 <= 0.500 THEN '0.500'
                WHEN a.att_broadcast_p90 <= 0.750 THEN '0.750'
                WHEN a.att_broadcast_p90 <= 1 THEN '1'
                WHEN a.att_broadcast_p90 <= 1.5 THEN '1.5'
                WHEN a.att_broadcast_p90 <= 2 THEN '2'
                ELSE '+2'
            END AS broadcast_p90_bucket_g,
            CASE
                WHEN a.att_broadcast_p95 = 0 THEN '0'
                WHEN a.att_broadcast_p95 < 0.150 THEN '0.150'
                WHEN a.att_broadcast_p95 <= 0.300 THEN '0.300'
                WHEN a.att_broadcast_p95 <= 0.500 THEN '0.500'
                WHEN a.att_broadcast_p95 <= 0.750 THEN '0.750'
                WHEN a.att_broadcast_p95 <= 1 THEN '1'
                WHEN a.att_broadcast_p95 <= 1.5 THEN '1.5'
                WHEN a.att_broadcast_p95 <= 2 THEN '2'
                ELSE '+2'
            END AS broadcast_p95_bucket_g,
            CASE
                WHEN ai.inclusion_delay = 0 THEN '0'
                WHEN ai.inclusion_delay = 1 THEN '1'
                WHEN ai.inclusion_delay = 2 THEN '2'
                WHEN ai.inclusion_delay <= 5 THEN '3-5'
                WHEN ai.inclusion_delay <= 10 THEN '6-10'
                WHEN ai.inclusion_delay <= 20 THEN '11-20'
                WHEN ai.inclusion_delay <= 40 THEN '21-40'
                WHEN ai.inclusion_delay IS NULL THEN NULL
                ELSE '41-63'
            END AS inclusion_range
        
        FROM attestation_arrivals a
        LEFT JOIN attestation_inclusion ai on (a.slot == ai.slot and a.val_idx == ai.val_idx)
        WHERE a.val_idx IS NOT NULL
        ORDER BY latency_bucket ASC
        """
        df.append(client.query_df(query))
        break

    return pd.concat(df), query


def fetch_block_and_column_broadcast_info(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch attestation arrivals.

    Returns (df, query).
    """
    date_filter = _get_date_filter(target_date)

    first_seen_interval = 0.1  # s
    p50_seen_interval = 0.1  # s
    query=f"""
    WITH
        block_arrivals as (
            SELECT
                slot,
                min(propagation_slot_start_diff) as block_first_seen,
                quantiles(0.50)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) as block_broadcast_p50,
                quantiles(0.90)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) as block_broadcast_p90,
                quantiles(0.95)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) as block_broadcast_p95
            FROM beacon_api_eth_v1_events_block
            PREWHERE {date_filter}
            WHERE meta_network_name = '{network}'
            GROUP BY slot
        ),
        block_sizes AS (
            SELECT
                slot,
                min(message_size) AS block_size_bytes
            FROM libp2p_gossipsub_beacon_block
            PREWHERE {date_filter}
            WHERE meta_network_name = '{network}'
            GROUP BY slot
        ),
        blobs AS (
            SELECT
                slot,
                count(DISTINCT blob_index) AS blob_count
            FROM canonical_beacon_blob_sidecar
            PREWHERE {date_filter}
            WHERE meta_network_name = '{network}'
            GROUP BY slot
        ),
        column_arrivals as (
            SELECT
                slot,
                column_index,
                min(propagation_slot_start_diff) as column_first_seen,
                quantiles(0.50)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) as column_broadcast_p50,
                quantiles(0.90)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) as column_broadcast_p90,
                quantiles(0.95)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) as column_broadcast_p95
            FROM beacon_api_eth_v1_events_data_column_sidecar
            PREWHERE {date_filter}
            WHERE meta_network_name = '{network}'
            GROUP BY slot, column_index
        )
    SELECT
        bs.slot,
        bs.slot - 1 AS previous_slot,
        bs.block_size_bytes / 1024 as block_kb,
        bl.blob_count,
        cla.column_index,
        ba.block_first_seen / 1000.0 AS block_first_seen,
        ba.block_broadcast_p50 / 1000.0 AS block_broadcast_p50,
        ba.block_broadcast_p90 / 1000.0 AS block_broadcast_p90,
        ba.block_broadcast_p95 / 1000.0 AS block_broadcast_p95,
        cla.column_first_seen / 1000.0 AS column_first_seen,
        cla.column_broadcast_p50 / 1000.0 AS column_broadcast_p50,
        cla.column_broadcast_p90 / 1000.0 AS column_broadcast_p90,
        cla.column_broadcast_p95 / 1000.0 AS column_broadcast_p95,
        floor((ba.block_first_seen / 1000.0) / {first_seen_interval}) * {first_seen_interval} AS block_latency_bucket,
        floor(((ba.block_broadcast_p50 + ba.block_first_seen) / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS block_broadcast_p50_bucket_wfs,
        floor(((ba.block_broadcast_p90 + ba.block_first_seen) / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS block_broadcast_p90_bucket_wfs,
        floor((ba.block_broadcast_p50 / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS block_broadcast_p50_bucket,
        floor((ba.block_broadcast_p90 / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS block_broadcast_p90_bucket,
        CASE
            WHEN ba.block_broadcast_p50 IS NULL THEN NULL
            WHEN ba.block_broadcast_p50 = 0 THEN '0'
            WHEN ba.block_broadcast_p50 < 150 THEN '0.150'
            WHEN ba.block_broadcast_p50 <= 300 THEN '0.300'
            WHEN ba.block_broadcast_p50 <= 500 THEN '0.500'
            WHEN ba.block_broadcast_p50 <= 750 THEN '0.750'
            WHEN ba.block_broadcast_p50 <= 1000 THEN '1'
            WHEN ba.block_broadcast_p50 <= 1500 THEN '1.5'
            WHEN ba.block_broadcast_p50 <= 2000 THEN '2'
            ELSE '+2'
        END AS block_broadcast_p50_bucket_g,
        CASE
            WHEN ba.block_broadcast_p90 IS NULL THEN NULL
            WHEN ba.block_broadcast_p90 = 0 THEN '0'
            WHEN ba.block_broadcast_p90 < 150 THEN '0.150'
            WHEN ba.block_broadcast_p90 <= 300 THEN '0.300'
            WHEN ba.block_broadcast_p90 <= 500 THEN '0.500'
            WHEN ba.block_broadcast_p90 <= 750 THEN '0.750'
            WHEN ba.block_broadcast_p90 <= 1000 THEN '1'
            WHEN ba.block_broadcast_p90 <= 1500 THEN '1.5'
            WHEN ba.block_broadcast_p90 <= 2000 THEN '2'
            ELSE '+2'
        END AS block_broadcast_p90_bucket_g,
        floor((cla.column_first_seen / 1000.0) / {first_seen_interval}) * {first_seen_interval} AS column_latency_bucket,
        floor(((cla.column_broadcast_p50 + cla.column_first_seen) / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS column_broadcast_p50_bucket_wfs,
        floor(((cla.column_broadcast_p90 + cla.column_first_seen) / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS column_broadcast_p90_bucket_wfs,
        floor((cla.column_broadcast_p50 / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS column_broadcast_p50_bucket,
        floor((cla.column_broadcast_p90 / 1000.0) / {p50_seen_interval}) * {p50_seen_interval} AS column_broadcast_p90_bucket,
        CASE
            WHEN cla.column_broadcast_p50 IS NULL THEN NULL
            WHEN cla.column_broadcast_p50 = 0 THEN '0'
            WHEN cla.column_broadcast_p50 < 150 THEN '0.150'
            WHEN cla.column_broadcast_p50 <= 300 THEN '0.300'
            WHEN cla.column_broadcast_p50 <= 500 THEN '0.500'
            WHEN cla.column_broadcast_p50 <= 750 THEN '0.750'
            WHEN cla.column_broadcast_p50 <= 1000 THEN '1'
            WHEN cla.column_broadcast_p50 <= 1500 THEN '1.5'
            WHEN cla.column_broadcast_p50 <= 2000 THEN '2'
            ELSE '+2'
        END AS column_broadcast_p50_bucket_g,
        CASE
            WHEN cla.column_broadcast_p90 IS NULL THEN NULL
            WHEN cla.column_broadcast_p90 = 0 THEN '0'
            WHEN cla.column_broadcast_p90 < 150 THEN '0.150'
            WHEN cla.column_broadcast_p90 <= 300 THEN '0.300'
            WHEN cla.column_broadcast_p90 <= 500 THEN '0.500'
            WHEN cla.column_broadcast_p90 <= 750 THEN '0.750'
            WHEN cla.column_broadcast_p90 <= 1000 THEN '1'
            WHEN cla.column_broadcast_p90 <= 1500 THEN '1.5'
            WHEN cla.column_broadcast_p90 <= 2000 THEN '2'
            ELSE '+2'
        END AS column_broadcast_p90_bucket_g
    FROM block_sizes bs
    LEFT JOIN block_arrivals ba ON bs.slot == ba.slot
    LEFT JOIN blobs bl ON bs.slot == bl.slot
    LEFT JOIN column_arrivals cla ON bs.slot == cla.slot
    ORDER BY bs.slot ASC
    """

    df = client.query_df(query)
    return df, query


def fetch_aggregation_broadcast_info(
    client,
    target_date: str,
    network: str = "mainnet",
) -> tuple:
    """Fetch attestation arrivals.

    Returns (df, query).
    """
    query = ""
    first_seen_interval = 0.1  # s
    p50_seen_interval = 0.1  # s
    agg_bits_interval = 25  # attestation bits
    dfs = []
    hour_interval = 1
    for base_h in range(0, 24, hour_interval):
        date_filter = _manual_date_filter(
            target_date,
            base_h=14,
            h_interval=1,
        )
        query = f"""
            WITH
                aggregated_proofs AS (
                    SELECT
                        slot,
                        committee_index,
                        aggregator_index,
                        bitCount(unhex(aggregation_bits)) as agg_bits,
                        message_id,
                        min(slot_start_date_time) as slot_start_time,
                        min(event_date_time) as att_first_seen,
                        min(event_date_time) - min(slot_start_date_time) as agg_first_seen_wb,
                        quantiles(0.50)(event_date_time)[1] - min(event_date_time) AS agg_broadcast_p50,
                        quantiles(0.90)(event_date_time)[1] - min(event_date_time) AS agg_broadcast_p90,
                        quantiles(0.95)(event_date_time)[1] - min(event_date_time) AS agg_broadcast_p95
                    FROM libp2p_gossipsub_aggregate_and_proof
                    PREWHERE {date_filter}
                    WHERE meta_network_name = '{network}'
                    GROUP BY slot, committee_index, aggregator_index, agg_bits, message_id
                )
            SELECT
                *,
                floor(agg_first_seen_wb / {first_seen_interval}) * {first_seen_interval} AS latency_bucket,
                floor(agg_bits / {agg_bits_interval}) * {agg_bits_interval} AS aggregated_bits_bucket,
                floor((agg_broadcast_p50 + agg_first_seen_wb) / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p50_bucket_wfs,
                floor((agg_broadcast_p90 + agg_first_seen_wb) / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p90_bucket_wfs,
                floor(agg_broadcast_p50 / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p50_bucket,
                floor(agg_broadcast_p90 / {p50_seen_interval}) * {p50_seen_interval} AS broadcast_p90_bucket,
                CASE
                    WHEN agg_broadcast_p50 = 0 THEN '0'
                    WHEN agg_broadcast_p50 < 0.150 THEN '0.150'
                    WHEN agg_broadcast_p50 <= 0.300 THEN '0.300'
                    WHEN agg_broadcast_p50 <= 0.500 THEN '0.500'
                    WHEN agg_broadcast_p50 <= 0.750 THEN '0.750'
                    WHEN agg_broadcast_p50 <= 1 THEN '1'
                    WHEN agg_broadcast_p50 <= 1.5 THEN '1.5'
                    WHEN agg_broadcast_p50 <= 2 THEN '2'
                    WHEN agg_broadcast_p50 <= 3 THEN '3'
                    WHEN agg_broadcast_p50 <= 4 THEN '4'
                    WHEN agg_broadcast_p50 <= 5 THEN '5'
                    ELSE '+5'
                END AS broadcast_p50_bucket_g,
                CASE
                    WHEN agg_broadcast_p90 = 0 THEN '0'
                    WHEN agg_broadcast_p90 < 0.150 THEN '0.150'
                    WHEN agg_broadcast_p90 <= 0.300 THEN '0.300'
                    WHEN agg_broadcast_p90 <= 0.500 THEN '0.500'
                    WHEN agg_broadcast_p90 <= 0.750 THEN '0.750'
                    WHEN agg_broadcast_p90 <= 1 THEN '1'
                    WHEN agg_broadcast_p90 <= 1.5 THEN '1.5'
                    WHEN agg_broadcast_p90 <= 2 THEN '2'
                    WHEN agg_broadcast_p90 <= 3 THEN '3'
                    WHEN agg_broadcast_p90 <= 4 THEN '4'
                    WHEN agg_broadcast_p90 <= 5 THEN '5'
                    ELSE '+5'
                END AS broadcast_p90_bucket_g
            FROM aggregated_proofs
            ORDER BY latency_bucket ASC
            """
        dfs.append(client.query_df(query))
        break

    return pd.concat(dfs), query
