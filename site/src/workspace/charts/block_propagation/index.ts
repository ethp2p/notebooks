import regionWinnerGroupedBar from './region_winner_grouped_bar';
import sizeDistHistogram from './size_dist_histogram';
import compressionRatioScatter from './compression_ratio_scatter';
import winningBidHistogram from './winning_bid_histogram';
import buildingVsNetworkStacked from './building_vs_network_stacked';
import rawVsCorrectedBox from './raw_vs_corrected_box';
import correctedVsSizeScatter from './corrected_vs_size_scatter';
import correctedBySizebucketBox from './corrected_by_sizebucket_box';
import correctedDensityByBuilder from './corrected_density_by_builder';
import regionalCorrectedBox from './regional_corrected_box';
import regionalCdfSubplots from './regional_cdf_subplots';
import regionSizeHeatmapSubplots from './region_size_heatmap_subplots';
import spreadBySizeBox from './spread_by_size_box';
import spreadVsSizeScatter from './spread_vs_size_scatter';
import entityPercentileBars from './entity_percentile_bars';
import topEntityDensityFacets from './top_entity_density_facets';
import sizeResidualsScatter from './size_residuals_scatter';
import doubleOutlierQuadrantScatter from './double_outlier_quadrant_scatter';
import entityAnomalyRateBar from './entity_anomaly_rate_bar';

export const BLOCK_PROPAGATION_CHARTS = {
  [regionWinnerGroupedBar.id]: regionWinnerGroupedBar,
  [sizeDistHistogram.id]: sizeDistHistogram,
  [compressionRatioScatter.id]: compressionRatioScatter,
  [winningBidHistogram.id]: winningBidHistogram,
  [buildingVsNetworkStacked.id]: buildingVsNetworkStacked,
  [rawVsCorrectedBox.id]: rawVsCorrectedBox,
  [correctedVsSizeScatter.id]: correctedVsSizeScatter,
  [correctedBySizebucketBox.id]: correctedBySizebucketBox,
  [correctedDensityByBuilder.id]: correctedDensityByBuilder,
  [regionalCorrectedBox.id]: regionalCorrectedBox,
  [regionalCdfSubplots.id]: regionalCdfSubplots,
  [regionSizeHeatmapSubplots.id]: regionSizeHeatmapSubplots,
  [spreadBySizeBox.id]: spreadBySizeBox,
  [spreadVsSizeScatter.id]: spreadVsSizeScatter,
  [entityPercentileBars.id]: entityPercentileBars,
  [topEntityDensityFacets.id]: topEntityDensityFacets,
  [sizeResidualsScatter.id]: sizeResidualsScatter,
  [doubleOutlierQuadrantScatter.id]: doubleOutlierQuadrantScatter,
  [entityAnomalyRateBar.id]: entityAnomalyRateBar,
} as const;
