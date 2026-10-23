// STATUS: DIAMANT VGT SUPREME — Interactive Sovereign Layout Ruler & Tab Stops
import React, { useRef, useState, useEffect } from 'react';
import type { WriterTabStop, WriterTabAlignment } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig, CustomMargins } from '../../types';
import { getMargins, getWriterPageGeometry } from '../pagination/writerPagination';

interface WriterRulerProps {
  pageSetup: PageSetupConfig;
  tabStops?: WriterTabStop[];
  firstLineIndentMm?: number;
  leftIndentMm?: number;
  rightIndentMm?: number;
  /**
   * True when the marked paragraphs do not agree on a value the ruler shows. The
   * ruler edits the marked paragraphs through the shared command, so it has to
   * say that the handles do not describe all of them (W-119).
   */
  mixedIndentMm?: { readonly firstLine?: boolean; readonly left?: boolean };
  mixedTabStops?: boolean;
  onUpdateMargins?: (margins: CustomMargins) => void;
  onUpdateTabStops?: (tabStops: WriterTabStop[]) => void;
  onUpdateIndent?: (indent: { firstLineMm?: number; leftMm?: number; rightMm?: number }) => void;
  zoom: number;
  showRuler?: boolean;
}

const CSS_PIXELS_PER_MM = 96 / 25.4;

/** Marks a handle whose value the marked range does not agree on. */
const MIXED_HANDLE_CLASS = 'ring-2 ring-dashed ring-amber-400/80 rounded-sm';
const MIXED_HANDLE_TITLE = 'Mehrere Werte in der markierten Auswahl';

export const WriterRuler: React.FC<WriterRulerProps> = ({
  pageSetup,
  tabStops = [],
  firstLineIndentMm = 0,
  leftIndentMm = 0,
  rightIndentMm = 0,
  mixedIndentMm,
  mixedTabStops = false,
  onUpdateMargins,
  onUpdateTabStops,
  onUpdateIndent,
  zoom,
  showRuler = true,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<
    | { type: 'leftMargin'; startX: number; initialValue: number }
    | { type: 'rightMargin'; startX: number; initialValue: number }
    | { type: 'firstLineIndent'; startX: number; initialValue: number }
    | { type: 'leftIndent'; startX: number; initialValue: number }
    | { type: 'tabStop'; id: string; startX: number; initialValue: number }
    | null
  >(null);

  const geometry = getWriterPageGeometry(pageSetup);
  const margins = getMargins(pageSetup);
  const scale = zoom / 100;
  const totalWidthMm = geometry.widthPx / CSS_PIXELS_PER_MM;

  // Render tick marks every 1mm, with major marks every 10mm (1cm)
  const renderTicks = () => {
    const ticks: React.ReactNode[] = [];
    const cmCount = Math.floor(totalWidthMm / 10);

    for (let cm = 0; cm <= cmCount; cm++) {
      const posMm = cm * 10;
      const posPx = posMm * CSS_PIXELS_PER_MM;

      // Major cm tick + label
      ticks.push(
        <div
          key={`cm-${cm}`}
          className="absolute top-0 flex flex-col items-center select-none pointer-events-none"
          style={{ left: `${posPx}px` }}
        >
          <div className="w-px h-3 bg-slate-500/50" />
          <span className="text-[0.5625rem] font-mono text-slate-400 -ml-1 mt-0.5">{cm}</span>
        </div>
      );

      // Half-cm tick
      if (posMm + 5 <= totalWidthMm) {
        ticks.push(
          <div
            key={`half-${cm}`}
            className="absolute top-0 w-px h-2 bg-slate-600/40 select-none pointer-events-none"
            style={{ left: `${(posMm + 5) * CSS_PIXELS_PER_MM}px` }}
          />
        );
      }
    }
    return ticks;
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current || !onUpdateTabStops) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / scale;
    const clickMm = clickX / CSS_PIXELS_PER_MM;

    // Only allow tab stop clicks inside body margins
    if (clickMm < margins.left || clickMm > totalWidthMm - margins.right) return;

    const relativePosMm = Math.round((clickMm - margins.left) * 10) / 10;
    const existingIndex = tabStops.findIndex((ts) => Math.abs(ts.positionMm - relativePosMm) < 2);

    if (existingIndex !== -1) {
      // Cycle alignment on click: left -> center -> right -> decimal
      const alignments: WriterTabAlignment[] = ['left', 'center', 'right', 'decimal'];
      const current = tabStops[existingIndex];
      if (current) {
        const nextAlign = alignments[(alignments.indexOf(current.alignment) + 1) % alignments.length] ?? 'left';
        const updated = [...tabStops];
        updated[existingIndex] = { ...current, alignment: nextAlign };
        onUpdateTabStops(updated);
      }
    } else {
      // Add new left tab stop
      const newStop: WriterTabStop = {
        id: `tab-${Date.now()}`,
        positionMm: relativePosMm,
        alignment: 'left',
        leader: 'none',
      };
      onUpdateTabStops([...tabStops, newStop]);
    }
  };

  // Mouse move and up handlers for dragging handles
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!activeDrag || !rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left) / scale;
      const deltaX = currentX - activeDrag.startX;
      const deltaMm = deltaX / CSS_PIXELS_PER_MM;

      if (activeDrag.type === 'leftMargin' && onUpdateMargins) {
        const newLeft = Math.max(5, Math.min(100, Math.round((activeDrag.initialValue + deltaMm) * 2) / 2));
        onUpdateMargins({
          top: margins.top,
          bottom: margins.bottom,
          left: newLeft,
          right: margins.right,
          gutter: pageSetup.customMargins?.gutter ?? 0,
        });
      } else if (activeDrag.type === 'rightMargin' && onUpdateMargins) {
        const newRight = Math.max(5, Math.min(100, Math.round((activeDrag.initialValue - deltaMm) * 2) / 2));
        onUpdateMargins({
          top: margins.top,
          bottom: margins.bottom,
          left: margins.left,
          right: newRight,
          gutter: pageSetup.customMargins?.gutter ?? 0,
        });
      } else if (activeDrag.type === 'firstLineIndent' && onUpdateIndent) {
        const newFirstLine = Math.max(-50, Math.min(50, Math.round((activeDrag.initialValue + deltaMm) * 2) / 2));
        onUpdateIndent({ firstLineMm: newFirstLine, leftMm: leftIndentMm, rightMm: rightIndentMm });
      } else if (activeDrag.type === 'leftIndent' && onUpdateIndent) {
        const newLeft = Math.max(0, Math.min(100, Math.round((activeDrag.initialValue + deltaMm) * 2) / 2));
        onUpdateIndent({ firstLineMm: firstLineIndentMm, leftMm: newLeft, rightMm: rightIndentMm });
      } else if (activeDrag.type === 'tabStop' && onUpdateTabStops) {
        const newPos = Math.max(0, Math.min(geometry.bodyWidthPx / CSS_PIXELS_PER_MM, Math.round((activeDrag.initialValue + deltaMm) * 2) / 2));
        const updated = tabStops.map((ts) => ts.id === activeDrag.id ? { ...ts, positionMm: newPos } : ts);
        onUpdateTabStops(updated);
      }
    };

    const onMouseUp = () => {
      setActiveDrag(null);
    };

    if (activeDrag) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [activeDrag, scale, margins, totalWidthMm, onUpdateMargins, onUpdateIndent, onUpdateTabStops, tabStops, leftIndentMm, rightIndentMm, firstLineIndentMm, geometry.bodyWidthPx, pageSetup.customMargins]);

  if (!showRuler) return null;

  const leftMarginPx = margins.left * CSS_PIXELS_PER_MM;
  const rightMarginPx = margins.right * CSS_PIXELS_PER_MM;
  const bodyLeftPx = leftMarginPx;
  const bodyRightPx = geometry.widthPx - rightMarginPx;

  return (
    <div
      ref={rulerRef}
      role="region"
      aria-label="Horizontal Page Ruler"
      data-vgt-workspace-chrome="ruler"
      onClick={handleRulerClick}
      className="relative h-6 bg-slate-900 border-b border-white/10 select-none cursor-crosshair overflow-hidden shadow-inner"
      style={{ width: `${geometry.widthPx}px` }}
    >
      {/* Left Margin Shading */}
      <div
        data-vgt-workspace-chrome-layer="true"
        className="absolute top-0 bottom-0 left-0 bg-slate-950/80 border-r border-slate-700/60 z-0"
        style={{ width: `${leftMarginPx}px` }}
      />

      {/* Right Margin Shading */}
      <div
        data-vgt-workspace-chrome-layer="true"
        className="absolute top-0 bottom-0 right-0 bg-slate-950/80 border-l border-slate-700/60 z-0"
        style={{ width: `${rightMarginPx}px` }}
      />

      {/* Tick Marks */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {renderTicks()}
      </div>

      {/* Left Margin Drag Handle */}
      <div
        role="slider"
        aria-label="Left Margin Slider"
        aria-valuenow={margins.left}
        className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/40 z-20 transition-colors"
        style={{ left: `${leftMarginPx - 4}px` }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setActiveDrag({ type: 'leftMargin', startX: (e.clientX - (rulerRef.current?.getBoundingClientRect().left ?? 0)) / scale, initialValue: margins.left });
        }}
      >
        <div className="w-0.5 h-full bg-blue-400 mx-auto" />
      </div>

      {/* Right Margin Drag Handle */}
      <div
        role="slider"
        aria-label="Right Margin Slider"
        aria-valuenow={margins.right}
        className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/40 z-20 transition-colors"
        style={{ left: `${bodyRightPx - 2}px` }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setActiveDrag({ type: 'rightMargin', startX: (e.clientX - (rulerRef.current?.getBoundingClientRect().left ?? 0)) / scale, initialValue: margins.right });
        }}
      >
        <div className="w-0.5 h-full bg-blue-400 mx-auto" />
      </div>

      {/* Indent Markers */}
      {/* First line indent (top triangle) */}
      <div
        role="button"
        tabIndex={0}
        aria-label={mixedIndentMm?.firstLine ? `First Line Indent (${MIXED_HANDLE_TITLE})` : 'First Line Indent'}
        data-writer-indent-mixed={mixedIndentMm?.firstLine ? 'true' : 'false'}
        title={mixedIndentMm?.firstLine ? MIXED_HANDLE_TITLE : undefined}
        className={`absolute top-0 w-2.5 h-2.5 cursor-ew-resize z-30 flex items-center justify-center group ${mixedIndentMm?.firstLine ? MIXED_HANDLE_CLASS : ''}`}
        style={{ left: `${bodyLeftPx + (firstLineIndentMm * CSS_PIXELS_PER_MM) - 5}px` }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setActiveDrag({ type: 'firstLineIndent', startX: (e.clientX - (rulerRef.current?.getBoundingClientRect().left ?? 0)) / scale, initialValue: firstLineIndentMm });
        }}
      >
        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-amber-400 group-hover:border-t-amber-300" />
      </div>

      {/* Left indent (bottom triangle) */}
      <div
        role="button"
        tabIndex={0}
        aria-label={mixedIndentMm?.left ? `Left Indent (${MIXED_HANDLE_TITLE})` : 'Left Indent'}
        data-writer-indent-mixed={mixedIndentMm?.left ? 'true' : 'false'}
        title={mixedIndentMm?.left ? MIXED_HANDLE_TITLE : undefined}
        className={`absolute bottom-0 w-2.5 h-2.5 cursor-ew-resize z-30 flex items-center justify-center group ${mixedIndentMm?.left ? MIXED_HANDLE_CLASS : ''}`}
        style={{ left: `${bodyLeftPx + (leftIndentMm * CSS_PIXELS_PER_MM) - 5}px` }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setActiveDrag({ type: 'leftIndent', startX: (e.clientX - (rulerRef.current?.getBoundingClientRect().left ?? 0)) / scale, initialValue: leftIndentMm });
        }}
      >
        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-cyan-400 group-hover:border-b-cyan-300" />
      </div>

      {/* A range whose tab stops differ: the handles below describe the active
          paragraph, so the ruler says so instead of pretending they are the
          selection's tab stops (W-119). */}
      {mixedTabStops && (
        <span
          data-writer-tab-stops-mixed="true"
          className="absolute bottom-0 left-2 z-40 rounded-sm border border-dashed border-amber-400/70 bg-slate-950/80 px-1 text-[0.5625rem] leading-4 text-amber-200"
          title={MIXED_HANDLE_TITLE}
        >
          Tabstopps: mehrere Werte
        </span>
      )}

      {/* Tab Stop Markers */}
      {tabStops.map((stop) => {
        const stopPx = bodyLeftPx + stop.positionMm * CSS_PIXELS_PER_MM;
        return (
          <div
            key={stop.id}
            role="button"
            tabIndex={0}
            aria-label={`Tab stop at ${stop.positionMm}mm (${stop.alignment})`}
            className="absolute bottom-0.5 w-3 h-3 cursor-pointer z-30 flex items-center justify-center"
            style={{ left: `${stopPx - 6}px` }}
            title={`Tab stop: ${stop.positionMm}mm (${stop.alignment}). Right-click to remove.`}
            onMouseDown={(e) => {
              if (e.button === 0) {
                e.stopPropagation();
                setActiveDrag({ type: 'tabStop', id: stop.id, startX: (e.clientX - (rulerRef.current?.getBoundingClientRect().left ?? 0)) / scale, initialValue: stop.positionMm });
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onUpdateTabStops) {
                onUpdateTabStops(tabStops.filter((ts) => ts.id !== stop.id));
              }
            }}
          >
            {stop.alignment === 'left' && <span className="text-[0.625rem] font-bold text-emerald-400 font-mono">∟</span>}
            {stop.alignment === 'right' && <span className="text-[0.625rem] font-bold text-emerald-400 font-mono">⅃</span>}
            {stop.alignment === 'center' && <span className="text-[0.625rem] font-bold text-emerald-400 font-mono">┴</span>}
            {stop.alignment === 'decimal' && <span className="text-[0.625rem] font-bold text-emerald-400 font-mono">┴·</span>}
          </div>
        );
      })}
    </div>
  );
};
