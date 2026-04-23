import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Mock echarts-setup before importing PlotRenderer so the mock is in place
// when the module is first loaded. jsdom's CanvasRenderer cannot actually
// create a <canvas> element when getContext returns null, so we stub
// echarts.init to insert a real canvas element ourselves. The shim is the
// minimal surface PlotRenderer actually calls: setOption, resize, dispose.
const mockInstance = {
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('@/workspace/charts/echarts-setup', () => ({
  ensureEchartsRegistered: vi.fn(),
  echarts: {
    init: vi.fn((el: HTMLElement) => {
      const canvas = document.createElement('canvas');
      el.appendChild(canvas);
      return mockInstance;
    }),
    registerTheme: vi.fn(),
  },
}));

// Import after the mock is registered
const { PlotRenderer } = await import('@/workspace/charts/PlotRenderer');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeAll(() => {
  // reset mock instance between test files
});

describe('PlotRenderer', () => {
  it('mounts an ECharts instance into its container', () => {
    const option = {
      xAxis: { type: 'category' as const, data: ['a', 'b'] },
      yAxis: { type: 'value' as const },
      series: [{ type: 'bar' as const, data: [1, 2] }],
    };
    const { container } = render(<PlotRenderer option={option} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('cleans up on unmount', () => {
    const option = {
      xAxis: { type: 'category' as const, data: ['a'] },
      yAxis: { type: 'value' as const },
      series: [{ type: 'bar' as const, data: [1] }],
    };
    const { unmount, container } = render(<PlotRenderer option={option} />);
    unmount();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
