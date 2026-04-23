Boolean flag per (column index, 5-minute bucket): orange indicates at least one slot in that bucket had no first-seen observation for that column.
Missing observations can result from custodian churn, network partitions, or data collection gaps.
Columns with frequent missing buckets may correspond to custody sets with lower node count or reliability.
Compare with the first-seen heatmap to check whether missing buckets align with periods of elevated latency.
