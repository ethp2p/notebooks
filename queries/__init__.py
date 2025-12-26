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
    "NUM_COLUMNS",
]
