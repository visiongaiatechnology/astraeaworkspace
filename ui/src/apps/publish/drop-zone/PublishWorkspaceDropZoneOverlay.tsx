// STATUS: PLATIN — Integration & Release, **Paket 13**: die dünne Ansicht der Publish-Ablagezone
//
// ## Die Ansicht entscheidet **nichts**
//
// Sie **liest** den Zustand (Paket 13, rein) und schreibt ihn hin: Urteil, Grund, Vorschau, Absichten, Zeichen,
// Form, Wörter. *Kein `if` über Fachlichkeit, keine eigene Regel* — wer hier eine Entscheidung einbaut, hat zwei
// Wahrheiten über dieselbe Frage. Deshalb steht in dieser Datei **keine** Erlaubnis, **kein** Objektartverzeichnis
// und **keine** Schwelle; alles kommt aus `publishWorkspaceDropZone.ts`,
// `publishWorkspaceDropZoneContract.ts` und `publishWorkspaceDropZoneTouch.ts`.
//
// ## Die fünf Punkte des Standards (§12.3) in dieser Datei
//
//   1. **Erkennbare Zone** — vier **Eckwinkel** (Form), eine **Strichart** (`dashed` / `solid` / `double`), ein
//      **Zeichen** und **Wörter**. Ein Farbton ist **keine** der Aussagen: *die Strichart ist die Form des
//      Zustands, die Farbe ist daneben.*
//   2. **Vorschau** — `state.target.preview.label` wird **wörtlich** gerendert; das Modul daneben formuliert ihn
//      nicht neu (Paket 6 hat ihn gebaut).
//   3. **Erlaubt / unerlaubt als benannter Zustand** — `state.target.verdict` (`accept` / `reject` / `none`) steht
//      als **Wort** im DOM und als `data`-Attribut; der Grund steht als **Code und Satz** daneben.
//   4. **Tastatur ohne Zeiger** — jede Handlung ist ein echtes `<button type="button">` mit `aria-keyshortcuts`,
//      keiner ist `disabled` (ein abgeschalteter Knopf wäre nicht erreichbar und könnte seinen Grund nicht
//      ansagen), und `aria-disabled` sagt an, dass er nichts ausrichten würde. *Eine Ablagezone, die man nur mit
//      dem Zeiger bestätigen kann, ist ein Befund.*
//   5. **Touch** — die Entscheidungen kommen **benannt** aus `publishWorkspaceDropZoneTouch.ts` (`manipulation`,
//      **nie** `none`); diese Ansicht setzt sie um und **sagt sie an** (Schwelle und Toleranz als Text).
//
// ## Die Ansageregion steht **immer** im DOM
//
// `role="status"`, `aria-live="assertive"`, `aria-atomic="true"` — auch im leeren Zustand. *Eine Ansage, die erst
// mit ihrem Text geboren wird, wird nicht vorgelesen; sie ist eine **Änderung** in einer vorhandenen Region.*
//
// ## Warum die Zone **über** der Leinwand liegt, aber keine Zeiger fängt
//
// Die Ebene ist `pointer-events-none`: die Zeigerereignisse (Rahmen ziehen, Bild ablegen) gehören der Leinwand
// darunter — die **Tastatur** ist davon nicht betroffen, Fokus braucht keinen Zeiger. Nur die Zone selbst
// (`pointer-events-auto`) nimmt Klicks an.
//
// **Nicht geprüft** und ausdrücklich so benannt: das **echte** Ziehen und Ablegen (`dragenter` / `dragover` /
// `drop`), `pointercancel` am Gerät, `touch-action` auf einem echten Gerät und jede Screenshot-Prüfung. Dafür
// fehlt in dieser Umgebung ein Browser. Geprüft ist die **gerenderte Zusage**.
import React from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDropIntent, WorkspaceLiveMode } from '../../../shared/workspace-interaction';
import type { DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import { PUBLISH_STORY_MODES } from '../integrations/publishStoryAcceptance';
import {
  PUBLISH_WORKSPACE_DROP_ZONE_CONFIRM_LABEL,
  PUBLISH_WORKSPACE_DROP_ZONE_DISMISS_LABEL,
  PUBLISH_WORKSPACE_DROP_ZONE_IDLE_ANNOUNCEMENT,
  PUBLISH_WORKSPACE_DROP_ZONE_KEY_HINT,
  PUBLISH_WORKSPACE_DROP_ZONE_MODE_CHOSEN,
  PUBLISH_WORKSPACE_DROP_ZONE_MODE_LABEL,
  PUBLISH_WORKSPACE_DROP_ZONE_MODE_NOT_CHOSEN,
  PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION,
  PUBLISH_WORKSPACE_DROP_ZONE_PREVIEW_LABEL,
  PUBLISH_WORKSPACE_DROP_ZONE_TITLE,
  publishWorkspaceDropPreviewText,
  publishWorkspaceDropRefusalText,
} from './publishWorkspaceDropZoneContract';
import type { PublishWorkspaceDropZoneState } from './publishWorkspaceDropZoneContract';
import {
  isPublishWorkspaceDropZoneVisible,
  publishWorkspaceDropIntentLabelOf,
  publishWorkspaceDropZoneCanConfirm,
  publishWorkspaceDropZoneChoices,
  publishWorkspaceDropZoneRefusalCode,
  publishWorkspaceDropZoneView,
} from './publishWorkspaceDropZone';
import { publishWorkspaceDropTouchStrategy } from './publishWorkspaceDropZoneTouch';

export interface PublishWorkspaceDropZoneOverlayProps {
  readonly state: PublishWorkspaceDropZoneState;
  /** Die Eingabeart, die gerade bedient — **gelesen** aus Paket 6, nicht geraten. */
  readonly inputKind?: DragInputKind;
  /** Die Tastatur-Absicht „ablegen" — **dieselbe** Zustellung wie die Zeiger-Ablage. */
  readonly onConfirm: () => void;
  /** Die Tastatur-Absicht „diese Absicht" — **dieselbe** Zustellung wie die Ablage. */
  readonly onChooseIntent: (intent: WorkspaceDropIntent) => void;
  readonly onDismiss: () => void;
  /** Die Tastatur der Zone selbst — sie braucht den Zeiger **nicht**. */
  readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  /**
   * **Paket 15 — der Live-Modus, wie der Nutzer ihn gesagt hat.** `'Live'` / `'Frozen'`, oder **abwesend**,
   * solange er nicht gewählt hat.
   *
   * Er wird hier **nicht** entschieden und **nicht** vorbelegt: die Zone reicht ihn durch, und der fehlende Fall
   * steht als Wort in der Ansicht („mode not chosen") — *ein vorbelegtes „Live" wäre genau der heimliche Default,
   * den Paket 15 verbietet.*
   */
  readonly requestedMode?: WorkspaceLiveMode;
  /** Die Wahl des Modus — **nur** wenn gereicht, rendert die Ansicht die zwei Knöpfe. */
  readonly onChooseMode?: (mode: WorkspaceLiveMode) => void;
}

/**
 * Die Rahmenart je Zustand — **eine** Abbildung, und sie ist eine **Form**, kein Farbton.
 *
 * Die Farbklassen daneben sind Verstärkung, nie die Aussage: *wer die Farbklassen entfernt, sieht den Zustand
 * weiterhin an Strichart, Zeichen und Wörtern.*
 */
const RAHMENFORM: Readonly<Record<string, string>> = Object.freeze({
  none: 'border-transparent',
  dashed: 'border-dashed',
  solid: 'border-solid',
  double: 'border-double border-4',
});

/** Die vier Eckwinkel — die erkennbare Zone, unabhängig von jeder Farbe. */
const ECKEN: readonly string[] = Object.freeze([
  'left-0 top-0 border-l-4 border-t-4',
  'right-0 top-0 border-r-4 border-t-4',
  'left-0 bottom-0 border-l-4 border-b-4',
  'right-0 bottom-0 border-r-4 border-b-4',
]);

export const PublishWorkspaceDropZoneOverlay: React.FC<PublishWorkspaceDropZoneOverlayProps> = ({
  state,
  inputKind = 'mouse',
  onConfirm,
  onChooseIntent,
  onDismiss,
  onKeyDown,
  requestedMode,
  onChooseMode,
}) => {
  const view = publishWorkspaceDropZoneView(state);
  const presentation = PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION[view];
  const strategy = publishWorkspaceDropTouchStrategy(inputKind);
  const preview = state.target.preview;
  const previewText = publishWorkspaceDropPreviewText(preview);
  const refusalCode = publishWorkspaceDropZoneRefusalCode(state);
  const choices = publishWorkspaceDropZoneChoices(state);
  const visible = isPublishWorkspaceDropZoneVisible(state);
  const canConfirm = publishWorkspaceDropZoneCanConfirm(state);
  const delivered = state.decision.kind === 'delivered' ? state.decision.resolution : null;
  const announcement = visible
    ? `${presentation.headline}. ${previewText === '' ? '' : `${PUBLISH_WORKSPACE_DROP_ZONE_PREVIEW_LABEL} ${previewText}. `}${
        refusalCode === null ? '' : `${refusalCode}: ${publishWorkspaceDropRefusalText(refusalCode)}`
      }`.trim()
    : PUBLISH_WORKSPACE_DROP_ZONE_IDLE_ANNOUNCEMENT;

  return (
    <div
      className="publish-drop-zone-layer pointer-events-none absolute inset-0 z-30"
      // Die Touch-Strategie ist **entschieden** (`publishWorkspaceDropZoneTouch.ts`): `manipulation`, **nie**
      // `none` — sonst stritten Scrollen der Seitenfläche, Zoom und Zug um dieselbe Geste.
      style={{ touchAction: strategy.touchAction }}
      data-vgt-publish-drop-zone-layer={view}
      data-vgt-publish-drop-zone-touch-action={strategy.touchAction}
    >
      {/*
        Die Ansageregion steht **immer** — auch ohne Zone. Nur so ist die Ansage eine **Änderung** in einer
        vorhandenen Region statt einer Region, die mit ihrem Text geboren wird (und deshalb stumm bleibt).
      */}
      <p
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-vgt-publish-drop-zone-announcer={view}
      >
        {announcement}
      </p>

      {visible && (
        <section
          aria-label={PUBLISH_WORKSPACE_DROP_ZONE_TITLE}
          data-vgt-publish-drop-zone={view}
          data-vgt-publish-drop-zone-glyph={presentation.glyph}
          data-vgt-publish-drop-zone-pattern={presentation.pattern}
          data-vgt-publish-drop-zone-verdict={state.target.verdict}
          data-vgt-publish-drop-zone-reason={refusalCode ?? ''}
          data-vgt-publish-drop-zone-transfer={state.transfer.ok ? 'read' : state.transfer.reason}
          data-vgt-publish-drop-zone-pointer-free={strategy.pointerFree ? 'true' : 'false'}
          data-vgt-publish-drop-zone-touch-longpress-ms={String(strategy.longPress.ms)}
          data-vgt-publish-drop-zone-touch-threshold-px={String(strategy.thresholdPx)}
          data-vgt-publish-drop-zone-touch-cancel={strategy.cancelReason}
          onKeyDown={onKeyDown}
          className={`publish-drop-zone pointer-events-auto absolute inset-x-6 top-6 border-2 bg-slate-950/85 px-5 py-4 text-slate-100 shadow-lg ${
            RAHMENFORM[presentation.pattern] ?? RAHMENFORM.dashed
          }`}
        >
          {ECKEN.map((ecke) => (
            <span key={ecke} aria-hidden="true" className={`absolute h-3 w-3 border-slate-200/80 ${ecke}`} />
          ))}

          <p className="flex items-start gap-2">
            {/* Das Zeichen ist **dekorativ** — es steht zusätzlich als `data`-Attribut und die Aussage als Wort da. */}
            <span aria-hidden="true" data-vgt-publish-drop-zone-glyph-mark="true" className="font-mono text-base leading-5">
              {presentation.glyph}
            </span>
            <span data-vgt-publish-drop-zone-headline="true" className="text-sm font-bold tracking-wide break-words">
              {presentation.headline}
            </span>
          </p>

          {/* Das Urteil (Paket 6) als **Wort** — `accept` / `reject` / `none`, nicht als Farbton. */}
          <p data-vgt-publish-drop-zone-verdict-text={state.target.verdict} className="mt-3 text-[0.6875rem] font-semibold">
            {`Verdict: ${state.target.verdict}`}
          </p>

          {preview !== null && (
            <p data-vgt-publish-drop-zone-preview={preview.objectKind} className="mt-1 text-[0.6875rem] leading-relaxed">
              <span className="text-slate-400">{`${PUBLISH_WORKSPACE_DROP_ZONE_PREVIEW_LABEL} `}</span>
              {/* **Wörtlich** aus dem Urteil (Paket 6) — hier wird nichts umformuliert. */}
              <span data-vgt-publish-drop-zone-preview-label="true" className="font-mono">{previewText}</span>
            </p>
          )}

          {refusalCode !== null && (
            <p data-vgt-publish-drop-zone-reason-text={refusalCode} className="mt-1 text-[0.6875rem] leading-relaxed text-amber-200">
              {`Reason: ${refusalCode} · ${publishWorkspaceDropRefusalText(refusalCode)}`}
            </p>
          )}

          {/* Ein abgelehnter Zustand bekommt zusätzlich eine **Schraffur** — Form, nicht Farbton. */}
          {state.target.verdict === 'reject' && (
            <p
              data-vgt-publish-drop-zone-hatch="true"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(148,163,184,0.28) 0 6px, transparent 6px 14px)' }}
            />
          )}

          {delivered !== null && (
            <p
              data-vgt-publish-drop-zone-resolution={delivered.adapterId}
              data-vgt-publish-drop-zone-resolution-intent={delivered.intent}
              // **Paket 15:** *wie* die Quelle behandelt wird, ist eine eigene, sichtbare Tatsache — kein Farbton.
              data-vgt-publish-drop-zone-resolution-kind={delivered.integrationKind}
              // **Kein heimlicher Default:** ohne gewählten Modus steht hier **nichts** — nicht „Live".
              data-vgt-publish-drop-zone-resolution-mode={delivered.mode ?? ''}
              className="mt-1 font-mono text-[0.6875rem] text-slate-300"
            >
              {`Placed via ${delivered.adapterId} · ${publishWorkspaceDropIntentLabelOf(delivered.intent)} · ${
                delivered.integrationKind === 'live'
                  ? `Live reference (${delivered.mode ?? 'mode not chosen'})`
                  : 'Copy'
              } · source v${delivered.sourceVersion} → target v${delivered.targetVersion}`}
            </p>
          )}

          {choices.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {choices.map((choice) => (
                <li key={choice.intent}>
                  <button
                    type="button"
                    data-vgt-publish-drop-zone-choice={choice.intent}
                    aria-keyshortcuts={choice.shortcutLabel}
                    onClick={() => onChooseIntent(choice.intent)}
                    className="rounded border border-white/20 px-3 py-1.5 text-[0.6875rem] text-slate-200 hover:bg-white/10"
                  >
                    <span data-vgt-publish-drop-zone-choice-key={choice.key} className="mr-1.5 font-mono text-slate-400">{choice.key}</span>
                    {choice.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/*
            **Paket 15: der Modus wird gesagt, nicht angenommen.**
            Zwei echte Knöpfe, tastaturerreichbar, mit `aria-pressed` **und** einem Wort — *kein Farbton trägt die
            Aussage.* Solange nichts gewählt ist, steht genau das da: „mode not chosen". Ein vorbelegtes „Live"
            wäre der heimliche Default, den die Zone an ihrer Stelle schon verbietet.
          */}
          {onChooseMode && (
            <div className="mt-3" data-vgt-publish-drop-zone-mode-choice={requestedMode ?? 'none'}>
              <p className="text-[0.6875rem] text-slate-400">{PUBLISH_WORKSPACE_DROP_ZONE_MODE_LABEL}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {PUBLISH_STORY_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    data-vgt-publish-drop-zone-mode={mode}
                    aria-pressed={requestedMode === mode}
                    onClick={() => onChooseMode(mode)}
                    className={`rounded border px-3 py-1.5 text-[0.6875rem] ${
                      requestedMode === mode
                        ? 'border-purple-400/60 bg-purple-500/20 text-purple-100 font-semibold'
                        : 'border-white/20 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p data-vgt-publish-drop-zone-mode-state={requestedMode ?? 'none'} className="mt-1 text-[0.625rem] text-slate-400">
                {requestedMode === undefined ? PUBLISH_WORKSPACE_DROP_ZONE_MODE_NOT_CHOSEN : `${PUBLISH_WORKSPACE_DROP_ZONE_MODE_CHOSEN} ${requestedMode}`}
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-vgt-publish-drop-zone-confirm="true"
              aria-keyshortcuts="Enter"
              aria-disabled={!canConfirm}
              onClick={onConfirm}
              className="rounded border border-purple-400/50 bg-purple-500/10 px-3 py-1.5 text-[0.6875rem] font-semibold text-purple-100 hover:bg-purple-500/20 aria-disabled:opacity-40"
            >
              {PUBLISH_WORKSPACE_DROP_ZONE_CONFIRM_LABEL}
            </button>
            <button
              type="button"
              data-vgt-publish-drop-zone-dismiss="true"
              aria-keyshortcuts="Escape"
              onClick={onDismiss}
              className="rounded border border-white/20 px-3 py-1.5 text-[0.6875rem] text-slate-300 hover:bg-white/10"
            >
              {PUBLISH_WORKSPACE_DROP_ZONE_DISMISS_LABEL}
            </button>
          </div>

          <p data-vgt-publish-drop-zone-keys="true" className="mt-2 text-[0.625rem] text-slate-400">{PUBLISH_WORKSPACE_DROP_ZONE_KEY_HINT}</p>
          <p data-vgt-publish-drop-zone-input={inputKind} className="mt-1 text-[0.625rem] text-slate-400">{strategy.reason}</p>
        </section>
      )}
    </div>
  );
};
