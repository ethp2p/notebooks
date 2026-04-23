// This file imports every query submodule so that their query() calls
// register themselves on import. Keep this list exhaustive.
import './blob_inclusion';
import './blob_flow';
import './column_propagation';
import './mempool_visibility';
import './block_production_timeline';
import './block_propagation_by_size';
import './block_propagation_contributoor';
// Plan 03: primary datasets
import './block_production_events';
import './blob_inclusion_events';
import './mempool_events';
// Plan 03: aggregations
import './aggregated/col_first_seen_binned';
import './aggregated/block_timeline_cdf';
import './aggregated/region_size_matrix';
import './aggregated/blob_flow_edges';

export {};
