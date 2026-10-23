// STATUS: PLATIN — Integration & Release, **Paket 10**: die Anbindung der Present-Ablagefläche an den DOM
//
// ## Warum die Substanz **nicht** in diesem Hook liegt
//
// Ein React-Hook ist in dieser Umgebung **nicht** abnehmbar: ohne Browser gibt es keine `dragover`-,
// `drop`- oder Tastaturereignisse. Deshalb liegt jede Entscheidung **außerhalb** — in
// `presentWorkspaceDropZone.ts` (Zustand und Zustellung), `presentWorkspaceDropZoneTouch.ts`
// (Touch-Strategie) und `presentWorkspaceDropZoneContract.ts` (Vokabular). *Der Hook entscheidet
// nichts: er hält **einen** Zustand und reicht weiter.*
//
// ## Die drei Signale, die es heute wirklich gibt
//
//   1. **Die Zieh-Session aus Paket 5** — `onDragSession(session)` folgt dem Erzeuger
//      (`isDragActive`, `session.payload`) statt einen zweiten Zug zu führen.
//   2. **Die native Ablagefläche aus Paket 4** — `dragover` kündigt den Träger nur über
//      `dataTransfer.types` an (der Inhalt ist während `dragover` **nicht** lesbar). Deshalb ist der
//      Zustand beim Überfahren der **leere** Zustand (`open`) und **kein** Fehler — *erst das Ablegen
//      liest den Träger, und erst dann gibt es ein Urteil*.
//   3. **Die Tastatur als Absicht** — `onKeyDown` übersetzt die Taste in einen **Befehl**
//      (`resolvePresentWorkspaceDropCommand`) und führt ihn über **dieselbe** Zustellung aus wie die
//      Ablage. Die sichtbaren Knöpfe der Fläche sind der primäre Tastaturweg; dieser Zweig existiert für
//      eine Shell, die die Tasten global bindet.
//
// **Nicht geprüft** und so benannt: dieses **Binden** selbst. Geprüft sind Zustand, Urteil, Vorschau,
// Touch-Entscheidung und Tastatur-Umrechnung — alles, was kopflos prüfbar ist.
import { useCallback, useMemo, useRef, useState } from 'react';
import type { PresentObjectGeometry, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WorkspaceDropIntent, WorkspaceInteractionRegistry } from '../../../../shared/workspace-interaction';
import type { DragSessionState } from '../../../../shell/workspace/drag/dragSession';
import {
  applyPresentWorkspaceDropCommand,
  createPresentWorkspaceDropZone,
  dropPresentWorkspaceDropZone,
  hasPresentWorkspaceDropTransfer,
  leavePresentWorkspaceDropZone,
  openPresentWorkspaceDropZone,
  openPresentWorkspaceDropZoneFromDragSession,
  readPresentWorkspaceTransfer,
  resolvePresentWorkspaceDropCommand,
  type PresentWorkspaceDataTransferLike,
  type PresentWorkspaceDropZoneContext,
  type PresentWorkspaceDropZoneState,
  type PresentWorkspaceDropZoneStep,
} from './presentWorkspaceDropZone';

/** Die Ablagefläche, wie der DOM sie zeigt — **strukturell**, ohne DOM-Typen (wie `DragPointerLike`). */
export interface PresentDragEventLike {
  readonly dataTransfer?: (PresentWorkspaceDataTransferLike & { readonly types?: unknown; dropEffect?: string }) | null;
  readonly preventDefault?: () => void;
}

/** Ein Tastenereignis — nur der Name der Taste und das Abfangen werden gebraucht. */
export interface PresentKeyEventLike {
  readonly key?: unknown;
  readonly preventDefault?: () => void;
}

export interface PresentWorkspaceDropZoneWiringInput {
  readonly targetDocumentId: string | null;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly existingObjects?: readonly PresentObjectGeometry[];
  /** Die **eine** Autorität (Paket 4). Fehlt sie, wird **nicht** angenommen (fail-closed). */
  readonly registry?: WorkspaceInteractionRegistry | null;
}

export interface PresentWorkspaceDropZoneWiring {
  readonly state: PresentWorkspaceDropZoneState;
  readonly onDragSession: (session: DragSessionState) => void;
  readonly onDragOver: (event: PresentDragEventLike) => void;
  readonly onDragLeave: () => void;
  readonly onDrop: (event: PresentDragEventLike) => void;
  readonly onKeyDown: (event: PresentKeyEventLike) => void;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  readonly onChooseIntent: (intent: WorkspaceDropIntent) => void;
}

/**
 * **Der Hook** — er hält **einen** Zustand und reicht jedes Ereignis durch die vorhandenen Funktionen.
 * Er entscheidet **nichts**: kein Urteil, keine Schwelle, keine Absicht.
 */
export function usePresentWorkspaceDropZone(input: PresentWorkspaceDropZoneWiringInput): PresentWorkspaceDropZoneWiring {
  const { targetDocumentId, documents, existingObjects, registry } = input;
  const [state, setState] = useState<PresentWorkspaceDropZoneState>(() => createPresentWorkspaceDropZone(targetDocumentId));
  // Der jüngste Zustand liegt **auch** in einer Referenz: ein Tastenereignis braucht ihn **synchron**,
  // bevor React neu gerendert hat — *sonst entschiede der Hook über einen veralteten Zustand*.
  const current = useRef(state);

  const context = useMemo<PresentWorkspaceDropZoneContext>(() => ({
    targetDocumentId,
    documents,
    existingObjects,
    registry,
  }), [targetDocumentId, documents, existingObjects, registry]);

  const dispatch = useCallback((step: (previous: PresentWorkspaceDropZoneState) => PresentWorkspaceDropZoneStep): void => {
    const next = step(current.current);
    current.current = next.state;
    setState(next.state);
  }, []);

  const onDragSession = useCallback((session: DragSessionState): void => {
    dispatch((previous) => openPresentWorkspaceDropZoneFromDragSession(previous, session, context));
  }, [context, dispatch]);

  const onDragOver = useCallback((event: PresentDragEventLike): void => {
    const dataTransfer = event.dataTransfer ?? null;
    // Nur **unser** Träger öffnet die Fläche: *ein fremdes Ziehen bekommt hier kein Ziel.*
    if (!hasPresentWorkspaceDropTransfer(dataTransfer?.types ? Array.from(dataTransfer.types as ArrayLike<string>) : null)) return;
    event.preventDefault?.();
    if (dataTransfer && typeof dataTransfer === 'object') dataTransfer.dropEffect = 'copy';
    dispatch((previous) => openPresentWorkspaceDropZone(previous, { ...context, payload: null }));
  }, [context, dispatch]);

  const onDragLeave = useCallback((): void => {
    dispatch((previous) => leavePresentWorkspaceDropZone(previous, 'drag-left'));
  }, [dispatch]);

  const onDrop = useCallback((event: PresentDragEventLike): void => {
    event.preventDefault?.();
    const transfer = readPresentWorkspaceTransfer(event.dataTransfer ?? null);
    dispatch((previous) => dropPresentWorkspaceDropZone(previous, {
      ...context,
      payload: transfer.ok ? transfer.payload : null,
    }));
  }, [context, dispatch]);

  const onKeyDown = useCallback((event: PresentKeyEventLike): void => {
    const step = resolvePresentWorkspaceDropCommand(current.current, event.key);
    // **Kein stiller No-op**: eine Taste, die kein Befehl ist, wird nicht abgefangen.
    if (!step.ok) return;
    event.preventDefault?.();
    dispatch((previous) => applyPresentWorkspaceDropCommand(previous, step.command, context));
  }, [context, dispatch]);

  const onConfirm = useCallback((): void => {
    dispatch((previous) => applyPresentWorkspaceDropCommand(previous, { kind: 'confirm' }, context));
  }, [context, dispatch]);

  const onDismiss = useCallback((): void => {
    dispatch((previous) => applyPresentWorkspaceDropCommand(previous, { kind: 'dismiss' }, context));
  }, [context, dispatch]);

  const onChooseIntent = useCallback((intent: WorkspaceDropIntent): void => {
    dispatch((previous) => applyPresentWorkspaceDropCommand(previous, { kind: 'choose', intent }, context));
  }, [context, dispatch]);

  return { state, onDragSession, onDragOver, onDragLeave, onDrop, onKeyDown, onConfirm, onDismiss, onChooseIntent };
}
