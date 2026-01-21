# Contributoor Notebooks Workplan

This document outlines the plan to build Jupyter notebooks using the Contributoor ClickHouse database, which provides crowdsourced telemetry from validator operators (vs Xatu Sentries' hyperconnected node perspective).

## Overview

**Goal:** Build 12 notebooks total - 7 equivalents to existing Sentries notebooks + 5 new notebooks leveraging unique Contributoor data.

**Data source:** `mcp-clickhouse-xatu-contributoor` → `mainnet` database

**Key difference from Sentries:** Contributoor data comes from many distributed validator operators, providing a "validator's eye view" of the network rather than an edge observer view.

---

## Phase 1: Equivalent notebooks (adapt existing)

These notebooks mirror existing Sentries notebooks but use Contributoor data, offering a different perspective on the same metrics.

### 1.1 Blob inclusion (Contributoor)

**Priority:** High
**Equivalent to:** `01-blob-inclusion.ipynb`
**Status:** [ ] Not started

**Data sources:**
- `fct_block_blob_count` - Blob count per block (2.5M rows)
- `fct_block_blob_count_head` - Unfinalized chain blob counts

**Queries to create:**
```
queries/contributoor/blob_inclusion.py
├── fetch_blobs_per_slot()      # Blobs per slot timeseries
├── fetch_blocks_blob_epoch()   # Block counts by blob count per epoch
├── fetch_blob_popularity()     # Blob count distribution per epoch
└── fetch_slot_in_epoch()       # Blob count by slot position in epoch
```

**Notebook:** `notebooks/contributoor/01-blob-inclusion.ipynb`

---

### 1.2 Blob flow (Contributoor)

**Priority:** High
**Equivalent to:** `02-blob-flow.ipynb`
**Status:** [ ] Not started

**Data sources:**
- `fct_block_mev` - MEV relay data (1.5M rows)
- `fct_block_proposer_entity` - Proposer entity mapping (1.6M rows)
- `dim_block_blob_submitter` - Blob submitter names (533K rows)

**Queries to create:**
```
queries/contributoor/blob_flow.py
└── fetch_blob_flow()           # Proposer blobs with MEV relay + submitter data
```

**Notebook:** `notebooks/contributoor/02-blob-flow.ipynb`

---

### 1.3 Column propagation (Contributoor)

**Priority:** High
**Equivalent to:** `03-column-propagation.ipynb`
**Status:** [ ] Not started

**Data sources:**
- `fct_block_data_column_sidecar_first_seen_by_node` - Per-node column timing (3.6B rows)
- `fct_block_data_column_sidecar_first_seen` - Network-wide first seen (51M rows)
- `fct_data_column_availability_by_slot` - Column availability (113M rows)

**Queries to create:**
```
queries/contributoor/column_propagation.py
├── fetch_col_first_seen()      # Column first seen timing across 128 columns
└── fetch_col_by_node()         # Per-node column arrival (for geographic analysis)
```

**Notebook:** `notebooks/contributoor/03-column-propagation.ipynb`

**Key difference:** Shows propagation from many distributed vantage points vs few sentries.

---

### 1.4 MEV pipeline (Contributoor)

**Priority:** High
**Equivalent to:** `05-mev-pipeline.ipynb`
**Status:** [ ] Not started

**Data sources:**
- `fct_mev_bid_highest_value_by_builder_chunked_50ms` - 50ms bid progression (3.1B rows)
- `fct_mev_bid_count_by_builder` - Bids per builder (72M rows)
- `fct_mev_bid_count_by_relay` - Bids per relay (10M rows)
- `fct_block_mev` - Winning bids (1.5M rows)

**Queries to create:**
```
queries/contributoor/mev_pipeline.py
├── fetch_mev_bid_timeline()    # Bid value progression in 50ms chunks
├── fetch_builder_activity()    # Builder bid counts and win rates
└── fetch_relay_performance()   # Relay-level statistics
```

**Notebook:** `notebooks/contributoor/04-mev-pipeline.ipynb`

**Enhancement:** 50ms granularity bid data enables richer visualizations than Sentries.

---

### 1.5 Block/column timing (Contributoor)

**Priority:** Medium
**Equivalent to:** `06-block-column-timing.ipynb`
**Status:** [ ] Not started

**Data sources:**
- `fct_block_first_seen_by_node` - Block arrival times (420M rows)
- `fct_block_data_column_sidecar_first_seen_by_node` - Column arrival times (3.6B rows)
- `fct_block_blob_count` - Blob counts for correlation

**Queries to create:**
```
queries/contributoor/block_column_timing.py
├── fetch_block_timing()        # Block arrival latency distribution
├── fetch_column_timing()       # Column arrival after block
└── fetch_timing_by_blob_count() # Timing vs blob count correlation
```

**Notebook:** `notebooks/contributoor/05-block-column-timing.ipynb`

---

### 1.6 Propagation anomalies (Contributoor)

**Priority:** Medium
**Equivalent to:** `07-propagation-anomalies.ipynb`
**Status:** [ ] Not started

**Data sources:**
- `fct_block_first_seen_by_node` - Block timing
- `fct_block_data_column_sidecar_first_seen` - Column timing
- `fct_block_blob_count` - Expected delay based on blob count
- `fct_block_proposer_entity` - Proposer attribution

**Queries to create:**
```
queries/contributoor/propagation_anomalies.py
├── fetch_block_production_timeline()  # End-to-end timing
└── fetch_anomalies()                  # Blocks slower than expected
```

**Notebook:** `notebooks/contributoor/06-propagation-anomalies.ipynb`

---

### 1.7 Missed slots (Contributoor)

**Priority:** Medium
**Equivalent to:** `08-missed-slots.ipynb`
**Status:** [ ] Not started

**Data sources:**
- `fct_block` - Canonical blocks (1.6M rows)
- `fct_block_proposer` - Proposer duties (1.6M rows)
- `fct_block_proposer_entity` - Entity attribution

**Queries to create:**
```
queries/contributoor/missed_slots.py
├── fetch_missed_slots()        # Slots without blocks
└── fetch_missed_by_entity()    # Miss rate by staking entity
```

**Notebook:** `notebooks/contributoor/07-missed-slots.ipynb`

---

## Phase 2: New notebooks (unique Contributoor data)

These notebooks leverage data only available in Contributoor.

### 2.1 Engine API performance

**Priority:** High
**Status:** [ ] Not started

**Unique value:** Compare execution client performance (Geth, Nethermind, Besu, Erigon, Reth) for `engine_newPayload` and `engine_getBlobs` calls.

**Data sources:**
- `fct_engine_new_payload_by_el_client_hourly` - Hourly EL client stats (8K rows)
- `fct_engine_get_blobs_by_el_client_hourly` - Hourly blob fetch stats (8K rows)
- `fct_engine_new_payload_duration_chunked_50ms` - Latency distribution (1.7M rows)
- `fct_engine_get_blobs_duration_chunked_50ms` - Blob fetch latency (938K rows)

**Queries to create:**
```
queries/contributoor/engine_api.py
├── fetch_new_payload_by_client()   # engine_newPayload stats by EL client
├── fetch_get_blobs_by_client()     # engine_getBlobs stats by EL client
├── fetch_new_payload_latency()     # 50ms latency distribution
└── fetch_get_blobs_latency()       # 50ms blob fetch distribution
```

**Notebook:** `notebooks/contributoor/08-engine-api.ipynb`

**Visualizations:**
- Line chart: p50/p95/p99 latency by EL client over time
- CDF: Latency distribution comparison across clients
- Heatmap: Success rate by client by hour
- Bar chart: Request volume by client

---

### 2.2 Attestation timing

**Priority:** High
**Status:** [ ] Not started

**Unique value:** 50ms-granularity view of when attestations arrive on the network.

**Data sources:**
- `fct_attestation_first_seen_chunked_50ms` - Attestation timing (304M rows)
- `fct_attestation_observation_by_node` - Per-node observations (121M rows)

**Queries to create:**
```
queries/contributoor/attestation_timing.py
├── fetch_attestation_cdf()         # Cumulative attestation arrival
├── fetch_attestation_by_hour()     # Hourly timing percentiles
└── fetch_attestation_by_node()     # Node-level timing comparison
```

**Notebook:** `notebooks/contributoor/09-attestation-timing.ipynb`

**Visualizations:**
- CDF: Attestation arrival time from slot start
- Line chart: p50/p95/p99 over time
- Heatmap: Arrival distribution by time of day
- Reference line: 4-second inclusion deadline

---

### 2.3 Attestation correctness

**Priority:** High
**Status:** [ ] Not started

**Unique value:** Track head/source/target vote correctness at validator and entity level.

**Data sources:**
- `fct_attestation_correctness_canonical` - Per-block correctness (1.6M rows)
- `fct_attestation_liveness_by_entity_head` - Entity-level liveness (1.1B rows)

**Queries to create:**
```
queries/contributoor/attestation_correctness.py
├── fetch_correctness_daily()       # Daily correctness rates
├── fetch_correctness_by_entity()   # Entity-level breakdown
└── fetch_liveness_by_entity()      # Attestation participation rates
```

**Notebook:** `notebooks/contributoor/10-attestation-correctness.ipynb`

**Visualizations:**
- Stacked area: Correct vs incorrect attestations over time
- Bar chart: Top/bottom entities by correctness rate
- Line chart: Head/source/target correctness trends

---

### 2.4 Data column availability

**Priority:** Medium
**Status:** [ ] Not started

**Unique value:** Per-column availability across the network, identifying systematic gaps.

**Data sources:**
- `fct_data_column_availability_by_slot` - Per-slot availability (113M rows)
- `fct_data_column_availability_by_epoch` - Epoch aggregation (1.2M rows)
- `fct_data_column_availability_hourly` - Hourly trends (157K rows)

**Queries to create:**
```
queries/contributoor/column_availability.py
├── fetch_availability_by_column()  # Per-column availability rate
├── fetch_availability_hourly()     # Hourly availability trends
└── fetch_gaps()                    # Slots with missing columns
```

**Notebook:** `notebooks/contributoor/11-column-availability.ipynb`

**Visualizations:**
- Heatmap: Column index vs time, color = availability %
- Line chart: Overall availability trend
- Table: Columns with lowest availability

---

### 2.5 Prepared block analysis

**Priority:** Medium
**Status:** [ ] Not started

**Unique value:** See what validators *would have* proposed if selected - reveals local block building patterns.

**Data sources:**
- `fct_prepared_block` - Prepared proposals (41M rows)
- `fct_block` - Actual blocks for comparison

**Queries to create:**
```
queries/contributoor/prepared_blocks.py
├── fetch_prepared_vs_actual()      # Compare prepared vs winning block
├── fetch_prepared_blob_count()     # Blob inclusion in prepared blocks
└── fetch_local_vs_mev()            # Local building vs MEV relay usage
```

**Notebook:** `notebooks/contributoor/12-prepared-blocks.ipynb`

**Visualizations:**
- Histogram: Prepared block blob counts
- Comparison: Prepared vs actual block value
- Pie chart: Local vs MEV relay block building

---

## Phase 3: Infrastructure

### 3.1 Query module structure

Create new query directory for Contributoor:
```
queries/
├── blob_inclusion.py           # Existing Sentries queries
├── ...
└── contributoor/               # NEW
    ├── __init__.py
    ├── blob_inclusion.py
    ├── blob_flow.py
    ├── column_propagation.py
    ├── mev_pipeline.py
    ├── block_column_timing.py
    ├── propagation_anomalies.py
    ├── missed_slots.py
    ├── engine_api.py
    ├── attestation_timing.py
    ├── attestation_correctness.py
    ├── column_availability.py
    └── prepared_blocks.py
```

### 3.2 Pipeline configuration

Add to `pipeline.yaml`:
```yaml
# Contributoor query registry
contributoor_queries:
  c_blobs_per_slot:
    module: queries.contributoor.blob_inclusion
    function: fetch_blobs_per_slot
    output_file: contributoor/blobs_per_slot.parquet
    database: contributoor
  # ... etc

# Contributoor notebook registry
contributoor_notebooks:
  - id: c-blob-inclusion
    title: Blob inclusion (Contributoor)
    source: notebooks/contributoor/01-blob-inclusion.ipynb
    queries: [c_blobs_per_slot, ...]
```

### 3.3 Data loader updates

Update `notebooks/loaders.py` to support Contributoor data path:
```python
def load_parquet(name: str, source: str = "sentries") -> pd.DataFrame:
    """Load parquet with source selection."""
    if source == "contributoor":
        path = DATA_DIR / "contributoor" / f"{name}.parquet"
    else:
        path = DATA_DIR / f"{name}.parquet"
    ...
```

### 3.4 Site navigation

Add Contributoor section to site navigation:
- New sidebar section: "Contributoor Data"
- Badge or indicator showing data source
- Shared date navigation

---

## Implementation order

### Sprint 1: Foundation + high-value notebooks
1. [ ] Create `queries/contributoor/` directory structure
2. [ ] Update pipeline.yaml schema for multi-source support
3. [ ] Build: Engine API performance (unique, high value)
4. [ ] Build: Attestation timing (unique, high value)
5. [ ] Build: Blob inclusion (equivalent, validates approach)

### Sprint 2: Core equivalents
6. [ ] Build: Blob flow
7. [ ] Build: Column propagation
8. [ ] Build: MEV pipeline
9. [ ] Build: Block/column timing

### Sprint 3: Remaining notebooks
10. [ ] Build: Propagation anomalies
11. [ ] Build: Missed slots
12. [ ] Build: Attestation correctness
13. [ ] Build: Data column availability
14. [ ] Build: Prepared block analysis

### Sprint 4: Integration
15. [ ] Site navigation updates
16. [ ] Documentation
17. [ ] CI/CD pipeline updates

---

## Success criteria

- [ ] All 12 notebooks render without errors
- [ ] Data fetches complete within reasonable time (<5 min each)
- [ ] Visualizations match quality of existing notebooks
- [ ] Site navigation cleanly separates Sentries vs Contributoor views
- [ ] Pipeline supports both data sources in single `just sync`

---

## Open questions

1. **Shared vs separate dates:** Should Contributoor notebooks use same date range as Sentries, or independent?
2. **URL structure:** `/contributoor/{date}/{notebook}` or `/{date}/contributoor/{notebook}`?
3. **Data retention:** Same 365-day rolling window as Sentries?
4. **Caching strategy:** Separate manifest for Contributoor data?

---

## Appendix: Table row counts

| Table | Rows | Notes |
|-------|------|-------|
| `fct_block` | 1.6M | Finalized blocks |
| `fct_block_blob_count` | 2.5M | Blob counts |
| `fct_block_first_seen_by_node` | 420M | Block timing |
| `fct_block_data_column_sidecar_first_seen_by_node` | 3.6B | Column timing |
| `fct_attestation_first_seen_chunked_50ms` | 304M | Attestation timing |
| `fct_attestation_liveness_by_entity_head` | 1.1B | Entity liveness |
| `fct_mev_bid_highest_value_by_builder_chunked_50ms` | 3.1B | MEV bids |
| `fct_engine_new_payload_by_el_client` | 2.3M | Engine API |
| `fct_prepared_block` | 41M | Prepared proposals |

---

*Created: 2026-01-15*
*Last updated: 2026-01-15*
