# Plan 03: query consolidation and pre-aggregations

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
>
> **BEFORE STARTING, READ `docs/superpowers/plans/ERRATA.md` IN FULL.** Entries override this plan wherever they conflict.
>
> **IF YOU DEVIATE from this plan**, append to `ERRATA.md` BEFORE marking the step complete.

**Goal:** Add consolidated primary-dataset queries (`block_events`, `blob_events`, `mempool_events`) and the four pre-aggregation queries (`col_first_seen_binned`, `block_timeline_cdf`, `region_size_matrix`, `blob_flow_edges`) to the observatory pipeline. The older per-chart queries stay in place alongside; they will be removed in Plan 07 once every chart has migrated.

**Architecture:** Eight new entries in `observatory/src/queries/` plus a new `observatory/src/queries/aggregated/` subdirectory for the pre-aggregations. Each new query uses `query({...})` the same way the Plan 02 ports did. ClickHouse does the heavy lifting: pre-aggregations are pure SQL (`quantileExact`, `floor(...)` time buckets, `groupArray`, etc.) so the browser never sees more than tens of thousands of rows for these queries.

**Tech Stack:** Same as Plan 02 (Bun, `@clickhouse/client`, `apache-arrow`, Zod, `p-limit`).

---

## Scope and non-scope

**In scope:**
- Three new primary dataset queries: `block_events`, `blob_events`, `mempool_events`.
- Four new aggregated queries: `col_first_seen_binned`, `block_timeline_cdf`, `region_size_matrix`, `blob_flow_edges`.
- Unit tests for the schemas.
- Dry-run a single date end-to-end through all new queries.
- Update `pipeline.yaml` (no structural change; the registry is code, not YAML).

**Out of scope:**
- Deleting the old per-chart queries (Plan 07 does this once charts are migrated).
- Charts or UI (Plans 04-06).

## File structure

```
observatory/src/queries/
├── registry.ts                                 # unchanged
├── index.ts                                    # add imports for the 7 new modules
├── block_production_events.ts                  # NEW: defines `block_events`
├── blob_inclusion_events.ts                    # NEW: defines `blob_events`
├── mempool_events.ts                           # NEW: defines `mempool_events`
└── aggregated/
    ├── col_first_seen_binned.ts                # NEW
    ├── block_timeline_cdf.ts                   # NEW
    ├── region_size_matrix.ts                   # NEW
    └── blob_flow_edges.ts                      # NEW
```

Existing files from Plan 02 are untouched.

---

## Task 01: `block_events` primary dataset

**Files:**
- Create: `observatory/src/queries/block_production_events.ts`
- Modify: `observatory/src/queries/index.ts`

- [ ] **Step 1: Write the schema + query**

```ts
// observatory/src/queries/block_production_events.ts
import { z } from 'zod';
import { query } from './registry';

export const BlockEventsRow = z.object({
  slot:              z.number().int(),
  slot_start:        z.coerce.date(),
  event_type:        z.enum([
    'bid_received',
    'bid_winning',
    'block_arrival',
    'first_column_seen',
    'last_column_seen',
  ]),
  builder_pubkey:    z.string().nullable(),
  proposer_pubkey:   z.string(),
  relay:             z.string().nullable(),
  region:            z.string().nullable(),
  wire_size_bytes:   z.number().int().nullable(),
  latency_ms:        z.number().nullable(),
  is_mev:            z.boolean(),
  blob_count:        z.number().int().nonnegative(),
  winning_bid_wei:   z.string().nullable(),  // bigint-as-string
});
export type BlockEventsRow = z.infer<typeof BlockEventsRow>;

export const blockEvents = query({
  id: 'block_events',
  topic: 'block-production',
  description:
    'Row-level block-production events for the day: bidding, arrival, column first/last seen. ' +
    'One row per (slot, event_type). Wide schema feeding every block-production chart.',
  schema: BlockEventsRow,
  async fetch(client, { date }) {
    // SQL sketch: adapt to your canonical Xatu table names and column conventions.
    // Union the five event types into one table, tagging each row with event_type.
    const sql = /* sql */ `
      WITH
        bids AS (
          SELECT slot,
                 slot_start_date_time                         AS slot_start,
                 'bid_received'                                AS event_type,
                 builder_pubkey,
                 proposer_pubkey,
                 relay_name                                    AS relay,
                 NULL                                          AS region,
                 NULL                                          AS wire_size_bytes,
                 dateDiff('millisecond', slot_start_date_time, bid_received_at) AS latency_ms,
                 1                                             AS is_mev_raw,
                 blob_count,
                 toString(value_wei)                           AS winning_bid_wei
          FROM mev_relay_bid_trace
          WHERE toDate(slot_start_date_time) = {date:Date}
        ),
        winning AS (
          SELECT slot, slot_start_date_time AS slot_start, 'bid_winning' AS event_type,
                 builder_pubkey, proposer_pubkey, relay_name AS relay, NULL AS region,
                 NULL AS wire_size_bytes,
                 dateDiff('millisecond', slot_start_date_time, bid_winning_at) AS latency_ms,
                 1 AS is_mev_raw, blob_count, toString(value_wei) AS winning_bid_wei
          FROM mev_relay_winning_bid
          WHERE toDate(slot_start_date_time) = {date:Date}
        ),
        arrivals AS (
          SELECT slot, slot_start_date_time AS slot_start, 'block_arrival' AS event_type,
                 NULL AS builder_pubkey, proposer_pubkey, NULL AS relay,
                 region, wire_size_bytes,
                 dateDiff('millisecond', slot_start_date_time, first_seen_at) AS latency_ms,
                 is_mev AS is_mev_raw, blob_count, NULL AS winning_bid_wei
          FROM canonical_beacon_block_sentry_arrival
          WHERE toDate(slot_start_date_time) = {date:Date}
        ),
        first_cols AS (
          SELECT slot, slot_start_date_time AS slot_start, 'first_column_seen' AS event_type,
                 NULL AS builder_pubkey, proposer_pubkey, NULL AS relay,
                 region, NULL AS wire_size_bytes,
                 dateDiff('millisecond', slot_start_date_time, first_column_at) AS latency_ms,
                 is_mev AS is_mev_raw, blob_count, NULL AS winning_bid_wei
          FROM data_column_first_seen
          WHERE toDate(slot_start_date_time) = {date:Date}
        ),
        last_cols AS (
          SELECT slot, slot_start_date_time AS slot_start, 'last_column_seen' AS event_type,
                 NULL AS builder_pubkey, proposer_pubkey, NULL AS relay,
                 region, NULL AS wire_size_bytes,
                 dateDiff('millisecond', slot_start_date_time, last_column_at) AS latency_ms,
                 is_mev AS is_mev_raw, blob_count, NULL AS winning_bid_wei
          FROM data_column_last_seen
          WHERE toDate(slot_start_date_time) = {date:Date}
        )
      SELECT slot, slot_start, event_type, builder_pubkey, proposer_pubkey,
             relay, region, wire_size_bytes, latency_ms,
             if(is_mev_raw = 1, true, false) AS is_mev,
             blob_count, winning_bid_wei
      FROM (
        SELECT * FROM bids
        UNION ALL SELECT * FROM winning
        UNION ALL SELECT * FROM arrivals
        UNION ALL SELECT * FROM first_cols
        UNION ALL SELECT * FROM last_cols
      )
      ORDER BY slot, event_type
    `;

    const rs = await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlockEventsRow.parse(r));
  },
});
```

The exact table names here (`mev_relay_bid_trace`, `canonical_beacon_block_sentry_arrival`, etc.) are placeholders matching the EthPandaOps Xatu naming convention. Before running, confirm the real names by inspecting `queries/block_production_timeline.py`:

```bash
grep -nE 'FROM [a-z_]+' queries/block_production_timeline.py | head
```

Update the SQL to match. Append any SQL surprises to ERRATA.

- [ ] **Step 2: Register the module**

```ts
// observatory/src/queries/index.ts (append)
import './block_production_events';
```

- [ ] **Step 3: Dry-run for yesterday**

```bash
cd observatory && bun run fetch --only block_events --date $(date -v -1d +%F)
```

Expected: exit 0; `build/data/<yesterday>/block_events.arrow` exists; row count is large (tens of thousands to low hundreds of thousands, across five event types × ~7200 slots).

- [ ] **Step 4: Verify shape**

```bash
cd observatory && bun -e '
  import { readArrow } from "./src/arrow";
  const t = await readArrow("../build/data/'$(date -v -1d +%F)'/block_events.arrow");
  console.log("rows", t.numRows);
  console.log("event types:", Array.from(new Set(t.getChild("event_type")!.toArray())));
'
```

Expected: row count non-zero; five distinct event types.

- [ ] **Step 5: Commit**

```bash
git add observatory/src/queries/block_production_events.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): block_events primary dataset"
```

## Task 02: `blob_events` primary dataset

**Files:**
- Create: `observatory/src/queries/blob_inclusion_events.ts`
- Modify: `observatory/src/queries/index.ts`

- [ ] **Step 1: Write the schema + query**

```ts
// observatory/src/queries/blob_inclusion_events.ts
import { z } from 'zod';
import { query } from './registry';

export const BlobEventsRow = z.object({
  slot:             z.number().int(),
  slot_start:       z.coerce.date(),
  epoch:            z.number().int(),
  blob_count:       z.number().int().nonnegative(),
  proposer_pubkey:  z.string(),
  entity:           z.string().nullable(),
  is_mev:           z.boolean(),
});
export type BlobEventsRow = z.infer<typeof BlobEventsRow>;

export const blobEvents = query({
  id: 'blob_events',
  topic: 'blob-inclusion',
  description:
    'Row-level blob-inclusion events for the day. One row per slot; ' +
    'charts slice/pivot for density, popularity, slot-in-epoch, etc.',
  schema: BlobEventsRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
      SELECT DISTINCT
        slot,
        slot_start_date_time AS slot_start,
        intDiv(slot, 32)     AS epoch,
        blob_count,
        proposer_pubkey,
        proposer_entity      AS entity,
        is_mev
      FROM canonical_beacon_block
      WHERE toDate(slot_start_date_time) = {date:Date}
      ORDER BY slot
    `;
    const rs = await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobEventsRow.parse(r));
  },
});
```

Confirm the column names against `queries/blob_inclusion.py`. The `DISTINCT` is required (see commit `d0ce799`).

- [ ] **Step 2-5:** same pattern as Task 01 (register, fetch, verify, commit).

```bash
# Register
echo "import './blob_inclusion_events';" >> observatory/src/queries/index.ts
# Fetch
cd observatory && bun run fetch --only blob_events --date $(date -v -1d +%F)
# Verify
bun -e 'import { readArrow } from "./src/arrow"; const t = await readArrow("../build/data/'$(date -v -1d +%F)'/blob_events.arrow"); console.log("rows", t.numRows);'
# Commit
git add observatory/src/queries/blob_inclusion_events.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): blob_events primary dataset"
```

## Task 03: `mempool_events` primary dataset

**Files:**
- Create: `observatory/src/queries/mempool_events.ts`
- Modify: `observatory/src/queries/index.ts`

- [ ] **Step 1: Write**

```ts
// observatory/src/queries/mempool_events.ts
import { z } from 'zod';
import { query } from './registry';

export const MempoolEventsRow = z.object({
  slot:             z.number().int(),
  slot_start:       z.coerce.date(),
  tx_hash:          z.string(),
  tx_type:          z.enum(['legacy', 'eip2930', 'eip1559', 'blob', 'setcode']),
  sentry:           z.string().nullable(),
  mempool_seen_at:  z.coerce.date().nullable(),
  included_at:      z.coerce.date().nullable(),
  age_ms:           z.number().nullable(),
  delay_ms:         z.number().nullable(),
  visibility:       z.enum(['before', 'after', 'never']),
});
export type MempoolEventsRow = z.infer<typeof MempoolEventsRow>;

export const mempoolEvents = query({
  id: 'mempool_events',
  topic: 'mempool-visibility',
  description:
    'Row-level mempool visibility events. One row per tx with visibility timing. Feeds every mempool chart.',
  schema: MempoolEventsRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
      SELECT
        slot, slot_start_date_time AS slot_start,
        tx_hash,
        tx_type,
        sentry_name AS sentry,
        mempool_seen_at,
        included_at,
        dateDiff('millisecond', mempool_seen_at, included_at) AS age_ms,
        dateDiff('millisecond', slot_start_date_time, included_at) AS delay_ms,
        CASE
          WHEN mempool_seen_at IS NULL                                 THEN 'never'
          WHEN mempool_seen_at <= slot_start_date_time                 THEN 'before'
          ELSE 'after'
        END AS visibility
      FROM mempool_tx_events
      WHERE toDate(slot_start_date_time) = {date:Date}
    `;
    const rs = await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => MempoolEventsRow.parse(r));
  },
});
```

Confirm against `queries/mempool_visibility.py`; update table/column names to match.

- [ ] **Step 2-5:** register, fetch, verify, commit as Task 01.

```bash
git add observatory/src/queries/mempool_events.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): mempool_events primary dataset"
```

## Task 04: `col_first_seen_binned` aggregation (128 × 480)

**Files:**
- Create: `observatory/src/queries/aggregated/col_first_seen_binned.ts`
- Modify: `observatory/src/queries/index.ts`

- [ ] **Step 1: Write**

```ts
// observatory/src/queries/aggregated/col_first_seen_binned.ts
import { z } from 'zod';
import { query } from '../registry';

export const ColFirstSeenBinnedRow = z.object({
  column_index: z.number().int().min(0).max(127),
  time_bucket:  z.number().int().min(0).max(479),        // 5-minute buckets across 24h
  median_ms:    z.number().nullable(),
  p95_ms:       z.number().nullable(),
  min_ms:       z.number().nullable(),
  max_ms:       z.number().nullable(),
  missing_count: z.number().int().nonnegative(),
});
export type ColFirstSeenBinnedRow = z.infer<typeof ColFirstSeenBinnedRow>;

export const colFirstSeenBinned = query({
  id: 'col_first_seen_binned',
  topic: 'column-propagation',
  description:
    '128 columns x 480 (5-minute) buckets: median, p95, min, max of first-seen ms, plus missing count.',
  schema: ColFirstSeenBinnedRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
      WITH base AS (
        SELECT
          column_index,
          toUInt32(intDiv(
            toUInt32(toUnixTimestamp(slot_start_date_time)) -
            toUInt32(toUnixTimestamp(toDateTime(concat('{date:Date}'::String, ' 00:00:00')))),
            300
          )) AS time_bucket,
          first_seen_ms
        FROM col_first_seen
        WHERE toDate(slot_start_date_time) = {date:Date}
      )
      SELECT
        column_index,
        time_bucket,
        quantileExactIf(0.5)(first_seen_ms,  first_seen_ms IS NOT NULL)  AS median_ms,
        quantileExactIf(0.95)(first_seen_ms, first_seen_ms IS NOT NULL) AS p95_ms,
        minIf(first_seen_ms,  first_seen_ms IS NOT NULL) AS min_ms,
        maxIf(first_seen_ms,  first_seen_ms IS NOT NULL) AS max_ms,
        countIf(first_seen_ms IS NULL)                   AS missing_count
      FROM base
      GROUP BY column_index, time_bucket
      ORDER BY column_index, time_bucket
    `;
    const rs = await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => ColFirstSeenBinnedRow.parse(r));
  },
});
```

- [ ] **Step 2-5:** register, fetch, verify.

```bash
echo "import './aggregated/col_first_seen_binned';" >> observatory/src/queries/index.ts
cd observatory && bun run fetch --only col_first_seen_binned --date $(date -v -1d +%F)
```

Expected: row count ≤ 128 × 480 = 61,440. Likely lower if some buckets are empty.

- [ ] **Step 6: Commit**

```bash
git add observatory/src/queries/aggregated/col_first_seen_binned.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): col_first_seen_binned aggregation (128x480)"
```

## Task 05: `block_timeline_cdf` aggregation

**Files:**
- Create: `observatory/src/queries/aggregated/block_timeline_cdf.ts`

- [ ] **Step 1: Write**

```ts
// observatory/src/queries/aggregated/block_timeline_cdf.ts
import { z } from 'zod';
import { query } from '../registry';

export const BlockTimelineCdfRow = z.object({
  region:       z.enum(['eu-west', 'eu-east', 'us-east', 'us-west']),
  source:       z.enum(['sentry', 'contributoor']),
  size_bucket:  z.enum(['tiny', 'small', 'medium', 'large']),
  builder_type: z.enum(['mev', 'local']),
  percentile:   z.number().int().min(0).max(100),
  value_ms:     z.number(),
});

export const blockTimelineCdf = query({
  id: 'block_timeline_cdf',
  topic: 'block-propagation',
  description:
    'Pre-computed 101-percentile CDFs per (region x source x size_bucket x builder_type) for chart 9.10.',
  schema: BlockTimelineCdfRow,
  async fetch(client, { date }) {
    // Materialise union of sentry + contributoor arrivals, bin by size, tag builder type,
    // then compute every percentile 0..100 via arrayJoin.
    const sql = /* sql */ `
      WITH joined AS (
        SELECT region,
               'sentry'        AS source,
               size_bucket,
               if(is_mev, 'mev', 'local') AS builder_type,
               latency_ms
        FROM canonical_beacon_block_sentry_arrival
        WHERE toDate(slot_start_date_time) = {date:Date}

        UNION ALL

        SELECT region,
               'contributoor'  AS source,
               size_bucket,
               if(is_mev, 'mev', 'local') AS builder_type,
               latency_ms
        FROM canonical_beacon_block_contributoor_arrival
        WHERE toDate(slot_start_date_time) = {date:Date}
      )
      SELECT region, source, size_bucket, builder_type,
             p AS percentile,
             quantileExact(toFloat64(p) / 100.0)(latency_ms) AS value_ms
      FROM joined
      ARRAY JOIN range(0, 101) AS p
      GROUP BY region, source, size_bucket, builder_type, p
      ORDER BY region, source, size_bucket, builder_type, p
    `;
    const rs = await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlockTimelineCdfRow.parse(r));
  },
});
```

Note: `quantileExact(p)` expects p at query-plan time, not per-row. ClickHouse offers `quantilesExact(0.0, 0.01, ..., 1.0)(x)` to compute many quantiles in one pass. If the above form is too slow, rewrite as `SELECT quantilesExact(...)(latency_ms) AS qs` and `ARRAY JOIN` across the resulting array in the outer query. Append to ERRATA if you rewrite.

- [ ] **Step 2-5:** register, fetch (expect ≤ 6,464 rows), verify, commit.

```bash
echo "import './aggregated/block_timeline_cdf';" >> observatory/src/queries/index.ts
cd observatory && bun run fetch --only block_timeline_cdf --date $(date -v -1d +%F)
git add observatory/src/queries/aggregated/block_timeline_cdf.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): block_timeline_cdf pre-aggregated CDFs"
```

## Task 06: `region_size_matrix` aggregation

**Files:**
- Create: `observatory/src/queries/aggregated/region_size_matrix.ts`

- [ ] **Step 1: Write**

```ts
// observatory/src/queries/aggregated/region_size_matrix.ts
import { z } from 'zod';
import { query } from '../registry';

export const RegionSizeMatrixRow = z.object({
  region:      z.string(),
  size_bucket: z.string(),
  source:      z.enum(['sentry', 'contributoor']),
  median_ms:   z.number(),
  count:       z.number().int().nonnegative(),
});

export const regionSizeMatrix = query({
  id: 'region_size_matrix',
  topic: 'block-propagation',
  description: 'Per (region x size_bucket x source) median latency and count. ~32 rows for chart 9.12.',
  schema: RegionSizeMatrixRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
      SELECT region, size_bucket, 'sentry' AS source,
             quantileExact(0.5)(latency_ms) AS median_ms,
             count() AS count
      FROM canonical_beacon_block_sentry_arrival
      WHERE toDate(slot_start_date_time) = {date:Date}
      GROUP BY region, size_bucket

      UNION ALL

      SELECT region, size_bucket, 'contributoor' AS source,
             quantileExact(0.5)(latency_ms) AS median_ms,
             count() AS count
      FROM canonical_beacon_block_contributoor_arrival
      WHERE toDate(slot_start_date_time) = {date:Date}
      GROUP BY region, size_bucket

      ORDER BY region, size_bucket, source
    `;
    const rs = await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => RegionSizeMatrixRow.parse(r));
  },
});
```

- [ ] **Step 2-5:** register, fetch (expect ≤ ~32 rows), verify, commit.

```bash
echo "import './aggregated/region_size_matrix';" >> observatory/src/queries/index.ts
cd observatory && bun run fetch --only region_size_matrix --date $(date -v -1d +%F)
git add observatory/src/queries/aggregated/region_size_matrix.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): region_size_matrix aggregation"
```

## Task 07: `blob_flow_edges` aggregation

**Files:**
- Create: `observatory/src/queries/aggregated/blob_flow_edges.ts`

- [ ] **Step 1: Write**

```ts
// observatory/src/queries/aggregated/blob_flow_edges.ts
import { z } from 'zod';
import { query } from '../registry';

export const BlobFlowEdgesRow = z.object({
  stage:         z.enum([
    'entity_to_blob',
    'relay_to_blob',
    'entity_to_relay',
    'entity_to_relay_to_blob',
  ]),
  source:        z.string(),
  target:        z.string(),
  intermediate:  z.string().nullable(),       // for 3-stage edges
  value:         z.number().int().nonnegative(),
});

export const blobFlowEdges = query({
  id: 'blob_flow_edges',
  topic: 'blob-flow',
  description:
    'Sankey edge lists for the four blob-flow diagrams. ' +
    'One row per (stage, source, target, intermediate) with block counts.',
  schema: BlobFlowEdgesRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
      WITH base AS (
        SELECT proposer_entity AS entity,
               relay_name       AS relay,
               toString(blob_count) AS blob_bin
        FROM canonical_beacon_block
        WHERE toDate(slot_start_date_time) = {date:Date}
      )
      SELECT 'entity_to_blob'           AS stage,
             entity AS source, blob_bin AS target, NULL AS intermediate, count() AS value
      FROM base GROUP BY entity, blob_bin

      UNION ALL

      SELECT 'relay_to_blob'            AS stage,
             if(isNull(relay), 'none', relay) AS source,
             blob_bin AS target, NULL AS intermediate, count() AS value
      FROM base GROUP BY relay, blob_bin

      UNION ALL

      SELECT 'entity_to_relay'          AS stage,
             entity AS source,
             if(isNull(relay), 'none', relay) AS target,
             NULL AS intermediate, count() AS value
      FROM base GROUP BY entity, relay

      UNION ALL

      SELECT 'entity_to_relay_to_blob'  AS stage,
             entity AS source,
             if(isNull(relay), 'none', relay) AS target,
             blob_bin AS intermediate,
             count() AS value
      FROM base GROUP BY entity, relay, blob_bin

      ORDER BY stage, value DESC
    `;
    const rs = await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobFlowEdgesRow.parse(r));
  },
});
```

- [ ] **Step 2-5:** register, fetch (expect ~1,000-2,000 rows), verify, commit.

```bash
echo "import './aggregated/blob_flow_edges';" >> observatory/src/queries/index.ts
cd observatory && bun run fetch --only blob_flow_edges --date $(date -v -1d +%F)
git add observatory/src/queries/aggregated/blob_flow_edges.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): blob_flow_edges aggregation for sankeys"
```

## Task 08: end-to-end dry run for a full date

**Files:**
- None; verification only.

- [ ] **Step 1: Remove cache + data for yesterday to force a fresh run**

```bash
rm -rf build/data/$(date -v -1d +%F)
rm -f build/.cache.json build/.failures.json
```

- [ ] **Step 2: Full fetch**

```bash
cd observatory && bun run fetch --date $(date -v -1d +%F)
```

Expected: every registered query succeeds. Output files land in `build/data/<yesterday>/`:

- Primary: `blobs_per_slot.arrow`, `blocks_blob_epoch.arrow`, `blob_popularity.arrow`, `slot_in_epoch.arrow`, `blob_flow.arrow`, `col_first_seen.arrow`, `tx_per_slot.arrow`, `mempool_coverage.arrow`, `sentry_coverage.arrow`, `mempool_availability.arrow`, `block_production_timeline.arrow`, `block_propagation_by_size.arrow`, `block_propagation_by_region.arrow`, `block_propagation_by_region_contributoor.arrow`
- New primary datasets: `block_events.arrow`, `blob_events.arrow`, `mempool_events.arrow`
- Aggregations: `col_first_seen_binned.arrow`, `block_timeline_cdf.arrow`, `region_size_matrix.arrow`, `blob_flow_edges.arrow`

- [ ] **Step 3: List and size-check**

```bash
ls -la build/data/$(date -v -1d +%F)/*.arrow | awk '{print $9, $5}'
```

Append observed file sizes to ERRATA as a record.

- [ ] **Step 4: Verify row counts roughly match spec estimates**

```bash
cd observatory && bun -e '
  import { readArrow } from "./src/arrow";
  import fs from "node:fs";
  const date = process.env.DATE || "'$(date -v -1d +%F)'";
  const dir = `../build/data/${date}`;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".arrow"))) {
    const t = await readArrow(`${dir}/${f}`);
    console.log(f.padEnd(40), String(t.numRows).padStart(8));
  }
'
```

Expected order of magnitude:
- `block_events`: > 10,000 (5 event types × ~7,200 slots, minus gaps)
- `blob_events`: ~7,200
- `mempool_events`: hundreds of thousands (depends on mempool activity)
- `col_first_seen_binned`: ≤ 61,440
- `block_timeline_cdf`: ≤ 6,464
- `region_size_matrix`: ≤ 32
- `blob_flow_edges`: ~1,000 - 2,000

If any is dramatically off (10x), investigate and append notes to ERRATA.

## Task 09: wire Parallelism tuning into the test harness

**Files:**
- Modify: `observatory/src/fetch.ts` (sanity check the parallelism hook is respected; already coded in Plan 02: just verify it here)

- [ ] **Step 1: Verify that `--workers 1` and `--workers 8` both succeed**

```bash
cd observatory
bun run fetch --only region_size_matrix --date $(date -v -1d +%F) --workers 1
bun run fetch --only region_size_matrix --date $(date -v -1d +%F) --workers 8
```

Expected: both succeed (the second might skip because the first hit cache).

- [ ] **Step 2: Commit (no code changes unless the verify uncovers a bug)**

If a bug is found, fix it, test it, and commit with an appropriate conventional message.

## Self-review checklist

- [ ] Each of the seven new query IDs is in `QUERY_REGISTRY` after `import './queries/index'`.
- [ ] `block_events`, `blob_events`, `mempool_events` produce non-empty Arrow files with schemas matching the Zod types.
- [ ] `col_first_seen_binned` produces ≤ 61,440 rows.
- [ ] `block_timeline_cdf` produces ≤ 6,464 rows.
- [ ] `region_size_matrix` produces ≤ ~32 rows.
- [ ] `blob_flow_edges` produces a few thousand rows across four stages.
- [ ] No existing query was deleted. (Old queries continue to run; cleanup is Plan 07.)
- [ ] `bun run fetch --date <yesterday>` returns exit code 0 for a clean build.
- [ ] ERRATA entries exist for any table/column name substitutions, SQL shape changes, or row-count surprises.

## Done condition

`plan-03-query-consolidation` PR merged. The observatory pipeline now produces all primary datasets and pre-aggregations required by the new charts. Old per-chart queries continue to run in parallel. Next: Plan 04 builds the chart authoring scaffold so the site can render from these Arrow files.
