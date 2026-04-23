/**
 * CLI entry point: scans chart modules, validates them, and emits
 * build/registry.json + build/dates.json (also copied to site/public/).
 *
 * Usage: bun run src/registry-manifest.ts [--config <path>]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import glob from 'fast-glob';
import { loadConfig, resolveDates } from './config';
import { scanFile } from './scanner';
import type { ScannedChart } from './scanner';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// observatory/src/ -> observatory/ -> repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OBSERVATORY_DIR = path.resolve(__dirname, '..');

const BUILD_DIR = path.join(OBSERVATORY_DIR, 'build');
const SITE_PUBLIC_DIR = path.join(REPO_ROOT, 'site', 'public');

const REGISTRY_FILENAME = 'registry.json';
const DATES_FILENAME = 'dates.json';

// ---------------------------------------------------------------------------
// TOPIC_REGISTRY loaded from site source
// ---------------------------------------------------------------------------

// Import the topic registry from site source. observatory/tsconfig.json uses
// "moduleResolution": "bundler" and "baseUrl": ".", so we resolve by path.
// The relative path from observatory/src/ to site/src/workspace/charts/ is:
// ../../site/src/workspace/charts/topics.ts
// We use a dynamic import to load it at runtime.

interface TopicDef {
  id: string;
  title: string;
  order: number;
}

async function loadTopicRegistry(): Promise<Record<string, TopicDef>> {
  const topicsPath = path.join(
    REPO_ROOT,
    'site',
    'src',
    'workspace',
    'charts',
    'topics.ts',
  );

  // Read the source and extract TOPIC_REGISTRY using the scanner-style AST
  // approach is overkill here — we can rely on the static shape of topics.ts.
  // Instead, import directly via Bun's native TS support:
  const mod = await import(topicsPath);
  const registry = mod.TOPIC_REGISTRY as Record<string, TopicDef> | undefined;
  if (!registry || typeof registry !== 'object') {
    throw new Error(`topics.ts did not export TOPIC_REGISTRY`);
  }
  return registry;
}

// ---------------------------------------------------------------------------
// Chart glob
// ---------------------------------------------------------------------------

const CHARTS_GLOB = path.join(
  REPO_ROOT,
  'site',
  'src',
  'workspace',
  'charts',
  '**',
  '*.ts',
);

// Files to exclude from scanning (support files, not chart definitions).
const EXCLUDE_NAMES = new Set([
  'index.ts',
  'define.ts',
  'types.ts',
  'theme.ts',
  'echarts-setup.ts',
  'context.ts',
  'topics.ts',
]);

// Directories whose children are never chart modules.
const EXCLUDE_DIRS = new Set(['context']);

function shouldScan(filePath: string): boolean {
  const basename = path.basename(filePath);
  const dir = path.basename(path.dirname(filePath));
  if (EXCLUDE_NAMES.has(basename)) return false;
  if (EXCLUDE_DIRS.has(dir)) return false;
  // Also skip .tsx files (PlotRenderer etc. are excluded by glob *.ts, but guard anyway)
  return true;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

interface DateRange {
  activeFrom: string;
  activeTo: string | null;
}

function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const aEnd = a.activeTo ?? '9999-12-31';
  const bEnd = b.activeTo ?? '9999-12-31';
  return a.activeFrom <= bEnd && b.activeFrom <= aEnd;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Parse --config flag.
  const args = process.argv.slice(2);
  let configPath = 'pipeline.v2.yaml';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--config' || arg === '-c') && i + 1 < args.length) {
      const next = args[i + 1];
      if (next === undefined) throw new Error('--config requires a value');
      configPath = next;
      i++;
    }
  }

  // Load config (resolves relative to CWD, i.e. observatory/).
  const cfg = loadConfig(configPath);
  const dates = resolveDates(cfg, new Date());
  const latest = dates[dates.length - 1] ?? '';

  // Load topic registry.
  const topicRegistry = await loadTopicRegistry();

  // Glob chart files.
  const rawPaths = await glob(CHARTS_GLOB, {
    absolute: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**'],
  });

  const chartPaths = rawPaths.filter(shouldScan);

  // Scan each file.
  const scanned: ScannedChart[] = [];
  for (const filePath of chartPaths.sort()) {
    const chart = await scanFile(filePath);
    if (!chart) {
      console.log(`SKIP  ${path.relative(REPO_ROOT, filePath)} (no defineChart found)`);
      continue;
    }
    console.log(`SCAN  ${path.relative(REPO_ROOT, filePath)} → ${chart.id}`);
    scanned.push(chart);
  }

  // Validate: no duplicate ids with overlapping date ranges.
  const byId = new Map<string, ScannedChart[]>();
  for (const chart of scanned) {
    const existing = byId.get(chart.id) ?? [];
    existing.push(chart);
    byId.set(chart.id, existing);
  }
  for (const [id, charts] of byId) {
    if (charts.length < 2) continue;
    for (let i = 0; i < charts.length; i++) {
      for (let j = i + 1; j < charts.length; j++) {
        const a = charts[i];
        const b = charts[j];
        if (a === undefined || b === undefined) continue;
        if (rangesOverlap(a, b)) {
          throw new Error(
            `Duplicate chart id "${id}" with overlapping date ranges: ` +
              `[${a.activeFrom}..${a.activeTo ?? 'now'}] and [${b.activeFrom}..${b.activeTo ?? 'now'}]`,
          );
        }
      }
    }
  }

  // Validate: every topic referenced exists in TOPIC_REGISTRY.
  const missingTopics: string[] = [];
  for (const chart of scanned) {
    if (!(chart.topic in topicRegistry)) {
      missingTopics.push(`chart "${chart.id}" references unknown topic "${chart.topic}"`);
    }
  }
  if (missingTopics.length > 0) {
    throw new Error(`Unknown topics:\n${missingTopics.join('\n')}`);
  }

  // Build registry.json
  const sortedTopics = Object.values(topicRegistry).sort(
    (a, b) => a.order - b.order,
  );

  const chartsObj: Record<string, Omit<ScannedChart, 'id'> & { id: string }> = {};
  for (const chart of scanned) {
    chartsObj[chart.id] = chart;
  }

  const registry = {
    schemaVersion: '2.0',
    generatedAt: new Date().toISOString(),
    topics: sortedTopics,
    charts: chartsObj,
  };

  // Build dates.json
  const datesJson = { dates, latest };

  // Write to build/
  await fs.mkdir(BUILD_DIR, { recursive: true });
  await fs.writeFile(
    path.join(BUILD_DIR, REGISTRY_FILENAME),
    JSON.stringify(registry, null, 2),
  );
  await fs.writeFile(
    path.join(BUILD_DIR, DATES_FILENAME),
    JSON.stringify(datesJson, null, 2),
  );

  // Copy to site/public/
  await fs.mkdir(SITE_PUBLIC_DIR, { recursive: true });
  await fs.copyFile(
    path.join(BUILD_DIR, REGISTRY_FILENAME),
    path.join(SITE_PUBLIC_DIR, REGISTRY_FILENAME),
  );
  await fs.copyFile(
    path.join(BUILD_DIR, DATES_FILENAME),
    path.join(SITE_PUBLIC_DIR, DATES_FILENAME),
  );

  console.log(
    `\nWrote build/${REGISTRY_FILENAME} and build/${DATES_FILENAME} ` +
      `(${scanned.length} charts, ${sortedTopics.length} topics, ${dates.length} dates)`,
  );
  console.log(`Copied to site/public/`);
}

main().catch((err) => {
  console.error('ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
