Boxplot of per-slot spread between block arrival and last column seen, grouped only by blob count bucket. MEV and local blocks are combined.
This chart isolates the effect of blob count on column propagation latency without the MEV vs local split, giving a cleaner view of the structural relationship.
A monotonically increasing median across buckets confirms that each additional blob meaningfully extends the time to full column propagation.
Box: 25th-75th percentile. Line: median. Whiskers: min/max excluding outliers.
