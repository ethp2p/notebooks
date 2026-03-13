# Tags that could be applied to a slot
"""
Some of these tags or subtags can't be combined: i.e., the proposal of the block could only be one of the items listed below.
"""

MISSED_SLOT = "missed_slot"
NO_BLOBS = "no_blobs"

# --- 1. Block-related ---
# --- 1.1. Block Proposer ---
BLOCK_STAKING_ENTITY_PROPOSER = "block_staking_entity_proposer"
BLOCK_HOME_STAKING_PROPOSER = "block_home_staking_proposer"

# 1.2. Proposal of the block ---
EARLY_PROPOSAL = "early_proposal"
NEUTRAL_PROPOSAL = "neutral_proposal"
AGGRESSIVE_PROPOSAL = "aggressive_proposal"
LATE_PROPOSAL = "late_proposal"

# --- 1.3. Builder of the block ---
# Who is the builder of the block
BLOCK_LOCAL_BUILDER_PROPOSAL = "block_local_builder_proposal"
BLOCK_MEV_BUILDER_PROPOSAL = "block_mev_builder_proposal"
BLOCK_BUILDER_TAG = "block_builder_tag"
BLOCK_MEV_RELAY_TAG = "block_mev_relay_tag"

# --- 1.4. Blobs per block
BLOCK_BELOW_BLOB_TARGET_PROPOSAL = "block_below_blob_target_proposal"
BLOCK_ON_BLOB_TARGET_PROPOSAL = "block_on_blob_target_proposal"
BLOCK_ABOVE_BLOB_TARGET_PROPOSAL = "block_above_blob_target_proposal"
BLOCK_MAX_BLOB_PROPOSAL = "block_max_blob_proposal"

# --- 1.5 Block arrival (shared across all percentiles; column name gives context)
BLOCK_ARRIVAL_BELOW_2S = "block_arrival_below_2s"
BLOCK_ARRIVAL_BELOW_3S = "block_arrival_below_3s"
BLOCK_ARRIVAL_BELOW_4S = "block_arrival_below_4s"
BLOCK_ARRIVAL_OVER_4S  = "block_arrival_over_4s"

# --- 1.6 Propagation spread (shared across block, attestation, and aggregation)
# The column name in the DataFrame identifies which metric this applies to.
PROPAGATION_NOT_TRACKED = "propagation_not_tracked"
PROPAGATION_BELOW_500MS = "propagation_below_500ms"
PROPAGATION_BELOW_750MS = "propagation_below_750ms"
PROPAGATION_BELOW_1S    = "propagation_below_1s"
PROPAGATION_BELOW_1_5S  = "propagation_below_1_5s"
PROPAGATION_BELOW_2S    = "propagation_below_2s"
PROPAGATION_BELOW_5S    = "propagation_below_5s"
PROPAGATION_OVER_5S     = "propagation_over_5s"

# --- 1.7 Block size
BLOCK_SIZE_SMALL = "small_block_size"
BLOCK_SIZE_AVG = "avg_block_size"
BLOCK_SIZE_LARGE = "large_block_size"
BLOCK_SIZE_EXTRA_LARGE = "extra_large_block_size"


# --- 1.8 Data Column arrival (shared across all percentiles; column name gives context)
COL_FIRST_SEEN_MISSED = "col_first_seen_missed"
COL_ARRIVAL_BEFORE_4S = "col_arrival_before_4s"
COL_ARRIVAL_AT_4S     = "col_arrival_at_4s"
COL_ARRIVAL_OVER_4S   = "col_arrival_over_4s"
COL_ARRIVAL_LATE      = "col_arrival_late"

# --- 1.9 Single Attestation arrivals
ATT_FIRST_SEEN_MISSED   = "att_first_seen_missed"
ATT_ARRIVAL_BEFORE_4S   = "att_arrival_before_4s"
ATT_ARRIVAL_AT_4S       = "att_arrival_at_4s"
ATT_ARRIVAL_OVER_4S     = "att_arrival_over_4s"
ATT_ARRIVAL_LATE        = "att_arrival_late"

# inclusion_delay distribution across attestations per slot (slots).
ATT_INCLUSION_1        = "att_inclusion_1"
ATT_INCLUSION_2        = "att_inclusion_2"
ATT_INCLUSION_BELOW_5  = "att_inclusion_below_5"
ATT_INCLUSION_OVER_5   = "att_inclusion_over_5"

# --- 1.10 Attestation aggregation arrivals
AGG_FIRST_SEEN_MISSED    = "agg_first_seen_missed"
AGG_ARRIVAL_BEFORE_8S    = "agg_arrival_before_8s"
AGG_ARRIVAL_AT_8S        = "agg_arrival_at_8s"
AGG_ARRIVAL_BEFORE_12S   = "agg_arrival_before_12s"
AGG_ARRIVAL_LATE         = "agg_arrival_late"


# --- Visualization helpers ---

# Shared ordering list for all spread/broadcast tag columns (block, col, att, agg).
# Column name in the DataFrame provides the context; the value set is identical.
_PROPAGATION_SPREAD_ORDER: list[str] = [
    PROPAGATION_NOT_TRACKED,
    PROPAGATION_BELOW_500MS,
    PROPAGATION_BELOW_750MS,
    PROPAGATION_BELOW_1S,
    PROPAGATION_BELOW_1_5S,
    PROPAGATION_BELOW_2S,
    PROPAGATION_BELOW_5S,
    PROPAGATION_OVER_5S,
]

TAG_ORDERS: dict[str, list[str]] = {
    "block_size_tag": [
        BLOCK_SIZE_SMALL,
        BLOCK_SIZE_AVG,
        BLOCK_SIZE_LARGE,
        BLOCK_SIZE_EXTRA_LARGE,
    ],
    "block_proposal_tag": [EARLY_PROPOSAL, NEUTRAL_PROPOSAL, AGGRESSIVE_PROPOSAL,LATE_PROPOSAL],
    "block_p50_arrival_tag": [BLOCK_ARRIVAL_BELOW_2S, BLOCK_ARRIVAL_BELOW_3S, BLOCK_ARRIVAL_BELOW_4S, BLOCK_ARRIVAL_OVER_4S],
    "block_p50_spread_tag": _PROPAGATION_SPREAD_ORDER,
    "blob_count_tag": [
        NO_BLOBS,
        BLOCK_BELOW_BLOB_TARGET_PROPOSAL,
        BLOCK_ON_BLOB_TARGET_PROPOSAL,
        BLOCK_ABOVE_BLOB_TARGET_PROPOSAL,
        BLOCK_MAX_BLOB_PROPOSAL,
    ],
    "first_col_proposal_tag": [EARLY_PROPOSAL, NEUTRAL_PROPOSAL, AGGRESSIVE_PROPOSAL, LATE_PROPOSAL],
    "last_col_proposal_tag": [EARLY_PROPOSAL, NEUTRAL_PROPOSAL, AGGRESSIVE_PROPOSAL, LATE_PROPOSAL],
    "col_first_seen_p50_tag": [COL_FIRST_SEEN_MISSED, COL_ARRIVAL_BEFORE_4S, COL_ARRIVAL_AT_4S, COL_ARRIVAL_OVER_4S, COL_ARRIVAL_LATE],
    "col_first_seen_p90_tag": [COL_FIRST_SEEN_MISSED, COL_ARRIVAL_BEFORE_4S, COL_ARRIVAL_AT_4S, COL_ARRIVAL_OVER_4S, COL_ARRIVAL_LATE],
    "col_first_seen_p95_tag": [COL_FIRST_SEEN_MISSED, COL_ARRIVAL_BEFORE_4S, COL_ARRIVAL_AT_4S, COL_ARRIVAL_OVER_4S, COL_ARRIVAL_LATE],
    "col_first_seen_p99_tag": [COL_FIRST_SEEN_MISSED, COL_ARRIVAL_BEFORE_4S, COL_ARRIVAL_AT_4S, COL_ARRIVAL_OVER_4S, COL_ARRIVAL_LATE],

    "col_spread_p50_tag": _PROPAGATION_SPREAD_ORDER,
    "col_spread_p90_tag": _PROPAGATION_SPREAD_ORDER,
    "col_spread_p95_tag": _PROPAGATION_SPREAD_ORDER,
    "col_spread_p99_tag": _PROPAGATION_SPREAD_ORDER,

    "att_first_seen_p50_tag": [ATT_FIRST_SEEN_MISSED, ATT_ARRIVAL_BEFORE_4S, ATT_ARRIVAL_AT_4S, ATT_ARRIVAL_OVER_4S, ATT_ARRIVAL_LATE],
    "att_first_seen_p90_tag": [ATT_FIRST_SEEN_MISSED, ATT_ARRIVAL_BEFORE_4S, ATT_ARRIVAL_AT_4S, ATT_ARRIVAL_OVER_4S, ATT_ARRIVAL_LATE],
    "att_first_seen_p95_tag": [ATT_FIRST_SEEN_MISSED, ATT_ARRIVAL_BEFORE_4S, ATT_ARRIVAL_AT_4S, ATT_ARRIVAL_OVER_4S, ATT_ARRIVAL_LATE],
    "att_first_seen_p99_tag": [ATT_FIRST_SEEN_MISSED, ATT_ARRIVAL_BEFORE_4S, ATT_ARRIVAL_AT_4S, ATT_ARRIVAL_OVER_4S, ATT_ARRIVAL_LATE],

    "att_spread_p50_tag": _PROPAGATION_SPREAD_ORDER,
    "att_spread_p90_tag": _PROPAGATION_SPREAD_ORDER,
    "att_spread_p95_tag": _PROPAGATION_SPREAD_ORDER,
    "att_spread_p99_tag": _PROPAGATION_SPREAD_ORDER,

    "att_inclusion_p50_tag": [ATT_INCLUSION_1, ATT_INCLUSION_2, ATT_INCLUSION_BELOW_5, ATT_INCLUSION_OVER_5],
    "att_inclusion_p90_tag": [ATT_INCLUSION_1, ATT_INCLUSION_2, ATT_INCLUSION_BELOW_5, ATT_INCLUSION_OVER_5],
    "att_inclusion_p95_tag": [ATT_INCLUSION_1, ATT_INCLUSION_2, ATT_INCLUSION_BELOW_5, ATT_INCLUSION_OVER_5],
    "att_inclusion_p99_tag": [ATT_INCLUSION_1, ATT_INCLUSION_2, ATT_INCLUSION_BELOW_5, ATT_INCLUSION_OVER_5],

    "agg_first_seen_p50_tag": [AGG_FIRST_SEEN_MISSED, AGG_ARRIVAL_BEFORE_8S, AGG_ARRIVAL_AT_8S, AGG_ARRIVAL_BEFORE_12S, AGG_ARRIVAL_LATE],
    "agg_first_seen_p90_tag": [AGG_FIRST_SEEN_MISSED, AGG_ARRIVAL_BEFORE_8S, AGG_ARRIVAL_AT_8S, AGG_ARRIVAL_BEFORE_12S, AGG_ARRIVAL_LATE],
    "agg_first_seen_p95_tag": [AGG_FIRST_SEEN_MISSED, AGG_ARRIVAL_BEFORE_8S, AGG_ARRIVAL_AT_8S, AGG_ARRIVAL_BEFORE_12S, AGG_ARRIVAL_LATE],
    "agg_first_seen_p99_tag": [AGG_FIRST_SEEN_MISSED, AGG_ARRIVAL_BEFORE_8S, AGG_ARRIVAL_AT_8S, AGG_ARRIVAL_BEFORE_12S, AGG_ARRIVAL_LATE],

    "agg_spread_p50_tag": _PROPAGATION_SPREAD_ORDER,
    "agg_spread_p90_tag": _PROPAGATION_SPREAD_ORDER,
    "agg_spread_p95_tag": _PROPAGATION_SPREAD_ORDER,
    "agg_spread_p99_tag": _PROPAGATION_SPREAD_ORDER,
}

TAG_GROUPS: dict[str, list[str]] = {
    "Blocks": [
        "blob_count_tag",
        "block_size_tag",
        "block_proposal_tag",
        "block_p50_arrival_tag",
        "block_p50_spread_tag",
    ],
    "Data Columns": [
        "first_col_proposal_tag",
        "last_col_proposal_tag",
        "col_first_seen_p50_tag",
        "col_first_seen_p90_tag",
        "col_first_seen_p95_tag",
        "col_first_seen_p99_tag",
        "col_spread_p50_tag",
        "col_spread_p90_tag",
        "col_spread_p95_tag",
        "col_spread_p99_tag",
    ],
    "Attestations": [
        "att_first_seen_p50_tag",
        "att_first_seen_p90_tag",
        "att_first_seen_p95_tag",
        "att_first_seen_p99_tag",
        "att_spread_p50_tag",
        "att_spread_p90_tag",
        "att_spread_p95_tag",
        "att_spread_p99_tag",
        "att_inclusion_p50_tag",
        "att_inclusion_p90_tag",
        "att_inclusion_p95_tag",
        "att_inclusion_p99_tag",
    ],
    "Aggregations": [
        "agg_first_seen_p50_tag",
        "agg_first_seen_p90_tag",
        "agg_first_seen_p95_tag",
        "agg_first_seen_p99_tag",
        "agg_spread_p50_tag",
        "agg_spread_p90_tag",
        "agg_spread_p95_tag",
        "agg_spread_p99_tag",
    ],
}

TAG_LABELS: dict[str, str] = {
    "block_size_tag": "Block Size",
    "block_proposal_tag": "Block Proposal Timing",
    "block_p50_arrival_tag": "Block P50 Arrival",
    "block_p50_spread_tag": "Block P50 Broadcast",
    "blob_count_tag": "Blob Count",
    "att_first_seen_p50_tag": "Att First Seen P50",
    "att_first_seen_p90_tag": "Att First Seen P90",
    "att_first_seen_p95_tag": "Att First Seen P95",
    "att_first_seen_p99_tag": "Att First Seen P99",
    "att_spread_p50_tag": "Att Spread P50",
    "att_spread_p90_tag": "Att Spread P90",
    "att_spread_p95_tag": "Att Spread P95",
    "att_spread_p99_tag": "Att Spread P99",
    "att_inclusion_p50_tag": "Att Inclusion Delay P50",
    "att_inclusion_p90_tag": "Att Inclusion Delay P90",
    "att_inclusion_p95_tag": "Att Inclusion Delay P95",
    "att_inclusion_p99_tag": "Att Inclusion Delay P99",
    "agg_first_seen_p50_tag": "Agg First Seen P50",
    "agg_first_seen_p90_tag": "Agg First Seen P90",
    "agg_first_seen_p95_tag": "Agg First Seen P95",
    "agg_first_seen_p99_tag": "Agg First Seen P99",
    "agg_spread_p50_tag": "Agg Spread P50",
    "agg_spread_p90_tag": "Agg Spread P90",
    "agg_spread_p95_tag": "Agg Spread P95",
    "agg_spread_p99_tag": "Agg Spread P99",
    "first_col_proposal_tag": "First Col Proposal",
    "last_col_proposal_tag": "Last Col Proposal",
    "col_first_seen_p50_tag": "Col First Seen P50",
    "col_first_seen_p90_tag": "Col First Seen P90",
    "col_first_seen_p95_tag": "Col First Seen P95",
    "col_first_seen_p99_tag": "Col First Seen P99",
    "col_spread_p50_tag": "Col Spread P50",
    "col_spread_p90_tag": "Col Spread P90",
    "col_spread_p95_tag": "Col Spread P95",
    "col_spread_p99_tag": "Col Spread P99",
}


def short_label(val: str | None) -> str:
    """Strip common tag prefixes for compact axis labels."""
    if val is None:
        return "n/a"
    return (
        val
        .replace("block_p50_propagation_", "")
        .replace("block_", "")
        .replace("_proposal", "")
        .replace("_tag", "")
        .replace("_", " ")
    )
