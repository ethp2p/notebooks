import { z } from 'zod';
import { query } from './registry';

export const BlobEventsRow = z.object({
  slot: z.number().int(),
  slot_start: z.coerce.date(),
  epoch: z.number().int(),
  blob_count: z.number().int().nonnegative(),
  proposer_index: z.number().int().nullable(),
  proposer_pubkey: z.string().nullable(), // not available in canonical_beacon_block; NULL
  entity: z.string().nullable(),
  is_mev: z.boolean(),
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
    // NOTE: Column name substitutions vs. plan:
    //   proposer_entity -> derived via JOIN with ethseer_validator_entity on proposer_index
    //   is_mev          -> derived via EXISTS/IN against mev_relay_proposer_payload_delivered
    //   proposer_pubkey -> not available in canonical_beacon_block; added as NULL
    //   blob_count      -> derived via JOIN with canonical_beacon_blob_sidecar
    //
    // Follows the same pattern as blob_flow.py.
    //
    // TODO: validate column types against live schema before first production run.
    //
    const sql = /* sql */ `
WITH
blocks AS (
    SELECT DISTINCT
        slot,
        slot_start_date_time,
        proposer_index
    FROM canonical_beacon_block FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
blob_counts AS (
    SELECT slot, count(DISTINCT blob_index) AS blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot
),
mev_slots AS (
    SELECT DISTINCT slot
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
)
SELECT
    b.slot                                                    AS slot,
    b.slot_start_date_time                                    AS slot_start,
    intDiv(b.slot, 32)                                        AS epoch,
    coalesce(bc.blob_count, 0)                                AS blob_count,
    b.proposer_index,
    NULL                                                      AS proposer_pubkey,
    e.entity                                                  AS entity,
    if(b.slot GLOBAL IN mev_slots, true, false)               AS is_mev
FROM blocks b
GLOBAL LEFT JOIN blob_counts bc ON b.slot = bc.slot
GLOBAL LEFT JOIN ethseer_validator_entity e
    ON b.proposer_index = e.index
    AND e.meta_network_name = {network:String}
ORDER BY b.slot
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobEventsRow.parse(r));
  },
});
