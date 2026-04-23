import '@testing-library/jest-dom/vitest';

// jsdom does not implement HTMLCanvasElement.getContext.
// ECharts (CanvasRenderer) calls getContext('2d') during init; returning null
// prevents a crash. The cast satisfies the overloaded signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(HTMLCanvasElement.prototype as any).getContext = (): null => null;

// jsdom does not implement ResizeObserver.
// PlotRenderer uses it for responsive resizing; stub it out so tests don't throw.
global.ResizeObserver = class ResizeObserver {
  observe() { /* no-op */ }
  unobserve() { /* no-op */ }
  disconnect() { /* no-op */ }
};
