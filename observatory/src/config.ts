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
