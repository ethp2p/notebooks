import coverageStacked from './coverage_stacked';
import hourlyCoverageLines from './hourly_coverage_lines';
import txVolumeStackedTime from './tx_volume_stacked_time';
import coverageHeatmap from './coverage_heatmap';
import agePercentileLines from './age_percentile_lines';
import ageHistogramFacets from './age_histogram_facets';
import delayPercentileLines from './delay_percentile_lines';
import delayHistogramFacets from './delay_histogram_facets';
import sentryCoverageBar from './sentry_coverage_bar';

export const MEMPOOL_VISIBILITY_CHARTS = {
  [coverageStacked.id]: coverageStacked,
  [hourlyCoverageLines.id]: hourlyCoverageLines,
  [txVolumeStackedTime.id]: txVolumeStackedTime,
  [coverageHeatmap.id]: coverageHeatmap,
  [agePercentileLines.id]: agePercentileLines,
  [ageHistogramFacets.id]: ageHistogramFacets,
  [delayPercentileLines.id]: delayPercentileLines,
  [delayHistogramFacets.id]: delayHistogramFacets,
  [sentryCoverageBar.id]: sentryCoverageBar,
} as const;
