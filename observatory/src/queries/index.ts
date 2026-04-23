// This file imports every query submodule so that their query() calls
// register themselves on import. Keep this list exhaustive.
// Per-chart legacy queries kept alive because charts still reference them.
import './column_propagation';   // col_first_seen (spread_timeseries, spread_histogram)
import './mempool_visibility';   // sentry_coverage (sentry-coverage-bar)
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
