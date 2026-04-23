import { z } from 'zod';
import { query } from '../registry';

export const RegionSizeMatrixRow = z.object({
  region: z.string(), // continent code: EU, NA, AS, OC
  size_bucket: z.string(), // tiny/small/medium/large derived from compressed bytes
  source: z.enum(['sentry', 'contributoor']),
  median_ms: z.number(),
  count: z.number().int().nonnegative(),
});
export type RegionSizeMatrixRow = z.infer<typeof RegionSizeMatrixRow>;

export const regionSizeMatrix = query({
  id: 'region_size_matrix',
  topic: 'block-propagation',
  description: 'Per (region x size_bucket x source) median latency and count. ~32 rows per source for propagation heatmap.',
  schema: RegionSizeMatrixRow,
  async fetch(client, { date }) {
    // NOTE: Deviations from plan:
    //   canonical_beacon_block_sentry_arrival       -> computed from libp2p_gossipsub_beacon_block
    //   canonical_beacon_block_contributoor_arrival -> computed from mainnet.fct_block_first_seen_by_node
    //   latency_ms  -> propagation_slot_start_diff (sentry) / seen_slot_start_diff (contributoor)
    //   size_bucket -> derived from block_total_bytes_compressed in canonical_beacon_block /
    //                  mainnet.int_block_canonical
    //   region      -> meta_client_geo_continent_code (EU, NA, AS, OC) not eu-west etc.
    //
    // TODO: validate against live schema before first production run.
    //
    const network = 'mainnet';
    const sql = /* sql */ `
WITH
block_meta_sentry AS (
    SELECT DISTINCT
        slot,
        block_root,
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
sentry_grouped AS (
    SELECT
        g.meta_client_geo_continent_code AS region,
        bm.size_bucket,
        'sentry'                          AS source,
        quantileExact(0.5)(g.propagation_slot_start_diff) AS median_ms,
        count()                           AS count
    FROM libp2p_gossipsub_beacon_block g
    GLOBAL JOIN block_meta_sentry bm ON g.slot = bm.slot AND g.block = bm.block_root
    WHERE g.meta_network_name = {network:String}
      AND g.slot_start_date_time >= {date:Date}
      AND g.slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND g.propagation_slot_start_diff < 12000
      AND g.meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
    GROUP BY region, size_bucket
),
block_meta_contributoor AS (
    SELECT
        slot,
        block_root,
        multiIf(
            block_total_bytes_compressed < 100000,  'tiny',
            block_total_bytes_compressed < 500000,  'small',
            block_total_bytes_compressed < 1000000, 'medium',
                                                    'large'
        ) AS size_bucket
    FROM ${network}.int_block_canonical
    WHERE slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
contributoor_grouped AS (
    SELECT
        p.meta_client_geo_continent_code AS region,
        bm.size_bucket,
        'contributoor'                    AS source,
        quantileExact(0.5)(p.seen_slot_start_diff) AS median_ms,
        count()                           AS count
    FROM ${network}.fct_block_first_seen_by_node p
    JOIN block_meta_contributoor bm ON p.slot = bm.slot AND p.block_root = bm.block_root
    WHERE p.slot_start_date_time >= {date:Date}
      AND p.slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND p.seen_slot_start_diff < 12000
      AND p.meta_client_geo_continent_code IN ('EU', 'NA', 'AS', 'OC')
    GROUP BY region, size_bucket
)
SELECT region, size_bucket, source, median_ms, count FROM sentry_grouped
UNION ALL
SELECT region, size_bucket, source, median_ms, count FROM contributoor_grouped
ORDER BY region, size_bucket, source
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => RegionSizeMatrixRow.parse(r));
  },
});
