// STATUS: PLATIN — Integration & Release, **Paket 11**: die dünne Ansicht der Whiteboard-Ablagezone
//
// ## Die Ansicht entscheidet **nichts**
//
// Sie **liest** den Zustand (Paket 11, rein) und schreibt ihn hin: Urteil, Grund, Vorschau, Absichten, Zeichen,
// Form, Wörter. *Kein `if` über Fachlichkeit, keine eigene Regel* — wer hier eine Entscheidung einbaut, hat zwei
// Wahrheiten über dieselbe Frage.
//
// ## Warum das hier **kein** Canvas ist — der Kern von Paket 11
//
// Die annehmende Fläche des Whiteboards ist eine **Leinwand**, und der UI/UX-Standard verbietet wesentliche
// Funktion, die **nur** dort lebt (§8.6, §21.3, §32). Eine Ablagezone, die **nur als Pixel** existiert, ist für
// einen Screenreader nicht vorhanden — *das ist ein Befund, kein Detail*. Deshalb ist diese Zone **echtes DOM**:
//
//   * Die **Ansageregion** (`role="status"`, `aria-live="assertive"`, `aria-atomic="true"`) steht **immer** im DOM —
//     auch im leeren Zustand. *Eine Ansage, die erst mit ihrem Text entsteht, wird nicht vorgelesen; sie ist eine
//     Änderung in einer **vorhandenen** Region.*
//   * Die Zone liegt **außerhalb** der Leinwandfläche (Geschwister, nicht Kind) und ist damit ohne den Canvas
//     erreichbar.
//   * Jede Handlung ist ein echtes `<button type="button">` — mit Tab erreichbar, mit Enter/Leertaste auslösbar —
//     und trägt ihre Taste zusätzlich als Text und in `aria-keyshortcuts`. *Eine Ablagezone, die man nur mit dem
//     Zeiger bestätigen kann, wäre auf einer Leinwand unerreichbar.*
//
// ## Zustände ohne Farbe
//
// Die Zone ist eine **Form** (`data-vgt-whiteboard-drop-zone-pattern`: `dashed` / `solid` / `double`), jedes
// Zustandszeichen ist **Text** (`data-vgt-whiteboard-drop-zone-glyph`) und jeder Zustand hat **Wörter**
// (`headline`, Urteil, Grund). Ein Farbton ist nirgends die einzige Aussage.
//
// ## Die Touch-Strategie ist **entschieden** und wird nur **angezeigt**
//
// `touchAction` kommt aus `whiteboardDropZoneTouch.ts` (`manipulation`, **nie** `none`): Das Board behält
// Verschieben und Pinch-Zoom. Die Hinweiszeile nennt die Langdruck-Schwelle und die Toleranz und **liest** sie
// aus Paket 6 — sie erfindet keine zweite Zahl.
import React from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDropIntent } from '../../../shared/workspace-interaction';
import type { DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import {
  WHITEBOARD_DROP_INTENT_LABEL,
  WHITEBOARD_DROP_ZONE_CONFIRM_LABEL,
  WHITEBOARD_DROP_ZONE_DISMISS_LABEL,
  WHITEBOARD_DROP_ZONE_IDLE_ANNOUNCEMENT,
  WHITEBOARD_DROP_ZONE_KEY_HINT,
  WHITEBOARD_DROP_ZONE_TITLE,
  whiteboardDropPreviewLabel,
  whiteboardDropRefusalText,
} from './whiteboardDropZoneContract';
import type { WhiteboardDropZoneState } from './whiteboardDropZoneContract';
import {
  isWhiteboardDropZoneVisible,
  whiteboardDropZoneCanConfirm,
  whiteboardDropZoneChoices,
  whiteboardDropZonePresentation,
  whiteboardDropZoneRefusalCode,
  whiteboardDropZoneView,
} from './whiteboardDropZone';
import { WHITEBOARD_DROP_ZONE_TOUCH_ACTION, whiteboardDropZoneInputHint } from './whiteboardDropZoneTouch';

export interface WhiteboardDropZoneOverlayProps {
  state: WhiteboardDropZoneState;
  /** Die Eingabeart, die gerade bedient — **gelesen** aus Paket 6, nicht geraten. */
  inputKind?: DragInputKind;
  /** Die Tastatur-Absicht „bestätigen" — **dieselbe** Zustellung wie die Ablage. */
  onConfirm: () => void;
  /** Die Tastatur-Absicht „diese Absicht" — **dieselbe** Zustellung wie die Ablage. */
  onChooseIntent: (intent: WorkspaceDropIntent) => void;
  onDismiss: () => void;
  /** Die Tastatur der Zone selbst — sie braucht den Canvas **nicht**. */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export const WhiteboardDropZoneOverlay: React.FC<WhiteboardDropZoneOverlayProps> = ({
  state,
  inputKind = 'mouse',
  onConfirm,
  onChooseIntent,
  onDismiss,
  onKeyDown,
}) => {
  const view = whiteboardDropZoneView(state);
  const presentation = whiteboardDropZonePresentation(state);
  const previewLabel = whiteboardDropPreviewLabel(state);
  const refusalCode = whiteboardDropZoneRefusalCode(state);
  const choices = whiteboardDropZoneChoices(state);
  const visible = isWhiteboardDropZoneVisible(state);
  const canConfirm = whiteboardDropZoneCanConfirm(state);
  const delivered = state.decision.kind === 'delivered' ? state.decision.resolution : null;

  return (
    <div
      className="whiteboard-drop-zone-layer"
      // Die Touch-Strategie ist **entschieden** (`whiteboardDropZoneTouch.ts`): `manipulation`, **nie** `none` —
      // sonst stritten Verschieben, Pinch-Zoom und Zug um dieselbe Geste auf der Leinwand.
      style={{ touchAction: WHITEBOARD_DROP_ZONE_TOUCH_ACTION }}
      data-vgt-whiteboard-drop-zone-layer={view}
    >
      {/*
        Die Ansageregion steht **immer** — auch ohne Zone. Nur so ist die Ansage eine **Änderung** in einer
        vorhandenen Region statt einer Region, die mit ihrem Text geboren wird (und deshalb stumm bleibt).
      */}
      <p
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        data-vgt-whiteboard-drop-zone-announcer={view}
        className="sr-only"
      >
        {visible
          ? `${presentation.headline}. ${previewLabel ?? ''}${refusalCode === null ? '' : ` ${refusalCode}: ${whiteboardDropRefusalText(refusalCode)}`}`.trim()
          : WHITEBOARD_DROP_ZONE_IDLE_ANNOUNCEMENT}
      </p>

      {visible && (
        <section
          aria-label={WHITEBOARD_DROP_ZONE_TITLE}
          data-vgt-whiteboard-drop-zone={view}
          data-vgt-whiteboard-drop-zone-glyph={presentation.glyph}
          data-vgt-whiteboard-drop-zone-pattern={presentation.pattern}
          data-vgt-whiteboard-drop-zone-verdict={state.target.verdict}
          data-vgt-whiteboard-drop-zone-reason={refusalCode ?? ''}
          data-vgt-whiteboard-drop-zone-transfer={state.transfer.ok ? 'read' : state.transfer.reason}
          data-vgt-whiteboard-drop-zone-pointer-free={inputKind === 'keyboard' ? 'true' : 'false'}
          onKeyDown={onKeyDown}
          className="whiteboard-drop-zone"
        >
          <p className="whiteboard-drop-zone__headline">
            <span aria-hidden="true" className="whiteboard-drop-zone__glyph">{presentation.glyph}</span>
            <span className="whiteboard-drop-zone__title">{presentation.headline}</span>
          </p>

          {/* Das Urteil (Paket 6) als **Wort** — `accept` / `reject` / `none`, nicht als Farbton. */}
          <p className="whiteboard-drop-zone__verdict" data-vgt-whiteboard-drop-zone-verdict-text={state.target.verdict}>
            {`Verdict: ${state.target.verdict}`}
          </p>

          {previewLabel !== null && (
            <p
              className="whiteboard-drop-zone__preview"
              data-vgt-whiteboard-drop-zone-preview={state.target.preview?.objectKind ?? ''}
            >
              {`Preview: ${previewLabel}`}
            </p>
          )}

          {refusalCode !== null && (
            <p className="whiteboard-drop-zone__reason" data-vgt-whiteboard-drop-zone-reason-text={refusalCode}>
              {`Reason: ${refusalCode} · ${whiteboardDropRefusalText(refusalCode)}`}
            </p>
          )}

          {delivered !== null && (
            <p
              className="whiteboard-drop-zone__resolution"
              data-vgt-whiteboard-drop-zone-resolution={delivered.adapterId}
              data-vgt-whiteboard-drop-zone-resolution-intent={delivered.intent}
              // **Paket 15** ✓: die Behandlungsart und — bei `live` — der **gewählte** Modus stehen sichtbar im
              // Markup. *Ein Modus, den nur der Zustand kennt, wäre für den Nutzer ein heimlicher Default* ✗: bei
              // einer Kopie ist die **Abwesenheit** die Aussage ✓ (kein `mode`, kein Platzhalter).
              data-vgt-whiteboard-drop-zone-resolution-kind={delivered.integrationKind}
              data-vgt-whiteboard-drop-zone-resolution-mode={delivered.mode ?? ''}
            >
              {`Routed via ${delivered.adapterId} · ${WHITEBOARD_DROP_INTENT_LABEL[delivered.intent]} · ${delivered.integrationKind}${delivered.mode === undefined ? '' : ` (${delivered.mode})`} · source v${delivered.sourceVersion} → target v${delivered.targetVersion}`}
            </p>
          )}

          {choices.length > 0 && (
            <ul className="whiteboard-drop-zone__choices">
              {choices.map((choice) => (
                <li key={choice.intent}>
                  <button
                    type="button"
                    data-vgt-whiteboard-drop-zone-choice={choice.intent}
                    aria-keyshortcuts={choice.shortcutLabel}
                    onClick={() => onChooseIntent(choice.intent)}
                    className="whiteboard-drop-zone__button"
                  >
                    <span className="whiteboard-drop-zone__key">{choice.key}</span>
                    {choice.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="whiteboard-drop-zone__actions">
            <button
              type="button"
              data-vgt-whiteboard-drop-zone-confirm
              aria-keyshortcuts="Enter"
              onClick={onConfirm}
              aria-disabled={!canConfirm}
              className="whiteboard-drop-zone__button"
            >
              {WHITEBOARD_DROP_ZONE_CONFIRM_LABEL}
            </button>
            <button
              type="button"
              data-vgt-whiteboard-drop-zone-dismiss
              aria-keyshortcuts="Escape"
              onClick={onDismiss}
              className="whiteboard-drop-zone__button"
            >
              {WHITEBOARD_DROP_ZONE_DISMISS_LABEL}
            </button>
          </div>

          <p className="whiteboard-drop-zone__keys" data-vgt-whiteboard-drop-zone-keys="true">{WHITEBOARD_DROP_ZONE_KEY_HINT}</p>
          <p className="whiteboard-drop-zone__input" data-vgt-whiteboard-drop-zone-input={inputKind}>
            {whiteboardDropZoneInputHint(inputKind)}
          </p>
        </section>
      )}
    </div>
  );
};
