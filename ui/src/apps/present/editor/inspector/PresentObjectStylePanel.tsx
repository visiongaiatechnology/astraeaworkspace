// STATUS: PLATIN — Present Round 42: glass style inspector with local draft preview + throttled commits.
//
// Native Chromium fires `input` continuously while the user drags a colour picker. Committing every
// event into the document/history re-rendered the whole slide and froze the UI (user finding 1/3).
// This panel therefore keeps a LOCAL draft:
//   - every event updates the draft and the lightweight canvas preview immediately (no document),
//   - a debounce (~160 ms) / blur / unmount flushes exactly ONE document commit per change,
//   - numbers (font size, border, opacity, gradient angle) are drafted the same way.
// The style payload itself stays the additive optional `presentStyle` extension from Round 41.
import React, { useEffect, useRef, useState } from 'react';
import type { PresentSceneObject } from '../../../../shared/contracts/workspace';
import {
  readPresentObjectStyle,
  type PresentObjectStyle,
  type PresentStyleAlignment,
  type PresentStyleFontWeight,
} from '../../contracts/presentStyle';

interface Props {
  object: PresentSceneObject;
  onPatch: (id: string, patch: Partial<PresentSceneObject>) => void;
  /** Immediate, document-free preview of the draft style (null = preview cleared). */
  onPreview?: (style: PresentObjectStyle | null) => void;
}

type StyleTab = 'style' | 'background';

const COMMIT_DEBOUNCE_MS = 160;
const labelClass = 'flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.625rem] text-slate-300';
const inputClass = 'w-full rounded-md border border-white/10 bg-slate-950/80 px-1.5 py-1 text-[0.625rem] text-slate-100 outline-none focus:border-cyan-400/60';

function cleanStyle(style: PresentObjectStyle): PresentObjectStyle | undefined {
  const entries = Object.entries(style).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as PresentObjectStyle) : undefined;
}

export const PresentObjectStylePanel: React.FC<Props> = ({ object, onPatch, onPreview }) => {
  const [tab, setTab] = useState<StyleTab>('style');
  const [draft, setDraft] = useState<PresentObjectStyle>(() => readPresentObjectStyle(object));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftDirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const objectIdRef = useRef(object.id);
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Flush the draft into exactly one document commit (idempotent when nothing is pending). */
  const flush = () => {
    clearTimer();
    if (!draftDirtyRef.current) return;
    draftDirtyRef.current = false;
    onPatchRef.current(objectIdRef.current, { presentStyle: cleanStyle(draftRef.current) } as Partial<PresentSceneObject>);
    onPreviewRef.current?.(null);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // External style change (e.g. undo/redo or another selection) synchronises the draft. Selecting a
  // different object first flushes the pending draft of the previous object (no lost colour).
  useEffect(() => {
    if (objectIdRef.current !== object.id) {
      flushRef.current();
      objectIdRef.current = object.id;
    }
    if (draftDirtyRef.current) return;
    setDraft(readPresentObjectStyle(object));
  }, [object.id, (object as { presentStyle?: unknown }).presentStyle]);

  // A pending draft is committed when the panel unmounts (selection change / inspector close).
  useEffect(() => () => { flushRef.current(); }, []);

  const apply = (patch: Partial<PresentObjectStyle>) => {
    const next: PresentObjectStyle = { ...draftRef.current };
    for (const [key, value] of Object.entries(patch) as Array<[keyof PresentObjectStyle, unknown]>) {
      if (value === undefined) delete next[key];
      else (next as Record<string, unknown>)[key] = value;
    }
    draftRef.current = next;
    draftDirtyRef.current = true;
    setDraft(next);
    onPreviewRef.current?.(next);
    clearTimer();
    timerRef.current = window.setTimeout(() => flushRef.current(), COMMIT_DEBOUNCE_MS);
  };

  const commitNow = () => { flushRef.current(); };

  // The inputs read from the draft (not from the document) so typing/dragging is never blocked by
  // a document round-trip; blur commits immediately.
  const style = draft;

  const numberValue = (value: number | undefined): string => (value === undefined ? '' : String(value));
  const parseNumber = (raw: string, min: number, max: number): number | undefined => {
    if (raw.trim() === '') return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : undefined;
  };

  return (
    <div className="space-y-2 border-t border-white/10 pt-3" data-present-style-panel="true">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.625rem] font-mono uppercase text-slate-400">Style</span>
        <div className="flex gap-0.5 rounded-lg border border-white/10 bg-slate-900/70 p-0.5" role="tablist" aria-label="Object style tabs">
          {(['style', 'background'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              data-present-style-tab={value}
              onClick={() => setTab(value)}
              className={`rounded px-2 py-0.5 text-[0.625rem] ${tab === value ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {value === 'style' ? 'Style' : 'Background'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'style' ? (
        <div className="space-y-2" role="tabpanel" aria-label="Style">
          <label className={labelClass}>
            <span>Text colour</span>
            <input aria-label="Object text colour" type="color" value={style.textColor ?? '#0f172a'} onChange={(event) => apply({ textColor: event.target.value })} onBlur={commitNow} className="h-5 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Font size (pt)</span>
              <input aria-label="Style font size" type="number" min={6} max={200} value={numberValue(style.fontSizePt)} placeholder="default" onChange={(event) => apply({ fontSizePt: parseNumber(event.target.value, 6, 200) })} onBlur={commitNow} className={inputClass} />
            </label>
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Weight</span>
              <select aria-label="Style font weight" value={style.fontWeight ?? 'normal'} onChange={(event) => apply({ fontWeight: event.target.value as PresentStyleFontWeight })} onBlur={commitNow} className={inputClass}>
                <option value="normal">Normal</option>
                <option value="semibold">Semibold</option>
                <option value="bold">Bold</option>
              </select>
            </label>
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Alignment</span>
              <select aria-label="Style text alignment" value={style.textAlign ?? 'left'} onChange={(event) => apply({ textAlign: event.target.value as PresentStyleAlignment })} onBlur={commitNow} className={inputClass}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Opacity</span>
              <input aria-label="Object opacity" type="number" min={0} max={1} step={0.05} value={numberValue(style.opacity)} placeholder="default" onChange={(event) => apply({ opacity: parseNumber(event.target.value, 0, 1) })} onBlur={commitNow} className={inputClass} />
            </label>
          </div>
          <label className={labelClass}>
            <span>Border colour</span>
            <input aria-label="Border colour" type="color" value={style.border?.color ?? '#94a3b8'} onChange={(event) => apply({ border: { color: event.target.value, width: style.border?.width ?? 2, radius: style.border?.radius ?? 12 } })} onBlur={commitNow} className="h-5 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Border width (px)</span>
              <input aria-label="Border width" type="number" min={0} max={24} value={style.border?.width ?? 0} onChange={(event) => apply({ border: { color: style.border?.color ?? '#94a3b8', width: parseNumber(event.target.value, 0, 24) ?? 0, radius: style.border?.radius ?? 12 } })} onBlur={commitNow} className={inputClass} />
            </label>
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Border radius (px)</span>
              <input aria-label="Border radius" type="number" min={0} max={999} value={style.border?.radius ?? 0} onChange={(event) => apply({ border: { color: style.border?.color ?? '#94a3b8', width: style.border?.width ?? 0, radius: parseNumber(event.target.value, 0, 999) ?? 0 } })} onBlur={commitNow} className={inputClass} />
            </label>
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Shadow blur (px)</span>
              <input aria-label="Shadow blur" type="number" min={0} max={128} value={style.shadow?.blurPx ?? 0} onChange={(event) => apply({ shadow: { color: style.shadow?.color ?? 'rgba(0,0,0,0.35)', blurPx: parseNumber(event.target.value, 0, 128) ?? 0, offsetXPx: style.shadow?.offsetXPx ?? 0, offsetYPx: style.shadow?.offsetYPx ?? 8 } })} onBlur={commitNow} className={inputClass} />
            </label>
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Shadow colour</span>
              <input aria-label="Shadow colour" type="color" value={style.shadow?.color ?? '#000000'} onChange={(event) => apply({ shadow: { color: event.target.value, blurPx: style.shadow?.blurPx ?? 24, offsetXPx: style.shadow?.offsetXPx ?? 0, offsetYPx: style.shadow?.offsetYPx ?? 8 } })} onBlur={commitNow} className="h-5 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              clearTimer();
              draftDirtyRef.current = false;
              setDraft({});
              onPreviewRef.current?.(null);
              onPatch(object.id, { presentStyle: undefined } as Partial<PresentSceneObject>);
            }}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
            data-present-style-reset="true"
          >
            Reset object style
          </button>
        </div>
      ) : (
        <div className="space-y-2" role="tabpanel" aria-label="Background">
          <label className={labelClass}>
            <span>Background colour</span>
            <input aria-label="Object background colour" type="color" value={style.backgroundColor ?? '#ffffff'} onChange={(event) => apply({ backgroundColor: event.target.value })} onBlur={commitNow} className="h-5 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.625rem] text-slate-300">
            <input aria-label="Use gradient" type="checkbox" checked={Boolean(style.backgroundGradient)} onChange={(event) => apply({ backgroundGradient: event.target.checked ? { type: 'linear', from: style.backgroundGradient?.from ?? '#ffffff', to: style.backgroundGradient?.to ?? '#bfdbfe', angle: style.backgroundGradient?.angle ?? 135 } : undefined })} onBlur={commitNow} />
            Use linear gradient
          </label>
          {style.backgroundGradient && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-0.5 text-[0.625rem] text-slate-400">
                <span>Gradient from</span>
                <input aria-label="Gradient from" type="color" value={style.backgroundGradient.from} onChange={(event) => apply({ backgroundGradient: { ...style.backgroundGradient!, from: event.target.value } })} onBlur={commitNow} className="h-5 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
              </label>
              <label className="space-y-0.5 text-[0.625rem] text-slate-400">
                <span>Gradient to</span>
                <input aria-label="Gradient to" type="color" value={style.backgroundGradient.to} onChange={(event) => apply({ backgroundGradient: { ...style.backgroundGradient!, to: event.target.value } })} onBlur={commitNow} className="h-5 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
              </label>
              <label className="col-span-2 space-y-0.5 text-[0.625rem] text-slate-400">
                <span>Gradient angle (deg)</span>
                <input aria-label="Gradient angle" type="number" min={0} max={360} value={style.backgroundGradient.angle} onChange={(event) => apply({ backgroundGradient: { ...style.backgroundGradient!, angle: parseNumber(event.target.value, 0, 360) ?? 0 } })} onBlur={commitNow} className={inputClass} />
              </label>
            </div>
          )}
          <button type="button" onClick={() => { apply({ backgroundColor: undefined, backgroundGradient: undefined }); commitNow(); }} className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1 text-[0.625rem] text-slate-300 hover:bg-white/10" data-present-style-background-reset="true">
            Reset background
          </button>
        </div>
      )}
    </div>
  );
};
