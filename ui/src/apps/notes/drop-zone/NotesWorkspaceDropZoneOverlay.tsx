// STATUS: PLATIN — Integration & Release, **Paket 12**: die dünne Ansicht der Notes-Ablagezone
//
// ## Die Ansicht entscheidet **nichts**
//
// Sie **liest** den Zustand (Paket 12, rein) und schreibt ihn hin: Fläche, Urteil, Grund, Vorschau, Absichten,
// Zeichen, Form, Worte. *Kein `if` über Fachlichkeit, keine eigene Regel* — wer hier eine Entscheidung einbaut,
// hat zwei Wahrheiten über dieselbe Frage.
//
// ## Warum die Fläche **echtes DOM** ist und keine Leinwand-Malerei
//
// Die Notes-Leinwand ist eine Leinwand; der UI/UX-Standard verbietet wesentliche Funktion, die **nur** dort lebt
// (§8.6, §21.3, §32). Ein Ablageziel, das **nur als Pixel** existiert, ist für einen Screenreader nicht vorhanden
// — *das ist ein Befund, kein Detail*. Deshalb:
//
//   * Die **Ansageregion** (`role="status"`, `aria-live="assertive"`, `aria-atomic="true"`) steht **immer** im DOM
//     — auch im leeren Zustand. *Eine Ansage, die erst mit ihrem Text entsteht, wird nicht vorgelesen; sie ist
//     eine **Änderung** in einer **vorhandenen** Region.* Je Fläche eine Region, weil je Fläche eine Zone steht —
//     die Texte nennen die Fläche, also ist keine Ansage mehrdeutig.
//   * Jede Handlung ist ein echtes `<button type="button">` — mit Tab erreichbar, mit Enter/Leertaste auslösbar —
//     und trägt ihre Taste zusätzlich als Text und in `aria-keyshortcuts`. *Eine Ablagezone, die man nur mit dem
//     Zeiger bestätigen kann, wäre ein Befund.*
//   * Die Zone ist eine **Form** (`data-vgt-notes-drop-zone-pattern`: `dashed` / `solid` / `double`), jedes
//     Zustandszeichen ist **Text** (`data-vgt-notes-drop-zone-glyph`) und jeder Zustand hat **Wörter**
//     (`headline`, Urteil, Grund). Ein Farbton ist nirgends die einzige Aussage.
//
// ## Die Touch-Strategie ist **entschieden** und wird nur **angezeigt**
//
// `touchAction` kommt aus `notesDropZoneTouch.ts` (`manipulation`, **nie** `none`) und wird von der Fläche
// (`NotesWorkspaceDropZoneSurface`) gesetzt — die Ansicht nennt die Entscheidung in Worten
// (`notesDropZoneInputHint`) und erfindet keine zweite Zahl.
import React from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDropIntent, WorkspaceLiveMode } from '../../../shared/workspace-interaction';
import type { DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import './notesDropZone.css';
import {
  NOTES_DROP_INTENT_LABEL,
  NOTES_DROP_MODE_LABEL,
  NOTES_DROP_MODE_PROMPT,
  NOTES_DROP_MODES,
  NOTES_DROP_ZONE_CONFIRM_LABEL,
  NOTES_DROP_ZONE_DISMISS_LABEL,
  NOTES_DROP_ZONE_KEY_HINT,
  NOTES_DROP_ZONE_SURFACE_LABEL,
  notesDropPreviewLabel,
  notesDropRefusalText,
  notesDropZoneAnnouncerId,
  notesDropZoneIdleAnnouncement,
  notesDropZoneTitle,
} from './notesDropZoneContract';
import type { NotesDropZoneState, NotesDropZoneSurface } from './notesDropZoneContract';
import {
  isNotesDropZoneVisible,
  notesDropZoneCanConfirm,
  notesDropZoneChoices,
  notesDropZoneNeedsMode,
  notesDropZonePresentation,
  notesDropZoneRefusalCode,
  notesDropZoneView,
} from './notesDropZone';
import { notesDropZoneInputHint } from './notesDropZoneTouch';

export interface NotesWorkspaceDropZoneOverlayProps {
  state: NotesDropZoneState;
  /** **Welche** der beiden benannten Flächen diese Ansicht zeigt — sie wird nicht geraten. */
  surface: NotesDropZoneSurface;
  /** Die Eingabeart, die gerade bedient — **gelesen** aus Paket 6, nicht geraten. */
  inputKind?: DragInputKind;
  /** Die Tastatur-Absicht „bestätigen" — **dieselbe** Zustellung wie die Ablage. */
  onConfirm: () => void;
  /** Die Tastatur-Absicht „diese Absicht" — **dieselbe** Zustellung wie die Ablage. */
  /**
   * **Paket 15:** der Modus eines Live-Verweises wird **gesagt** (nie angenommen) — er geht als zweites Argument
   * mit und erreicht den Resolver über den Kontext. *Fehlt er, nennt der Resolver `drop_live_mode_required`.*
   */
  onChooseIntent: (intent: WorkspaceDropIntent, mode?: WorkspaceLiveMode) => void;
  onDismiss: () => void;
  /** Die Tastatur der Zone selbst — sie braucht die Leinwand **nicht**. */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export const NotesWorkspaceDropZoneOverlay: React.FC<NotesWorkspaceDropZoneOverlayProps> = ({
  state,
  surface,
  inputKind = 'mouse',
  onConfirm,
  onChooseIntent,
  onDismiss,
  onKeyDown,
}) => {
  const view = notesDropZoneView(state);
  const presentation = notesDropZonePresentation(state);
  const previewLabel = notesDropPreviewLabel(state);
  const refusalCode = notesDropZoneRefusalCode(state);
  const choices = notesDropZoneChoices(state);
  const needsMode = notesDropZoneNeedsMode(state);
  const visible = isNotesDropZoneVisible(state);
  const canConfirm = notesDropZoneCanConfirm(state);
  const surfaceLabel = NOTES_DROP_ZONE_SURFACE_LABEL[surface];
  const delivered = state.decision.kind === 'delivered' ? state.decision.resolution : null;

  return (
    <>
      {/*
        Die Ansageregion steht **immer** — auch ohne Zone. Nur so ist die Ansage eine **Änderung** in einer
        vorhandenen Region statt einer Region, die mit ihrem Text geboren wird (und deshalb stumm bleibt).
      */}
      <p
        id={notesDropZoneAnnouncerId(surface)}
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        data-vgt-notes-drop-zone-announcer={view}
        data-vgt-notes-drop-zone-announcer-surface={surface}
        className="sr-only"
      >
        {visible
          ? `${surfaceLabel}: ${presentation.headline}. ${previewLabel ?? ''}${refusalCode === null ? '' : ` ${refusalCode}: ${notesDropRefusalText(refusalCode)}`}`.trim()
          : notesDropZoneIdleAnnouncement(surface)}
      </p>

      {visible && (
        <div className="notes-drop-zone-layer">
          <section
            aria-label={notesDropZoneTitle(surface)}
            data-vgt-notes-drop-zone={view}
            data-vgt-notes-drop-zone-surface={surface}
            data-vgt-notes-drop-zone-glyph={presentation.glyph}
            data-vgt-notes-drop-zone-pattern={presentation.pattern}
            data-vgt-notes-drop-zone-verdict={state.target.verdict}
            data-vgt-notes-drop-zone-reason={refusalCode ?? ''}
            data-vgt-notes-drop-zone-transfer={state.transfer.ok ? 'read' : state.transfer.reason}
            data-vgt-notes-drop-zone-pointer-free={inputKind === 'keyboard' ? 'true' : 'false'}
            onKeyDown={onKeyDown}
            className="notes-drop-zone"
          >
            <p className="notes-drop-zone__headline">
              <span aria-hidden="true" className="notes-drop-zone__glyph">{presentation.glyph}</span>
              <span className="notes-drop-zone__title">{presentation.headline}</span>
            </p>

            {/* Die Fläche als **Wort** — Leinwand oder Seitenliste, nicht als Ort im Pixel. */}
            <p className="notes-drop-zone__surface" data-vgt-notes-drop-zone-surface-text={surface}>
              {`Surface: ${surfaceLabel}`}
            </p>

            {/* Das Urteil (Paket 6) als **Wort** — `accept` / `reject` / `none`, nicht als Farbton. */}
            <p className="notes-drop-zone__verdict" data-vgt-notes-drop-zone-verdict-text={state.target.verdict}>
              {`Verdict: ${state.target.verdict}`}
            </p>

            {previewLabel !== null && (
              <p
                className="notes-drop-zone__preview"
                data-vgt-notes-drop-zone-preview={state.target.preview?.objectKind ?? ''}
              >
                {`Preview: ${previewLabel}`}
              </p>
            )}

            {refusalCode !== null && (
              <p className="notes-drop-zone__reason" data-vgt-notes-drop-zone-reason-text={refusalCode}>
                {`Reason: ${refusalCode} · ${notesDropRefusalText(refusalCode)}`}
              </p>
            )}

            {delivered !== null && (
              <p
                className="notes-drop-zone__resolution"
                data-vgt-notes-drop-zone-resolution={delivered.adapterId}
                data-vgt-notes-drop-zone-resolution-intent={delivered.intent}
                data-vgt-notes-drop-zone-resolution-kind={delivered.integrationKind}
                data-vgt-notes-drop-zone-resolution-mode={delivered.mode ?? ''}
              >
                {`Routed via ${delivered.adapterId} · ${NOTES_DROP_INTENT_LABEL[delivered.intent]} · ${delivered.integrationKind}${delivered.mode === undefined ? '' : ` (${delivered.mode})`} · source v${delivered.sourceVersion} → target v${delivered.targetVersion}`}
              </p>
            )}

            {choices.length > 0 && (
              <ul className="notes-drop-zone__choices">
                {choices.map((choice) => (
                  <li key={choice.intent}>
                    <button
                      type="button"
                      data-vgt-notes-drop-zone-choice={choice.intent}
                      aria-keyshortcuts={choice.shortcutLabel}
                      onClick={() => onChooseIntent(choice.intent)}
                      className="notes-drop-zone__button"
                    >
                      <span className="notes-drop-zone__key">{choice.key}</span>
                      {choice.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/*
              **Paket 15 — die klare Auswahl Live/Frozen, ohne heimlichen Default.**
              Die Knöpfe erscheinen, wenn die Matrix eine Live-Route **angeboten** hat (Phase `choice`) oder wenn die
              Zustellung genau das **benannt** hat (`drop_live_mode_required`) — *beide Tatsachen liest
              `notesDropZoneNeedsMode`, keine wird geraten.* Jeder Knopf sagt den Modus **mit** der Absicht, sodass
              der Resolver ihn prüft; die Wörter sind die **vorhandenen** (Live-Verweis / eingefrorene Momentaufnahme).
            */}
            {needsMode && (
              <div className="notes-drop-zone__modes" data-vgt-notes-drop-zone-mode-prompt="true">
                <p className="notes-drop-zone__mode-prompt">{NOTES_DROP_MODE_PROMPT}</p>
                <ul className="notes-drop-zone__choices">
                  {NOTES_DROP_MODES.map((mode) => (
                    <li key={mode}>
                      <button
                        type="button"
                        data-vgt-notes-drop-zone-mode={mode}
                        onClick={() => onChooseIntent('LIVE_REFERENCE', mode)}
                        className="notes-drop-zone__button"
                      >
                        {NOTES_DROP_MODE_LABEL[mode]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="notes-drop-zone__actions">
              <button
                type="button"
                data-vgt-notes-drop-zone-confirm
                aria-keyshortcuts="Enter"
                onClick={onConfirm}
                aria-disabled={!canConfirm}
                className="notes-drop-zone__button"
              >
                {NOTES_DROP_ZONE_CONFIRM_LABEL}
              </button>
              <button
                type="button"
                data-vgt-notes-drop-zone-dismiss
                aria-keyshortcuts="Escape"
                onClick={onDismiss}
                className="notes-drop-zone__button"
              >
                {NOTES_DROP_ZONE_DISMISS_LABEL}
              </button>
            </div>

            <p className="notes-drop-zone__keys" data-vgt-notes-drop-zone-keys="true">{NOTES_DROP_ZONE_KEY_HINT}</p>
            <p className="notes-drop-zone__input" data-vgt-notes-drop-zone-input={inputKind}>
              {notesDropZoneInputHint(inputKind)}
            </p>
          </section>
        </div>
      )}
    </>
  );
};
