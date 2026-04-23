import { z } from 'zod';
import { query } from './registry';

// ---------------------------------------------------------------------------
// blob_flow
// ---------------------------------------------------------------------------

const BlobFlowRow = z.object({
  slot: z.number().int(),
  epoch: z.number().int(),
  slot_start_date_time: z.coerce.date(),
  proposer_index: z.number().int(),
  proposer_entity: z.string().nullable(),
  blob_count: z.number().int(),
  winning_builder_pubkey: z.string().nullable(),
  winning_relay: z.string().nullable(),
});

export const blobFlow = query({
  id: 'blob_flow',
  topic: 'blob-flow',
  description: 'Proposer blobs with MEV relay data',
  schema: BlobFlowRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
WITH blocks AS (
    SELECT DISTINCT
        slot,
        epoch,
        slot_start_date_time,
        proposer_index,
        block_root,
        meta_network_name
    FROM canonical_beacon_block
    WHERE
        meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
blobs AS (
    SELECT
        slot,
        block_root,
        count(DISTINCT blob_index) AS blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE
        meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot, block_root
),
mev AS (
    SELECT
        slot,
        -- Use max() for deterministic selection when multiple relays deliver same slot
        max(builder_pubkey) AS builder_pubkey,
        max(relay_name) AS relay_name
    FROM mev_relay_proposer_payload_delivered
    WHERE
        meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot
)
SELECT
    b.slot,
    b.epoch,
    b.slot_start_date_time,
    b.proposer_index,
    e.entity AS proposer_entity,
    coalesce(bl.blob_count, 0) AS blob_count,
    m.builder_pubkey AS winning_builder_pubkey,
    m.relay_name AS winning_relay
FROM blocks b
GLOBAL LEFT JOIN ethseer_validator_entity e
    ON b.proposer_index = e.index
    AND b.meta_network_name = e.meta_network_name
LEFT JOIN blobs bl
    ON b.slot = bl.slot AND b.block_root = bl.block_root
LEFT JOIN mev m
    ON b.slot = m.slot
ORDER BY b.slot DESC
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobFlowRow.parse(r));
  },
});
