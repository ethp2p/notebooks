import { z } from 'zod';
import { query } from '../registry';

export const BlobFlowEdgesRow = z.object({
  stage: z.enum([
    'entity_to_blob',
    'relay_to_blob',
    'entity_to_relay',
    'entity_to_relay_to_blob',
  ]),
  source: z.string(),
  target: z.string(),
  intermediate: z.string().nullable(), // for 3-stage edges
  value: z.number().int().nonnegative(),
});
export type BlobFlowEdgesRow = z.infer<typeof BlobFlowEdgesRow>;

export const blobFlowEdges = query({
  id: 'blob_flow_edges',
  topic: 'blob-flow',
  description:
    'Sankey edge lists for the four blob-flow diagrams. ' +
    'One row per (stage, source, target, intermediate) with block counts.',
  schema: BlobFlowEdgesRow,
  async fetch(client, { date }) {
    // NOTE: Column substitutions vs. plan:
    //   proposer_entity -> derived via JOIN with ethseer_validator_entity (see blob_flow.py)
    //   relay_name      -> derived via JOIN with mev_relay_proposer_payload_delivered (max per slot)
    //   blob_count      -> derived via JOIN with canonical_beacon_blob_sidecar
    //   canonical_beacon_block has proposer_index, not proposer_entity directly.
    //
    // Mirrors the blob_flow.py pattern: blocks CTE -> blobs CTE -> mev CTE -> final join.
    //
    // TODO: validate against live schema before first production run.
    //
    const sql = /* sql */ `
WITH
blocks AS (
    SELECT DISTINCT
        slot,
        block_root,
        proposer_index
    FROM canonical_beacon_block FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
blob_counts AS (
    SELECT slot, block_root, count(DISTINCT blob_index) AS blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot, block_root
),
mev AS (
    SELECT slot, max(relay_name) AS relay_name
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot
),
base AS (
    SELECT
        coalesce(e.entity, 'Unknown')      AS entity,
        coalesce(m.relay_name, 'none')     AS relay,
        toString(coalesce(bc.blob_count, 0)) AS blob_bin
    FROM blocks b
    GLOBAL LEFT JOIN ethseer_validator_entity e
        ON b.proposer_index = e.index
        AND e.meta_network_name = {network:String}
    GLOBAL LEFT JOIN blob_counts bc ON b.slot = bc.slot AND b.block_root = bc.block_root
    GLOBAL LEFT JOIN mev m ON b.slot = m.slot
)
SELECT 'entity_to_blob'          AS stage,
       entity AS source, blob_bin AS target, NULL AS intermediate, count() AS value
FROM base GROUP BY entity, blob_bin

UNION ALL

SELECT 'relay_to_blob'           AS stage,
       relay AS source, blob_bin AS target, NULL AS intermediate, count() AS value
FROM base GROUP BY relay, blob_bin

UNION ALL

SELECT 'entity_to_relay'         AS stage,
       entity AS source, relay AS target, NULL AS intermediate, count() AS value
FROM base GROUP BY entity, relay

UNION ALL

SELECT 'entity_to_relay_to_blob' AS stage,
       entity AS source, relay AS target, blob_bin AS intermediate, count() AS value
FROM base GROUP BY entity, relay, blob_bin

ORDER BY stage, value DESC
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobFlowEdgesRow.parse(r));
  },
});
