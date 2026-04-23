#!/usr/bin/env bun
import path from 'node:path';
import fs from 'node:fs/promises';
import pLimit from 'p-limit';
import { loadConfig, resolveDates, type Config } from './config';
import { makeClient } from './clickhouse';
import { writeArrow } from './arrow';
import {
  hashFile,
  loadCache,
  saveCache,
  needsFetch,
  recordFetch,
} from './staleness';
import { loadManifest, saveManifest } from './manifest';
import { QUERY_REGISTRY, type QueryDef } from './queries/registry';
import './queries/index';

interface Args {
  date?: string;
  only?: string;
  workers?: number;
  force: boolean;
  configPath: string;
}

function nextArg(argv: string[], i: number, flag: string): string {
  const val = argv[i + 1];
  if (val === undefined) throw new Error(`${flag} requires a value`);
  return val;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { force: false, configPath: 'pipeline.v2.yaml' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--force') out.force = true;
    else if (a === '--date')    { out.date = nextArg(argv, i, '--date'); i++; }
    else if (a === '--only')    { out.only = nextArg(argv, i, '--only'); i++; }
    else if (a === '--workers') { out.workers = Number(nextArg(argv, i, '--workers')); i++; }
    else if (a === '--config')  { out.configPath = nextArg(argv, i, '--config'); i++; }
    else if (a === '-h' || a === '--help') {
      console.log('Usage: bun run fetch [--date YYYY-MM-DD] [--only query_id] [--workers N] [--force] [--config path]');
      process.exit(0);
    }
  }
  return out;
}

function queryFilePath(q: QueryDef): string {
  const topicSnake = q.topic.replace(/-/g, '_');
  return path.join('observatory', 'src', 'queries', `${topicSnake}.ts`);
}

async function runOne(
  q: QueryDef,
  date: string,
  cfg: Config,
): Promise<{ rows: number; bytes: number } | { error: string }> {
  try {
    const client = makeClient(q.database ?? 'default');
    try {
      const rows = await q.fetch(client, { date, database: q.database ?? 'default' });
      const valid = rows.map((r, i) => {
        const parsed = q.schema.safeParse(r);
        if (!parsed.success) {
          throw new Error(`Row ${i} failed schema validation: ${parsed.error.message}`);
        }
        return parsed.data;
      });
      const outPath = path.join(cfg.settings.data_dir, date, `${q.id}.arrow`);
      await writeArrow(valid, outPath);
      const stat = await fs.stat(outPath);
      return { rows: valid.length, bytes: stat.size };
    } finally {
      await client.close();
    }
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    return { error: msg };
  }
}

async function recordFailure(queryId: string, date: string, error: string): Promise<void> {
  const fp = path.join('build', '.failures.json');
  let existing: Record<string, Record<string, { error: string; at: string }>> = {};
  try {
    existing = JSON.parse(await fs.readFile(fp, 'utf8'));
  } catch {
    // ignore
  }
  existing[queryId] ??= {};
  existing[queryId][date] = { error, at: new Date().toISOString() };
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(existing, null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const cfg = loadConfig(args.configPath);
  const today = new Date();
  const configuredDates = resolveDates(cfg, today);
  const dates = args.date ? [args.date] : configuredDates;

  const entries = [...QUERY_REGISTRY.values()].filter((q) => !args.only || q.id === args.only);
  if (entries.length === 0) {
    console.warn('No queries registered. Add imports to observatory/src/queries/index.ts.');
    process.exit(0);
  }

  const cache = await loadCache();
  const manifest = await loadManifest();
  const failures: Array<{ queryId: string; date: string; error: string }> = [];

  const limit = pLimit(args.workers ?? cfg.parallelism.fetch);

  await Promise.all(
    entries.flatMap((q) =>
      dates.map((date) =>
        limit(async () => {
          const src = queryFilePath(q);
          const hash = await hashFile(src).catch(() => 'unknown');
          const outPath = path.join(cfg.settings.data_dir, date, `${q.id}.arrow`);
          const reason = args.force
            ? 'forced'
            : await needsFetch({ queryId: q.id, queryHash: hash, date, outputPath: outPath }, cache);
          if (!reason) {
            console.log(`SKIP  ${q.id}@${date}  (up to date)`);
            return;
          }
          console.log(`FETCH ${q.id}@${date}  (${reason})`);
          const res = await runOne(q, date, cfg);
          if ('error' in res) {
            console.error(`FAIL  ${q.id}@${date}: ${res.error.split('\n')[0]}`);
            failures.push({ queryId: q.id, date, error: res.error });
            await recordFailure(q.id, date, res.error);
            return;
          }
          recordFetch(cache, q.id, hash, date);
          const entry = manifest.queries[q.id] ?? { hash, dates: {} };
          entry.hash = hash;
          entry.dates[date] = { rowCount: res.rows, byteSize: res.bytes };
          manifest.queries[q.id] = entry;
          console.log(`OK    ${q.id}@${date}  ${res.rows} rows, ${(res.bytes / 1024).toFixed(1)} KB`);
        }),
      ),
    ),
  );

  const latest = configuredDates.at(-1);
  if (latest) manifest.latestDate = latest;
  await saveCache(cache);
  await saveManifest(manifest);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
