import React from 'react';
import {
  PresentDiagramSceneObject,
  PresentCodeSceneObject,
  PresentWidgetSceneObject,
} from '../../../../shared/contracts/workspace';
import { ArrowRight, Star } from 'lucide-react';

interface DiagramRendererProps {
  diagram: PresentDiagramSceneObject;
  onUpdateItem?: (idx: number, title: string, subtitle?: string) => void;
}

export const PresentDiagramRenderer: React.FC<DiagramRendererProps> = ({ diagram, onUpdateItem }) => {
  const { diagramType, items, accentColor = '#38bdf8' } = diagram;

  if (diagramType === 'process') {
    return (
      <div className="w-full h-full flex items-center justify-between p-3 gap-2 select-none">
        {items.map((item, idx) => (
          <React.Fragment key={item.id || idx}>
            <div
              className="flex-1 h-full rounded-xl border p-2.5 flex flex-col justify-between shadow-lg bg-slate-900/90"
              style={{ borderColor: `${item.color || accentColor}60` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.625rem] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10" style={{ color: item.color || accentColor }}>
                  0{idx + 1}
                </span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color || accentColor }} />
              </div>
              <div>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => onUpdateItem?.(idx, e.target.value, item.subtitle)}
                  className="w-full bg-transparent text-xs font-bold text-slate-100 outline-none truncate"
                  placeholder="Step title"
                />
                <input
                  type="text"
                  value={item.subtitle || ''}
                  onChange={(e) => onUpdateItem?.(idx, item.title, e.target.value)}
                  className="w-full bg-transparent text-[0.625rem] text-slate-400 outline-none truncate mt-0.5"
                  placeholder="Details"
                />
              </div>
            </div>
            {idx < items.length - 1 && (
              <ArrowRight className="w-4 h-4 shrink-0 text-slate-600" />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (diagramType === 'timeline') {
    return (
      <div className="w-full h-full flex flex-col justify-center p-3 select-none">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-700 -translate-y-1/2 z-0" />
          {items.map((item, idx) => (
            <div key={item.id || idx} className="relative z-10 flex flex-col items-center group">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center border-2 bg-slate-950 shadow-lg text-[0.625rem] font-bold font-mono"
                style={{ borderColor: item.color || accentColor, color: item.color || accentColor }}
              >
                {idx + 1}
              </div>
              <div className="mt-2 text-center max-w-[110px]">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => onUpdateItem?.(idx, e.target.value, item.subtitle)}
                  className="w-full bg-transparent text-[0.6875rem] font-bold text-center text-slate-100 outline-none truncate"
                  placeholder="Milestone"
                />
                <input
                  type="text"
                  value={item.subtitle || ''}
                  onChange={(e) => onUpdateItem?.(idx, item.title, e.target.value)}
                  className="w-full bg-transparent text-[0.5625rem] text-center text-slate-400 outline-none truncate"
                  placeholder="Date / Target"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (diagramType === 'matrix') {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-2 p-2 select-none">
        {items.slice(0, 4).map((item, idx) => (
          <div
            key={item.id || idx}
            className="rounded-xl border p-2.5 flex flex-col justify-between shadow-md bg-slate-900/80"
            style={{ borderColor: `${item.color || accentColor}50` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[0.5625rem] font-bold uppercase tracking-wider text-slate-400">
                Quadrant {idx + 1}
              </span>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color || accentColor }} />
            </div>
            <div>
              <input
                type="text"
                value={item.title}
                onChange={(e) => onUpdateItem?.(idx, e.target.value, item.subtitle)}
                className="w-full bg-transparent text-xs font-bold text-slate-100 outline-none truncate"
                placeholder="Quadrant title"
              />
              <input
                type="text"
                value={item.subtitle || ''}
                onChange={(e) => onUpdateItem?.(idx, item.title, e.target.value)}
                className="w-full bg-transparent text-[0.625rem] text-slate-400 outline-none truncate"
                placeholder="Description"
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Fallback / Hierarchy
  return (
    <div className="w-full h-full flex flex-col justify-around p-2 select-none">
      <div className="flex justify-center">
        <div className="px-3 py-1.5 rounded-lg border bg-slate-900 border-blue-500/50 text-xs font-bold text-blue-300">
          {items[0]?.title || 'Root'}
        </div>
      </div>
      <div className="flex justify-around gap-2">
        {items.slice(1).map((item, idx) => (
          <div key={item.id || idx} className="px-2.5 py-1 rounded-lg border bg-slate-900/80 border-white/15 text-[0.625rem] font-medium text-slate-200">
            {item.title}
          </div>
        ))}
      </div>
    </div>
  );
};

interface CodeRendererProps {
  codeObject: PresentCodeSceneObject;
  onUpdateCode?: (code: string) => void;
}

export const PresentCodeRenderer: React.FC<CodeRendererProps> = ({ codeObject, onUpdateCode }) => {
  const { code, language, lineNumbers = true } = codeObject;
  const lines = code.split('\n');

  return (
    <div className="w-full h-full rounded-xl border border-white/15 bg-slate-950/95 overflow-hidden flex flex-col font-mono text-xs shadow-2xl">
      {/* Code Header Bar */}
      <div className="h-6 bg-slate-900/90 border-b border-white/10 px-2.5 flex items-center justify-between select-none">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500/80" />
          <span className="w-2 h-2 rounded-full bg-amber-500/80" />
          <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
        </div>
        <span className="text-[0.5625rem] uppercase tracking-wider text-slate-400 font-semibold">{language}</span>
      </div>

      {/* Code Content */}
      <div className="flex-1 flex overflow-auto p-2">
        {lineNumbers && (
          <div className="pr-2 select-none text-slate-600 text-[0.625rem] text-right leading-relaxed font-mono">
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <textarea
          value={code}
          onChange={(e) => onUpdateCode?.(e.target.value)}
          className="flex-1 bg-transparent text-emerald-400 outline-none resize-none leading-relaxed font-mono text-[0.6875rem] select-text"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

interface WidgetVisualProps {
  widget: PresentWidgetSceneObject;
}

export const PresentGaugeVisual: React.FC<WidgetVisualProps> = ({ widget }) => {
  const progress = Math.max(0, Math.min(100, widget.progress ?? 75));
  const strokeDashoffset = 188.5 - (188.5 * progress) / 100;

  return (
    <div className="w-full h-full flex items-center justify-center p-2 relative select-none">
      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="30" stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="transparent" />
        <circle
          cx="40"
          cy="40"
          r="30"
          stroke={widget.accentColor}
          strokeWidth="6"
          strokeDasharray="188.5"
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-sm font-black text-slate-100">{widget.value}</span>
        <span className="text-[0.5rem] uppercase tracking-wider text-slate-400">{widget.label}</span>
      </div>
    </div>
  );
};

export const PresentRatingVisual: React.FC<WidgetVisualProps> = ({ widget }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center select-none">
      <span className="text-[0.625rem] uppercase font-bold tracking-widest text-slate-400 mb-1">{widget.label}</span>
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <span className="mt-1 text-xs font-bold text-slate-200">{widget.value}</span>
    </div>
  );
};
