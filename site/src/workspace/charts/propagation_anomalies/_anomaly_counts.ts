import type { Table } from 'apache-arrow';

const MAX_BLOBS = 9;

function computeP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = 0.95 * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return (sorted[lo] ?? 0) * (hi - idx) + (sorted[hi] ?? 0) * (idx - lo);
}

/**
 * Counts propagation anomalies (block_arrival rows where latency_ms > P95 for their
 * blob_count bucket) grouped by the given column name.
 */
export function computeAnomalyCounts(t: Table, groupCol: string): Map<string, number> {
  const typeCol = t.getChild('event_type');
  const latCol = t.getChild('latency_ms');
  const blobsCol = t.getChild('blob_count');
  const col = t.getChild(groupCol);

  type Entry = { blobCount: number; latency: number; label: string };
  const rows: Entry[] = [];

  for (let i = 0; i < t.numRows; i++) {
    const evType = String(typeCol?.get(i) ?? '');
    if (evType !== 'block_arrival') continue;
    rows.push({
      blobCount: Math.min(Number(blobsCol?.get(i) ?? 0), MAX_BLOBS),
      latency: Number(latCol?.get(i) ?? 0),
      label: String(col?.get(i) ?? 'unknown'),
    });
  }

  // Compute P95 per blob-count bucket
  const byBlob = new Map<number, number[]>();
  for (let b = 0; b <= MAX_BLOBS; b++) byBlob.set(b, []);
  for (const r of rows) {
    byBlob.get(r.blobCount)?.push(r.latency);
  }
  const p95 = new Map<number, number>();
  for (let b = 0; b <= MAX_BLOBS; b++) {
    p95.set(b, computeP95(byBlob.get(b) ?? []));
  }

  // Count anomalies per label
  const counts = new Map<string, number>();
  for (const r of rows) {
    const threshold = p95.get(r.blobCount) ?? 0;
    if (r.latency > threshold) {
      counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
    }
  }
  return counts;
}
