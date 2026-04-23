import { z } from 'zod';
import { query } from './registry';

// Number of data columns in PeerDAS.
const NUM_COLUMNS = 128;

// ---------------------------------------------------------------------------
// col_first_seen
// ---------------------------------------------------------------------------
// Each row has slot, time, and c0..c127 (propagation_slot_start_diff in ms,
// nullable because minIfOrNull returns NULL when no row matches the condition).

// Build the Zod schema dynamically: slot + time + c0..c127 all nullable numbers.
const colFields: Record<string, z.ZodTypeAny> = {
  slot: z.number().int(),
  time: z.coerce.date(),
};
for (let i = 0; i < NUM_COLUMNS; i++) {
  colFields[`c${i}`] = z.number().nullable();
}
const ColFirstSeenRow = z.object(colFields as { slot: z.ZodNumber; time: ReturnType<typeof z.coerce.date> } & Record<string, z.ZodTypeAny>);

// Build the SELECT column list: minIfOrNull(propagation_slot_start_diff, column_index = N) AS cN
function buildColSelects(n: number): string {
  return Array.from({ length: n }, (_, i) =>
    `minIfOrNull(propagation_slot_start_diff, column_index = ${i}) AS c${i}`,
  ).join(',\n    ');
}

export const colFirstSeen = query({
  id: 'col_first_seen',
  topic: 'column-propagation',
  description: 'Column first seen timing across 128 subnets',
  schema: ColFirstSeenRow,
  async fetch(client, { date }) {
    const colSelects = buildColSelects(NUM_COLUMNS);
    const sql = /* sql */ `
SELECT
    slot,
    slot_start_date_time AS time,
    ${colSelects}
FROM libp2p_gossipsub_data_column_sidecar
WHERE event_date_time >= {date:Date}
  AND event_date_time < {date:Date} + INTERVAL 1 DAY
  AND slot_start_date_time >= {date:Date}
  AND slot_start_date_time < {date:Date} + INTERVAL 1 DAY
  AND meta_network_name = {network:String}
GROUP BY slot, slot_start_date_time
ORDER BY slot
`;
    const rs = await client.query({
      query: sql,
      query_params: { date, network: 'mainnet' },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => ColFirstSeenRow.parse(r));
  },
});
