'use client';

import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';

interface Props {
  data: readonly LineData[];
}

export function PnlChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'rgba(0,0,0,0)' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(127,127,127,0.1)' },
        horzLines: { color: 'rgba(127,127,127,0.1)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const series = chart.addLineSeries({ color: '#10b981', lineWidth: 2 });
    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.setData([...data]);
  }, [data]);

  return <div ref={containerRef} className="h-[300px] w-full" />;
}
