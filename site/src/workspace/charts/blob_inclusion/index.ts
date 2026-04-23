import blobDensityScatter from './density_scatter';
import blobCountStackedEpoch from './count_stacked_epoch';
import blobPopularityHeatmap from './popularity_heatmap';
import blobSlotHeatmapVertical from './slot_heatmap_vertical';
import blobSlotHeatmapFacet from './slot_heatmap_facet';

export const BLOB_INCLUSION_CHARTS = {
  [blobDensityScatter.id]: blobDensityScatter,
  [blobCountStackedEpoch.id]: blobCountStackedEpoch,
  [blobPopularityHeatmap.id]: blobPopularityHeatmap,
  [blobSlotHeatmapVertical.id]: blobSlotHeatmapVertical,
  [blobSlotHeatmapFacet.id]: blobSlotHeatmapFacet,
} as const;
