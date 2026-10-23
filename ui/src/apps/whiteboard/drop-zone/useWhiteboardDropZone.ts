// STATUS: PLATIN — Integration & Release, **Paket 11**: die Anbindung der Whiteboard-Leinwand an die Ablagezone
//
// ## Warum hier **kein** zweiter Zieh-Mechanismus steht
//
// Dies ist die **Empfängerseite**. Sie führt **keine** eigene Zieh-Session und misst **keine** Schwelle: die
// Zugschwelle und der Langdruck sind anderswo entschieden (`DRAG_THRESHOLD_PX` / `DRAG_TOUCH_LONGPRESS_MS` in
// Paket 5/6, `whiteboardDropZoneTouch.ts` in Paket 11), und die Zustellung entscheidet die **Matrix**.
//
// Diese Schicht **übersetzt nur** — wie `dragSessionBindings` in Paket 5: je Ereignis ein Aufruf, **kein** eigener
// Zweig über Fachlichkeit. *Ein Zweig hier wäre eine zweite Wahrheit.* Deshalb kommen auch die Regeln „ein neuer
// Zug löst einen entschiedenen Fall ab", „ein bewegter Zeiger überschreibt nichts Entschiedenes" und „Verlassen
// schließt nur Überfahrenes" **aus dem reinen Modul**.
//
// ## Der Inhalt kommt erst bei der Ablage — und das ist der Punkt
//
// Während `dragenter` / `dragover` liegt der Ablagespeicher im **geschützten** Modus: `getData()` liefert nichts,
// `types` dagegen schon. Deshalb fragt diese Schicht zuerst `isWhiteboardWorkspaceDrag` (nur `types`) und ruft
// `preventDefault()` — *ohne das gäbe es nie ein `drop`*. Der **Inhalt** wird beim Überfahren gelesen, wenn er
// sich lesen lässt; sonst bleibt das Urteil fail-closed (`reject` / `object-kind-unknown`), und die Zone **sagt
// an**, dass sie den Träger noch nicht lesen kann. Bei der Ablage wird er **neu** gelesen.
//
// ## Warum Dateizüge **nicht** beansprucht werden
//
// Ein Zug mit Bildern oder PDFs gehört der Seite (`useWhiteboardObjectInsertion`, `whiteboardDropPolicy`): er
// trägt die Workspace-MIME **nicht**, und diese Schicht rührt ihn nicht an. *Zwei Empfänger für eine Ablage
// wären zwei Antworten.*
//
// ## Was hier `NOT_TESTED` bleibt
//
// Das **Binden** selbst — `dragenter`, `dragover`, `dragleave`, `drop`, `keydown` — dafür braucht es einen
// Browser mit Ereignissen, den diese Umgebung nicht hat. Geprüft sind die reinen Übersetzer
// (`isWhiteboardWorkspaceDrag`, `readWhiteboardWorkspaceTransfer`, `resolveWhiteboardDropCommand`) und die Regeln.
import { useCallback, useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceDropIntent } from '../../../shared/workspace-interaction';
import type { DragSessionState } from '../../../shell/workspace/drag/dragSession';
import type { DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import { normalizePointerType } from '../model/whiteboardInkEngine';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  applyWhiteboardDropCommand,
  chooseWhiteboardDropIntent,
  confirmWhiteboardDropZone,
  createWhiteboardDropZone,
  dropWhiteboardDropZone,
  hoverWhiteboardDropZone,
  isWhiteboardWorkspaceDrag,
  leaveWhiteboardDropZone,
  readWhiteboardWorkspaceTransfer,
  resolveWhiteboardDropCommand,
  whiteboardDropZoneFromDragSession,
} from './whiteboardDropZone';
import type { WhiteboardDropZoneContext } from './whiteboardDropZone';
import type { WhiteboardDropResolution, WhiteboardDropZoneState, WhiteboardDropZoneStep } from './whiteboardDropZoneContract';

export interface WhiteboardDropZoneOptions {
  /** Die Fläche **ist** dieses Dokument — die Zielkennung und die eigene App werden nicht geraten. */
  readonly targetDocument: WorkspaceDocument;
  /** Die im Workspace **bekannten** Dokumente — fehlt die Quelle, sagt das der Resolver (benannt). */
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  /**
   * Wird gerufen, sobald eine Zustellung WIRKLICH bestaetigt ist — GAP-0042, Runde 316.
   *
   * WARUM DER HOOK NUR MELDET UND NICHT SCHREIBT: er kennt die Aufloesung
   * (`state.decision.resolution`), aber weder die Items der Flaeche noch eine
   * Ablageposition. Der Aufrufer kennt beides. Eine Zustellung, die hier
   * "verbraucht" aussaehe, ohne dass jemand die Items kennt, waere genau der
   * Zustand, den GAP-0042 beschreibt: eine Meldung ohne Handlung.
   *
   * UND WARUM ER NICHT `delivered` HEISST: `delivered` beschreibt in diesem
   * Modul die Aufloesung der Route, nicht die Annahme im Zielmodell. Wer
   * verbraucht, entscheidet der Aufrufer mit `acceptWhiteboardTableDrop` — und
   * der kann ablehnen, mit einem benannten Grund.
   */
  readonly onDelivered?: (resolution: WhiteboardDropResolution) => void;
}

export interface WhiteboardDropZoneBindings {
  readonly state: WhiteboardDropZoneState;
  /**
   * Die Eingabeart, mit der die Zone gerade bedient wird — sie entscheidet **nur** die angezeigte Strategie
   * (Paket 6: Langdruck, Toleranz, Zeigerfreiheit). Die Übersetzung aus `PointerEvent.pointerType` wird
   * **nicht** hier erfunden: sie kommt aus `normalizePointerType` (die eine Übersetzung dieses Typs).
   */
  readonly inputKind: DragInputKind;
  readonly notePointerType: (pointerType: unknown) => void;
  readonly onDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  /** Der Empfänger folgt einer **laufenden** Zieh-Session aus Paket 5 (Zeiger-Zug derselben Shell). */
  readonly onDragSession: (session: DragSessionState) => void;
  readonly confirm: () => void;
  readonly chooseIntent: (intent: WorkspaceDropIntent) => void;
  readonly dismiss: () => void;
}

/** Der Elementname eines Ereignisziels — **strukturell** gelesen, ohne DOM-Klassen zu laden. */
function targetTagName(target: unknown): string {
  if (!target || typeof target !== 'object') return '';
  const candidate = target as { readonly tagName?: unknown };
  return typeof candidate.tagName === 'string' ? candidate.tagName.toLowerCase() : '';
}

/** Ob das Ereignis in ein Eingabefeld geht — dort wird **nicht** abgelegt. */
function isTypingTarget(target: unknown): boolean {
  const tag = targetTagName(target);
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (!target || typeof target !== 'object') return false;
  return (target as { readonly isContentEditable?: unknown }).isContentEditable === true;
}

export function useWhiteboardDropZone(options: WhiteboardDropZoneOptions): WhiteboardDropZoneBindings {
  const { targetDocument, documents } = options;
  const targetDocumentId = targetDocument.id;
  const targetApp = targetDocument.kind;
  const [state, setState] = useState<WhiteboardDropZoneState>(() => createWhiteboardDropZone());
  const [inputKind, setInputKind] = useState<DragInputKind>('mouse');
  const notePointerType = useCallback((pointerType: unknown) => {
    setInputKind(normalizePointerType(typeof pointerType === 'string' ? pointerType : undefined));
  }, []);
  const documentsById = useMemo(() => {
    const record: Record<string, WorkspaceDocument> = {};
    for (const document of Object.values(documents ?? {})) record[document.id] = document;
    // Das **Ziel** ist diese Fläche — es ist immer bekannt, auch wenn die Shell es nicht mitliefert.
    record[targetDocument.id] = targetDocument;
    return record;
  }, [documents, targetDocument]);
  /**
   * Die **eine** Autorität (Paket 4): die versiegelte Matrix der Shell. Hier wird **keine** zweite gebaut und
   * **keine** zweite Erlaubnisliste geführt.
   */
  const context = useMemo<WhiteboardDropZoneContext>(
    () => ({ registry: FABRIC_WORKSPACE_DROP_REGISTRY, targetApp, targetDocumentId, documents: documentsById }),
    [documentsById, targetApp, targetDocumentId],
  );
  const apply = useCallback((step: WhiteboardDropZoneStep) => {
    setState(step.state);
  }, []);

  const onDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    // Nur **unser** Zug: der Inhalt ist hier noch nicht lesbar, die MIME-Art aber schon.
    if (!isWhiteboardWorkspaceDrag(event.dataTransfer)) return;
    event.preventDefault();
    const read = readWhiteboardWorkspaceTransfer(event.dataTransfer);
    setState((current) =>
      hoverWhiteboardDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
  }, [context]);

  const onDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!isWhiteboardWorkspaceDrag(event.dataTransfer)) return;
    // `preventDefault` **muss** sein, sonst gibt es kein `drop` — entschieden wird hier aber nichts.
    event.preventDefault();
    const read = readWhiteboardWorkspaceTransfer(event.dataTransfer);
    setState((current) =>
      hoverWhiteboardDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
  }, [context]);

  const onDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const related = event.relatedTarget;
    if (related && event.currentTarget.contains(related as Node)) return; // nur das Verlassen der Fläche zählt
    setState((current) => leaveWhiteboardDropZone(current, 'drag-left').state);
  }, []);

  const onDrop = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!isWhiteboardWorkspaceDrag(event.dataTransfer)) return; // Dateien gehören der Seite
    event.preventDefault();
    const read = readWhiteboardWorkspaceTransfer(event.dataTransfer);
    // Auch ohne lesbaren Inhalt wird **benannt** abgelehnt statt still verschluckt: `undefined` führt im reinen
    // Modul zu `whiteboard-drop-transfer-missing` und damit zu einer angesagten Ablehnung.
    setState((current) => dropWhiteboardDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
  }, [context]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
    // Enter/Leertaste auf einem Knopf gehören dem Knopf — sonst liefe dieselbe Zustellung zweimal.
    if (targetTagName(event.target) === 'button' && (event.key === 'Enter' || event.key === ' ')) return;
    const resolved = resolveWhiteboardDropCommand(state, event.key);
    if (!resolved.ok) return;
    event.preventDefault();
    // Die Zone wurde **ohne Zeiger** bedient — das ist die Eingabeart, die die Anzeige nennen muss.
    setInputKind('keyboard');
    apply(applyWhiteboardDropCommand(state, resolved.command, context));
  }, [apply, context, state]);

  const onDragSession = useCallback((session: DragSessionState) => {
    setState((current) => whiteboardDropZoneFromDragSession(current, session, context).state);
  }, [context]);

  const confirm = useCallback(() => {
    const step = confirmWhiteboardDropZone(state, context);
    apply(step);
    // GAP-0042, Runde 316: DIE MELDUNG AN DEN VERBRAUCHER.
    //
    // GEMESSEN in den Runden 263/264: das Whiteboard hatte 23 Lesezugriffe auf
    // die Zustellung und 0 Schreibstellen. Hier entsteht der eine Uebergang,
    // der fehlte — und er ist bewusst NUR eine Meldung: ob die Zustellung
    // angenommen wird, entscheidet `acceptWhiteboardTableDrop` beim Aufrufer,
    // und der kann mit einem benannten Grund ablehnen. Eine Zustellung, die
    // hier als verbraucht gaelte, waere die alte Meldung ohne Handlung.
    if (step.state.decision.kind === 'delivered') {
      options.onDelivered?.(step.state.decision.resolution);
    }
  }, [apply, context, options, state]);

  const chooseIntent = useCallback((intent: WorkspaceDropIntent) => {
    apply(chooseWhiteboardDropIntent(state, intent, context));
  }, [apply, context, state]);

  const dismiss = useCallback(() => {
    apply(leaveWhiteboardDropZone(state, 'keyboard-dismiss'));
  }, [apply, state]);

  return { state, inputKind, notePointerType, onDragEnter, onDragOver, onDragLeave, onDrop, onKeyDown, onDragSession, confirm, chooseIntent, dismiss };
}
