import { z } from 'zod';
import { query } from '../registry';

export const BlockTimelineCdfRow = z.object({
  region: z.string(), // continent code from gossipsub: EU, NA, AS, OC (not eu-west etc.)
  source: z.enum(['sentry', 'contributoor']),
  size_bucket: z.string(), // derived: tiny/small/medium/large from compressed bytes
  builder_type: z.enum(['mev', 'local']),
  percentile: z.number().int().min(0).max(100),
  value_ms: z.number(),
});
export type BlockTimelineCdfRow = z.infer<typeof BlockTimelineCdfRow>;

export const blockTimelineCdf = query({
  id: 'block_timeline_cdf',
  topic: 'block-propagation',
  description:
    'Pre-computed 101-percentile CDFs per (region x source x size_bucket x builder_type) for propagation charts.',
  schema: BlockTimelineCdfRow,
  async fetch(client, { date }) {
    // NOTE: Significant deviations from plan due to real schema differences:
    //
    //  Plan schema               -> Reality
    //  canonical_beacon_block_sentry_arrival    -> no such table; computed from:
    //                                             libp2p_gossipsub_beacon_block JOIN canonical_beacon_block
    //  canonical_beacon_block_contributoor_arrival -> no such table; computed from:
    //                                             mainnet.fct_block_first_seen_by_node JOIN mainnet.int_block_canonical
    //  region enum (eu-west, eu-east, us-east, us-west) -> continent codes (EU, NA, AS, OC)
    //  latency_ms               -> propagation_slot_start_diff (sentry) / seen_slot_start_diff (contributoor)
    //  size_bucket              -> derived from block_total_bytes_compressed:
    //                             tiny <100KB, small 100-500KB, medium 500KB-1MB, large >=1MB
    //  is_mev                   -> derived via JOIN with mev_relay_proposer_payload_delivered
    //
    // The quantileExact(p/100)(latency_ms) ARRAY JOIN range(0,101) form is used.
    // If ClickHouse rejects per-row quantile level, rewrite as quantilesExact(...) with ARRAY JOIN.
    //
    // TODO: validate against live schema before first production run.
    //
    const network = 'mainnet';
    const sql = /* sql */ `
WITH
mev_slots AS (
    SELECT DISTINCT slot
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
block_meta AS (
    SELECT DISTINCT
        slot,
        block_root,
        block_total_bytes_compressed,
        multiIf(
            block_total_bytes_compressed < 100000,  'tiny',
            block_total_bytes_compressed < 500000,  'small',
            block_total_bytes_compressed < 1000000, 'medium',
                                                    'large'
        ) AS size_bucket
    FROM canonical_beacon_block FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
sentry_raw AS (
    SELECT
        g.slot,
        g.meta_client_geo_continent_code  AS region,
        'sentry'                           AS source,
        bm.size_bucket,
        if(g.slot GLOBAL IN mev_slots, 'mev', 'local') AS builder_type,
        g.propagation_slot_start_diff      AS latency_ms
    FROM libp2p_gossipsub_beacon_block g
    GLOBAL JOIN block_meta bm ON g.slot = bm.slot AND g.block = bm.block_root
    WHERE g.meta_network_name = {network:String}
      AND g.slot_start_date_time >= {date:Date}
      AND g.slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND g.propagation_slot_start_diff < 12000
      AND g.meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
),
contributoor_raw AS (
    SELECT
        p.slot,
        p.meta_client_geo_continent_code   AS region,
        'contributoor'                      AS source,
        bm.size_bucket,
        if(p.slot IN (SELECT slot FROM ${network}.fct_block_mev
                      WHERE slot_start_date_time >= {date:Date}
                        AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY),
           'mev', 'local')                  AS builder_type,
        p.seen_slot_start_diff              AS latency_ms
    FROM ${network}.fct_block_first_seen_by_node p
    JOIN ${network}.int_block_canonical bm
        ON p.slot = bm.slot AND p.block_root = bm.block_root
    WHERE p.slot_start_date_time >= {date:Date}
      AND p.slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND p.seen_slot_start_diff < 12000
      AND p.meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
),
combined AS (
    SELECT region, source, size_bucket, builder_type, latency_ms FROM sentry_raw
    UNION ALL
    SELECT region, source, size_bucket, builder_type, latency_ms FROM contributoor_raw
)
SELECT
    region,
    source,
    size_bucket,
    builder_type,
    p                                                              AS percentile,
    quantileExact(toFloat64(p) / 100.0)(latency_ms)               AS value_ms
FROM combined
ARRAY JOIN range(0, 101) AS p
GROUP BY region, source, size_bucket, builder_type, p
ORDER BY region, source, size_bucket, builder_type, p
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlockTimelineCdfRow.parse(r));
  },
});
