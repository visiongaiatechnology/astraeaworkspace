// STATUS: PLATIN — Integration & Release, **Paket 9**: die dünne Ansicht des Writer-Ablageziels
//
// ## Die Ansicht entscheidet **nichts** ✓
//
// Sie **liest** den Zustand ✓ (Paket 9, rein ✓) und schreibt ihn hin ✓: Zeichen ✓, Form ✓, Wörter ✓,
// Vorschau ✓, Gründe ✓, Absichten ✓. *Kein `if` über Fachlichkeit, keine eigene Regel* ✗ — wer hier eine
// Entscheidung einbaut, hat zwei Wahrheiten über dieselbe Frage ✓.
//
// ## Zustände ohne Farbe ✓
//
// Die Fläche ist eine **Form** ✓ (`data-writer-drop-zone-frame` = `dashed` / `solid` / `double` ✓), das
// Zeichen ist **Text** ✓, der Zustand hat **Wörter** ✓ (`headline`, `detail` ✓). Ein Farbton ist nirgends
// die einzige Aussage ✓ — *eine Farbe ist keine Aussage, sie ist eine Andeutung* ✓.
//
// ## Die Tastatur ist kein Zusatz ✓
//
// Jede Handlung ist ein echtes `<button type="button">` ✓ — also mit Tab erreichbar ✓ und mit Enter/Leertaste
// auslösbar ✓ — und trägt zusätzlich ihre Tastenkürzel als Text ✓ (`aria-keyshortcuts` ✓ + der sichtbare
// Hinweis ✓). *Ein Ablageziel, das man nur mit dem Zeiger bestätigen kann, ist ein Befund* ✓.
//
// ## Was hier **nicht** geprüft ist ✗
//
// Das **Binden** der Zeiger- und Tastenereignisse ✓ (`useWriterWorkspaceDropZone` ✓) — dafür braucht es einen
// Browser ✓. Das ist `NOT_TESTED` ✓ und wird so berichtet ✓; geprüft sind Zustand ✓ und Markup ✓.
import React from 'react';
import type { WorkspaceDropIntent, WorkspaceLiveMode } from '../../../../shared/workspace-interaction';
import {
  WRITER_WORKSPACE_DROP_INTENT_LABEL,
  WRITER_WORKSPACE_DROP_MODE_PROMPT,
  WRITER_WORKSPACE_DROP_ZONE_CONFIRM_LABEL,
  WRITER_WORKSPACE_DROP_ZONE_DISMISS_LABEL,
  WRITER_WORKSPACE_DROP_ZONE_KEY_HINT,
  WRITER_WORKSPACE_DROP_ZONE_TITLE,
  WRITER_WORKSPACE_LIVE_MODE_LABEL,
  WRITER_WORKSPACE_LIVE_MODES,
  writerWorkspaceDropPreviewText,
} from './writerWorkspaceDropZoneContract';
import type { WriterWorkspaceDropZoneState } from './writerWorkspaceDropZoneContract';
import { isWriterWorkspaceDropZoneVisible, writerWorkspaceDropZoneNeedsMode } from './writerWorkspaceDropZone';
import { WRITER_DROP_ZONE_TOUCH_ACTION } from './writerWorkspaceDropZoneTouch';

/** Die Rahmenform je Zustand ✓ — die zweite Achse neben dem Zeichen ✓, **ohne** Farbe ✓. */
const FRAME_CLASS: Readonly<Record<WriterWorkspaceDropZoneState['pattern'], string>> = {
  none: 'border-0',
  dashed: 'border-2 border-dashed',
  solid: 'border-2 border-solid',
  double: 'border-4 border-double',
};

export interface WriterWorkspaceDropZoneOverlayProps {
  state: WriterWorkspaceDropZoneState;
  /** Die Tastatur-Absicht „bestätigen" ✓ — **dieselbe** Zustellung wie die Ablage ✓. */
  onConfirm: () => void;
  /**
   * Die Tastatur-Absicht „diese Absicht" ✓ — **dieselbe** Zustellung wie die Ablage ✓. Der **Modus** reist
   * **mit** der Absicht ✓ (Paket 15 ✓): *ein Knopf, der ohne Klick `Live` setzt, wäre genau der Defekt, den
   * Paket 15 beseitigt* ✗✓ — hier wird er **gesagt** ✓.
   */
  onChooseIntent: (intent: WorkspaceDropIntent, mode?: WorkspaceLiveMode) => void;
  onDismiss: () => void;
}

export const WriterWorkspaceDropZoneOverlay: React.FC<WriterWorkspaceDropZoneOverlayProps> = ({
  state,
  onConfirm,
  onChooseIntent,
  onDismiss,
}) => {
  if (!isWriterWorkspaceDropZoneVisible(state)) return null;
  // **Eine** Bedingung, gelesen statt geraten ✓ (Paket 15 ✓): die Matrix hat eine Live-Route **angeboten** ✓,
  // oder die Zustellung hat den Modus **benannt** ✓ (`drop_live_mode_required` ✓).
  const needsMode = writerWorkspaceDropZoneNeedsMode(state);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60]"
      data-writer-drop-zone-surface={state.phase}
      // Die Touch-Strategie ist **entschieden** (Paket 9, `writerWorkspaceDropZoneTouch.ts`): `manipulation`,
      // **nie** `none` — sonst kämpften Scrollen und Zug um dieselbe Geste.
      style={{ touchAction: WRITER_DROP_ZONE_TOUCH_ACTION }}
    >
      <div
        aria-hidden="true"
        data-writer-drop-zone-frame={state.pattern}
        className={`absolute inset-2 rounded-2xl border-cyan-300/70 ${FRAME_CLASS[state.pattern]}`}
      />
      <section
        aria-label={WRITER_WORKSPACE_DROP_ZONE_TITLE}
        data-writer-drop-zone={state.phase}
        data-writer-drop-zone-glyph={state.glyph}
        data-writer-drop-zone-pattern={state.pattern}
        data-writer-drop-zone-acceptance={state.acceptance}
        data-writer-drop-zone-code={state.code ?? ''}
        className="pointer-events-auto absolute bottom-4 right-4 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-2xl"
      >
        <p role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-2">
          <span aria-hidden="true" className="font-mono text-base leading-none text-cyan-200">{state.glyph}</span>
          <span className="flex-1">
            <span className="font-semibold">{state.headline}</span>
            {state.detail !== null && (
              <span data-writer-drop-zone-detail className="mt-0.5 block text-slate-300">{state.detail}</span>
            )}
          </span>
        </p>
        {state.preview !== null && (
          <p
            data-writer-drop-zone-preview={state.preview.adapterId}
            className="mt-2 rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[0.625rem] text-slate-300"
          >
            {writerWorkspaceDropPreviewText(state.preview)}
          </p>
        )}
        {state.resolution !== null && (
          <p
            data-writer-drop-zone-resolution={state.resolution.adapterId}
            data-writer-drop-zone-resolution-intent={state.resolution.intent}
            data-writer-drop-zone-resolution-kind={state.resolution.integrationKind}
            data-writer-drop-zone-resolution-mode={state.resolution.mode ?? ''}
            className="mt-2 rounded border border-emerald-300/20 bg-emerald-400/[0.05] px-2 py-1 text-[0.625rem] text-emerald-100"
          >
            {`Weitergeleitet über ${state.resolution.adapterId} · ${WRITER_WORKSPACE_DROP_INTENT_LABEL[state.resolution.intent]} · ${state.resolution.integrationKind}${state.resolution.mode === undefined ? '' : ` (${WRITER_WORKSPACE_LIVE_MODE_LABEL[state.resolution.mode]})`} · Quelle v${state.resolution.sourceVersion} → Ziel v${state.resolution.targetVersion}`}
          </p>
        )}
        {state.choices.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {state.choices.map((choice) => (
              <button
                key={choice.intent}
                type="button"
                data-writer-drop-zone-choice={choice.intent}
                aria-keyshortcuts={choice.shortcutLabel}
                onClick={() => onChooseIntent(choice.intent)}
                className="rounded border border-white/20 px-2 py-1 text-[0.6875rem] text-slate-100 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <span className="mr-1 font-mono text-slate-400">{choice.key}</span>
                {choice.label}
              </button>
            ))}
          </div>
        )}
        {/*
          **Paket 15 — die klare Auswahl Live/Frozen, ohne heimlichen Default.**
          Die Knöpfe erscheinen, wenn die Matrix eine Live-Route **angeboten** hat (Phase `choice`) oder wenn die
          Zustellung genau das **benannt** hat (`drop_live_mode_required`) — *beide Tatsachen liest
          `writerWorkspaceDropZoneNeedsMode`, keine wird geraten.* Jeder Knopf sagt den Modus **mit** der Absicht,
          sodass der Resolver ihn prüft; die Wörter sind die **vorhandenen** (Live-Verweis / eingefrorene
          Momentaufnahme).
        */}
        {needsMode && (
          <div data-writer-drop-zone-mode-prompt className="mt-2 rounded border border-amber-300/25 bg-amber-400/[0.06] px-2 py-1.5">
            <p className="text-[0.625rem] text-amber-100">{WRITER_WORKSPACE_DROP_MODE_PROMPT}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WRITER_WORKSPACE_LIVE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-writer-drop-zone-mode={mode}
                  onClick={() => onChooseIntent('LIVE_REFERENCE', mode)}
                  className="rounded border border-amber-300/40 px-2 py-1 text-[0.6875rem] text-amber-50 transition-colors hover:bg-amber-300/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  {WRITER_WORKSPACE_LIVE_MODE_LABEL[mode]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            data-writer-drop-zone-confirm
            aria-keyshortcuts="Enter"
            onClick={onConfirm}
            disabled={!state.canConfirmWithKeyboard}
            aria-disabled={!state.canConfirmWithKeyboard}
            className="rounded border border-cyan-300/40 px-2 py-1 text-[0.6875rem] font-medium text-cyan-50 transition-colors hover:bg-cyan-300/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-40"
          >
            {WRITER_WORKSPACE_DROP_ZONE_CONFIRM_LABEL}
          </button>
          <button
            type="button"
            data-writer-drop-zone-dismiss
            aria-keyshortcuts="Escape"
            onClick={onDismiss}
            className="rounded border border-white/15 px-2 py-1 text-[0.6875rem] text-slate-300 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {WRITER_WORKSPACE_DROP_ZONE_DISMISS_LABEL}
          </button>
        </div>
        <p data-writer-drop-zone-keys className="mt-2 text-[0.625rem] text-slate-400">{WRITER_WORKSPACE_DROP_ZONE_KEY_HINT}</p>
      </section>
    </div>
  );
};
