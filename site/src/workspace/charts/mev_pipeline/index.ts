import bidTraceCoverageStacked from './bid_trace_coverage_stacked';
import bidVsBlockScatter from './bid_vs_block_scatter';
import bidToBlockScatterMedian from './bid_to_block_scatter_median';
import bidValueVsBlock from './bid_value_vs_block';
import biddingDurationVsBlock from './bidding_duration_vs_block';
import relayBoxByBlobbin from './relay_box_by_blobbin';
import blocksByBlobcountMevLocal from './blocks_by_blobcount_mev_local';
import firstColByBlobMevLocal from './first_col_by_blob_mev_local';
import lastColByBlobMevLocal from './last_col_by_blob_mev_local';
import builderDensityFacets from './builder_density_facets';
import relayDensityFacets from './relay_density_facets';
import bidTimingDensityOutliers from './bid_timing_density_outliers';
import bidTimingDensityFacets from './bid_timing_density_facets';

export const MEV_PIPELINE_CHARTS = {
  [bidTraceCoverageStacked.id]: bidTraceCoverageStacked,
  [bidVsBlockScatter.id]: bidVsBlockScatter,
  [bidToBlockScatterMedian.id]: bidToBlockScatterMedian,
  [bidValueVsBlock.id]: bidValueVsBlock,
  [biddingDurationVsBlock.id]: biddingDurationVsBlock,
  [relayBoxByBlobbin.id]: relayBoxByBlobbin,
  [blocksByBlobcountMevLocal.id]: blocksByBlobcountMevLocal,
  [firstColByBlobMevLocal.id]: firstColByBlobMevLocal,
  [lastColByBlobMevLocal.id]: lastColByBlobMevLocal,
  [builderDensityFacets.id]: builderDensityFacets,
  [relayDensityFacets.id]: relayDensityFacets,
  [bidTimingDensityOutliers.id]: bidTimingDensityOutliers,
  [bidTimingDensityFacets.id]: bidTimingDensityFacets,
} as const;
