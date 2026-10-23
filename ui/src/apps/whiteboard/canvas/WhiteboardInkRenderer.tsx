// STATUS: DIAMANT VGT SUPREME
import React from 'react';
import type { WhiteboardInkPoint } from '../../../shared/contracts/workspace';
import type { WhiteboardInteractionTool, WhiteboardItem } from '../types';
import { effectiveInkWidth, inkPathData, type WhiteboardInkDraft } from '../model/whiteboardInkEngine';

interface WhiteboardInkRendererProps {
  items: WhiteboardItem[];
  selectedItemId: string | null;
  selectedInkIds: readonly string[];
  handleItemMouseDown: (event: React.MouseEvent, item: WhiteboardItem) => void;
}

function pointBounds(points: readonly WhiteboardInkPoint[]) {
  let minX = points[0]?.x ?? 0; let maxX = minX; let minY = points[0]?.y ?? 0; let maxY = minY;
  for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
  return { minX, maxX, minY, maxY };
}

export const WhiteboardInkRenderer: React.FC<WhiteboardInkRendererProps> = ({ items, selectedItemId, selectedInkIds, handleItemMouseDown }) => {
  const selected = new Set(selectedInkIds);
  return (
    <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1, overflow: 'visible' }} aria-label="Whiteboard vector ink">
      <defs>
        <marker id="wb-ink-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><polygon points="0 1, 8 4, 0 7" fill="context-stroke" /></marker>
      </defs>
      {items.filter((item) => item.type === 'ink' && item.ink?.points.length).map((item) => {
        const ink = item.ink!;
        const width = effectiveInkWidth(ink);
        const isSelected = item.id === selectedItemId || selected.has(item.id);
        const points = ink.points;
        const first = points[0]; const last = points[points.length - 1];
        const bounds = pointBounds(points);
        const common = {
          fill: 'none',
          stroke: ink.color,
          strokeWidth: width,
          strokeOpacity: ink.opacity,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
          markerStart: ink.arrowStart ? 'url(#wb-ink-arrow)' : undefined,
          markerEnd: ink.arrowEnd ? 'url(#wb-ink-arrow)' : undefined,
        };
        const shape = ink.recognizedShape === 'line'
          ? <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} {...common} />
          : ink.recognizedShape === 'rect'
            ? <rect x={bounds.minX} y={bounds.minY} width={Math.max(1, bounds.maxX - bounds.minX)} height={Math.max(1, bounds.maxY - bounds.minY)} rx={4} {...common} />
            : ink.recognizedShape === 'ellipse'
              ? <ellipse cx={(bounds.minX + bounds.maxX) / 2} cy={(bounds.minY + bounds.maxY) / 2} rx={Math.max(1, (bounds.maxX - bounds.minX) / 2)} ry={Math.max(1, (bounds.maxY - bounds.minY) / 2)} {...common} />
              : <path d={inkPathData(points)} {...common} />;
        return (
          <g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation ?? 0} ${item.width / 2} ${item.height / 2})`} className="pointer-events-auto cursor-move" onMouseDown={(event) => handleItemMouseDown(event, item)}>
            {isSelected && <path d={inkPathData(points)} fill="none" stroke="#22d3ee" strokeWidth={width + 7} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" />}
            <path d={inkPathData(points)} fill="none" stroke="transparent" strokeWidth={Math.max(12, width + 8)} strokeLinecap="round" strokeLinejoin="round" />
            {shape}
          </g>
        );
      })}
    </svg>
  );
};

interface WhiteboardInkDraftOverlayProps {
  draft: WhiteboardInkDraft | null;
  gesturePoints: readonly WhiteboardInkPoint[];
  activeTool: WhiteboardInteractionTool;
  eraserRadius: number;
}

export const WhiteboardInkDraftOverlay: React.FC<WhiteboardInkDraftOverlayProps> = ({ draft, gesturePoints, activeTool, eraserRadius }) => {
  if (!draft && gesturePoints.length < 1) return null;
  return (
    <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1, overflow: 'visible' }} aria-hidden="true">
      {draft && <path d={inkPathData(draft.points)} fill="none" stroke={draft.color} strokeWidth={draft.width} strokeOpacity={draft.opacity} strokeLinecap="round" strokeLinejoin="round" />}
      {activeTool === 'ink-lasso' && gesturePoints.length > 1 && <polygon points={gesturePoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(34,211,238,.08)" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="7 5" />}
      {activeTool === 'ink-eraser' && gesturePoints.length > 0 && <><path d={inkPathData(gesturePoints)} fill="none" stroke="rgba(251,113,133,.45)" strokeWidth={eraserRadius * 2} strokeLinecap="round" strokeLinejoin="round" /><path d={inkPathData(gesturePoints)} fill="none" stroke="#fb7185" strokeWidth="1" strokeDasharray="4 4" /></>}
    </svg>
  );
};
