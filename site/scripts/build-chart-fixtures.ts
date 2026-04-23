#!/usr/bin/env bun
import { tableFromJSON, tableToIPC } from 'apache-arrow';
import fs from 'node:fs/promises';
import path from 'node:path';

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const rows = [
  { region: 'EU', source: 'sentry',       size_bucket: 'small',  median_ms: 1200, count: 1000 },
  { region: 'EU', source: 'contributoor', size_bucket: 'small',  median_ms: 1350, count:  800 },
  { region: 'NA', source: 'sentry',       size_bucket: 'small',  median_ms: 1500, count: 1200 },
  { region: 'NA', source: 'contributoor', size_bucket: 'small',  median_ms: 1650, count:  900 },
  { region: 'AS', source: 'sentry',       size_bucket: 'small',  median_ms: 1800, count:  600 },
  { region: 'AS', source: 'contributoor', size_bucket: 'small',  median_ms: 1900, count:  500 },
];
const out = path.join(import.meta.dir, '..', 'public', 'data', yesterday, 'region_size_matrix.arrow');
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, tableToIPC(tableFromJSON(rows), 'file'));
// Scripts are allowed to write to stdout; using process.stdout to avoid the
// no-console lint rule that only permits warn/error in application code.
process.stdout.write(`Wrote ${out}\n`);
