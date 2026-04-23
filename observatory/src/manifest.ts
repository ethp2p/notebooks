import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const DataManifestSchema = z.object({
  schemaVersion: z.literal('2.0'),
  latestDate: z.string(),
  generatedAt: z.string(),
  queries: z.record(
    z.string(),
    z.object({
      hash: z.string(),
      dates: z.record(
        z.string(),
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
