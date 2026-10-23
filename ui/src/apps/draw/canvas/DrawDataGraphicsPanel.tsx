// STATUS: DIAMANT VGT SUPREME — Paket 14: Statusdaten als Farbe, Icon und Label (AST-1301…AST-1304).
//
// ## Die Form ist **gemessen**, nicht erfunden
//
// Die Writer-Zone hat den sichtbaren Live/Frozen-Wähler gebaut, Notes war die Form-Referenz: **ein
// Wort-Register und zwei echte Knöpfe** — *kein Modus ohne Klick, kein heimlicher Default* ✗. Genau diese
// Form steht hier: der Zustand ist ein **Wort** (`live`/`frozen`/`broken`), und **zwei echte Knöpfe**
// setzen ihn. Es gibt **keinen** Schalter, der den Modus beim Rendern „schon irgendwie" annimmt.
//
// ## Keine zweite Regel
//
// Das Panel **entscheidet nichts**: die Werte liest `drawDataFieldsFrom`, die Bindung schreibt
// `bindDrawDataGraphic`, den Modus setzt `setDrawDataBindingMode` (alle `drawDataGraphicsEngine`, die
// ihrerseits die vorhandenen Engines benutzt). Hier stehen nur Beschriftungen, Auswahlfelder und Knöpfe —
// alles fokussierbar, alles mit Namen.
import React from 'react';
import type { DrawDataGraphicRule, DrawDocumentModel } from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { drawInteractionText } from '../drawInteractionLocale';
import {
  DRAW_DATA_OPERATORS, DRAW_DATA_TARGETS, drawDataBindingFor, drawDataFieldsFrom, drawDataSourceKind,
} from '../interactions/drawDataGraphicsEngine';

export interface DrawDataGraphicsPanelProps {
  readonly model: DrawDocumentModel;
  readonly locale: WorkspaceLocale;
  readonly selectedIds: readonly string[];
  readonly workspaceDocuments: readonly WorkspaceDocument[];
  /** Bindet die Auswahl an Quelle + Feld mit einer Regel (Farbe) und wendet sie sofort an. */
  readonly onBind: (input: { readonly sourceDocumentId: string; readonly sourceObjectId: string; readonly field: string }) => void;
  /** Modus **durch Klick**: `live` oder `frozen`. */
  readonly onSetMode: (mode: 'live' | 'frozen') => void;
  readonly onApply: () => void;
  readonly onBreak: () => void;
  readonly onRemove: () => void;
  readonly onRelink: () => void;
}

const FIELD = 'rounded border border-white/15 bg-slate-950 px-1.5 py-0.5 text-[0.6875rem] text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300';
const BUTTON = 'rounded border border-white/15 px-1.5 py-0.5 text-[0.625rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40';

/** Eine Regel je Auswahl: die Farbe ist der häufigste Fall, die übrigen Ziele kommen aus dem Vertrag. */
export function drawDataRuleFor(field: string, target: DrawDataGraphicRule['target'] = 'fill', value = '#ef4444'): DrawDataGraphicRule {
  return { id: 'rule-1', sourceField: field, operator: 'eq', compareValue: 'red', target, value, allowGeometryMutation: false };
}

export const DrawDataGraphicsPanel: React.FC<DrawDataGraphicsPanelProps> = ({
  model, locale, selectedIds, workspaceDocuments, onBind, onSetMode, onApply, onBreak, onRemove, onRelink,
}) => {
  const t = (message: Parameters<typeof drawInteractionText>[0]) => drawInteractionText(message, locale);
  const subjectId = selectedIds.length === 1 ? selectedIds[0]! : null;
  const subject = subjectId ? model.objects[subjectId] : undefined;
  const binding = subjectId ? drawDataBindingFor(model, subjectId) : null;

  // Quellen: nur die zwei Arten, die `bindWorkspaceDataGraphic` führt — **nicht** geraten.
  const sources = workspaceDocuments.filter((document) => {
    try { drawDataSourceKind(document); return true; } catch { return false; }
  });
  const firstSource = sources[0];
  const sourceObjects = firstSource ? Object.keys(firstSource.objects).slice(0, 64) : [];
  const readable = (() => {
    if (!firstSource || sourceObjects.length === 0) return null;
    try { return drawDataFieldsFrom(firstSource, sourceObjects[0]!); } catch { return null; }
  })();

  return (
    <section
      data-vgt-panel="data-graphics"
      data-vgt-data-sources={sources.length}
      data-vgt-data-binding={binding ? binding.mode : 'none'}
      className="flex w-72 flex-col gap-2 overflow-auto border-l border-white/10 bg-slate-900/60 p-3"
      aria-label={t('dataGraphics')}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t('dataGraphics')}</h2>

      {sources.length === 0 ? (
        <p data-vgt-data-empty="no-sources" role="status" className="text-[0.6875rem] text-amber-200">{t('dataNoSources')}</p>
      ) : null}

      {!subject || subject.type !== 'shape' ? (
        <p data-vgt-data-empty="no-subject" className="text-[0.6875rem] text-slate-400">{t('dataEmpty')}</p>
      ) : (
        <>
          {binding ? (
            <div className="flex flex-col gap-1" data-vgt-data-mode={binding.mode}>
              {/* Das **Wort-Register**: der Zustand ist ein Wort, nicht eine Farbe. */}
              <p className="text-[0.6875rem] text-slate-200">
                {`${t('sendStatus')}: `}
                <strong data-vgt-data-mode-word={binding.mode}>{binding.mode}</strong>
              </p>
              <div className="flex flex-wrap gap-1">
                {/* **Zwei echte Knöpfe** — der Modus entsteht nur durch einen Klick. */}
                <button
                  type="button" data-vgt-command="data-live" className={BUTTON}
                  aria-pressed={binding.mode === 'live'} disabled={binding.mode === 'live'}
                  onClick={() => onSetMode('live')}
                >{t('dataLive')}</button>
                <button
                  type="button" data-vgt-command="data-frozen" className={BUTTON}
                  aria-pressed={binding.mode === 'frozen'} disabled={binding.mode === 'frozen'}
                  onClick={() => onSetMode('frozen')}
                >{t('dataFrozen')}</button>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" data-vgt-command="data-apply" className={BUTTON} onClick={onApply}>{t('dataApply')}</button>
                <button type="button" data-vgt-command="data-break" className={BUTTON} disabled={binding.mode === 'broken'} onClick={onBreak}>{t('dataBreak')}</button>
                <button type="button" data-vgt-command="data-relink" className={BUTTON} onClick={onRelink}>{t('dataBind')}</button>
                <button type="button" data-vgt-command="data-remove" className={BUTTON} onClick={onRemove}>{t('dataRemove')}</button>
              </div>
              <p className="text-[0.625rem] text-slate-400">{`${binding.sourceKind} · ${binding.sourceUri}`}</p>
            </div>
          ) : (
            <form
              className="flex flex-col gap-1 text-[0.625rem] text-slate-300"
              data-vgt-data-form="true"
              onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const sourceDocumentId = String(data.get('sourceDocumentId') ?? '');
                const sourceObjectId = String(data.get('sourceObjectId') ?? '');
                const field = String(data.get('field') ?? '');
                if (sourceDocumentId && sourceObjectId && field) onBind({ sourceDocumentId, sourceObjectId, field });
              }}
            >
              <label className="flex flex-col gap-1">
                {t('dataSourceDoc')}
                <select name="sourceDocumentId" className={FIELD} defaultValue={firstSource?.id ?? ''} data-vgt-data-source-doc="true">
                  {sources.map((document) => <option key={document.id} value={document.id}>{document.title || document.id}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                {t('dataSourceObject')}
                <select name="sourceObjectId" className={FIELD} defaultValue={sourceObjects[0] ?? ''} data-vgt-data-source-object="true">
                  {sourceObjects.map((objectId) => <option key={objectId} value={objectId}>{objectId}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                {t('dataField')}
                <select name="field" className={FIELD} defaultValue={readable?.fields[0] ?? ''} data-vgt-data-field="true">
                  {(readable?.fields ?? []).map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </label>
              {/* Die Vokabeln der Engine sind die Auswahl: `target` und `operator` werden **nicht** neu benannt. */}
              <p className="text-[0.625rem] text-slate-400" data-vgt-data-targets={DRAW_DATA_TARGETS.length}>
                {`${DRAW_DATA_TARGETS.join(' · ')} — ${DRAW_DATA_OPERATORS.join(' · ')}`}
              </p>
              <button type="submit" data-vgt-command="data-bind" className={BUTTON} disabled={!readable?.fields.length}>
                {t('dataBind')}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
};

export default DrawDataGraphicsPanel;
