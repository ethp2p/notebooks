import blockToColumnHistogram from './histogram';
import blockToColumnBoxplot from './boxplot';
import blockToColumnTimeseries from './timeseries';
import columnSpreadBoxplotBlob from './spread_boxplot';

export const BLOCK_COLUMN_TIMING_CHARTS = {
  [blockToColumnHistogram.id]: blockToColumnHistogram,
  [blockToColumnBoxplot.id]: blockToColumnBoxplot,
  [blockToColumnTimeseries.id]: blockToColumnTimeseries,
  [columnSpreadBoxplotBlob.id]: columnSpreadBoxplotBlob,
} as const;
