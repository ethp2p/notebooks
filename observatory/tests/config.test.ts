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
    expect(dates[0]).toBe('2025-04-24');
    expect(dates[dates.length - 1]).toBe('2026-04-22');
    expect(dates.length).toBe(364);
  });
});
