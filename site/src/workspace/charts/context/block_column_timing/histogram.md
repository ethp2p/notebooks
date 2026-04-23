Distribution of per-slot spread between block arrival and last column seen, binned into 60 buckets over the 0-2000 ms range, split by MEV vs local block.
MEV blocks are typically built by sophisticated block builders that optimise for proposer payment and may have different propagation characteristics than locally built blocks.
A wide distribution or heavy right tail indicates that many slots experience significant delays between when the block first arrives and when the last data column completes propagation.
Slots outside the 0-2000 ms window are excluded; use the timeseries view to inspect outliers.
