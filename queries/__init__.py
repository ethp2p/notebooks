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
from queries.slot_tagger import (
    fetch_slot_tags,
    TAG_ORDERS,
    TAG_GROUPS,
    short_label,
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
    # Slot tagger
    "fetch_slot_tags",
    "NUM_COLUMNS",
    "TAG_ORDERS",
    "TAG_GROUPS",
    "short_label",
]
