// STATUS: DIAMANT VGT SUPREME — Draw shape library with search, categories and a keyboard insert path.
//
// Search matches through the canonical `searchStencils` rule (see `searchDrawShapes`), so the library
// never grows a second matching implementation. Results are bounded; every entry is a real button, so
// the whole library is reachable without a pointer, and dragging reuses the placement engine's payload.
import React, { useMemo, useState } from 'react';
import type { DrawDocumentModel } from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { drawInteractionText } from '../drawInteractionLocale';
import { listDrawShapeCategories, searchDrawShapes } from '../interactions/drawStencilCatalog';
import { DRAW_STENCIL_MIME } from '../interactions/drawPlacementEngine';

/** Upper bound on rendered results so a large document library stays responsive. */
export const DRAW_SHAPE_RESULT_LIMIT = 200;

export interface DrawShapeLibraryPanelProps {
  readonly model: DrawDocumentModel;
  readonly locale: WorkspaceLocale;
  /** Keyboard/click insert; the caller decides the drop position (page centre for keyboard). */
  readonly onInsert: (stencilId: string) => void;
}

export const DrawShapeLibraryPanel: React.FC<DrawShapeLibraryPanelProps> = ({ model, locale, onInsert }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const t = (message: Parameters<typeof drawInteractionText>[0]) => drawInteractionText(message, locale);

  const categories = useMemo(() => listDrawShapeCategories(), []);
  const results = useMemo(() => {
    const found = searchDrawShapes(model, query, category === '' ? undefined : category);
    return found.slice(0, DRAW_SHAPE_RESULT_LIMIT);
  }, [model, query, category]);

  return (
    <section data-vgt-panel="shape-library" className="flex min-h-0 w-64 flex-col border-r border-white/10 bg-slate-900/60" aria-label={t('shapeLibrary')}>
      <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{t('shapeLibrary')}</h2>
      <div className="flex flex-col gap-2 px-3 pb-2">
        <label className="flex flex-col gap-1 text-[0.6875rem] text-slate-300">
          {t('shapeSearch')}
          <input
            data-vgt-shape-search="true"
            type="search"
            className="rounded border border-white/15 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            aria-controls="draw-shape-results"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.6875rem] text-slate-300">
          {t('shapeCategories')}
          <select
            data-vgt-shape-category="true"
            className="rounded border border-white/15 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            value={category}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setCategory(event.target.value)}
          >
            <option value="">{t('allCategories')}</option>
            {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        <p className="text-[0.625rem] leading-snug text-slate-400">{t('dragShapeHint')}</p>
      </div>
      <ul
        id="draw-shape-results"
        data-vgt-shape-results={results.length}
        className="min-h-0 flex-1 overflow-auto px-2 pb-2"
        aria-live="polite"
      >
        {results.length === 0 ? <li className="px-1 py-2 text-[0.6875rem] text-slate-400">{t('shapeSearchEmpty')}</li> : null}
        {results.map((stencil) => (
          <li key={stencil.id} className="py-0.5">
            <button
              type="button"
              data-vgt-stencil={stencil.id}
              draggable
              onDragStart={(event: React.DragEvent<HTMLButtonElement>) => {
                event.dataTransfer.setData(DRAW_STENCIL_MIME, stencil.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onInsert(stencil.id)}
              aria-label={`${t('insertShape')}: ${stencil.name} (${stencil.category})`}
              className="flex w-full items-center justify-between gap-2 rounded border border-white/10 px-2 py-1 text-left text-[0.6875rem] text-slate-100 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              <span>{stencil.name}</span>
              <span className="text-[0.625rem] text-slate-400">{stencil.category}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default DrawShapeLibraryPanel;
