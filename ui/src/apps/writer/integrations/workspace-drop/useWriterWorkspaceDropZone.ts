// STATUS: PLATIN — Integration & Release, **Paket 9**: die Anbindung der Writer-Fläche an das Ablageziel
//
// ## Warum hier **kein** zweiter Zieh-Mechanismus steht
//
// Dies ist die **Empfängerseite** ✓. Sie führt **keine** eigene Zieh-Session ✗ und misst **keine** Schwelle ✗:
// die Zugschwelle ✓ und der Langdruck ✓ sind anderswo entschieden (`DRAG_THRESHOLD_PX` ✓ in Paket 5 ✓,
// `WRITER_DROP_ZONE_LONG_PRESS_MS` ✓ in Paket 9 ✓), und die Zustellung entscheidet die **Matrix** ✓.
//
// Diese Schicht **übersetzt nur** ✓ — genau wie `dragSessionBindings` in Paket 5 ✓: je Ereignis ein Aufruf ✓,
// **kein** eigener Zweig über Fachlichkeit ✗. *Ein Zweig hier wäre eine zweite Wahrheit* ✓. Deshalb kommen
// auch die Regeln „ein neuer Zug löst einen entschiedenen Fall ab" ✓, „ein bewegter Zeiger überschreibt
// nichts Entschiedenes" ✓ und „Verlassen schließt nur Überfahrendes" ✓ **aus dem reinen Modul** ✓
// (`enterWriterWorkspaceDropZone` ✓ / `hoverWriterWorkspaceDropZone` ✓ / `leaveWriterWorkspaceDropZone` ✓).
//
// ## Was hier `NOT_TESTED` bleibt ✗
//
// Das **Binden** selbst ✓: `dragenter` ✓, `dragover` ✓, `dragleave` ✓, `drop` ✓, `keydown` ✓ — dafür braucht
// es einen Browser mit Ereignissen ✓, den diese Umgebung nicht hat ✓. Geprüft sind die reinen Übersetzer ✓
// (`readWriterWorkspaceTransfer` ✓, `resolveWriterWorkspaceDropCommand` ✓) und die Regeln ✓.
//
// ## Die Tastensperre für Eingabefelder
//
// Die Fläche liegt **über** dem ganzen Editor ✓; deshalb legt `onKeyDown` nur ab, wenn **kein** Eingabefeld
// das Ziel ist ✓, **keine** Zusatztaste gedrückt ist ✓ und die Taste nicht schon einem **Knopf** des
// Ablageziels gehört ✓ (sonst würden Ziffern beim Tippen verschluckt ✓ oder eine Zustellung doppelt
// ausgelöst ✓ — *ein Tastenkürzel, das Text frisst, ist kein Kürzel* ✓).
import { useCallback, useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WorkspaceDropIntent } from '../../../../shared/workspace-interaction';
import {
  applyWriterWorkspaceDropCommand,
  chooseWriterWorkspaceDropIntent,
  chooseWriterWorkspaceDropMode,
  closeWriterWorkspaceDropZone,
  confirmWriterWorkspaceDropZone,
  createWriterWorkspaceDropZone,
  dropWriterWorkspaceDropZone,
  enterWriterWorkspaceDropZone,
  hoverWriterWorkspaceDropZone,
  leaveWriterWorkspaceDropZone,
  readWriterWorkspaceTransfer,
  resolveWriterWorkspaceDropCommand,
  revealWriterWorkspaceDropZone,
  writerWorkspaceDropZoneCarriesTransfer,
} from './writerWorkspaceDropZone';
import type { WriterWorkspaceDropZoneContext } from './writerWorkspaceDropZone';
import type { WriterWorkspaceDropZoneState, WriterWorkspaceDropZoneStep } from './writerWorkspaceDropZoneContract';

export interface WriterWorkspaceDropZoneOptions {
  /** Die Oberfläche **ist** dieses Dokument ✓ — die Zielkennung wird nicht geraten ✓. */
  readonly targetDocument: WorkspaceDocument;
  /** Die im Workspace **bekannten** Dokumente ✓ — fehlt die Quelle, sagt das der Resolver ✓ (`named` ✓). */
  readonly documents: readonly WorkspaceDocument[];
}

export interface WriterWorkspaceDropZoneBindings {
  readonly state: WriterWorkspaceDropZoneState;
  readonly onDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly confirm: () => void;
  /**
   * Die Tastatur-Absicht „diese Absicht" ✓. Der **Modus** reist **mit** ✓ (Paket 15 ✓) — bleibt hier `unknown`
   * ✓ wie im Kontext ✓: *der Resolver benennt Unbekanntes selbst* ✓, und ein Knopf, der ohne Klick `Live`
   * setzt, wäre genau der Defekt, den Paket 15 beseitigt ✗✓.
   */
  readonly chooseIntent: (intent: WorkspaceDropIntent, mode?: unknown) => void;
  readonly dismiss: () => void;
}

/** Der Elementname eines Ereignisziels ✓ — **strukturell** gelesen ✓, ohne DOM-Klassen zu laden ✓. */
function targetTagName(target: unknown): string {
  if (!target || typeof target !== 'object') return '';
  const candidate = target as { readonly tagName?: unknown };
  return typeof candidate.tagName === 'string' ? candidate.tagName.toLowerCase() : '';
}

/** Ob das Ereignis in ein Eingabefeld geht ✓ — dort wird **nicht** abgelegt ✓. */
function isTypingTarget(target: unknown): boolean {
  const tag = targetTagName(target);
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (!target || typeof target !== 'object') return false;
  return (target as { readonly isContentEditable?: unknown }).isContentEditable === true;
}

export function useWriterWorkspaceDropZone(options: WriterWorkspaceDropZoneOptions): WriterWorkspaceDropZoneBindings {
  const { targetDocument, documents } = options;
  const targetDocumentId = targetDocument.id;
  const [state, setState] = useState<WriterWorkspaceDropZoneState>(() => createWriterWorkspaceDropZone(targetDocumentId));
  const documentsById = useMemo(() => {
    const record: Record<string, WorkspaceDocument> = {};
    for (const document of documents) record[document.id] = document;
    // Das **Ziel** ist diese Oberfläche ✓ — es ist immer bekannt ✓, auch wenn die Shell es nicht mitliefert ✓.
    record[targetDocument.id] = targetDocument;
    return record;
  }, [documents, targetDocument]);
  const context = useMemo<WriterWorkspaceDropZoneContext>(
    () => ({ targetDocumentId, documents: documentsById }),
    [documentsById, targetDocumentId],
  );
  const apply = useCallback((step: WriterWorkspaceDropZoneStep) => {
    setState(step.state);
  }, []);

  const onDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    // **Zuerst** die Typenliste ✓ — `getData` ist hier im protected mode `''` ✓ (W-443 ✓).
    if (!writerWorkspaceDropZoneCarriesTransfer(event.dataTransfer)) return; // fremder Träger: nicht gemeint ✓
    // `preventDefault` **muss** fallen, auch wenn der Inhalt hier noch nicht lesbar ist ✓ — sonst gibt der
    // Browser **kein** `drop` ✓ und das Ziel wäre unerreichbar ✗ (W-443 ✓).
    event.preventDefault();
    const transfer = readWriterWorkspaceTransfer(event.dataTransfer);
    setState((current) => transfer.ok
      ? enterWriterWorkspaceDropZone(current, { ...context, payload: transfer.payload }).state
      // Unlesbarer Träger (protected mode): **nichts entscheiden** ✓, nur das leere Ziel sichtbar machen ✓.
      : revealWriterWorkspaceDropZone(current, context).state);
  }, [context]);

  const onDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!writerWorkspaceDropZoneCarriesTransfer(event.dataTransfer)) return;
    // `preventDefault` **muss** sein, sonst gibt es kein `drop` ✓ — entschieden wird hier nichts ✓.
    event.preventDefault();
    const transfer = readWriterWorkspaceTransfer(event.dataTransfer);
    setState((current) => transfer.ok
      ? hoverWriterWorkspaceDropZone(current, { ...context, payload: transfer.payload }).state
      : revealWriterWorkspaceDropZone(current, context).state);
  }, [context]);

  const onDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const related = event.relatedTarget;
    if (related && event.currentTarget.contains(related as Node)) return; // nur das Verlassen der Fläche zählt ✓
    setState((current) => leaveWriterWorkspaceDropZone(current, 'drag-left').state);
  }, []);

  const onDrop = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const transfer = readWriterWorkspaceTransfer(event.dataTransfer);
    if (!transfer.ok) return; // die Seite behandelt ihre eigenen Träger ✓ (z. B. Bilddateien ✓)
    event.preventDefault();
    const payload = { ...context, payload: transfer.payload };
    setState((current) => {
      // Ein `drop` ohne vorheriges `dragenter` ist möglich ✓ — dann wird das Ziel zuerst geöffnet ✓.
      const opened = current.phase === 'closed' ? enterWriterWorkspaceDropZone(current, payload).state : current;
      return dropWriterWorkspaceDropZone(opened, payload).state;
    });
  }, [context]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
    // Enter/Leertaste auf einem Knopf gehören dem Knopf ✓ — sonst liefe dieselbe Zustellung zweimal ✓.
    if (targetTagName(event.target) === 'button' && (event.key === 'Enter' || event.key === ' ')) return;
    const resolved = resolveWriterWorkspaceDropCommand(state, event.key);
    if (!resolved.ok) return;
    event.preventDefault();
    apply(applyWriterWorkspaceDropCommand(state, resolved.command, context));
  }, [apply, context, state]);

  const confirm = useCallback(() => {
    apply(confirmWriterWorkspaceDropZone(state, context));
  }, [apply, context, state]);

  const chooseIntent = useCallback((intent: WorkspaceDropIntent, mode?: unknown) => {
    // **Der Modus reist mit der Absicht** ✓ (Paket 15 ✓): gesagt → der Modusschritt ✓; nicht gesagt → die
    // Absicht allein ✓ (und der Resolver benennt den fehlenden Modus ✓). *Kein stiller Default* ✗✓.
    apply(mode === undefined
      ? chooseWriterWorkspaceDropIntent(state, intent, context)
      : chooseWriterWorkspaceDropMode(state, mode, context));
  }, [apply, context, state]);

  const dismiss = useCallback(() => {
    apply(closeWriterWorkspaceDropZone(state, 'keyboard-dismiss'));
  }, [apply, state]);

  return { state, onDragEnter, onDragOver, onDragLeave, onDrop, onKeyDown, confirm, chooseIntent, dismiss };
}
