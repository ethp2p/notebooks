import firstSeenHeatmap from './first_seen_heatmap';
import deltaHeatmap from './delta_heatmap';
import normalizedHeatmap from './normalized_heatmap';
import spreadHistogram from './spread_histogram';
import spreadTimeseries from './spread_timeseries';
import missingHeatmap from './missing_heatmap';

export const COLUMN_PROPAGATION_CHARTS = {
  [firstSeenHeatmap.id]: firstSeenHeatmap,
  [deltaHeatmap.id]: deltaHeatmap,
  [normalizedHeatmap.id]: normalizedHeatmap,
  [spreadHistogram.id]: spreadHistogram,
  [spreadTimeseries.id]: spreadTimeseries,
  [missingHeatmap.id]: missingHeatmap,
} as const;
