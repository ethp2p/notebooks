import { z } from 'zod';

const TopicEntry = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
});

const ChartEntry = z.object({
  id: z.string(),
  topic: z.string(),
  title: z.string(),
  description: z.string().default(''),
  related: z.array(z.string()).default([]),
  order: z.number().int().optional(),
  activeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activeTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const RegistrySchema = z.object({
  schemaVersion: z.literal('2.0'),
  generatedAt: z.string(),
  topics: z.array(TopicEntry),
  charts: z.record(z.string(), ChartEntry),
});

export type Registry = z.infer<typeof RegistrySchema>;

let cached: Promise<Registry> | null = null;

export function loadRegistry(): Promise<Registry> {
  cached ??= fetch('/registry.json')
    .then((r) => {
      if (!r.ok) throw new Error(`registry.json ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((raw) => RegistrySchema.parse(raw));
  return cached;
}
