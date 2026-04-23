import { z } from 'zod';
import { query } from './registry';

// ---------------------------------------------------------------------------
// block_propagation_by_region_contributoor
//
// Uses the 'contributoor' database. Tables are namespaced by network prefix
// (e.g. mainnet.fct_block_mev) rather than filtered by meta_network_name.
// The network parameter is baked into the table names via template literals
// in the SQL, following the Python original's f-string pattern.
// ---------------------------------------------------------------------------

const BlockPropagationContributoorRow = z.object({
  slot: z.number().int(),
  region: z.string(),
  uncompressed_bytes: z.number().int().nullable(),
  compressed_bytes: z.number().int().nullable(),
  // Contributoor doesn't have proposer_entity mapping: column omitted.
  builder_type: z.string(),
  first_seen_ms: z.number().nullable(),
  last_seen_ms: z.number().nullable(),
  median_ms: z.number().nullable(),
  // Column renamed from node_count in the subquery to sentry_count in SELECT
  // to match the Sentries output for consistent downstream processing.
  sentry_count: z.number().int(),
});

export const blockPropagationByRegionContributoor = query({
  id: 'block_propagation_by_region_contributoor',
  topic: 'block-propagation-size',
  description: 'Block propagation by geographic region from Contributoor nodes',
  database: 'contributoor',
  schema: BlockPropagationContributoorRow,
  async fetch(client, { date }) {
    // The contributoor database uses network-prefixed table names.
    // The Python query uses f-string interpolation for the network prefix.
    // Since 'contributoor' is not in the allow-list for meta_network_name
    // filtering, the network prefix is embedded in the table name directly.
    // Hard-coding 'mainnet' matches the Python pipeline default.
    const network = 'mainnet';
    const sql = /* sql */ `
WITH
-- MEV slots (slots with relay payload delivery)
mev_slots AS (
    SELECT DISTINCT slot
    FROM ${network}.fct_block_mev
    WHERE slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),

-- Block metadata (size)
block_meta AS (
    SELECT
        slot,
        block_root,
        block_total_bytes,
        block_total_bytes_compressed
    FROM ${network}.int_block_canonical
    WHERE slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),

-- Regional propagation timing
propagation AS (
    SELECT
        slot,
        block_root,
        meta_client_geo_continent_code AS region,
        min(seen_slot_start_diff) AS first_seen_ms,
        max(seen_slot_start_diff) AS last_seen_ms,
        quantile(0.5)(seen_slot_start_diff) AS median_ms,
        count() AS node_count
    FROM ${network}.fct_block_first_seen_by_node
    WHERE slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND seen_slot_start_diff < 12000
      AND meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
    GROUP BY slot, block_root, region
)

SELECT
    p.slot AS slot,
    p.region AS region,
    bm.block_total_bytes AS uncompressed_bytes,
    bm.block_total_bytes_compressed AS compressed_bytes,
    -- Match Sentries column naming for consistency
    if(p.slot IN mev_slots, 'MEV', 'Local') AS builder_type,
    p.first_seen_ms AS first_seen_ms,
    p.last_seen_ms AS last_seen_ms,
    p.median_ms AS median_ms,
    p.node_count AS sentry_count
FROM propagation p
LEFT JOIN block_meta bm ON p.slot = bm.slot AND p.block_root = bm.block_root
WHERE bm.block_total_bytes IS NOT NULL
ORDER BY p.slot, p.region
`;
    const rs = await client.query({
      query: sql,
      query_params: { date },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlockPropagationContributoorRow.parse(r));
  },
});
