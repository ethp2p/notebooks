"""
All the logic, queries, and final output for the slot tagger logic

Classify all the slots in the given range of dates to output a relevant map of:
- timestamp, slot -> slot_defining_tags
"""

import pandas as pd
import clickhouse_connect
from typing import List, Protocol
import concurrent.futures

from queries.slot_tags import *


def _get_date_filter(target_date: str, column: str = "slot_start_date_time") -> str:
    """Generate SQL date filter for a specific date."""
    return f"{column} >= '{target_date}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"


def _manual_date_filter(target_date: str, base_h: int, h_interval: int, column: str = "slot_start_date_time") -> str:
    """Generate a SQL date filter for a single hour window within a date."""
    end_h = base_h + h_interval
    start = f"{target_date} {base_h:02d}:00:00"
    if end_h >= 24:
        return f"{column} >= '{start}' AND {column} < '{target_date}'::date + INTERVAL 1 DAY"
    return f"{column} >= '{start}' AND {column} < '{target_date} {end_h:02d}:00:00'"


class SlotTaggerRule(Protocol):
    """
    Interface for each of the slot-tagging rules.
    Given a clichouse connection, and a start_date/end_date, return allways: slot -> tag mapping dataframe
    """
    def execute(
            self, client: clickhouse_connect.driver.Client, network: str, target_date: str,
    ) -> (pd.DataFrame, str):
        """Runs a ClickHouse query and returns a DataFrame with ['slot', 'tag'] columns."""
        pass


class BlockProposalAndDistributionRule:
    @staticmethod
    def execute(
            client: clickhouse_connect.driver.Client, network: str, target_date: str,
    ) -> (pd.DataFrame, str):
        date_filter = _get_date_filter(target_date)

        query = f"""
            WITH
                block_arrivals as (
                    SELECT
                        slot,
                        min(propagation_slot_start_diff) as block_proposal,
                        quantiles(0.50)(propagation_slot_start_diff)[1] as block_arrival_p50,
                        quantiles(0.50)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) as block_spread_p50
                    FROM beacon_api_eth_v1_events_block
                    PREWHERE {date_filter}
                    WHERE meta_network_name = '{network}'
                    GROUP BY slot
                ),
                block_sizes AS (
                    SELECT
                        slot,
                        CASE
                            WHEN min(message_size) IS NULL THEN '{MISSED_SLOT}'
                            WHEN min(message_size) < (50 * 1014) THEN '{BLOCK_SIZE_SMALL}'
                            WHEN min(message_size) <= (150 * 1014) THEN '{BLOCK_SIZE_AVG}'
                            WHEN min(message_size) <= (500 * 1024) THEN '{BLOCK_SIZE_LARGE}'
                            ELSE '{BLOCK_SIZE_EXTRA_LARGE}'
                        END AS block_size_tag
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
                
                )
            SELECT
                bs.slot as slot,
                bs.block_size_tag as block_size_tag,
                CASE
                    WHEN ba.block_proposal IS NULL THEN '{MISSED_SLOT}'
                    WHEN ba.block_proposal < 1000 THEN '{EARLY_PROPOSAL}'
                    WHEN ba.block_proposal <= 2000 THEN '{NEUTRAL_PROPOSAL}'
                    WHEN ba.block_proposal <= 4000 THEN '{AGGRESSIVE_PROPOSAL}'
                    ELSE '{LATE_PROPOSAL}'
                END AS block_proposal_tag,
                CASE
                    WHEN ba.block_arrival_p50 IS NULL  THEN '{MISSED_SLOT}'
                    WHEN ba.block_arrival_p50 < 2000   THEN '{BLOCK_ARRIVAL_BELOW_2S}'
                    WHEN ba.block_arrival_p50 < 3000   THEN '{BLOCK_ARRIVAL_BELOW_3S}'
                    WHEN ba.block_arrival_p50 <= 4000  THEN '{BLOCK_ARRIVAL_BELOW_4S}'
                    ELSE '{BLOCK_ARRIVAL_OVER_4S}'
                END AS block_p50_arrival_tag,
                CASE
                    WHEN ba.block_spread_p50 IS NULL  THEN '{MISSED_SLOT}'
                    WHEN ba.block_spread_p50 = 0      THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN ba.block_spread_p50 < 500    THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN ba.block_spread_p50 <= 750   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN ba.block_spread_p50 <= 1000  THEN '{PROPAGATION_BELOW_1S}'
                    WHEN ba.block_spread_p50 <= 1500  THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN ba.block_spread_p50 <= 2000  THEN '{PROPAGATION_BELOW_2S}'
                    WHEN ba.block_spread_p50 <= 5000  THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS block_p50_spread_tag,
                CASE
                    WHEN bl.blob_count IS NULL THEN '{MISSED_SLOT}'
                    WHEN bl.blob_count = 0 THEN '{NO_BLOBS}'
                    WHEN bl.blob_count < 9 THEN '{BLOCK_BELOW_BLOB_TARGET_PROPOSAL}'
                    WHEN bl.blob_count <= 9 THEN '{BLOCK_ON_BLOB_TARGET_PROPOSAL}'
                    WHEN bl.blob_count <= 20 THEN '{BLOCK_ABOVE_BLOB_TARGET_PROPOSAL}'
                    ELSE '{BLOCK_MAX_BLOB_PROPOSAL}'
                END AS blob_count_tag
            FROM block_sizes bs
            LEFT JOIN block_arrivals ba ON bs.slot == ba.slot
            LEFT JOIN blobs bl ON bs.slot == bl.slot
            ORDER BY bs.slot ASC
            """
        return client.query_df(query), "Block arrivals"


class AttestationArrivalRule:
    @staticmethod
    def execute(
            client: clickhouse_connect.driver.Client, network: str, target_date: str,
    ) -> (pd.DataFrame, str):
        # Run the full aggregation query in 2-hour batches to avoid ClickHouse timeouts.
        batch_dfs = []
        interval = 4
        for base_h in range(0, 24, interval):
            date_filter = _manual_date_filter(target_date, base_h=base_h, h_interval=interval)
            query = f"""
                WITH
                    per_attestation AS (
                        SELECT
                            slot,
                            attesting_validator_index AS val_idx,
                            min(event_date_time) - min(slot_start_date_time)           AS first_seen,
                            quantiles(0.50)(event_date_time)[1] - min(event_date_time) AS spread_p50
                        FROM beacon_api_eth_v1_events_attestation
                        PREWHERE {date_filter}
                        WHERE meta_network_name = '{network}'
                        GROUP BY slot, val_idx
                    ),
                    per_attestation_inclusion AS (
                        SELECT
                            slot,
                            arrayJoin(validators) AS val_idx,
                            min(block_slot - slot) AS inclusion_delay
                        FROM canonical_beacon_elaborated_attestation
                        PREWHERE {date_filter}
                        WHERE meta_network_name = '{network}'
                        GROUP BY slot, val_idx
                    ),
                    slot_stats AS (
                        SELECT
                            a.slot,
                            quantiles(0.50)(a.first_seen)[1] AS att_first_seen_p50,
                            quantiles(0.90)(a.first_seen)[1] AS att_first_seen_p90,
                            quantiles(0.95)(a.first_seen)[1] AS att_first_seen_p95,
                            quantiles(0.99)(a.first_seen)[1] AS att_first_seen_p99,
                            quantiles(0.50)(a.spread_p50)[1] AS att_spread_p50,
                            quantiles(0.90)(a.spread_p50)[1] AS att_spread_p90,
                            quantiles(0.95)(a.spread_p50)[1] AS att_spread_p95,
                            quantiles(0.99)(a.spread_p50)[1] AS att_spread_p99,
                            quantiles(0.50)(ai.inclusion_delay)[1] AS att_inclusion_p50,
                            quantiles(0.90)(ai.inclusion_delay)[1] AS att_inclusion_p90,
                            quantiles(0.95)(ai.inclusion_delay)[1] AS att_inclusion_p95,
                            quantiles(0.99)(ai.inclusion_delay)[1] AS att_inclusion_p99
                        FROM per_attestation a
                        LEFT JOIN per_attestation_inclusion ai ON (a.slot = ai.slot AND a.val_idx = ai.val_idx)
                        GROUP BY a.slot
                    )
                SELECT
                    slot,
                    CASE
                        WHEN att_first_seen_p50 IS NULL THEN '{ATT_FIRST_SEEN_MISSED}'
                        WHEN att_first_seen_p50 < 4    THEN '{ATT_ARRIVAL_BEFORE_4S}'
                        WHEN att_first_seen_p50 < 5    THEN '{ATT_ARRIVAL_AT_4S}'
                        WHEN att_first_seen_p50 < 8    THEN '{ATT_ARRIVAL_OVER_4S}'
                        ELSE '{ATT_ARRIVAL_LATE}'
                    END AS att_first_seen_p50_tag,
                    CASE
                        WHEN att_first_seen_p90 IS NULL THEN '{ATT_FIRST_SEEN_MISSED}'
                        WHEN att_first_seen_p90 < 4    THEN '{ATT_ARRIVAL_BEFORE_4S}'
                        WHEN att_first_seen_p90 < 5    THEN '{ATT_ARRIVAL_AT_4S}'
                        WHEN att_first_seen_p90 < 8    THEN '{ATT_ARRIVAL_OVER_4S}'
                        ELSE '{ATT_ARRIVAL_LATE}'
                    END AS att_first_seen_p90_tag,
                    CASE
                        WHEN att_first_seen_p95 IS NULL THEN '{ATT_FIRST_SEEN_MISSED}'
                        WHEN att_first_seen_p95 < 4    THEN '{ATT_ARRIVAL_BEFORE_4S}'
                        WHEN att_first_seen_p95 < 5    THEN '{ATT_ARRIVAL_AT_4S}'
                        WHEN att_first_seen_p95 < 8    THEN '{ATT_ARRIVAL_OVER_4S}'
                        ELSE '{ATT_ARRIVAL_LATE}'
                    END AS att_first_seen_p95_tag,
                    CASE
                        WHEN att_first_seen_p99 IS NULL THEN '{ATT_FIRST_SEEN_MISSED}'
                        WHEN att_first_seen_p99 < 4    THEN '{ATT_ARRIVAL_BEFORE_4S}'
                        WHEN att_first_seen_p99 < 5    THEN '{ATT_ARRIVAL_AT_4S}'
                        WHEN att_first_seen_p99 < 8    THEN '{ATT_ARRIVAL_OVER_4S}'
                        ELSE '{ATT_ARRIVAL_LATE}'
                    END AS att_first_seen_p99_tag,
                    CASE
                        WHEN att_spread_p50 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p50 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p50 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                        WHEN att_spread_p50 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                        WHEN att_spread_p50 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                        WHEN att_spread_p50 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                        WHEN att_spread_p50 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                        WHEN att_spread_p50 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                        ELSE '{PROPAGATION_OVER_5S}'
                    END AS att_spread_p50_tag,
                    CASE
                        WHEN att_spread_p90 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p90 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p90 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                        WHEN att_spread_p90 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                        WHEN att_spread_p90 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                        WHEN att_spread_p90 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                        WHEN att_spread_p90 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                        WHEN att_spread_p90 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                        ELSE '{PROPAGATION_OVER_5S}'
                    END AS att_spread_p90_tag,
                    CASE
                        WHEN att_spread_p95 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p95 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p95 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                        WHEN att_spread_p95 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                        WHEN att_spread_p95 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                        WHEN att_spread_p95 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                        WHEN att_spread_p95 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                        WHEN att_spread_p95 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                        ELSE '{PROPAGATION_OVER_5S}'
                    END AS att_spread_p95_tag,
                    CASE
                        WHEN att_spread_p99 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p99 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                        WHEN att_spread_p99 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                        WHEN att_spread_p99 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                        WHEN att_spread_p99 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                        WHEN att_spread_p99 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                        WHEN att_spread_p99 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                        WHEN att_spread_p99 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                        ELSE '{PROPAGATION_OVER_5S}'
                    END AS att_spread_p99_tag,
                    CASE
                        WHEN att_inclusion_p50 IS NULL THEN '{MISSED_SLOT}'
                        WHEN att_inclusion_p50 <= 1   THEN '{ATT_INCLUSION_1}'
                        WHEN att_inclusion_p50 <= 2   THEN '{ATT_INCLUSION_2}'
                        WHEN att_inclusion_p50 <= 5   THEN '{ATT_INCLUSION_BELOW_5}'
                        ELSE '{ATT_INCLUSION_OVER_5}'
                    END AS att_inclusion_p50_tag,
                    CASE
                        WHEN att_inclusion_p90 IS NULL THEN '{MISSED_SLOT}'
                        WHEN att_inclusion_p90 <= 1   THEN '{ATT_INCLUSION_1}'
                        WHEN att_inclusion_p90 <= 2   THEN '{ATT_INCLUSION_2}'
                        WHEN att_inclusion_p90 <= 5   THEN '{ATT_INCLUSION_BELOW_5}'
                        ELSE '{ATT_INCLUSION_OVER_5}'
                    END AS att_inclusion_p90_tag,
                    CASE
                        WHEN att_inclusion_p95 IS NULL THEN '{MISSED_SLOT}'
                        WHEN att_inclusion_p95 <= 1   THEN '{ATT_INCLUSION_1}'
                        WHEN att_inclusion_p95 <= 2   THEN '{ATT_INCLUSION_2}'
                        WHEN att_inclusion_p95 <= 5   THEN '{ATT_INCLUSION_BELOW_5}'
                        ELSE '{ATT_INCLUSION_OVER_5}'
                    END AS att_inclusion_p95_tag,
                    CASE
                        WHEN att_inclusion_p99 IS NULL THEN '{MISSED_SLOT}'
                        WHEN att_inclusion_p99 <= 1   THEN '{ATT_INCLUSION_1}'
                        WHEN att_inclusion_p99 <= 2   THEN '{ATT_INCLUSION_2}'
                        WHEN att_inclusion_p99 <= 5   THEN '{ATT_INCLUSION_BELOW_5}'
                        ELSE '{ATT_INCLUSION_OVER_5}'
                    END AS att_inclusion_p99_tag
                FROM slot_stats
                ORDER BY slot ASC
                """
            batch = client.query_df(query)
            print(f"\t-> Attestation arrivals (hours {base_h:02d}-{base_h+2:02d}): {len(batch)} slots")
            batch_dfs.append(batch)

        combined = pd.concat(batch_dfs, ignore_index=True)
        return combined.sort_values("slot").reset_index(drop=True), "Attestation arrivals"


class AggregationBroadcastRule:
    @staticmethod
    def execute(
            client: clickhouse_connect.driver.Client, network: str, target_date: str,
    ) -> (pd.DataFrame, str):
        date_filter = _get_date_filter(target_date)

        query = f"""
            WITH
                per_aggregate AS (
                    SELECT
                        slot,
                        committee_index,
                        aggregator_index,
                        min(event_date_time) - min(slot_start_date_time)           AS first_seen,
                        quantiles(0.50)(event_date_time)[1] - min(event_date_time) AS spread_p50
                    FROM libp2p_gossipsub_aggregate_and_proof
                    PREWHERE {date_filter}
                    WHERE meta_network_name = '{network}'
                    GROUP BY slot, committee_index, aggregator_index
                ),
                slot_stats AS (
                    SELECT
                        slot,
                        quantiles(0.50)(first_seen)[1] AS agg_first_seen_p50,
                        quantiles(0.90)(first_seen)[1] AS agg_first_seen_p90,
                        quantiles(0.95)(first_seen)[1] AS agg_first_seen_p95,
                        quantiles(0.99)(first_seen)[1] AS agg_first_seen_p99,
                        quantiles(0.50)(spread_p50)[1]  AS agg_spread_p50,
                        quantiles(0.90)(spread_p50)[1]  AS agg_spread_p90,
                        quantiles(0.95)(spread_p50)[1]  AS agg_spread_p95,
                        quantiles(0.99)(spread_p50)[1]  AS agg_spread_p99
                    FROM per_aggregate
                    GROUP BY slot
                )
            SELECT
                slot,
                CASE
                    WHEN agg_first_seen_p50 IS NULL THEN '{AGG_FIRST_SEEN_MISSED}'
                    WHEN agg_first_seen_p50 < 8    THEN '{AGG_ARRIVAL_BEFORE_8S}'
                    WHEN agg_first_seen_p50 < 9    THEN '{AGG_ARRIVAL_AT_8S}'
                    WHEN agg_first_seen_p50 < 12   THEN '{AGG_ARRIVAL_BEFORE_12S}'
                    ELSE '{AGG_ARRIVAL_LATE}'
                END AS agg_first_seen_p50_tag,
                CASE
                    WHEN agg_first_seen_p90 IS NULL THEN '{AGG_FIRST_SEEN_MISSED}'
                    WHEN agg_first_seen_p90 < 8    THEN '{AGG_ARRIVAL_BEFORE_8S}'
                    WHEN agg_first_seen_p90 < 9    THEN '{AGG_ARRIVAL_AT_8S}'
                    WHEN agg_first_seen_p90 < 12   THEN '{AGG_ARRIVAL_BEFORE_12S}'
                    ELSE '{AGG_ARRIVAL_LATE}'
                END AS agg_first_seen_p90_tag,
                CASE
                    WHEN agg_first_seen_p95 IS NULL THEN '{AGG_FIRST_SEEN_MISSED}'
                    WHEN agg_first_seen_p95 < 8    THEN '{AGG_ARRIVAL_BEFORE_8S}'
                    WHEN agg_first_seen_p95 < 9    THEN '{AGG_ARRIVAL_AT_8S}'
                    WHEN agg_first_seen_p95 < 12   THEN '{AGG_ARRIVAL_BEFORE_12S}'
                    ELSE '{AGG_ARRIVAL_LATE}'
                END AS agg_first_seen_p95_tag,
                CASE
                    WHEN agg_first_seen_p99 IS NULL THEN '{AGG_FIRST_SEEN_MISSED}'
                    WHEN agg_first_seen_p99 < 8    THEN '{AGG_ARRIVAL_BEFORE_8S}'
                    WHEN agg_first_seen_p99 < 9    THEN '{AGG_ARRIVAL_AT_8S}'
                    WHEN agg_first_seen_p99 < 12   THEN '{AGG_ARRIVAL_BEFORE_12S}'
                    ELSE '{AGG_ARRIVAL_LATE}'
                END AS agg_first_seen_p99_tag,
                CASE
                    WHEN agg_spread_p50 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p50 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p50 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN agg_spread_p50 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN agg_spread_p50 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                    WHEN agg_spread_p50 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN agg_spread_p50 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                    WHEN agg_spread_p50 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS agg_spread_p50_tag,
                CASE
                    WHEN agg_spread_p90 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p90 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p90 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN agg_spread_p90 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN agg_spread_p90 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                    WHEN agg_spread_p90 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN agg_spread_p90 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                    WHEN agg_spread_p90 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS agg_spread_p90_tag,
                CASE
                    WHEN agg_spread_p95 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p95 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p95 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN agg_spread_p95 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN agg_spread_p95 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                    WHEN agg_spread_p95 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN agg_spread_p95 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                    WHEN agg_spread_p95 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS agg_spread_p95_tag,
                CASE
                    WHEN agg_spread_p99 IS NULL   THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p99 = 0       THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN agg_spread_p99 < 0.5     THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN agg_spread_p99 <= 0.75   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN agg_spread_p99 <= 1.0    THEN '{PROPAGATION_BELOW_1S}'
                    WHEN agg_spread_p99 <= 1.5    THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN agg_spread_p99 <= 2.0    THEN '{PROPAGATION_BELOW_2S}'
                    WHEN agg_spread_p99 <= 5.0    THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS agg_spread_p99_tag
            FROM slot_stats
            ORDER BY slot ASC
            """
        return client.query_df(query), "Aggregation arrivals"


class DataColumnBroadcastRule:
    @staticmethod
    def execute(
            client: clickhouse_connect.driver.Client, network: str, target_date: str,
    ) -> (pd.DataFrame, str):
        date_filter = _get_date_filter(target_date, column="slot_start_date_time")

        query = f"""
            WITH
                per_column AS (
                    SELECT
                        slot,
                        column_index,
                        min(propagation_slot_start_diff)                                                AS first_seen,
                        quantiles(0.50)(propagation_slot_start_diff)[1] - min(propagation_slot_start_diff) AS spread_p50
                    FROM beacon_api_eth_v1_events_data_column_sidecar
                    PREWHERE {date_filter}
                    WHERE meta_network_name = '{network}'
                    GROUP BY slot, column_index
                ),
                slot_stats AS (
                    SELECT
                        slot,
                        min(first_seen) as first_col_proposal,
                        max(first_seen) as last_col_proposal,
                        quantiles(0.50)(first_seen)[1] AS col_first_seen_p50,
                        quantiles(0.90)(first_seen)[1] AS col_first_seen_p90,
                        quantiles(0.95)(first_seen)[1] AS col_first_seen_p95,
                        quantiles(0.99)(first_seen)[1] AS col_first_seen_p99,
                        quantiles(0.50)(spread_p50)[1]  AS col_spread_p50,
                        quantiles(0.90)(spread_p50)[1]  AS col_spread_p90,
                        quantiles(0.95)(spread_p50)[1]  AS col_spread_p95,
                        quantiles(0.99)(spread_p50)[1]  AS col_spread_p99
                    FROM per_column
                    GROUP BY slot
                )
            SELECT
                slot,
                CASE
                    WHEN first_col_proposal IS NULL THEN '{NO_BLOBS}'
                    WHEN first_col_proposal < 1000 THEN '{EARLY_PROPOSAL}'
                    WHEN first_col_proposal <= 2000 THEN '{NEUTRAL_PROPOSAL}'
                    WHEN first_col_proposal <= 4000 THEN '{AGGRESSIVE_PROPOSAL}'
                    ELSE '{LATE_PROPOSAL}'
                END AS first_col_proposal_tag,
                CASE
                    WHEN last_col_proposal IS NULL THEN '{NO_BLOBS}'
                    WHEN last_col_proposal < 1000 THEN '{EARLY_PROPOSAL}'
                    WHEN last_col_proposal <= 2000 THEN '{NEUTRAL_PROPOSAL}'
                    WHEN last_col_proposal <= 4000 THEN '{AGGRESSIVE_PROPOSAL}'
                    ELSE '{LATE_PROPOSAL}'
                END AS last_col_proposal_tag,
                CASE
                    WHEN col_first_seen_p50 IS NULL THEN '{COL_FIRST_SEEN_MISSED}'
                    WHEN col_first_seen_p50 < 4000  THEN '{COL_ARRIVAL_BEFORE_4S}'
                    WHEN col_first_seen_p50 < 5000  THEN '{COL_ARRIVAL_AT_4S}'
                    WHEN col_first_seen_p50 < 8000  THEN '{COL_ARRIVAL_OVER_4S}'
                    ELSE '{COL_ARRIVAL_LATE}'
                END AS col_first_seen_p50_tag,
                CASE
                    WHEN col_first_seen_p90 IS NULL THEN '{COL_FIRST_SEEN_MISSED}'
                    WHEN col_first_seen_p90 < 4000  THEN '{COL_ARRIVAL_BEFORE_4S}'
                    WHEN col_first_seen_p90 < 5000  THEN '{COL_ARRIVAL_AT_4S}'
                    WHEN col_first_seen_p90 < 8000  THEN '{COL_ARRIVAL_OVER_4S}'
                    ELSE '{COL_ARRIVAL_LATE}'
                END AS col_first_seen_p90_tag,
                CASE
                    WHEN col_first_seen_p95 IS NULL THEN '{COL_FIRST_SEEN_MISSED}'
                    WHEN col_first_seen_p95 < 4000  THEN '{COL_ARRIVAL_BEFORE_4S}'
                    WHEN col_first_seen_p95 < 5000  THEN '{COL_ARRIVAL_AT_4S}'
                    WHEN col_first_seen_p95 < 8000  THEN '{COL_ARRIVAL_OVER_4S}'
                    ELSE '{COL_ARRIVAL_LATE}'
                END AS col_first_seen_p95_tag,
                CASE
                    WHEN col_first_seen_p99 IS NULL THEN '{COL_FIRST_SEEN_MISSED}'
                    WHEN col_first_seen_p99 < 4000  THEN '{COL_ARRIVAL_BEFORE_4S}'
                    WHEN col_first_seen_p99 < 5000  THEN '{COL_ARRIVAL_AT_4S}'
                    WHEN col_first_seen_p99 < 8000  THEN '{COL_ARRIVAL_OVER_4S}'
                    ELSE '{COL_ARRIVAL_LATE}'
                END AS col_first_seen_p99_tag,
                CASE
                    WHEN col_spread_p50 IS NULL  THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p50 = 0      THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p50 < 500    THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN col_spread_p50 <= 750   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN col_spread_p50 <= 1000  THEN '{PROPAGATION_BELOW_1S}'
                    WHEN col_spread_p50 <= 1500  THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN col_spread_p50 <= 2000  THEN '{PROPAGATION_BELOW_2S}'
                    WHEN col_spread_p50 <= 5000  THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS col_spread_p50_tag,
                CASE
                    WHEN col_spread_p90 IS NULL  THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p90 = 0      THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p90 < 500    THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN col_spread_p90 <= 750   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN col_spread_p90 <= 1000  THEN '{PROPAGATION_BELOW_1S}'
                    WHEN col_spread_p90 <= 1500  THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN col_spread_p90 <= 2000  THEN '{PROPAGATION_BELOW_2S}'
                    WHEN col_spread_p90 <= 5000  THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS col_spread_p90_tag,
                CASE
                    WHEN col_spread_p95 IS NULL  THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p95 = 0      THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p95 < 500    THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN col_spread_p95 <= 750   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN col_spread_p95 <= 1000  THEN '{PROPAGATION_BELOW_1S}'
                    WHEN col_spread_p95 <= 1500  THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN col_spread_p95 <= 2000  THEN '{PROPAGATION_BELOW_2S}'
                    WHEN col_spread_p95 <= 5000  THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS col_spread_p95_tag,
                CASE
                    WHEN col_spread_p99 IS NULL  THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p99 = 0      THEN '{PROPAGATION_NOT_TRACKED}'
                    WHEN col_spread_p99 < 500    THEN '{PROPAGATION_BELOW_500MS}'
                    WHEN col_spread_p99 <= 750   THEN '{PROPAGATION_BELOW_750MS}'
                    WHEN col_spread_p99 <= 1000  THEN '{PROPAGATION_BELOW_1S}'
                    WHEN col_spread_p99 <= 1500  THEN '{PROPAGATION_BELOW_1_5S}'
                    WHEN col_spread_p99 <= 2000  THEN '{PROPAGATION_BELOW_2S}'
                    WHEN col_spread_p99 <= 5000  THEN '{PROPAGATION_BELOW_5S}'
                    ELSE '{PROPAGATION_OVER_5S}'
                END AS col_spread_p99_tag
            FROM slot_stats
            ORDER BY slot ASC
            """
        return client.query_df(query), "Data column arrivals"


class SlotTagger:
    def __init__(self, clickhouse_client):
        self.client = clickhouse_client
        self.rules: List[SlotTaggerRule] = [
            BlockProposalAndDistributionRule(),
            DataColumnBroadcastRule(),
            AttestationArrivalRule(),
            AggregationBroadcastRule(),
        ]

    def add_rule(self, rule: SlotTaggerRule):
        self.rules.append(rule)

    def run(self, network: str, target_date: str) -> pd.DataFrame:
        dataframes = []

        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [
                executor.submit(rule.execute, self.client, network, target_date)
                for rule in self.rules
            ]

            for future in concurrent.futures.as_completed(futures):
                try:
                    df, name = future.result()
                    print(f" -> query for {name} done: {len(df)} rows")
                    if len(df) > 0:
                        dataframes.append(df)
                except Exception as e:
                    import traceback
                    print(f"Error executing a tagging rule: {e}")
                    traceback.print_exc()

        if len(dataframes) == 0:
            return pd.DataFrame(columns=["slot"])

        final_df = pd.DataFrame()
        for i, df in enumerate(dataframes):
            if i == 0:
                final_df = df
            else:
                final_df = pd.merge(final_df, df, on="slot", how="left")

        # Slots with no blobs have no data-column sidecar events, so all col_* tag
        # columns are None after the left merge. Fill them with NO_BLOBS.
        col_tag_cols = [c for c in final_df.columns if c.contains("_col_") or (c.startswith("col_") and c.endswith("_tag"))]
        if col_tag_cols:
            final_df[col_tag_cols] = final_df[col_tag_cols].fillna(NO_BLOBS)

        return final_df.sort_values("slot").reset_index(drop=True)


def fetch_slot_tags(
        client,
        target_date: str,
        network: str = "mainnet",
) -> tuple:
    tagger = SlotTagger(client)
    df = tagger.run(network, target_date)
    return df, "tags"
