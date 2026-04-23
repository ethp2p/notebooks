import { z } from 'zod';
import { query } from './registry';

export const MempoolEventsRow = z.object({
  slot: z.number().int(),
  slot_start: z.coerce.date(),
  tx_hash: z.string(),
  tx_type: z.string(), // raw integer type from ClickHouse (0=legacy, 1=eip2930, 2=eip1559, 3=blob, 4=setcode)
  mempool_seen_at: z.coerce.date().nullable(),
  included_at: z.coerce.date().nullable(),
  age_ms: z.number().nullable(),
  delay_ms: z.number().nullable(),
  visibility: z.enum(['before', 'after', 'never']),
});
export type MempoolEventsRow = z.infer<typeof MempoolEventsRow>;

export const mempoolEvents = query({
  id: 'mempool_events',
  topic: 'mempool-visibility',
  description:
    'Row-level mempool visibility events. One row per (slot, tx_hash) with timing. ' +
    'Feeds every mempool chart.',
  schema: MempoolEventsRow,
  async fetch(client, { date }) {
    // NOTE: Column and table name substitutions vs. plan:
    //   mempool_tx_events  -> no such table; join canonical_beacon_block_execution_transaction
    //                         with mempool_transaction (see mempool_visibility.py)
    //   sentry             -> not included; per-sentry data is in mempool_transaction but
    //                         this query emits one row per (slot, tx_hash) like the plan.
    //                         sentry field is dropped (no natural single-sentry mapping).
    //   tx_type            -> type column in canonical_beacon_block_execution_transaction
    //                         (integer: 0=legacy, 1=eip2930, 2=eip1559, 3=blob, 4=setcode)
    //   included_at        -> slot_start_date_time (proxy; exact inclusion time not in schema)
    //
    // The visibility CASE is: NULL seen -> never; seen <= slot_start -> before; else -> after.
    //
    // TODO: validate against live schema before first production run.
    //       The mempool_transaction table has a 1-hour lookback window for first_seen.
    //       Adjust the date range on first_seen if needed.
    //
    const sql = /* sql */ `
WITH first_seen AS (
    SELECT
        hash,
        min(event_date_time) AS mempool_seen_at
    FROM mempool_transaction
    WHERE meta_network_name = {network:String}
      AND event_date_time >= {date:Date} - INTERVAL 1 DAY
      AND event_date_time < {date:Date} + INTERVAL 2 DAY
    GROUP BY hash
)
SELECT
    c.slot                                                                    AS slot,
    c.slot_start_date_time                                                    AS slot_start,
    c.hash                                                                    AS tx_hash,
    toString(c.type)                                                          AS tx_type,
    m.mempool_seen_at,
    c.slot_start_date_time                                                    AS included_at,
    if(m.mempool_seen_at IS NOT NULL,
       dateDiff('millisecond', m.mempool_seen_at, c.slot_start_date_time),
       NULL)                                                                  AS age_ms,
    if(m.mempool_seen_at IS NOT NULL,
       dateDiff('millisecond', c.slot_start_date_time, m.mempool_seen_at),
       NULL)                                                                  AS delay_ms,
    CASE
        WHEN m.mempool_seen_at IS NULL                       THEN 'never'
        WHEN m.mempool_seen_at <= c.slot_start_date_time     THEN 'before'
        ELSE                                                      'after'
    END                                                                       AS visibility
FROM canonical_beacon_block_execution_transaction c
GLOBAL LEFT JOIN first_seen m ON c.hash = m.hash
WHERE c.meta_network_name = {network:String}
  AND c.slot_start_date_time >= {date:Date}
  AND c.slot_start_date_time < {date:Date} + INTERVAL 1 DAY
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => MempoolEventsRow.parse(r));
  },
});
