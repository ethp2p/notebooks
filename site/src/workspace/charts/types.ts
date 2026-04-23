import type { EChartsOption } from 'echarts';
import type { Table } from 'apache-arrow';
import type { z } from 'zod';

export type ChartContext = {
  date: string; // ISO YYYY-MM-DD
  isDark: boolean;
};

export type QueryMap = Record<string, Table>;

export type ChartDef<
  Queries extends readonly string[] = readonly string[],
  Data = unknown,
> = {
  id: string;
  topic: string;
  title: string;
  description: string;
  queries: Queries;
  related?: readonly string[];
  context?: () => Promise<{ default: string }>; // Vite ?raw lazy import
  activeFrom: string; // YYYY-MM-DD
  activeTo: string | null;
  order?: number;
  dataSchema: z.ZodType<Data>;
  transform: (raw: QueryMap) => Data;
  option: (data: Data, ctx: ChartContext) => EChartsOption;
};
