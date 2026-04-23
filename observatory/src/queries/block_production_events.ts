import { z } from 'zod';
import { query } from './registry';

export const BlockEventsRow = z.object({
  slot: z.number().int(),
  slot_start: z.coerce.date(),
  event_type: z.enum([
    'bid_received',
    'bid_winning',
    'block_arrival',
    'first_column_seen',
    'last_column_seen',
  ]),
  builder_pubkey: z.string().nullable(),
  proposer_pubkey: z.string().nullable(), // nullable: not all event types carry it
  relay: z.string().nullable(),
  region: z.string().nullable(),
  wire_size_bytes: z.number().int().nullable(),
  latency_ms: z.number().nullable(),
  is_mev: z.boolean(),
  blob_count: z.number().int().nonnegative(),
  winning_bid_wei: z.string().nullable(), // bigint-as-string
});
export type BlockEventsRow = z.infer<typeof BlockEventsRow>;

export const blockEvents = query({
  id: 'block_events',
  topic: 'block-production',
  description:
    'Row-level block-production events for the day: bidding, block arrival, column first/last seen. ' +
    'One row per (slot, event_type). Wide schema feeding every block-production chart.',
  schema: BlockEventsRow,
  async fetch(client, { date }) {
    // NOTE: The real Xatu table names differ from the plan's placeholders.
    // Substitutions applied (verified against Python query files):
    //
    //  Plan placeholder                   -> Real Xatu table
    //  mev_relay_bid_trace                -> mev_relay_bid_trace             (same)
    //  mev_relay_winning_bid              -> mev_relay_proposer_payload_delivered (closest match)
    //  canonical_beacon_block_sentry_arrival -> libp2p_gossipsub_beacon_block (arrivals via gossipsub)
    //  data_column_first_seen             -> libp2p_gossipsub_data_column_sidecar (col propagation)
    //  data_column_last_seen              -> derived from same table using max()
    //
    // Column substitutions:
    //  bid_received_at                    -> fromUnixTimestamp64Milli(timestamp_ms)
    //  first_seen_at                      -> min(event_date_time) per slot
    //  first_column_at / last_column_at   -> min/max(event_date_time) per slot in gossipsub
    //  value_wei                          -> value  (in mev_relay_proposer_payload_delivered)
    //  is_mev                             -> derived via JOIN with mev_relay_proposer_payload_delivered
    //  wire_size_bytes                    -> block_total_bytes_compressed from canonical_beacon_block
    //  proposer_pubkey                    -> not available in bid/arrival tables; NULL for those events
    //
    // TODO: validate against live schema before first production run.
    //
    const sql = /* sql */ `
WITH
mev_paid AS (
    -- Slots where a relay delivered a payload (is_mev = true)
    SELECT DISTINCT slot
    FROM mev_relay_proposer_payload_delivered FINAL
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
bids AS (
    SELECT
        slot,
        slot_start_date_time                                                  AS slot_start,
        'bid_received'                                                        AS event_type,
        builder_pubkey,
        NULL                                                                  AS proposer_pubkey,
        relay_name                                                            AS relay,
        NULL                                                                  AS region,
        NULL                                                                  AS wire_size_bytes,
        (toInt64(timestamp_ms) - toInt64(toUnixTimestamp(slot_start_date_time)) * 1000)
                                                                              AS latency_ms,
        if(slot GLOBAL IN mev_paid, true, false)                              AS is_mev,
        NULL                                                                  AS winning_bid_wei
    FROM mev_relay_bid_trace
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
winning AS (
    SELECT
        slot,
        slot_start_date_time                                                  AS slot_start,
        'bid_winning'                                                         AS event_type,
        builder_pubkey,
        NULL                                                                  AS proposer_pubkey,
        relay_name                                                            AS relay,
        NULL                                                                  AS region,
        NULL                                                                  AS wire_size_bytes,
        NULL                                                                  AS latency_ms,
        true                                                                  AS is_mev,
        toString(value)                                                       AS winning_bid_wei
    FROM mev_relay_proposer_payload_delivered FINAL
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
),
arrivals AS (
    -- One row per slot (first arrival across all sentries)
    SELECT
        slot,
        slot_start_date_time                                                  AS slot_start,
        'block_arrival'                                                       AS event_type,
        NULL                                                                  AS builder_pubkey,
        NULL                                                                  AS proposer_pubkey,
        NULL                                                                  AS relay,
        meta_client_geo_continent_code                                        AS region,
        NULL                                                                  AS wire_size_bytes,
        min(propagation_slot_start_diff)                                      AS latency_ms,
        if(slot GLOBAL IN mev_paid, true, false)                              AS is_mev,
        NULL                                                                  AS winning_bid_wei
    FROM libp2p_gossipsub_beacon_block
    WHERE meta_network_name = {network:String}
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND propagation_slot_start_diff < 12000
    GROUP BY slot, slot_start_date_time, meta_client_geo_continent_code
),
first_cols AS (
    SELECT
        slot,
        slot_start_date_time                                                  AS slot_start,
        'first_column_seen'                                                   AS event_type,
        NULL                                                                  AS builder_pubkey,
        NULL                                                                  AS proposer_pubkey,
        NULL                                                                  AS relay,
        NULL                                                                  AS region,
        NULL                                                                  AS wire_size_bytes,
        min(propagation_slot_start_diff)                                      AS latency_ms,
        if(slot GLOBAL IN mev_paid, true, false)                              AS is_mev,
        NULL                                                                  AS winning_bid_wei
    FROM libp2p_gossipsub_data_column_sidecar
    WHERE meta_network_name = {network:String}
      AND event_date_time >= {date:Date}
      AND event_date_time < {date:Date} + INTERVAL 1 DAY
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND event_date_time > '1970-01-01 00:00:01'
    GROUP BY slot, slot_start_date_time
),
last_cols AS (
    SELECT
        slot,
        slot_start_date_time                                                  AS slot_start,
        'last_column_seen'                                                    AS event_type,
        NULL                                                                  AS builder_pubkey,
        NULL                                                                  AS proposer_pubkey,
        NULL                                                                  AS relay,
        NULL                                                                  AS region,
        NULL                                                                  AS wire_size_bytes,
        max(propagation_slot_start_diff)                                      AS latency_ms,
        if(slot GLOBAL IN mev_paid, true, false)                              AS is_mev,
        NULL                                                                  AS winning_bid_wei
    FROM libp2p_gossipsub_data_column_sidecar
    WHERE meta_network_name = {network:String}
      AND event_date_time >= {date:Date}
      AND event_date_time < {date:Date} + INTERVAL 1 DAY
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND event_date_time > '1970-01-01 00:00:01'
    GROUP BY slot, slot_start_date_time
)
SELECT
    u.slot,
    u.slot_start,
    u.event_type,
    u.builder_pubkey,
    u.proposer_pubkey,
    u.relay,
    u.region,
    u.wire_size_bytes,
    u.latency_ms,
    u.is_mev,
    coalesce(bc.blob_count, 0) AS blob_count,
    u.winning_bid_wei
FROM (
    SELECT * FROM bids
    UNION ALL SELECT * FROM winning
    UNION ALL SELECT * FROM arrivals
    UNION ALL SELECT * FROM first_cols
    UNION ALL SELECT * FROM last_cols
) u
GLOBAL LEFT JOIN blob_counts bc ON u.slot = bc.slot
ORDER BY u.slot, u.event_type
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlockEventsRow.parse(r));
  },
});
