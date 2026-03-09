"""
Fetch functions for PeerDAS analysis.

Each function executes SQL and writes directly to Parquet.
"""

from queries.blob_inclusion import (
    fetch_blobs_per_slot,
    fetch_blocks_blob_epoch,
    fetch_blob_popularity,
    fetch_slot_in_epoch,
)
from queries.blob_flow import fetch_blob_flow
from queries.column_propagation import fetch_col_first_seen, NUM_COLUMNS
from queries.slot_propagation_metrics import (
    fetch_attestation_arrivals,
    fetch_block_and_column_broadcast_info,
    fetch_aggregation_broadcast_info,
)

__all__ = [
    # Blob inclusion
    "fetch_blobs_per_slot",
    "fetch_blocks_blob_epoch",
    "fetch_blob_popularity",
    "fetch_slot_in_epoch",
    # Blob flow
    "fetch_blob_flow",
    # Column propagation
    "fetch_col_first_seen",
    # Attestation inclusion
    "fetch_attestation_arrivals",
    "fetch_aggregation_broadcast_info",
    "fetch_block_and_column_broadcast_info",
    "NUM_COLUMNS",
]
