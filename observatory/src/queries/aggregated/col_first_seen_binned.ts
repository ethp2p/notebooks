import { z } from 'zod';
import { query } from '../registry';

export const ColFirstSeenBinnedRow = z.object({
  column_index: z.number().int().min(0).max(127),
  time_bucket: z.number().int().min(0).max(479), // 5-minute buckets across 24h
  median_ms: z.number().nullable(),
  p95_ms: z.number().nullable(),
  min_ms: z.number().nullable(),
  max_ms: z.number().nullable(),
  missing_count: z.number().int().nonnegative(),
});
export type ColFirstSeenBinnedRow = z.infer<typeof ColFirstSeenBinnedRow>;

export const colFirstSeenBinned = query({
  id: 'col_first_seen_binned',
  topic: 'column-propagation',
  description:
    '128 columns x 480 (5-minute) buckets: median, p95, min, max of first-seen ms, plus missing count.',
  schema: ColFirstSeenBinnedRow,
  async fetch(client, { date }) {
    // NOTE: Column and table name substitutions vs. plan:
    //   col_first_seen       -> libp2p_gossipsub_data_column_sidecar (see column_propagation.py)
    //   first_seen_ms        -> propagation_slot_start_diff (ms since slot start)
    //   Date filter          -> event_date_time AND slot_start_date_time (matches Python)
    //   time_bucket          -> intDiv(toUnixTimestamp(slot_start_date_time) - toUnixTimestamp({date:Date}), 300)
    //
    // TODO: validate against live schema before first production run.
    //
    const sql = /* sql */ `
WITH base AS (
    SELECT
        column_index,
        toUInt32(intDiv(
            toInt64(toUnixTimestamp(slot_start_date_time)) -
            toInt64(toUnixTimestamp(toDateTime({date:String} || ' 00:00:00'))),
            300
        )) AS time_bucket,
        propagation_slot_start_diff AS first_seen_ms
    FROM libp2p_gossipsub_data_column_sidecar
    WHERE meta_network_name = {network:String}
      AND event_date_time >= {date:Date}
      AND event_date_time < {date:Date} + INTERVAL 1 DAY
      AND slot_start_date_time >= {date:Date}
      AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
      AND event_date_time > '1970-01-01 00:00:01'
)
SELECT
    column_index,
    time_bucket,
    quantileExactIf(0.5)(first_seen_ms,  first_seen_ms IS NOT NULL) AS median_ms,
    quantileExactIf(0.95)(first_seen_ms, first_seen_ms IS NOT NULL) AS p95_ms,
    minIf(first_seen_ms,  first_seen_ms IS NOT NULL)                AS min_ms,
    maxIf(first_seen_ms,  first_seen_ms IS NOT NULL)                AS max_ms,
    countIf(first_seen_ms IS NULL)                                  AS missing_count
FROM base
GROUP BY column_index, time_bucket
ORDER BY column_index, time_bucket
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => ColFirstSeenBinnedRow.parse(r));
  },
});
