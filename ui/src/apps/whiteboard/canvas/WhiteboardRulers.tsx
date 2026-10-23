// STATUS: DIAMANT VGT SUPREME
import React, { useMemo } from 'react';
import type { WhiteboardGuide } from '../../../shared/contracts/workspace';
import type { BoundingBox } from '../rendering/whiteboardSpatialIndexEngine';
import { rulerStepForZoom } from '../viewport/whiteboardViewportEngine';

interface WhiteboardRulersProps {
  pan: { x: number; y: number };
  zoom: number;
  viewportBounds: BoundingBox;
  guides: WhiteboardGuide[];
  onRemoveGuide: (id: string) => void;
}

const ticksFor = (min: number, max: number, step: number) => {
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start, count = 0; value <= max && count < 256; value += step, count += 1) ticks.push(value);
  return ticks;
};

export const WhiteboardRulers: React.FC<WhiteboardRulersProps> = ({ pan, zoom, viewportBounds, guides, onRemoveGuide }) => {
  const step = rulerStepForZoom(zoom);
  const xTicks = useMemo(() => ticksFor(viewportBounds.minX, viewportBounds.maxX, step), [step, viewportBounds.maxX, viewportBounds.minX]);
  const yTicks = useMemo(() => ticksFor(viewportBounds.minY, viewportBounds.maxY, step), [step, viewportBounds.maxY, viewportBounds.minY]);
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
      <div className="absolute left-6 right-0 top-0 h-6 border-b border-white/10 bg-slate-950/80 backdrop-blur-sm">
        {xTicks.map((value) => <div key={value} className="absolute top-0 h-6 border-l border-white/15" style={{ left: pan.x + value * zoom }}><span className="ml-1 text-[0.5rem] font-mono text-slate-500">{Math.round(value)}</span></div>)}
      </div>
      <div className="absolute bottom-0 left-0 top-6 w-6 border-r border-white/10 bg-slate-950/80 backdrop-blur-sm">
        {yTicks.map((value) => <div key={value} className="absolute left-0 w-6 border-t border-white/15" style={{ top: pan.y + value * zoom }}><span className="ml-0.5 text-[0.5rem] font-mono text-slate-500 [writing-mode:vertical-rl]">{Math.round(value)}</span></div>)}
      </div>
      {guides.map((guide) => guide.axis === 'x' ? (
        <button aria-label="Remove vertical guide" key={guide.id} type="button" tabIndex={-1} title="Remove vertical guide" onClick={() => onRemoveGuide(guide.id)} className="pointer-events-auto absolute bottom-0 top-6 w-px bg-cyan-400/60 hover:bg-rose-400" style={{ left: pan.x + guide.position * zoom }} />
      ) : (
        <button aria-label="Remove horizontal guide" key={guide.id} type="button" tabIndex={-1} title="Remove horizontal guide" onClick={() => onRemoveGuide(guide.id)} className="pointer-events-auto absolute left-6 right-0 h-px bg-cyan-400/60 hover:bg-rose-400" style={{ top: pan.y + guide.position * zoom }} />
      ))}
      <div className="absolute left-0 top-0 h-6 w-6 border-b border-r border-white/10 bg-slate-950" />
    </div>
  );
};
