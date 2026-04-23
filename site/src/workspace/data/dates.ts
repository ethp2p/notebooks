import { z } from 'zod';

export const DatesSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  latest: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type Dates = z.infer<typeof DatesSchema>;

let cached: Promise<Dates> | null = null;

export function loadDates(): Promise<Dates> {
  cached ??= fetch('/dates.json')
    .then((r) => {
      if (!r.ok) throw new Error(`dates.json ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((raw) => DatesSchema.parse(raw));
  return cached;
}
