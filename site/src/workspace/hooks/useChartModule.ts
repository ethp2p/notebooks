import { ALL_CHARTS } from '@/workspace/charts/index';
import type { ChartDef } from '@/workspace/charts/types';

export function useChartModule(id: string): ChartDef | null {
  const chart = (ALL_CHARTS as Record<string, ChartDef>)[id];
  return chart ?? null;
}
