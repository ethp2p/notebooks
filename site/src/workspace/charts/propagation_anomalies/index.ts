import regressionScatter from './regression_scatter';
import byRelay from './by_relay_bar';
import byProposer from './by_proposer_bar';
import byBuilder from './by_builder_bar';
import byBlobcount from './by_blobcount_bar';

export const PROPAGATION_ANOMALIES_CHARTS = {
  [regressionScatter.id]: regressionScatter,
  [byRelay.id]: byRelay,
  [byProposer.id]: byProposer,
  [byBuilder.id]: byBuilder,
  [byBlobcount.id]: byBlobcount,
} as const;
