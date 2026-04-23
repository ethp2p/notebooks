import { z } from 'zod';
import { query } from './registry';

// ---------------------------------------------------------------------------
// block_propagation_by_size
// ---------------------------------------------------------------------------

const BlockPropagationBySizeRow = z.object({
  slot: z.number().int(),
  uncompressed_bytes: z.number().int().nullable(),
  compressed_bytes: z.number().int().nullable(),
  proposer_index: z.number().int().nullable(),
  proposer_entity: z.string(),
  builder_type: z.string(),
  first_seen_ms: z.number().nullable(),
  last_seen_ms: z.number().nullable(),
  median_ms: z.number().nullable(),
  sentry_count: z.number().int(),
});

export const blockPropagationBySize = query({
  id: 'block_propagation_by_size',
  topic: 'block-propagation-size',
  description: 'Block propagation timing by wire size with MEV vs local classification',
  schema: BlockPropagationBySizeRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
WITH
-- Get MEV slot list (slots with relay payload delivery)
mev_slots AS (
    SELECT DISTINCT slot
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),

-- Block metadata (size, proposer)
block_meta AS (
    SELECT DISTINCT
        slot,
        block_root AS block,
        proposer_index,
        block_total_bytes,
        block_total_bytes_compressed
    FROM canonical_beacon_block FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),

-- Proposer entity mapping
proposer_entity AS (
    SELECT index, entity
    FROM ethseer_validator_entity FINAL
    WHERE meta_network_name = {network:String}
),

-- Propagation timing aggregated across all sentries
propagation AS (
    SELECT
        slot,
        block,
        min(propagation_slot_start_diff) AS first_seen_ms,
        max(propagation_slot_start_diff) AS last_seen_ms,
        quantile(0.5)(propagation_slot_start_diff) AS median_ms,
        count() AS sentry_count
    FROM libp2p_gossipsub_beacon_block
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND propagation_slot_start_diff < 12000
    GROUP BY slot, block
)

SELECT
    p.slot AS slot,
    bm.block_total_bytes AS uncompressed_bytes,
    bm.block_total_bytes_compressed AS compressed_bytes,
    bm.proposer_index,
    coalesce(pe.entity, 'Unknown') AS proposer_entity,
    -- Use IN for reliable MEV detection on distributed tables
    if(p.slot GLOBAL IN mev_slots, 'MEV', 'Local') AS builder_type,
    p.first_seen_ms AS first_seen_ms,
    p.last_seen_ms AS last_seen_ms,
    p.median_ms AS median_ms,
    p.sentry_count AS sentry_count
FROM propagation p
GLOBAL LEFT JOIN block_meta bm ON p.slot = bm.slot AND p.block = bm.block
GLOBAL LEFT JOIN proposer_entity pe ON bm.proposer_index = pe.index
WHERE bm.block_total_bytes IS NOT NULL
ORDER BY p.slot
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlockPropagationBySizeRow.parse(r));
  },
});

// ---------------------------------------------------------------------------
// block_propagation_by_region
// ---------------------------------------------------------------------------

const BlockPropagationByRegionRow = z.object({
  slot: z.number().int(),
  region: z.string(),
  uncompressed_bytes: z.number().int().nullable(),
  compressed_bytes: z.number().int().nullable(),
  proposer_index: z.number().int().nullable(),
  proposer_entity: z.string(),
  builder_type: z.string(),
  first_seen_ms: z.number().nullable(),
  last_seen_ms: z.number().nullable(),
  median_ms: z.number().nullable(),
  sentry_count: z.number().int(),
});

export const blockPropagationByRegion = query({
  id: 'block_propagation_by_region',
  topic: 'block-propagation-size',
  description: 'Block propagation by geographic region from Sentries',
  schema: BlockPropagationByRegionRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
WITH
-- Get MEV slot list
mev_slots AS (
    SELECT DISTINCT slot
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),

-- Block metadata
block_meta AS (
    SELECT DISTINCT
        slot,
        block_root AS block,
        proposer_index,
        block_total_bytes,
        block_total_bytes_compressed
    FROM canonical_beacon_block FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),

-- Proposer entity mapping
proposer_entity AS (
    SELECT index, entity
    FROM ethseer_validator_entity FINAL
    WHERE meta_network_name = {network:String}
),

-- Propagation timing by sentry region
propagation_by_region AS (
    SELECT
        slot,
        block,
        meta_client_geo_continent_code AS region,
        min(propagation_slot_start_diff) AS first_seen_ms,
        max(propagation_slot_start_diff) AS last_seen_ms,
        quantile(0.5)(propagation_slot_start_diff) AS median_ms,
        count() AS sentry_count
    FROM libp2p_gossipsub_beacon_block
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND propagation_slot_start_diff < 12000
      AND meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
    GROUP BY slot, block, region
)

SELECT
    pr.slot AS slot,
    pr.region AS region,
    bm.block_total_bytes AS uncompressed_bytes,
    bm.block_total_bytes_compressed AS compressed_bytes,
    bm.proposer_index AS proposer_index,
    coalesce(pe.entity, 'Unknown') AS proposer_entity,
    if(pr.slot GLOBAL IN mev_slots, 'MEV', 'Local') AS builder_type,
    pr.first_seen_ms AS first_seen_ms,
    pr.last_seen_ms AS last_seen_ms,
    pr.median_ms AS median_ms,
    pr.sentry_count AS sentry_count
FROM propagation_by_region pr
GLOBAL LEFT JOIN block_meta bm ON pr.slot = bm.slot AND pr.block = bm.block
GLOBAL LEFT JOIN proposer_entity pe ON bm.proposer_index = pe.index
WHERE bm.block_total_bytes IS NOT NULL
ORDER BY pr.slot, pr.region
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlockPropagationByRegionRow.parse(r));
  },
});
