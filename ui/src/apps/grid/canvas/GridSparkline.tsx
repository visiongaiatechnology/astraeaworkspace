// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Micro-Visualization Sparkline Subsystem
// Renders high-performance inline vector SVG sparklines: Line, Column, and Win-Loss

import React from 'react';

export type SparklineType = 'line' | 'column' | 'win-loss';

export interface GridSparklineProps {
  data: number[];
  type?: SparklineType;
  width?: number;
  height?: number;
  lineColor?: string;
  fillColor?: string;
  highlightMin?: boolean;
  highlightMax?: boolean;
  minColor?: string;
  maxColor?: string;
  negativeColor?: string;
}

export const GridSparkline: React.FC<GridSparklineProps> = ({
  data,
  type = 'line',
  width = 96,
  height = 20,
  lineColor = '#3b82f6',
  fillColor = 'rgba(59, 130, 246, 0.15)',
  highlightMin = true,
  highlightMax = true,
  minColor = '#ef4444',
  maxColor = '#10b981',
  negativeColor = '#f59e0b',
}) => {
  if (!data || data.length === 0) return null;

  const pad = 2;
  const renderW = Math.max(width - pad * 2, 10);
  const renderH = Math.max(height - pad * 2, 8);

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal === minVal ? 1 : maxVal - minVal;

  const minIdx = data.indexOf(minVal);
  const maxIdx = data.indexOf(maxVal);

  if (type === 'line') {
    const points = data.map((v, i) => {
      const x = pad + (i / Math.max(data.length - 1, 1)) * renderW;
      const y = pad + renderH - ((v - minVal) / range) * renderH;
      return { x, y, v };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - pad} L ${points[0].x.toFixed(1)} ${height - pad} Z`;

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible inline-block align-middle"
      >
        <path d={areaD} fill={fillColor} />
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {highlightMin && (
          <circle
            cx={points[minIdx].x}
            cy={points[minIdx].y}
            r="2"
            fill={minColor}
          />
        )}
        {highlightMax && (
          <circle
            cx={points[maxIdx].x}
            cy={points[maxIdx].y}
            r="2"
            fill={maxColor}
          />
        )}
      </svg>
    );
  }

  if (type === 'column') {
    const barWidth = Math.max(1, (renderW / data.length) - 1.5);
    const zeroY = minVal >= 0 ? height - pad : maxVal <= 0 ? pad : pad + (maxVal / range) * renderH;

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible inline-block align-middle"
      >
        <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="#475569" strokeWidth="0.75" />
        {data.map((v, i) => {
          const x = pad + i * (renderW / data.length);
          const isMin = highlightMin && i === minIdx;
          const isMax = highlightMax && i === maxIdx;
          const barColor = isMax ? maxColor : isMin ? minColor : v < 0 ? negativeColor : lineColor;

          let y: number;
          let h: number;
          if (v >= 0) {
            h = Math.max(1, (v / range) * renderH);
            y = zeroY - h;
          } else {
            h = Math.max(1, (Math.abs(v) / range) * renderH);
            y = zeroY;
          }

          return (
            <rect
              key={i}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={barWidth.toFixed(1)}
              height={h.toFixed(1)}
              fill={barColor}
              rx="0.5"
            />
          );
        })}
      </svg>
    );
  }

  if (type === 'win-loss') {
    const barWidth = Math.max(1, (renderW / data.length) - 1.5);
    const midY = height / 2;
    const barH = renderH / 2.2;

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible inline-block align-middle"
      >
        <line x1={pad} y1={midY} x2={width - pad} y2={midY} stroke="#475569" strokeWidth="0.75" />
        {data.map((v, i) => {
          const x = pad + i * (renderW / data.length);
          const y = v > 0 ? midY - barH : midY;
          const color = v > 0 ? maxColor : v < 0 ? minColor : '#94a3b8';
          const h = v === 0 ? 1 : barH;

          return (
            <rect
              key={i}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={barWidth.toFixed(1)}
              height={h.toFixed(1)}
              fill={color}
              rx="0.5"
            />
          );
        })}
      </svg>
    );
  }

  return null;
};
