import type { EChartsOption } from 'echarts';

export const LIGHT_TOKENS = {
  bg0:    '#f4f0e8',
  bg1:    '#e8e3d8',
  border: '#d0c9ba',
  muted:  '#7a7165',
  fg:     '#2c2822',
  hi:     '#1a1714',
  accent: {
    amber:  '#b8872e',
    teal:   '#2e7f92',
    green:  '#4d8a32',
    purple: '#8b4fa0',
  },
  palette: (hue: number, lightness = 38): string => `hsl(${hue}, 50%, ${lightness}%)`,
} as const;

export const HUE_CYCLE = [
  30, 195, 275, 140, 100, 55, 335, 15, 175, 240,
  70, 305, 160, 210, 120, 350, 45, 185, 260, 90, 5, 225,
] as const;

export function observatoryThemeLight(): EChartsOption {
  const t = LIGHT_TOKENS;
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Xray Mono, monospace', color: t.fg, fontSize: 12 },
    title: {
      textStyle: { fontFamily: 'Xray Mono, monospace', color: t.hi, fontSize: 13, fontWeight: 700 },
    },
    legend: { textStyle: { color: t.fg, fontFamily: 'Xray Mono, monospace', fontSize: 10 } },
    tooltip: {
      backgroundColor: t.bg1,
      borderColor: t.border,
      borderWidth: 1,
      textStyle: { color: t.fg, fontFamily: 'Xray Mono, monospace', fontSize: 12 },
      extraCssText: 'border-radius:0; box-shadow:none;',
    },
    color: [
      t.accent.amber, t.accent.teal, t.accent.green, t.accent.purple,
      ...HUE_CYCLE.slice(4).map((h) => t.palette(h)),
    ],
    grid: { top: 32, right: 16, bottom: 32, left: 48, containLabel: true },
    xAxis: {
      axisLine:  { lineStyle: { color: t.border } },
      axisTick:  { lineStyle: { color: t.border } },
      axisLabel: { color: t.muted, fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: t.border, opacity: 0.35 } },
      nameTextStyle: { color: t.muted, fontSize: 10 },
    },
    yAxis: {
      axisLine:  { lineStyle: { color: t.border } },
      axisTick:  { lineStyle: { color: t.border } },
      axisLabel: { color: t.muted, fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: t.border, opacity: 0.35 } },
      nameTextStyle: { color: t.muted, fontSize: 10 },
    },
    visualMap: {
      textStyle: { color: t.fg, fontFamily: 'Xray Mono, monospace' },
    },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', borderColor: t.border, backgroundColor: t.bg1, fillerColor: 'rgba(0,0,0,0.08)' },
    ],
  };
}
