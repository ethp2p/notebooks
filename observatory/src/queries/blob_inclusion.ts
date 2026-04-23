import { z } from 'zod';
import { query } from './registry';

// ---------------------------------------------------------------------------
// blobs_per_slot
// ---------------------------------------------------------------------------

const BlobsPerSlotRow = z.object({
  slot: z.number().int(),
  time: z.coerce.date(),
  blob_count: z.number().int(),
});

export const blobsPerSlot = query({
  id: 'blobs_per_slot',
  topic: 'blob-inclusion',
  description: 'Blobs per slot timeseries',
  schema: BlobsPerSlotRow,
  async fetch(client, { date, database }) {
    const sql = /* sql */ `
SELECT
    s.slot AS slot,
    s.slot_start_date_time AS time,
    COALESCE(b.blob_count, 0) AS blob_count
FROM (
    SELECT DISTINCT slot, slot_start_date_time
    FROM default.canonical_beacon_block
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
) s
LEFT JOIN (
    SELECT
        slot,
        COUNT(*) AS blob_count
    FROM default.canonical_beacon_blob_sidecar
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot
) b ON s.slot = b.slot
ORDER BY s.slot ASC
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobsPerSlotRow.parse(r));
  },
});

// ---------------------------------------------------------------------------
// blocks_blob_epoch
// ---------------------------------------------------------------------------

const BlocksBlobEpochRow = z.object({
  epoch: z.number().int(),
  time: z.coerce.date(),
  blob_count: z.number().int(),
  block_count: z.number().int(),
});

export const blocksBlobEpoch = query({
  id: 'blocks_blob_epoch',
  topic: 'blob-inclusion',
  description: 'Block counts by blob count per epoch',
  schema: BlocksBlobEpochRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
WITH blob_counts_per_slot AS (
    SELECT
        slot,
        epoch,
        epoch_start_date_time,
        slot_start_date_time,
        toUInt64(max(blob_index) + 1) as blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot, epoch, epoch_start_date_time, slot_start_date_time
),
blocks_per_epoch AS (
    SELECT
        epoch,
        epoch_start_date_time,
        toUInt64(COUNT(DISTINCT slot)) as total_blocks
    FROM canonical_beacon_block
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY epoch, epoch_start_date_time
),
epochs AS (
    SELECT DISTINCT epoch, epoch_start_date_time
    FROM blocks_per_epoch
),
all_blob_counts AS (
    SELECT arrayJoin(range(toUInt64(0), toUInt64(max(blob_count) + 1))) AS blob_count
    FROM blob_counts_per_slot
),
all_combinations AS (
    SELECT
        e.epoch,
        e.epoch_start_date_time,
        b.blob_count
    FROM epochs e
    CROSS JOIN all_blob_counts b
),
block_per_blob_count_per_epoch AS (
    SELECT
        epoch,
        epoch_start_date_time,
        blob_count,
        toUInt64(COUNT(*)) as block_count
    FROM blob_counts_per_slot
    GROUP BY epoch, epoch_start_date_time, blob_count
),
blocks_with_blobs_per_epoch AS (
    SELECT
        epoch,
        toUInt64(COUNT(*)) as blocks_with_blobs
    FROM blob_counts_per_slot
    GROUP BY epoch
)
SELECT
    a.epoch AS epoch,
    a.epoch_start_date_time AS time,
    a.blob_count AS blob_count,
    CASE
        WHEN a.blob_count = 0 THEN
            toInt64(COALESCE(blk.total_blocks, toUInt64(0))) - toInt64(COALESCE(wb.blocks_with_blobs, toUInt64(0)))
        ELSE
            toInt64(COALESCE(b.block_count, toUInt64(0)))
    END as block_count
FROM all_combinations a
GLOBAL LEFT JOIN block_per_blob_count_per_epoch b
    ON a.epoch = b.epoch AND a.blob_count = b.blob_count
GLOBAL LEFT JOIN blocks_per_epoch blk
    ON a.epoch = blk.epoch
GLOBAL LEFT JOIN blocks_with_blobs_per_epoch wb
    ON a.epoch = wb.epoch
ORDER BY a.epoch ASC, a.blob_count ASC
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlocksBlobEpochRow.parse(r));
  },
});

// ---------------------------------------------------------------------------
// blob_popularity
// ---------------------------------------------------------------------------

const BlobPopularityRow = z.object({
  epoch: z.number().int(),
  time: z.coerce.date(),
  blob_count: z.number().int(),
  count: z.number().int(),
});

export const blobPopularity = query({
  id: 'blob_popularity',
  topic: 'blob-inclusion',
  description: 'Blob count popularity per epoch',
  schema: BlobPopularityRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
WITH blob_counts_per_slot AS (
    SELECT
        slot_start_date_time,
        epoch_start_date_time,
        toUInt64(max(blob_index) + 1) as blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot, slot_start_date_time, epoch_start_date_time
),
blocks AS (
    SELECT DISTINCT
        epoch,
        slot_start_date_time,
        epoch_start_date_time
    FROM canonical_beacon_block
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
blocks_with_blob_count AS (
    SELECT
        b.epoch,
        b.epoch_start_date_time as time,
        COALESCE(bc.blob_count, toUInt64(0)) as blob_count
    FROM blocks b
    GLOBAL LEFT JOIN blob_counts_per_slot bc ON b.slot_start_date_time = bc.slot_start_date_time
)
SELECT
    epoch,
    time,
    blob_count,
    COUNT(*) as count
FROM blocks_with_blob_count
GROUP BY epoch, time, blob_count
ORDER BY epoch ASC, blob_count ASC
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobPopularityRow.parse(r));
  },
});

// ---------------------------------------------------------------------------
// slot_in_epoch
// ---------------------------------------------------------------------------

const SlotInEpochRow = z.object({
  slot: z.number().int(),
  epoch: z.number().int(),
  time: z.coerce.date(),
  slot_in_epoch: z.number().int(),
  blob_count: z.number().int(),
});

export const slotInEpoch = query({
  id: 'slot_in_epoch',
  topic: 'blob-inclusion',
  description: 'Blob count per slot within epoch',
  schema: SlotInEpochRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
WITH blob_counts_per_slot AS (
    SELECT
        slot,
        epoch,
        epoch_start_date_time,
        toUInt64(max(blob_index) + 1) as blob_count
    FROM canonical_beacon_blob_sidecar
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
    GROUP BY slot, epoch, epoch_start_date_time
),
blocks AS (
    SELECT DISTINCT
        slot,
        epoch,
        epoch_start_date_time
    FROM canonical_beacon_block
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
blocks_with_blob_count AS (
    SELECT
        b.slot,
        b.epoch,
        b.epoch_start_date_time,
        b.slot - (b.epoch * 32) as slot_in_epoch,
        COALESCE(bc.blob_count, toUInt64(0)) as blob_count
    FROM blocks b
    GLOBAL LEFT JOIN blob_counts_per_slot bc
        ON b.slot = bc.slot AND b.epoch = bc.epoch
)
SELECT
    slot,
    epoch,
    epoch_start_date_time as time,
    slot_in_epoch,
    blob_count
FROM blocks_with_blob_count
ORDER BY epoch ASC, slot_in_epoch ASC
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => SlotInEpochRow.parse(r));
  },
});
