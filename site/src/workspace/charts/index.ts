import { BLOB_INCLUSION_CHARTS } from './blob_inclusion';
import { BLOB_FLOW_CHARTS } from './blob_flow';
import { COLUMN_PROPAGATION_CHARTS } from './column_propagation';
import { MEMPOOL_VISIBILITY_CHARTS } from './mempool_visibility';
import { MEV_PIPELINE_CHARTS } from './mev_pipeline';
import { BLOCK_COLUMN_TIMING_CHARTS } from './block_column_timing';
import { PROPAGATION_ANOMALIES_CHARTS } from './propagation_anomalies';
import { MISSED_SLOTS_CHARTS } from './missed_slots';
import { BLOCK_PROPAGATION_CHARTS } from './block_propagation';

export const ALL_CHARTS = {
  ...BLOB_INCLUSION_CHARTS,
  ...BLOB_FLOW_CHARTS,
  ...COLUMN_PROPAGATION_CHARTS,
  ...MEMPOOL_VISIBILITY_CHARTS,
  ...MEV_PIPELINE_CHARTS,
  ...BLOCK_COLUMN_TIMING_CHARTS,
  ...PROPAGATION_ANOMALIES_CHARTS,
  ...MISSED_SLOTS_CHARTS,
  ...BLOCK_PROPAGATION_CHARTS,
} as const;
