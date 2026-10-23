// STATUS: DIAMANT VGT SUPREME — Interactive Sovereign Vertical Layout Ruler
import React, { useRef, useState, useEffect } from 'react';
import type { PageSetupConfig, CustomMargins } from '../../types';
import { getMargins, getWriterPageGeometry } from '../pagination/writerPagination';

interface WriterVerticalRulerProps {
  pageSetup: PageSetupConfig;
  onUpdateMargins?: (margins: CustomMargins) => void;
  zoom: number;
  showRuler?: boolean;
}

const CSS_PIXELS_PER_MM = 96 / 25.4;

export const WriterVerticalRuler: React.FC<WriterVerticalRulerProps> = ({
  pageSetup,
  onUpdateMargins,
  zoom,
  showRuler = true,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<
    | { type: 'topMargin'; startY: number; initialValue: number }
    | { type: 'bottomMargin'; startY: number; initialValue: number }
    | null
  >(null);

  const geometry = getWriterPageGeometry(pageSetup);
  const margins = getMargins(pageSetup);
  const scale = zoom / 100;
  const totalHeightMm = geometry.heightPx / CSS_PIXELS_PER_MM;

  // Render tick marks every 1mm, with major marks every 10mm (1cm)
  const renderTicks = () => {
    const ticks: React.ReactNode[] = [];
    const cmCount = Math.floor(totalHeightMm / 10);

    for (let cm = 0; cm <= cmCount; cm++) {
      const posMm = cm * 10;
      const posPx = posMm * CSS_PIXELS_PER_MM;

      // Major cm tick + label
      ticks.push(
        <div
          key={`cm-${cm}`}
          className="absolute left-0 flex items-center select-none pointer-events-none"
          style={{ top: `${posPx}px` }}
        >
          <div className="h-px w-3 bg-slate-500/50" />
          <span className="text-[0.5rem] font-mono text-slate-400 ml-0.5 leading-none">{cm}</span>
        </div>
      );

      // Half-cm tick
      if (posMm + 5 <= totalHeightMm) {
        ticks.push(
          <div
            key={`half-${cm}`}
            className="absolute left-0 h-px w-2 bg-slate-600/40 select-none pointer-events-none"
            style={{ top: `${(posMm + 5) * CSS_PIXELS_PER_MM}px` }}
          />
        );
      }
    }
    return ticks;
  };

  // Drag handlers for vertical top & bottom margins
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!activeDrag || !onUpdateMargins) return;
      const deltaY = (e.clientY - activeDrag.startY) / scale;
      const deltaMm = deltaY / CSS_PIXELS_PER_MM;

      const currentMargins: CustomMargins = {
        top: margins.top,
        bottom: margins.bottom,
        left: margins.left,
        right: margins.right,
        gutter: pageSetup.customMargins?.gutter ?? 0,
      };

      if (activeDrag.type === 'topMargin') {
        const nextTop = Math.max(5, Math.min(totalHeightMm - margins.bottom - 20, activeDrag.initialValue + deltaMm));
        onUpdateMargins({ ...currentMargins, top: Math.round(nextTop) });
      } else if (activeDrag.type === 'bottomMargin') {
        const nextBottom = Math.max(5, Math.min(totalHeightMm - margins.top - 20, activeDrag.initialValue - deltaMm));
        onUpdateMargins({ ...currentMargins, bottom: Math.round(nextBottom) });
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
  }, [activeDrag, margins, onUpdateMargins, pageSetup.customMargins, scale, totalHeightMm]);

  if (!showRuler) return null;

  const topMarginPx = margins.top * CSS_PIXELS_PER_MM;
  const bottomMarginPx = (totalHeightMm - margins.bottom) * CSS_PIXELS_PER_MM;

  return (
    <div
      ref={rulerRef}
      data-vgt-workspace-chrome="ruler"
      className="relative bg-slate-900 border-r border-white/10 select-none shrink-0"
      style={{
        width: '20px',
        height: `${geometry.heightPx * scale}px`,
      }}
    >
      <div
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `scale(${scale})`,
          width: '20px',
          height: `${geometry.heightPx}px`,
        }}
      >
        {/* Margin Shading: Top Header Area */}
        <div
          data-vgt-workspace-chrome-layer="true"
          className="absolute inset-x-0 top-0 bg-slate-950/60 pointer-events-none"
          style={{ height: `${topMarginPx}px` }}
        />

        {/* Margin Shading: Bottom Footer Area */}
        <div
          data-vgt-workspace-chrome-layer="true"
          className="absolute inset-x-0 bottom-0 bg-slate-950/60 pointer-events-none"
          style={{ height: `${margins.bottom * CSS_PIXELS_PER_MM}px` }}
        />

        {/* Tick Marks */}
        {renderTicks()}

        {/* Top Margin Drag Handle */}
        <div
          role="slider"
          aria-label="Oberer Seitenrand"
          aria-valuenow={Math.round(margins.top)}
          tabIndex={0}
          onMouseDown={(e) => {
            e.stopPropagation();
            setActiveDrag({ type: 'topMargin', startY: e.clientY, initialValue: margins.top });
          }}
          className="absolute right-0 w-3 h-2 bg-blue-500 hover:bg-blue-400 border border-blue-300 rounded-l-sm cursor-ns-resize z-20 transition-colors shadow-sm -mt-1"
          style={{ top: `${topMarginPx}px` }}
          title={`Oberer Rand: ${Math.round(margins.top)} mm`}
        />

        {/* Bottom Margin Drag Handle */}
        <div
          role="slider"
          aria-label="Unterer Seitenrand"
          aria-valuenow={Math.round(margins.bottom)}
          tabIndex={0}
          onMouseDown={(e) => {
            e.stopPropagation();
            setActiveDrag({ type: 'bottomMargin', startY: e.clientY, initialValue: margins.bottom });
          }}
          className="absolute right-0 w-3 h-2 bg-blue-500 hover:bg-blue-400 border border-blue-300 rounded-l-sm cursor-ns-resize z-20 transition-colors shadow-sm -mt-1"
          style={{ top: `${bottomMarginPx}px` }}
          title={`Unterer Rand: ${Math.round(margins.bottom)} mm`}
        />
      </div>
    </div>
  );
};
