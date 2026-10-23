// STATUS: PLATIN — Integration & Release, **Paket 14**: die dünne Ansicht der Draw-Ablagezone
//
// ## Die Ansicht entscheidet **nichts**
//
// Sie **liest** den Zustand (Paket 14, rein) und schreibt ihn hin: Urteil, Grund, Vorschau, Absichten, Zeichen,
// Form, Wörter. *Kein `if` über Fachlichkeit, keine eigene Regel* — wer hier eine Entscheidung einbaut, hat zwei
// Wahrheiten über dieselbe Frage.
//
// ## Warum das hier **kein** Canvas ist — der Kern von Paket 14
//
// Die annehmende Fläche von Draw ist eine **Leinwand** — genauer: eine **SVG-Anwendung**
// (`DrawInteractiveSurface`, `role="application"`, `touch-none`). Der UI/UX-Standard verbietet wesentliche
// Funktion, die **nur** dort lebt (§8.6, §21.3, §32). Eine Ablagezone, die **nur als Pixel** existiert — als
// Rechteck im SVG, als Farbe im Canvas — ist für einen Screenreader **nicht vorhanden**, und sie wäre auch mit
// der Tastatur **nicht** erreichbar. *Das ist ein Befund, kein Detail.* Deshalb ist diese Zone **echtes DOM**:
//
//   * Die **Ansageregion** (`role="status"`, `aria-live="assertive"`, `aria-atomic="true"`, stabile `id`) steht
//     **immer** im DOM — auch im leeren Zustand. *Eine Ansage, die erst mit ihrem Text entsteht, wird nicht
//     vorgelesen; sie ist eine **Änderung** in einer **vorhandenen** Region.*
//   * Die Zone liegt **außerhalb** der Zeichenfläche (Geschwister des SVG, nicht Kind) und ist damit ohne den
//     Canvas erreichbar; die Fläche verweist über `aria-describedby` auf genau diese Region.
//   * Jede Handlung ist ein echtes `<button type="button">` — mit Tab erreichbar, mit Enter/Leertaste auslösbar —
//     und trägt ihre Taste zusätzlich als Text und in `aria-keyshortcuts`. *Eine Ablagezone, die man nur mit dem
//     Zeiger bestätigen kann, wäre auf einer Leinwand unerreichbar.*
//   * Die Zone **schluckt keine Geste**: die Schicht ist `pointer-events: none`, nur ihre Knöpfe sind bedienbar.
//     *Eine Anzeige, die die Ablage abfängt, nimmt genau die Ablage weg, die sie ankündigt* — und auf einer
//     Zeichenfläche nähme sie zusätzlich das Zeichnen weg.
//
// ## Zustände ohne Farbe
//
// Die Zone ist eine **Form** (`data-vgt-draw-drop-zone-pattern`: `dashed` / `solid` / `double`), jedes
// Zustandszeichen ist **Text** (`data-vgt-draw-drop-zone-glyph`) und jeder Zustand hat **Wörter**
// (`headline`, Urteil, Grund). Ein Farbton ist nirgends die einzige Aussage.
//
// ## Die Touch-Strategie ist **entschieden** und wird nur **angezeigt**
//
// `touchAction` kommt aus `drawDropZoneTouch.ts` (`manipulation`, **nie** `none`): Verschieben und Pinch-Zoom
// bleiben der Fläche, und die Zeichengeste bleibt beim Canvas (dessen SVG behält sein eigenes `touch-none`). Die
// Hinweiszeile nennt Langdruck, Toleranz und die Zeigerfreiheit und **liest** die Zahlen aus Paket 6 — sie
// erfindet keine zweite Zahl.
import React from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDropIntent } from '../../../shared/workspace-interaction';
import type { DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import './drawDropZone.css';
import {
  DRAW_DROP_INTENT_LABEL,
  DRAW_DROP_ZONE_ANNOUNCER_ID,
  DRAW_DROP_ZONE_CONFIRM_LABEL,
  DRAW_DROP_ZONE_DISMISS_LABEL,
  DRAW_DROP_ZONE_IDLE_ANNOUNCEMENT,
  DRAW_DROP_ZONE_KEY_HINT,
  DRAW_DROP_ZONE_SURFACE_LABEL,
  DRAW_DROP_ZONE_TITLE,
  drawDropPreviewLabel,
  drawDropRefusalText,
} from './drawDropZoneContract';
import type { DrawDropZoneState } from './drawDropZoneContract';
import {
  drawDropZoneCanConfirm,
  drawDropZoneChoices,
  drawDropZonePresentation,
  drawDropZoneRefusalCode,
  drawDropZoneView,
  isDrawDropZoneVisible,
} from './drawDropZone';
import { DRAW_DROP_ZONE_TOUCH_ACTION, drawDropZoneInputHint } from './drawDropZoneTouch';

export interface DrawDropZoneOverlayProps {
  state: DrawDropZoneState;
  /** Die Eingabeart, die gerade bedient — **gelesen** aus Paket 6, nicht geraten. */
  inputKind?: DragInputKind;
  /** Die Tastatur-Absicht „bestätigen" — **dieselbe** Auflösung wie die Ablage. */
  onConfirm: () => void;
  /** Die Tastatur-Absicht „diese Absicht" — **dieselbe** Auflösung wie die Ablage. */
  onChooseIntent: (intent: WorkspaceDropIntent) => void;
  onDismiss: () => void;
  /** Die Tastatur der Zone selbst — sie braucht den Canvas **nicht**. */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export const DrawDropZoneOverlay: React.FC<DrawDropZoneOverlayProps> = ({
  state,
  inputKind = 'mouse',
  onConfirm,
  onChooseIntent,
  onDismiss,
  onKeyDown,
}) => {
  const view = drawDropZoneView(state);
  const presentation = drawDropZonePresentation(state);
  const previewLabel = drawDropPreviewLabel(state);
  const refusalCode = drawDropZoneRefusalCode(state);
  const choices = drawDropZoneChoices(state);
  const visible = isDrawDropZoneVisible(state);
  const canConfirm = drawDropZoneCanConfirm(state);
  const route = state.decision.kind === 'routed' ? state.decision.route : null;

  return (
    <div
      className="draw-drop-zone-layer"
      // Die Touch-Strategie ist **entschieden** (`drawDropZoneTouch.ts`): `manipulation`, **nie** `none` — sonst
      // stritten Verschieben, Pinch-Zoom und Zeichnen mit der Zone um dieselbe Geste auf der Leinwand.
      style={{ touchAction: DRAW_DROP_ZONE_TOUCH_ACTION }}
      data-vgt-draw-drop-zone-layer={view}
    >
      {/*
        Die Ansageregion steht **immer** — auch ohne Zone. Nur so ist die Ansage eine **Änderung** in einer
        vorhandenen Region statt einer Region, die mit ihrem Text geboren wird (und deshalb stumm bleibt).
        `DrawCanvas` verweist mit `aria-describedby` auf genau diese `id`.
      */}
      <p
        id={DRAW_DROP_ZONE_ANNOUNCER_ID}
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        data-vgt-draw-drop-zone-announcer={view}
        className="sr-only"
      >
        {visible
          ? `${presentation.headline}. ${previewLabel ?? ''}${refusalCode === null ? '' : ` ${refusalCode}: ${drawDropRefusalText(refusalCode)}`}`.trim()
          : DRAW_DROP_ZONE_IDLE_ANNOUNCEMENT}
      </p>

      {visible && (
        <section
          aria-label={DRAW_DROP_ZONE_TITLE}
          data-vgt-draw-drop-zone={view}
          data-vgt-draw-drop-zone-glyph={presentation.glyph}
          data-vgt-draw-drop-zone-pattern={presentation.pattern}
          data-vgt-draw-drop-zone-verdict={state.target.verdict}
          data-vgt-draw-drop-zone-reason={refusalCode ?? ''}
          data-vgt-draw-drop-zone-transfer={state.transfer.ok ? 'read' : state.transfer.reason}
          data-vgt-draw-drop-zone-pointer-free={inputKind === 'keyboard' ? 'true' : 'false'}
          // **Die Tatsache, die das Paket ausmacht:** das Ziel ist eine DOM-Schicht **außerhalb** der Leinwand —
          // kein gemaltes Rechteck im SVG. Ein Test kann das prüfen, ein Screenreader es benutzen.
          data-vgt-draw-drop-zone-canvas="dom-overlay"
          onKeyDown={onKeyDown}
          className="draw-drop-zone"
        >
          <p className="draw-drop-zone__headline">
            <span aria-hidden="true" className="draw-drop-zone__glyph">{presentation.glyph}</span>
            <span className="draw-drop-zone__title">{presentation.headline}</span>
          </p>

          {/* Die Fläche als **Wort** — die Zeichenfläche, nicht ein Ort im Pixel. */}
          <p className="draw-drop-zone__surface" data-vgt-draw-drop-zone-surface="canvas">
            {`Surface: ${DRAW_DROP_ZONE_SURFACE_LABEL}`}
          </p>

          {/* Das Urteil (Paket 6) als **Wort** — `accept` / `reject` / `none`, nicht als Farbton. */}
          <p className="draw-drop-zone__verdict" data-vgt-draw-drop-zone-verdict-text={state.target.verdict}>
            {`Verdict: ${state.target.verdict}`}
          </p>

          {previewLabel !== null && (
            <p
              className="draw-drop-zone__preview"
              data-vgt-draw-drop-zone-preview={state.target.preview?.objectKind ?? ''}
            >
              {`Preview: ${previewLabel}`}
            </p>
          )}

          {refusalCode !== null && (
            <p className="draw-drop-zone__reason" data-vgt-draw-drop-zone-reason-text={refusalCode}>
              {`Reason: ${refusalCode} · ${drawDropRefusalText(refusalCode)}`}
            </p>
          )}

          {route !== null && (
            <p
              className="draw-drop-zone__route"
              data-vgt-draw-drop-zone-route={route.adapterId}
              data-vgt-draw-drop-zone-route-intent={route.intent}
              // **Paket 15:** die Zustellung nennt die **Art** (Kopie / Live-Verweis) und — **nur** bei Live — den
              // **gesagten** Modus. *Ein Modus, den der Nutzer nicht sieht, wäre genau der heimliche Default.*
              data-vgt-draw-drop-zone-route-kind={route.integrationKind}
              data-vgt-draw-drop-zone-route-mode={route.mode ?? ''}
            >
              {`Route resolved via ${route.adapterId} · ${DRAW_DROP_INTENT_LABEL[route.intent]} · ${route.integrationKind}${route.mode === undefined ? '' : ` (${route.mode})`} · source v${route.sourceVersion} → target v${route.targetVersion}`}
            </p>
          )}

          {choices.length > 0 && (
            <ul className="draw-drop-zone__choices">
              {choices.map((choice) => (
                <li key={choice.intent}>
                  <button
                    type="button"
                    data-vgt-draw-drop-zone-choice={choice.intent}
                    aria-keyshortcuts={choice.shortcutLabel}
                    onClick={() => onChooseIntent(choice.intent)}
                    className="draw-drop-zone__button"
                  >
                    <span className="draw-drop-zone__key">{choice.key}</span>
                    {choice.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="draw-drop-zone__actions">
            <button
              type="button"
              data-vgt-draw-drop-zone-confirm
              aria-keyshortcuts="Enter"
              onClick={onConfirm}
              aria-disabled={!canConfirm}
              className="draw-drop-zone__button"
            >
              {DRAW_DROP_ZONE_CONFIRM_LABEL}
            </button>
            <button
              type="button"
              data-vgt-draw-drop-zone-dismiss
              aria-keyshortcuts="Escape"
              onClick={onDismiss}
              className="draw-drop-zone__button"
            >
              {DRAW_DROP_ZONE_DISMISS_LABEL}
            </button>
          </div>

          <p className="draw-drop-zone__keys" data-vgt-draw-drop-zone-keys="true">{DRAW_DROP_ZONE_KEY_HINT}</p>
          <p className="draw-drop-zone__input" data-vgt-draw-drop-zone-input={inputKind}>
            {drawDropZoneInputHint(inputKind)}
          </p>
        </section>
      )}
    </div>
  );
};

export default DrawDropZoneOverlay;
