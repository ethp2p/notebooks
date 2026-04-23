import { useEffect, useLayoutEffect, useRef } from 'react';
import type { EChartsOption } from 'echarts';
import { ensureEchartsRegistered, echarts } from './echarts-setup';

interface Props {
  option: EChartsOption;
  className?: string;
}

export function PlotRenderer({ option, className }: Props) {
  ensureEchartsRegistered();
  const divRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useLayoutEffect(() => {
    if (!divRef.current) return;
    instRef.current = echarts.init(divRef.current, 'observatory-light', { renderer: 'canvas' });
    return () => {
      instRef.current?.dispose();
      instRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    instRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => instRef.current?.resize());
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <div ref={divRef} className={className ?? 'h-full w-full'} />;
}
