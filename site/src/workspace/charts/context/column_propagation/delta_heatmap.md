Per-column delta from the column's own minimum median latency across all 5-minute buckets.
A zero value marks the bucket where a column propagated fastest; higher values indicate how much slower it was in that bucket.
This removes the structural baseline latency difference between columns, exposing purely temporal variation.
Spikes in a column at a specific time of day may indicate load events or network conditions affecting that column's custodians.
