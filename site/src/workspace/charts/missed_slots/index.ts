import byEntity from './by_entity_bar';
import missRate from './miss_rate_bar';
import hourly from './hourly_bar';
import timeline from './timeline_scatter';

export const MISSED_SLOTS_CHARTS = {
  [byEntity.id]: byEntity,
  [missRate.id]: missRate,
  [hourly.id]: hourly,
  [timeline.id]: timeline,
} as const;
