// STATUS: PLATIN — Integration & Release, **Paket 22 (Writer)**: der sichtbare Einstieg der Quellenseite
//
// ## Der direkt erreichbare Einstieg ✓✓
//
// Die Akzeptanz verlangt einen **sichtbaren Einstieg** ✓ — hier ist er: *drei echte Knöpfe* ✓, jeder sagt
// **eine** Behandlungsart ✓, und **keiner** setzt etwas ohne Klick ✗✓ (*Kopie* ✓ / *Live-Verweis* ✓ /
// *eingefrorene Momentaufnahme* ✓ — die Wörter kommen aus dem **einen** Wort-Register ✓).
//
// ## Die Ansicht entscheidet **nichts** ✓
//
// Sie liest den Zustand ✓ (`writerWorkspaceCarrier.ts` ✓) und schreibt ihn hin ✓ — Wörter ✓, Kennungen ✓,
// Grund ✓. *Ein `if` über Fachlichkeit hier wäre eine zweite Wahrheit* ✗.
//
// ## „Bereitgestellt" ist **nicht** „zugestellt" ✗✓
//
// Der Knopf baut den **Träger** ✓; ob ein Ziel ihn annimmt, entscheidet die **Matrix** ✓ und nennt es dort
// **benannt** ✓. *Ein „Erfolg", der nur den Träger gebaut hat, wäre ein Erfolg ohne Vorgang* ✗✓.
//
// ## Was hier `NOT_TESTED` bleibt ✗
//
// Das **Binden** des Ziehens ✓ (`draggable` + `onDragStart` ✓ → `dataTransfer.setData` ✓) — dafür braucht es
// einen Browser ✓. *Die Knöpfe sind der Weg, der **kein** Ziehen braucht* ✓; das Ziehen ist der zweite ✓.
import React from 'react';
import type { WorkspaceIntegrationKind, WorkspaceLiveMode } from '../../../../shared/workspace-interaction';
import {
  WRITER_WORKSPACE_DROP_INTENT_LABEL,
  WRITER_WORKSPACE_LIVE_MODE_LABEL,
} from '../workspace-drop/writerWorkspaceDropZoneContract';
import {
  writerWorkspaceCarrierIsVisible,
  writerWorkspaceCarrierStateText,
} from './writerWorkspaceCarrier';
import type { WriterWorkspaceCarrierState } from './writerWorkspaceCarrier';

export interface WriterWorkspaceCarrierControlProps {
  state: WriterWorkspaceCarrierState;
  /** **Drei** Wege, alle **gesagt** ✓ — keiner davon still ✗. */
  onCarry: (kind: WorkspaceIntegrationKind, mode?: WorkspaceLiveMode) => void;
  /** Der **Zeiger**-Weg ✓ — dieselbe Quelle ✓ wie die Knöpfe ✓. */
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onClear: () => void;
}

export const WriterWorkspaceCarrierControl: React.FC<WriterWorkspaceCarrierControlProps> = ({
  state,
  onCarry,
  onDragStart,
  onClear,
}) => {
  const carrier = state.carrier;
  const visible = writerWorkspaceCarrierIsVisible(state);
  const buttonClass = 'rounded border border-white/20 px-2 py-1 text-[0.6875rem] text-slate-100 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

  return (
    <div
      data-writer-carrier={carrier === null ? (state.refusal ?? 'idle') : 'ready'}
      data-writer-carrier-kind={carrier?.integrationKind ?? ''}
      data-writer-carrier-mode={carrier?.mode ?? ''}
      data-writer-carrier-document={carrier?.documentId ?? ''}
      data-writer-carrier-object={carrier?.objectId ?? ''}
      className="flex w-full flex-wrap items-center gap-2 border-t border-white/10 bg-slate-950/80 px-3 py-1.5 text-[0.6875rem] text-slate-300"
    >
      <span className="font-medium text-slate-400">Dokumentabschnitt als Story bereitstellen:</span>
      <button
        type="button"
        data-writer-carrier-action="copy"
        onClick={() => onCarry('copy')}
        className={buttonClass}
      >
        {WRITER_WORKSPACE_DROP_INTENT_LABEL.COPY}
      </button>
      <button
        type="button"
        data-writer-carrier-action="live"
        onClick={() => onCarry('live', 'Live')}
        className={buttonClass}
      >
        {WRITER_WORKSPACE_LIVE_MODE_LABEL.Live}
      </button>
      <button
        type="button"
        data-writer-carrier-action="frozen"
        onClick={() => onCarry('live', 'Frozen')}
        className={buttonClass}
      >
        {WRITER_WORKSPACE_LIVE_MODE_LABEL.Frozen}
      </button>
      {visible && (
        <p role="status" aria-live="polite" aria-atomic="true" className="flex flex-1 items-center gap-2">
          {state.refusal !== null && (
            <span data-writer-carrier-refusal={state.refusal} className="font-medium text-amber-200">
              {writerWorkspaceCarrierStateText(state)}
            </span>
          )}
          {carrier !== null && (
            <>
              <span
                draggable
                onDragStart={onDragStart}
                data-writer-carrier-handle="true"
                className="cursor-grab rounded border border-cyan-300/40 px-2 py-0.5 text-cyan-100"
              >
                {writerWorkspaceCarrierStateText(state)}
              </span>
              <button type="button" data-writer-carrier-clear onClick={onClear} className={buttonClass}>
                Schließen
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
};
