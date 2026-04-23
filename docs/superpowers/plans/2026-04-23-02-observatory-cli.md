# Plan 02: observatory CLI and Arrow data pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
>
> **BEFORE STARTING, READ `docs/superpowers/plans/ERRATA.md` IN FULL.** Entries override this plan wherever they conflict.
>
> **IF YOU DEVIATE from this plan**, append to `ERRATA.md` BEFORE marking the step complete.

**Goal:** Build a Bun + TypeScript data pipeline (`observatory/`) that queries ClickHouse, validates rows with Zod, and writes Apache Arrow IPC files per (query, date) under `build/data/`. Staleness detection, parallelism, and failure isolation work the way the existing Python pipeline does. All existing Python queries are ported 1:1 to TS; query consolidation is deferred to Plan 03.

**Architecture:** One Bun package at `observatory/`. Queries declare themselves via a `query()` registry; `bun run fetch` iterates over configured (query, date) pairs, calls each query's `fetch(client, ctx)` function, Zod-parses rows, writes Arrow IPC to `build/data/{date}/{query_id}.arrow`. Staleness computes a source hash per query (AST-based) combined with date; a cached manifest records (hash, mtime) per output; missing or stale outputs are refetched. Concurrency is capped with `p-limit`.

**Tech Stack:** Bun ≥ 1.1, `@clickhouse/client` (web or node package), `apache-arrow` (write IPC), `zod`, `yaml`, `p-limit`, `@babel/parser` + `@babel/traverse` (source hashing). Tests: `bun test` (Vitest-compatible).

---

## Scope and non-scope

**In scope:**
- Bun package scaffolding at `observatory/`.
- `config.ts`: type-safe `pipeline.yaml` loader.
- `clickhouse.ts`: thin wrapper.
- `queries/registry.ts`: `query()` helper + `QUERY_REGISTRY`.
- Port of all existing Python queries in `queries/` 1:1 to TS, in `observatory/queries/`.
- Arrow IPC write helper.
- Staleness + failure + manifest.
- `fetch.ts` CLI.
- Unit tests for registry, config, staleness, Arrow round-trip.
- CI job that runs `bun run test` in the `observatory/` workspace.

**Out of scope (later plans):**
- Query consolidation into primary datasets (Plan 03).
- Aggregated queries `col_first_seen_binned`, etc. (Plan 03).
- Chart build (Plan 04).
- Site consumption of Arrow files (Plan 04).
- Deletion of Python pipeline (Plan 07).

## File structure

```
observatory/
├── package.json
├── tsconfig.json
├── bunfig.toml                       # inherits repo root; overrides only if needed
├── src/
│   ├── index.ts                      # Re-exports for internal use
│   ├── config.ts                     # pipeline.yaml loader (Zod)
│   ├── clickhouse.ts                 # Client factory
│   ├── arrow.ts                      # writeArrow / readArrow helpers
│   ├── staleness.ts                  # Hash per query; cache read/write
│   ├── manifest.ts                   # Data manifest shape (build/manifest.json)
│   ├── fetch.ts                      # CLI: `bun run fetch`
│   ├── build.ts                      # (stub; fleshed out in Plan 04)
│   └── queries/
│       ├── registry.ts               # query() helper
│       ├── index.ts                  # Imports every submodule (auto-registration)
│       ├── blob_inclusion.ts         # Ports from queries/blob_inclusion.py
│       ├── blob_flow.ts
│       ├── column_propagation.ts
│       ├── mempool_visibility.ts
│       ├── block_production_timeline.ts
│       ├── block_propagation_by_size.ts
│       └── block_propagation_contributoor.ts
└── tests/
    ├── config.test.ts
    ├── staleness.test.ts
    ├── arrow.test.ts
    ├── registry.test.ts
    └── fixtures/
        └── minimal_pipeline.yaml
```

Repository root also gains:

```
build/                                # gitignored
├── data/{YYYY-MM-DD}/{query_id}.arrow
├── manifest.json                     # per-(query, date) metadata
├── .cache.json                       # staleness cache
└── .failures.json                    # per-fetch failure log
```

---

## Task 01: initialise `observatory/` workspace

**Files:**
- Create: `observatory/package.json`
- Create: `observatory/tsconfig.json`
- Modify: `package.json` (at repo root, to declare workspaces)

- [ ] **Step 1: Check if a root `package.json` exists**

```bash
cat package.json 2>/dev/null | head -30 || echo "no root package.json"
```

If absent, create a minimal one at repo root:

```json
{
  "name": "observatory-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["site", "observatory"]
}
```

If present, add `"workspaces": ["site", "observatory"]` if not already there and keep other fields.

- [ ] **Step 2: Write `observatory/package.json`**

```json
{
  "name": "@observatory/pipeline",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "bin": {
    "observatory-fetch": "./src/fetch.ts"
  },
  "scripts": {
    "fetch": "bun run src/fetch.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@babel/parser": "^7.25.0",
    "@babel/traverse": "^7.25.0",
    "@babel/types": "^7.25.0",
    "@clickhouse/client": "^1.7.0",
    "apache-arrow": "^17.0.0",
    "p-limit": "^6.1.0",
    "yaml": "^2.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/babel__traverse": "^7.20.6",
    "@types/bun": "^1.1.0",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 3: Write `observatory/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "lib": ["ES2022"],
    "types": ["bun-types"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Install**

```bash
cd observatory && bun install
```

Expected: `observatory/bun.lock` or `bun.lock` at root (with workspaces resolution). No errors.

- [ ] **Step 5: Commit**

```bash
git add package.json observatory/package.json observatory/tsconfig.json bun.lock observatory/bun.lock 2>/dev/null
git commit -m "chore(observatory): initialise workspace"
```

## Task 02: `config.ts` with Zod schema for pipeline.yaml

**Files:**
- Create: `observatory/src/config.ts`
- Create: `observatory/tests/fixtures/minimal_pipeline.yaml`
- Create: `observatory/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

`observatory/tests/config.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { loadConfig, resolveDates } from '../src/config';
import path from 'node:path';

const FIX = path.join(import.meta.dir, 'fixtures/minimal_pipeline.yaml');

describe('config', () => {
  it('loads the minimal fixture', () => {
    const cfg = loadConfig(FIX);
    expect(cfg.dates.mode).toBe('rolling');
    expect(cfg.settings.network).toBe('mainnet');
  });

  it('resolves rolling dates', () => {
    const cfg = loadConfig(FIX);
    const today = new Date('2026-04-23');
    const dates = resolveDates(cfg, today);
    expect(dates[0]).toBe('2025-04-24');      // 365 days before today
    expect(dates[dates.length - 1]).toBe('2026-04-22');  // yesterday
    expect(dates.length).toBe(365);
  });
});
```

- [ ] **Step 2: Write the fixture**

`observatory/tests/fixtures/minimal_pipeline.yaml`:

```yaml
version: "2.0"

dates:
  mode: rolling
  rolling:
    window: 365
    start: "2025-04-24"

parallelism:
  fetch: 4
  build: 4

settings:
  network: mainnet
  timezone: UTC
  flagship_chart_id: "block-propagation-by-size"
  data_dir: "build/data"
  dist_dir: "site/dist"
```

- [ ] **Step 3: Verify the test fails**

```bash
cd observatory && bun test tests/config.test.ts
```

Expected: 2 failures (module not found / function not exported).

- [ ] **Step 4: Implement `config.ts`**

```ts
import fs from 'node:fs';
import YAML from 'yaml';
import { z } from 'zod';

const DatesRolling = z.object({
  mode: z.literal('rolling'),
  rolling: z.object({
    window: z.number().int().positive(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

const DatesRange = z.object({
  mode: z.literal('range'),
  range: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

const DatesList = z.object({
  mode: z.literal('list'),
  list: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
});

export const ConfigSchema = z.object({
  version: z.string(),
  dates: z.discriminatedUnion('mode', [DatesRolling, DatesRange, DatesList]),
  parallelism: z.object({
    fetch: z.number().int().positive().default(4),
    build: z.number().int().positive().default(4),
  }).default({ fetch: 4, build: 4 }),
  settings: z.object({
    network: z.enum(['mainnet', 'holesky', 'sepolia']).default('mainnet'),
    timezone: z.string().default('UTC'),
    flagship_chart_id: z.string(),
    data_dir: z.string().default('build/data'),
    dist_dir: z.string().default('site/dist'),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  const raw = fs.readFileSync(path, 'utf8');
  const doc = YAML.parse(raw);
  return ConfigSchema.parse(doc);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function resolveDates(cfg: Config, today: Date): string[] {
  const yesterday = addDays(today, -1);
  if (cfg.dates.mode === 'rolling') {
    const { window, start } = cfg.dates.rolling;
    const windowStart = addDays(yesterday, -(window - 1));
    const floor = start ? new Date(`${start}T00:00:00Z`) : windowStart;
    const begin = windowStart < floor ? floor : windowStart;
    const out: string[] = [];
    for (let d = new Date(begin); d <= yesterday; d = addDays(d, 1)) {
      out.push(isoDay(d));
    }
    return out;
  }
  if (cfg.dates.mode === 'range') {
    const start = new Date(`${cfg.dates.range.start}T00:00:00Z`);
    const end = cfg.dates.range.end
      ? new Date(`${cfg.dates.range.end}T00:00:00Z`)
      : yesterday;
    const out: string[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(isoDay(d));
    return out;
  }
  return [...cfg.dates.list].sort();
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd observatory && bun test tests/config.test.ts
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add observatory/src/config.ts observatory/tests
git commit -m "feat(observatory): config loader with zod schema for pipeline.yaml"
```

## Task 03: ClickHouse client wrapper

**Files:**
- Create: `observatory/src/clickhouse.ts`

- [ ] **Step 1: Write `observatory/src/clickhouse.ts`**

```ts
import { createClient, type ClickHouseClient } from '@clickhouse/client';

export type Database = 'default' | 'contributoor';

export interface ClickHouseEnv {
  url: string;
  username: string;
  password: string;
}

export function readEnv(): ClickHouseEnv {
  const url = process.env.CLICKHOUSE_URL;
  const username = process.env.CLICKHOUSE_USERNAME;
  const password = process.env.CLICKHOUSE_PASSWORD;
  if (!url || !username || !password) {
    throw new Error(
      'CLICKHOUSE_URL, CLICKHOUSE_USERNAME, and CLICKHOUSE_PASSWORD must be set in the environment.',
    );
  }
  return { url, username, password };
}

export function makeClient(database: Database, env?: ClickHouseEnv): ClickHouseClient {
  const { url, username, password } = env ?? readEnv();
  return createClient({
    url,
    username,
    password,
    database,
    request_timeout: 120_000,
    compression: { response: true, request: false },
    application: 'observatory',
  });
}

export type { ClickHouseClient };
```

- [ ] **Step 2: Commit**

```bash
git add observatory/src/clickhouse.ts
git commit -m "feat(observatory): clickhouse client factory"
```

## Task 04: query registry helper

**Files:**
- Create: `observatory/src/queries/registry.ts`
- Create: `observatory/tests/registry.test.ts`

- [ ] **Step 1: Write the failing test**

`observatory/tests/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { query, QUERY_REGISTRY, clearRegistryForTests } from '../src/queries/registry';

beforeEach(() => clearRegistryForTests());

describe('query registry', () => {
  it('registers a query', () => {
    const Row = z.object({ a: z.number() });
    const q = query({
      id: 'test_q',
      topic: 'test',
      description: 'x',
      schema: Row,
      async fetch() { return []; },
    });
    expect(QUERY_REGISTRY.size).toBe(1);
    expect(QUERY_REGISTRY.get('test_q')).toBe(q);
  });

  it('rejects duplicate ids', () => {
    const Row = z.object({});
    query({ id: 'dup', topic: 't', description: '', schema: Row, async fetch() { return []; } });
    expect(() =>
      query({ id: 'dup', topic: 't', description: '', schema: Row, async fetch() { return []; } }),
    ).toThrow(/duplicate query id/i);
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
cd observatory && bun test tests/registry.test.ts
```

Expected: failure (module not found).

- [ ] **Step 3: Implement `registry.ts`**

```ts
import type { z } from 'zod';
import type { ClickHouseClient, Database } from '../clickhouse';

export interface QueryContext {
  date: string;             // YYYY-MM-DD
  database: Database;
}

export interface QueryDef<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  topic: string;
  description: string;
  database?: Database;
  schema: Schema;
  fetch(client: ClickHouseClient, ctx: QueryContext): Promise<Array<z.infer<Schema>>>;
}

export const QUERY_REGISTRY: Map<string, QueryDef> = new Map();

export function query<S extends z.ZodTypeAny>(def: QueryDef<S>): QueryDef<S> {
  if (QUERY_REGISTRY.has(def.id)) {
    throw new Error(`Duplicate query id: ${def.id}`);
  }
  QUERY_REGISTRY.set(def.id, def as QueryDef);
  return def;
}

/** Test-only: clear the registry between tests. Do not call from production code. */
export function clearRegistryForTests(): void {
  QUERY_REGISTRY.clear();
}
```

- [ ] **Step 4: Run test**

```bash
cd observatory && bun test tests/registry.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add observatory/src/queries/registry.ts observatory/tests/registry.test.ts
git commit -m "feat(observatory): query() registry helper"
```

## Task 05: Arrow IPC write helper

**Files:**
- Create: `observatory/src/arrow.ts`
- Create: `observatory/tests/arrow.test.ts`

- [ ] **Step 1: Write the failing test**

`observatory/tests/arrow.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { writeArrow, readArrow } from '../src/arrow';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('arrow', () => {
  it('round-trips a small table', async () => {
    const rows = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
      { a: 3, b: 'z' },
    ];
    const tmp = path.join(os.tmpdir(), `arrow-test-${Date.now()}.arrow`);
    await writeArrow(rows, tmp);
    const table = await readArrow(tmp);
    expect(table.numRows).toBe(3);
    expect(Array.from(table.getChild('a')!.toArray())).toEqual([1, 2, 3]);
    expect(Array.from(table.getChild('b')!.toArray())).toEqual(['x', 'y', 'z']);
    fs.unlinkSync(tmp);
  });

  it('handles empty input', async () => {
    const tmp = path.join(os.tmpdir(), `arrow-empty-${Date.now()}.arrow`);
    await writeArrow([], tmp);
    const table = await readArrow(tmp);
    expect(table.numRows).toBe(0);
    fs.unlinkSync(tmp);
  });
});
```

- [ ] **Step 2: Implement `arrow.ts`**

```ts
import { tableFromJSON, tableFromIPC, tableToIPC, Table } from 'apache-arrow';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeArrow<Row extends Record<string, unknown>>(
  rows: Row[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const table = rows.length === 0
    ? new Table()
    : tableFromJSON(rows);
  const bytes = tableToIPC(table, 'file');
  await fs.writeFile(outputPath, bytes);
}

export async function readArrow(inputPath: string): Promise<Table> {
  const buf = await fs.readFile(inputPath);
  return tableFromIPC(new Uint8Array(buf));
}
```

- [ ] **Step 3: Run tests**

```bash
cd observatory && bun test tests/arrow.test.ts
```

Expected: 2 passing. If `tableFromJSON` doesn't infer schema for an empty array, the empty-table path may need an adjustment: create `new Table(new Schema([]))` instead. Append to ERRATA if you took a different approach.

- [ ] **Step 4: Commit**

```bash
git add observatory/src/arrow.ts observatory/tests/arrow.test.ts
git commit -m "feat(observatory): arrow ipc write+read helpers"
```

## Task 06: staleness detection via AST hashing

**Files:**
- Create: `observatory/src/staleness.ts`
- Create: `observatory/tests/staleness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'bun:test';
import { hashSource } from '../src/staleness';

describe('staleness.hashSource', () => {
  it('is stable across comment whitespace changes', () => {
    const a = `// a\nexport function foo() { return 1; }`;
    const b = `/* hi */\nexport function foo() { return 1; }`;
    expect(hashSource(a)).toBe(hashSource(b));
  });

  it('changes when code changes', () => {
    const a = `export function foo() { return 1; }`;
    const b = `export function foo() { return 2; }`;
    expect(hashSource(a)).not.toBe(hashSource(b));
  });
});
```

- [ ] **Step 2: Implement `staleness.ts`**

```ts
import parser from '@babel/parser';
import traverse from '@babel/traverse';
import type { Node } from '@babel/types';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function hashSource(src: string): string {
  const ast = parser.parse(src, {
    sourceType: 'module',
    plugins: ['typescript'],
    createParenthesizedExpressions: false,
  });
  traverse(ast, {
    enter(p) {
      const n = p.node as Record<string, unknown>;
      delete n.loc;
      delete n.start;
      delete n.end;
      delete n.leadingComments;
      delete n.trailingComments;
      delete n.innerComments;
    },
  });
  const normalized = JSON.stringify(ast);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function hashFile(filePath: string): Promise<string> {
  const src = await fs.readFile(filePath, 'utf8');
  return hashSource(src);
}

export interface StalenessCache {
  queries: Record<string, { hash: string; dates: Record<string, { fetchedAt: string }> }>;
}

const CACHE_PATH = path.join('build', '.cache.json');

export async function loadCache(): Promise<StalenessCache> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    return JSON.parse(raw) as StalenessCache;
  } catch {
    return { queries: {} };
  }
}

export async function saveCache(cache: StalenessCache): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export interface StalenessInput {
  queryId: string;
  queryHash: string;
  date: string;
  outputPath: string;
}

export async function needsFetch(input: StalenessInput, cache: StalenessCache): Promise<string | null> {
  const entry = cache.queries[input.queryId];
  if (!entry) return 'new';
  if (entry.hash !== input.queryHash) return 'query-changed';
  const dateEntry = entry.dates[input.date];
  if (!dateEntry) return 'new';
  try {
    await fs.access(input.outputPath);
  } catch {
    return 'output-missing';
  }
  return null;
}

export function recordFetch(
  cache: StalenessCache,
  queryId: string,
  queryHash: string,
  date: string,
): void {
  const entry = cache.queries[queryId] ?? { hash: queryHash, dates: {} };
  entry.hash = queryHash;
  entry.dates[date] = { fetchedAt: new Date().toISOString() };
  cache.queries[queryId] = entry;
}
```

- [ ] **Step 3: Run tests**

```bash
cd observatory && bun test tests/staleness.test.ts
```

Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add observatory/src/staleness.ts observatory/tests/staleness.test.ts
git commit -m "feat(observatory): ast-based staleness hashing + cache"
```

## Task 07: data manifest

**Files:**
- Create: `observatory/src/manifest.ts`

- [ ] **Step 1: Write `manifest.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const DataManifestSchema = z.object({
  schemaVersion: z.literal('2.0'),
  latestDate: z.string(),
  generatedAt: z.string(),
  queries: z.record(
    z.string(),   // query_id
    z.object({
      hash: z.string(),
      dates: z.record(
        z.string(), // date
        z.object({
          rowCount: z.number().int().nonnegative(),
          byteSize: z.number().int().nonnegative(),
        }),
      ),
    }),
  ),
});

export type DataManifest = z.infer<typeof DataManifestSchema>;

const MANIFEST_PATH = path.join('build', 'manifest.json');

export async function loadManifest(): Promise<DataManifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    return DataManifestSchema.parse(JSON.parse(raw));
  } catch {
    return {
      schemaVersion: '2.0',
      latestDate: '',
      generatedAt: new Date().toISOString(),
      queries: {},
    };
  }
}

export async function saveManifest(m: DataManifest): Promise<void> {
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  m.generatedAt = new Date().toISOString();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2));
}
```

- [ ] **Step 2: Commit**

```bash
git add observatory/src/manifest.ts
git commit -m "feat(observatory): data manifest schema + io"
```

## Task 08: `fetch.ts` CLI skeleton

**Files:**
- Create: `observatory/src/fetch.ts`
- Create: `observatory/src/queries/index.ts` (imports every submodule for side-effect registration; starts empty, filled in later tasks)

- [ ] **Step 1: Write `observatory/src/queries/index.ts`** (starts empty; each query submodule adds itself later)

```ts
// This file imports every query submodule so that their @query() calls
// register themselves on import. Keep this list exhaustive.
export {};
// submodules will be added as they are ported:
// import './blob_inclusion';
// import './blob_flow';
// import './column_propagation';
// import './mempool_visibility';
// import './block_production_timeline';
// import './block_propagation_by_size';
// import './block_propagation_contributoor';
```

- [ ] **Step 2: Write `observatory/src/fetch.ts`**

```ts
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
import './queries/index';       // triggers registration side effects

interface Args {
  date?: string;
  only?: string;
  workers?: number;
  force: boolean;
  configPath: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { force: false, configPath: 'pipeline.yaml' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--date')    out.date = argv[++i];
    else if (a === '--only')    out.only = argv[++i];
    else if (a === '--workers') out.workers = Number(argv[++i]);
    else if (a === '--config')  out.configPath = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log('Usage: bun run fetch [--date YYYY-MM-DD] [--only query_id] [--workers N] [--force] [--config path]');
      process.exit(0);
    }
  }
  return out;
}

function queryFilePath(q: QueryDef): string {
  // Convention: query modules live at observatory/src/queries/<topic-kebab>.ts
  // The topic is kebab-case; the file uses snake_case. Resolve by mapping id -> module path.
  // Callers needing the path for hashing look up by the query's source file.
  // We use Bun's import.meta to introspect where each query was defined, if available.
  // Fallback: derive from topic.
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
    /* ignore */
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
          manifest.queries[q.id] ??= { hash, dates: {} };
          manifest.queries[q.id]!.hash = hash;
          manifest.queries[q.id]!.dates[date] = { rowCount: res.rows, byteSize: res.bytes };
          console.log(`OK    ${q.id}@${date}  ${res.rows} rows, ${(res.bytes / 1024).toFixed(1)} KB`);
        }),
      ),
    ),
  );

  if (configuredDates.length > 0) manifest.latestDate = configuredDates[configuredDates.length - 1]!;
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
```

- [ ] **Step 3: Dry-run with no registered queries**

```bash
cd observatory && bun run fetch 2>&1 | head
```

Expected: prints "No queries registered." and exits 0.

- [ ] **Step 4: Commit**

```bash
git add observatory/src/fetch.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): fetch cli skeleton with parallelism + staleness + failures"
```

## Task 09: port `blob_inclusion` query (pilot)

**Files:**
- Read: `queries/blob_inclusion.py` (existing Python source)
- Create: `observatory/src/queries/blob_inclusion.ts`
- Modify: `observatory/src/queries/index.ts`

- [ ] **Step 1: Read the Python reference**

```bash
cat queries/blob_inclusion.py
```

Examine each function. They produce DataFrames via `clickhouse-connect.query_df`. Each corresponds to one query id (likely `blobs_per_slot`, `blocks_blob_epoch`, `blob_popularity`, `slot_in_epoch`; confirm against `pipeline.yaml`). For each, note the SQL and the column names + dtypes.

- [ ] **Step 2: Write `observatory/src/queries/blob_inclusion.ts`**

Port each Python query as a `query({...})` call with the same id, same SQL, same column shape. Keep per-query files small: if one file gets unwieldy, split by sub-topic. Here is the template; apply it per query:

```ts
import { z } from 'zod';
import { query } from './registry';

const BlobsPerSlotRow = z.object({
  slot:         z.number().int(),
  slot_time:    z.coerce.date(),
  blob_count:   z.number().int(),
  proposer:     z.string().nullable(),
});

export const blobsPerSlot = query({
  id: 'blobs_per_slot',
  topic: 'blob-inclusion',
  description: 'Blobs per slot timeseries.',
  schema: BlobsPerSlotRow,
  async fetch(client, { date }) {
    const sql = /* sql */ `
      SELECT slot,
             slot_start_date_time AS slot_time,
             blob_count,
             proposer_pubkey    AS proposer
      FROM canonical_beacon_block
      WHERE toDate(slot_start_date_time) = {date:Date}
      ORDER BY slot
    `;
    const rs = await client.query({
      query: sql,
      query_params: { date },
      format: 'JSONEachRow',
    });
    const rows = await rs.json<unknown[]>();
    return rows.map((r) => BlobsPerSlotRow.parse(r));
  },
});

// Repeat for blocks_blob_epoch, blob_popularity, slot_in_epoch.
```

When translating each Python SQL, preserve `DISTINCT` clauses and any `ORDER BY` exactly (see the repo's past fix at commit `d0ce799` for why DISTINCT is important). If a SQL fragment uses a parameter, translate it to ClickHouse JS's `{name:Type}` placeholder syntax.

- [ ] **Step 3: Register in `observatory/src/queries/index.ts`**

Uncomment or add:

```ts
import './blob_inclusion';
```

- [ ] **Step 4: Dry-run fetch against real ClickHouse (requires env)**

Ensure `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD` are set.

```bash
cd observatory && bun run fetch --only blobs_per_slot --date $(date -v -1d +%F)
```

Expected: exit 0. `build/data/<yesterday>/blobs_per_slot.arrow` exists. Its row count roughly matches 7200 slots/day.

```bash
ls -la ../build/data/*/blobs_per_slot.arrow
```

- [ ] **Step 5: Verify the Arrow file round-trips to the expected shape**

Quick repl check:

```bash
cd observatory && bun -e '
  import { readArrow } from "./src/arrow";
  const t = await readArrow(`../build/data/2026-04-22/blobs_per_slot.arrow`);
  console.log("rows", t.numRows, "cols", t.schema.fields.map(f => f.name));
  console.log("first row:", t.get(0));
'
```

Expected: columns match the schema; non-zero row count.

- [ ] **Step 6: Commit**

```bash
git add observatory/src/queries/blob_inclusion.ts observatory/src/queries/index.ts
git commit -m "feat(observatory): port blob_inclusion queries to ts"
```

## Task 10: port the remaining query files

**Files:**
- Create: one file per existing `queries/*.py`, in `observatory/src/queries/`.
- Modify: `observatory/src/queries/index.ts` (add one import line per new file).

Each of the following existing Python files must be ported in the same way as Task 09. Keep query ids, SQL, and column shapes identical to today's behaviour. Do not consolidate queries yet; that is Plan 03's job.

| Python file | TS file |
|---|---|
| `queries/blob_flow.py` | `observatory/src/queries/blob_flow.ts` |
| `queries/column_propagation.py` | `observatory/src/queries/column_propagation.ts` |
| `queries/mempool_visibility.py` | `observatory/src/queries/mempool_visibility.ts` |
| `queries/block_production_timeline.py` | `observatory/src/queries/block_production_timeline.ts` |
| `queries/block_propagation_by_size.py` | `observatory/src/queries/block_propagation_by_size.ts` |
| `queries/block_propagation_contributoor.py` | `observatory/src/queries/block_propagation_contributoor.ts` |

- [ ] **Step 1-6 per file:** repeat Task 09's steps for each Python source:
  1. Read the Python source.
  2. Write the TS file with Zod schemas + `query({...})` calls.
  3. Add the import to `observatory/src/queries/index.ts`.
  4. Dry-run `bun run fetch --only <query_id> --date YYYY-MM-DD` for at least one id per file.
  5. Verify the resulting Arrow file.
  6. Commit: `feat(observatory): port <topic> queries to ts`.

After all six are ported and registered, `observatory/src/queries/index.ts` should look like:

```ts
import './blob_inclusion';
import './blob_flow';
import './column_propagation';
import './mempool_visibility';
import './block_production_timeline';
import './block_propagation_by_size';
import './block_propagation_contributoor';
```

- [ ] **Final step: full-pipeline dry run for yesterday**

```bash
cd observatory && bun run fetch --date $(date -v -1d +%F)
```

Expected: every query succeeds; `build/data/<yesterday>/*.arrow` has one file per query id. Build exits 0.

## Task 11: add observatory tests job to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append an `observatory` job**

```yaml
  observatory:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install
      - run: bun run --cwd observatory typecheck
      - run: bun run --cwd observatory test
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run observatory typecheck + tests"
```

## Self-review checklist

- [ ] Every query id from the old `pipeline.yaml` under `queries:` section has a matching `query({...})` call in `observatory/src/queries/`.
- [ ] `bun run fetch --force --date <yesterday>` succeeds and produces one Arrow file per query under `build/data/<yesterday>/`.
- [ ] No `any` types, no non-null assertion abuse, no `as` casts outside schema `.parse()` internals.
- [ ] Zod validates every row at the ClickHouse boundary.
- [ ] `hashSource` is stable across comment + whitespace changes.
- [ ] `needsFetch` returns `null` for a cache-hit and a non-null reason otherwise.
- [ ] Failures are recorded in `build/.failures.json`; exit code non-zero if any occurred.
- [ ] CI job runs on every PR.
- [ ] ERRATA entries written for every deviation.

## Done condition

`plan-02-observatory-cli` PR merged. `bun run fetch` replaces `scripts/fetch_data.py` functionally for today's query set. The Python pipeline still runs; both produce equivalent data. Next: Plan 03 consolidates queries into primary datasets and adds the four pre-aggregations.
