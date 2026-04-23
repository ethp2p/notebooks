import { z } from 'zod';
import { query } from './registry';

// ---------------------------------------------------------------------------
// tx_per_slot
// ---------------------------------------------------------------------------

const TxPerSlotRow = z.object({
  slot: z.number().int(),
  slot_start_date_time: z.coerce.date(),
  tx_type: z.number().int(),
  total_txs: z.number().int(),
});

export const txPerSlot = query({
  id: 'tx_per_slot',
  topic: 'mempool-visibility',
  description: 'Transaction counts per slot per type',
  schema: TxPerSlotRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
SELECT
    slot,
    slot_start_date_time,
    type AS tx_type,
    count() AS total_txs
FROM canonical_beacon_block_execution_transaction
WHERE meta_network_name = {network:String}
  AND slot_start_date_time >= {date:Date}
  AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
GROUP BY slot, slot_start_date_time, type
ORDER BY slot, type
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => TxPerSlotRow.parse(r));
  },
});

// ---------------------------------------------------------------------------
// mempool_coverage
// ---------------------------------------------------------------------------

const MempoolCoverageRow = z.object({
  hour: z.coerce.date(),
  tx_type: z.number().int(),
  total_txs: z.number().int(),
  seen_in_mempool: z.number().int(),
});

export const mempoolCoverage = query({
  id: 'mempool_coverage',
  topic: 'mempool-visibility',
  description: 'Hourly mempool coverage and wait time stats',
  schema: MempoolCoverageRow,
  async fetch(client, { date }) {
    // The subquery date window extends 1 hour before the target date to catch
    // transactions that entered the mempool just before midnight.
    const sql = /* sql */ `
SELECT
    toStartOfHour(slot_start_date_time) AS hour,
    type AS tx_type,
    count() AS total_txs,
    countIf(hash GLOBAL IN (
        SELECT DISTINCT hash
        FROM mempool_transaction
        WHERE meta_network_name = {network:String}
          AND event_date_time >= {date:Date} - INTERVAL 1 HOUR
          AND event_date_time < {date:Date} + INTERVAL 1 DAY
    )) AS seen_in_mempool
FROM canonical_beacon_block_execution_transaction
WHERE meta_network_name = {network:String}
  AND slot_start_date_time >= {date:Date}
  AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
GROUP BY hour, tx_type
ORDER BY hour, tx_type
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => MempoolCoverageRow.parse(r));
  },
});

// ---------------------------------------------------------------------------
// sentry_coverage
// ---------------------------------------------------------------------------

const SentryCoverageRow = z.object({
  sentry: z.string(),
  txs_seen: z.number().int(),
  coverage_pct: z.number(),
});

export const sentryCoverage = query({
  id: 'sentry_coverage',
  topic: 'mempool-visibility',
  description: 'Per-sentry mempool coverage rates',
  schema: SentryCoverageRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
WITH canonical_hashes AS (
    SELECT DISTINCT hash
    FROM canonical_beacon_block_execution_transaction
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
total_canonical AS (
    SELECT count() AS total FROM canonical_hashes
)
SELECT
    meta_client_name AS sentry,
    count(DISTINCT hash) AS txs_seen,
    round(count(DISTINCT hash) * 100.0 / (SELECT total FROM total_canonical), 2) AS coverage_pct
FROM mempool_transaction
WHERE meta_network_name = {network:String}
  AND event_date_time >= {date:Date} - INTERVAL 1 HOUR
  AND event_date_time < {date:Date} + INTERVAL 1 DAY
  AND hash GLOBAL IN (SELECT hash FROM canonical_hashes)
GROUP BY meta_client_name
ORDER BY txs_seen DESC
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => SentryCoverageRow.parse(r));
  },
});

// ---------------------------------------------------------------------------
// mempool_availability
// ---------------------------------------------------------------------------
// The Python query uses dynamically generated histogram countIf columns.
// Bucket boundaries in milliseconds (14 bounds → 15 buckets: 0..<0.5s,
// 0.5-1s, 1-2s, 2-4s, 4-8s, 8-16s, 16-32s, 32s-64s, 64-128s, 128-256s,
// 256-512s, 512-1024s, 1024-2048s, 2048-3600s, >=3600s).
const BOUNDS_MS = [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000, 1024000, 2048000, 3600000] as const;
const NUM_HIST_BUCKETS = BOUNDS_MS.length + 1; // 15

// Build histogram countIf columns matching the Python hist_columns() helper.
function histColumns(valueExpr: string, condition: string, prefix: string): string {
  const cols: string[] = [];
  // Bucket 0: < first bound
  cols.push(`countIf(${valueExpr} < ${BOUNDS_MS[0]} AND ${condition}) AS ${prefix}_0`);
  // Buckets 1..N-1: [bounds[i-1], bounds[i])
  for (let i = 0; i < BOUNDS_MS.length - 1; i++) {
    cols.push(
      `countIf(${valueExpr} >= ${BOUNDS_MS[i]} AND ${valueExpr} < ${BOUNDS_MS[i + 1]} AND ${condition}) AS ${prefix}_${i + 1}`,
    );
  }
  // Last bucket: >= last bound
  cols.push(`countIf(${valueExpr} >= ${BOUNDS_MS[BOUNDS_MS.length - 1]} AND ${condition}) AS ${prefix}_${BOUNDS_MS.length}`);
  return cols.join(',\n    ');
}

// Seen-before / seen-after condition fragments (mirrors Python verbatim).
const SEEN_BEFORE = `m.first_event_time IS NOT NULL
        AND m.first_event_time > '2020-01-01'
        AND m.first_event_time < c.slot_start_date_time`;
const SEEN_AFTER = `m.first_event_time IS NOT NULL
        AND m.first_event_time > '2020-01-01'
        AND m.first_event_time >= c.slot_start_date_time`;

const AGE_MS = `dateDiff('millisecond', m.first_event_time, c.slot_start_date_time)`;
const DELAY_MS = `dateDiff('millisecond', c.slot_start_date_time, m.first_event_time)`;

// Build the Zod schema dynamically for age_hist_N and delay_hist_N columns.
const mempoolAvailabilityFields: Record<string, z.ZodTypeAny> = {
  slot: z.number().int(),
  slot_start_date_time: z.coerce.date(),
  tx_type: z.number().int(),
  total_txs: z.number().int(),
  seen_before_slot: z.number().int(),
  seen_after_slot: z.number().int(),
  // ClickHouse returns quantilesIf result as an Array(Float64); Zod validates
  // it as an array of numbers (nullable for when no rows match the condition).
  age_percentiles_ms: z.array(z.number()).nullable(),
  delay_percentiles_ms: z.array(z.number()).nullable(),
};
for (let i = 0; i < NUM_HIST_BUCKETS; i++) {
  mempoolAvailabilityFields[`age_hist_${i}`] = z.number().int();
  mempoolAvailabilityFields[`delay_hist_${i}`] = z.number().int();
}
const MempoolAvailabilityRow = z.object(
  mempoolAvailabilityFields as {
    slot: z.ZodNumber;
    slot_start_date_time: ReturnType<typeof z.coerce.date>;
    tx_type: z.ZodNumber;
    total_txs: z.ZodNumber;
    seen_before_slot: z.ZodNumber;
    seen_after_slot: z.ZodNumber;
    age_percentiles_ms: z.ZodNullable<z.ZodArray<z.ZodNumber>>;
    delay_percentiles_ms: z.ZodNullable<z.ZodArray<z.ZodNumber>>;
  } & Record<string, z.ZodTypeAny>,
);

export const mempoolAvailability = query({
  id: 'mempool_availability',
  topic: 'mempool-visibility',
  description: 'Per-slot mempool availability with age percentiles',
  schema: MempoolAvailabilityRow,
  async fetch(client, { date }) {
    const ageHist = histColumns(AGE_MS, SEEN_BEFORE, 'age_hist');
    const delayHist = histColumns(DELAY_MS, SEEN_AFTER, 'delay_hist');

    const sql = /* sql */ `
WITH first_seen AS (
    SELECT
        hash,
        min(event_date_time) AS first_event_time
    FROM mempool_transaction
    WHERE meta_network_name = {network:String}
      AND event_date_time >= {date:Date} - INTERVAL 1 DAY
      AND event_date_time < {date:Date} + INTERVAL 2 DAY
    GROUP BY hash
)
SELECT
    c.slot,
    c.slot_start_date_time,
    c.type AS tx_type,
    count() AS total_txs,
    -- Seen BEFORE slot start (public, available for inclusion)
    countIf(${SEEN_BEFORE}) AS seen_before_slot,
    -- Seen AFTER slot start (appeared after block propagation)
    countIf(${SEEN_AFTER}) AS seen_after_slot,
    -- Age percentiles for transactions seen BEFORE (how long in mempool)
    quantilesIf(0.50, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99)(
        ${AGE_MS}, ${SEEN_BEFORE}
    ) AS age_percentiles_ms,
    -- Delay percentiles for transactions seen AFTER (propagation delay)
    quantilesIf(0.50, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99)(
        ${DELAY_MS}, ${SEEN_AFTER}
    ) AS delay_percentiles_ms,
    -- Age histogram (log2 buckets in seconds)
    ${ageHist},
    -- Delay histogram (log2 buckets in seconds)
    ${delayHist}
FROM canonical_beacon_block_execution_transaction c
GLOBAL LEFT JOIN first_seen m ON c.hash = m.hash
WHERE c.meta_network_name = {network:String}
  AND c.slot_start_date_time >= {date:Date}
  AND c.slot_start_date_time < {date:Date} + INTERVAL 1 DAY
GROUP BY c.slot, c.slot_start_date_time, c.type
ORDER BY c.slot, c.type
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => MempoolAvailabilityRow.parse(r));
  },
});
