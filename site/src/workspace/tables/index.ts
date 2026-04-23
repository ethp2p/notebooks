import { PROPAGATION_ANOMALIES_TABLES } from './propagation_anomalies';
import { MISSED_SLOTS_TABLES } from './missed_slots';
import { BLOCK_PROPAGATION_TABLES } from './block_propagation';

export const ALL_TABLES = {
  ...PROPAGATION_ANOMALIES_TABLES,
  ...MISSED_SLOTS_TABLES,
  ...BLOCK_PROPAGATION_TABLES,
} as const;
