// STATUS: PLATIN — Integration & Release, **Paket 10**: die sichtbare Ablagefläche in Present
//
// ## Was diese Komponente ist — und was sie **nicht** ist
//
// Sie **rendert** den Zustand, den `presentWorkspaceDropZone.ts` entschieden hat. Sie entscheidet
// **nichts**: kein Urteil, keine Erlaubnis, keine Vorschau, keine Schwelle. *Eine Ansicht, die eine
// zweite Regel über dieselbe Frage hätte, wäre eine zweite Wahrheit.*
//
// ## Die fünf Punkte des Standards (§12.3) in dieser Datei
//
//   1. **Erkennbare Zone** — vier **Eckwinkel**, eine **Rahmenart** (gestrichelt / ausgezogen / doppelt),
//      ein **Zeichen** und eine **Überschrift**. Farbe ist keiner dieser Träger.
//   2. **Vorschau** — `state.target.preview.label` wird **wörtlich** gerendert (Paket 6 hat ihn gebaut —
//      hier wird er nicht neu formuliert).
//   3. **Erlaubt / unerlaubt** — `state.verdict` und `state.reason` werden **gelesen** und als eigener
//      Satz sichtbar; die Ablehnung bekommt zusätzlich eine **Schraffur** (Form, nicht Farbton).
//   4. **Tastatur** — echte `<button>`-Elemente: bestätigen, Absicht wählen, schließen. *Ein Ziel, das
//      man nur mit dem Zeiger bestätigen kann, ist ein Befund — deshalb ist der Bestätigen-Knopf da und
//      ruft **dieselbe** Zustellung auf wie die Ablage.*
//   5. **Touch** — `touch-action` und der Langdruck kommen **entschieden** aus
//      `presentWorkspaceDropZoneTouch.ts`; die Fläche setzt die Entscheidung nur um (`manipulation`,
//      **nie** `none`) und sagt sie an.
//
// ## Prozente statt Pixel — die Geometrie bei Zoom
//
// Das Platzierungsrechteck wird in **Prozent** der Fläche gesetzt, über der diese Komponente montiert ist.
// Wird sie über der **Folie** montiert (der Aufrufer tut das), skalieren die Prozente mit dem Zoom mit:
// *dieselbe Geometrie, bei jedem Zoom an derselben Stelle der Folie.* Ein Pixelwert müsste dafür erst
// wieder durch den Zoom geteilt werden — genau die zweite Rechnung, die hier nicht entsteht.
//
// **Nicht geprüft** und ausdrücklich so benannt: das **echte** Ziehen und Ablegen (`dragover`,
// `drop`, `pointercancel` am Gerät). Dafür fehlt in dieser Umgebung ein Browser. Geprüft ist die
// **gerenderte Zusage** — Zone, Vorschau, Zustände ohne Farbe, Tastaturpfad.
import React from 'react';
import type { WorkspaceDropIntent } from '../../../../shared/workspace-interaction';
import type { PresentWorkspaceDropZoneState } from './presentWorkspaceDropZone';
import { presentWorkspaceDropChoiceKey } from './presentWorkspaceDropZone';
import { presentWorkspaceDropTouchStrategy } from './presentWorkspaceDropZoneTouch';
import {
  PRESENT_WORKSPACE_DROP_ZONE_CONFIRM_LABEL,
  PRESENT_WORKSPACE_DROP_ZONE_DISMISS_LABEL,
  PRESENT_WORKSPACE_DROP_ZONE_KEY_HINT,
  PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION,
  PRESENT_WORKSPACE_DROP_ZONE_PREVIEW_LABEL,
  PRESENT_WORKSPACE_DROP_ZONE_TITLE,
  PRESENT_WORKSPACE_DROP_ZONE_TOUCH_HINT,
  isPresentWorkspaceDropRefusal,
  presentWorkspaceDropIntentLabel,
  presentWorkspaceDropPreviewText,
  presentWorkspaceDropRefusalText,
  presentWorkspaceDropVerdictText,
} from './presentWorkspaceDropZoneContract';

interface Props {
  readonly state: PresentWorkspaceDropZoneState;
  /** Die Tastatur-Absicht „ablegen" — sie ruft **dieselbe** Zustellung auf wie die Zeiger-Ablage. */
  readonly onConfirm: () => void;
  /** Die Tastatur-Absicht „schließen". */
  readonly onDismiss: () => void;
  /** Die Tastatur-Absicht „Absicht wählen" — fehlt sie, bleibt der Knopf aus (kein Scheinpfad). */
  readonly onChooseIntent?: (intent: WorkspaceDropIntent) => void;
}

/** Die Rahmenart je Zustand — **eine** Abbildung, und sie ist eine Form, kein Farbton. */
const RAHMEN: Readonly<Record<string, string>> = Object.freeze({
  none: 'border-transparent',
  dashed: 'border-dashed border-cyan-300/70',
  solid: 'border-solid border-cyan-300',
  double: 'border-double border-amber-300/80',
});

/** Die vier Eckwinkel — die erkennbare Zone, unabhängig von jeder Farbe. */
const ECKEN: readonly string[] = Object.freeze([
  'left-0 top-0 border-l-4 border-t-4',
  'right-0 top-0 border-r-4 border-t-4',
  'left-0 bottom-0 border-l-4 border-b-4',
  'right-0 bottom-0 border-r-4 border-b-4',
]);

export const PresentWorkspaceDropZoneOverlay: React.FC<Props> = ({ state, onConfirm, onDismiss, onChooseIntent }) => {
  // `closed` rendert **nichts** — die Fläche ist dann keine Fläche.
  if (state.phase === 'closed') return null;

  const presentation = PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION[state.phase];
  const strategy = presentWorkspaceDropTouchStrategy(state.input);
  const preview = state.target.preview;
  const assessment = state.assessment;
  const abgelehnt = state.phase === 'refused';

  return (
    <div
      data-present-drop-zone="true"
      data-present-drop-phase={state.phase}
      data-present-drop-verdict={state.verdict}
      data-present-drop-pattern={presentation.pattern}
      data-present-drop-touch-action={strategy.touchAction}
      data-present-drop-touch-longpress={strategy.longPress.required ? 'true' : 'false'}
      data-present-drop-reason={state.reason ?? undefined}
      role="region"
      aria-label={PRESENT_WORKSPACE_DROP_ZONE_TITLE}
      className="pointer-events-none absolute inset-0 z-40"
    >
      {/* Die Platzierung liegt **über der Fläche**, nicht im Panel: Prozente der Folie, nicht des Panels. */}
      {state.placement && (
        <div
          data-present-drop-placement="true"
          aria-hidden="true"
          className={`pointer-events-none absolute border-2 ${abgelehnt ? 'border-dashed border-amber-300/70' : 'border-solid border-cyan-200/70'}`}
          style={{
            left: `${state.placement.xPercent}%`,
            top: `${state.placement.yPercent}%`,
            width: `${state.placement.widthPercent}%`,
            height: `${state.placement.heightPercent}%`,
          }}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div
          data-present-drop-panel="true"
          style={{
            touchAction: strategy.touchAction,
            // Die Schraffur ist die **Form** der Ablehnung — sichtbar ohne jeden Farbton.
            backgroundImage: abgelehnt
              ? 'repeating-linear-gradient(45deg, rgba(148,163,184,0.22) 0 6px, transparent 6px 14px)'
              : undefined,
          }}
          className={`pointer-events-auto relative w-full max-w-md border-2 bg-slate-950/85 px-5 py-4 text-slate-100 shadow-lg ${RAHMEN[presentation.pattern] ?? RAHMEN.dashed}`}
        >
          {ECKEN.map((ecke) => (
            <span key={ecke} aria-hidden="true" className={`absolute h-3 w-3 border-cyan-200/80 ${ecke}`} />
          ))}

          <div className="flex items-start gap-2">
            <span aria-hidden="true" data-present-drop-glyph="true" className="font-mono text-base leading-5 text-cyan-200">{presentation.glyph}</span>
            <h3 data-present-drop-headline="true" className="text-xs font-bold tracking-wide break-words">{presentation.headline}</h3>
          </div>

          {/* Die Ansage: Urteil, Vorschau und Grund stehen als **Text** da — nicht als Farbfläche. */}
          <div role="status" aria-live="polite" data-present-drop-announcement="true" className="mt-3 space-y-1.5 text-[0.6875rem] leading-relaxed">
            <p data-present-drop-verdict-text="true" className="font-semibold">{presentWorkspaceDropVerdictText(state.verdict)}</p>
            <p>
              <span className="text-slate-400">{PRESENT_WORKSPACE_DROP_ZONE_PREVIEW_LABEL} </span>
              <span data-present-drop-preview="true" className="font-mono">{presentWorkspaceDropPreviewText(preview)}</span>
            </p>
            {state.reason && (
              <p data-present-drop-refusal="true" className="text-amber-200">
                {isPresentWorkspaceDropRefusal(state.reason) ? presentWorkspaceDropRefusalText(state.reason) : state.reason}
              </p>
            )}
            {assessment?.status === 'resolved' && (
              <p data-present-drop-resolution="true" className="font-mono text-slate-400">
                {assessment.selection.adapterId} · {assessment.selection.intent} · {assessment.selection.targetDocumentId}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-present-drop-confirm="true"
              onClick={onConfirm}
              disabled={!state.canConfirmWithKeyboard}
              className="rounded border border-cyan-400/50 bg-cyan-500/10 px-3 py-1.5 text-[0.6875rem] font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {PRESENT_WORKSPACE_DROP_ZONE_CONFIRM_LABEL}
            </button>
            {onChooseIntent && state.compatibleIntents.map((intent, index) => (
              <button
                key={intent}
                type="button"
                data-present-drop-intent={intent}
                onClick={() => onChooseIntent(intent)}
                className="rounded border border-white/20 px-3 py-1.5 text-[0.6875rem] text-slate-200 hover:bg-white/10"
              >
                {presentWorkspaceDropIntentLabel(intent, presentWorkspaceDropChoiceKey(index))}
              </button>
            ))}
            <button
              type="button"
              data-present-drop-dismiss="true"
              onClick={onDismiss}
              className="rounded border border-white/20 px-3 py-1.5 text-[0.6875rem] text-slate-300 hover:bg-white/10"
            >
              {PRESENT_WORKSPACE_DROP_ZONE_DISMISS_LABEL}
            </button>
          </div>

          <p data-present-drop-touch-hint="true" className="mt-2 text-[0.625rem] text-slate-500">
            {strategy.longPress.required
              ? `${PRESENT_WORKSPACE_DROP_ZONE_TOUCH_HINT} · Langdruck ${strategy.longPress.ms} ms`
              : PRESENT_WORKSPACE_DROP_ZONE_TOUCH_HINT}
          </p>
          <p className="mt-1 text-[0.625rem] text-slate-500">{PRESENT_WORKSPACE_DROP_ZONE_KEY_HINT}</p>
        </div>
      </div>
    </div>
  );
};
