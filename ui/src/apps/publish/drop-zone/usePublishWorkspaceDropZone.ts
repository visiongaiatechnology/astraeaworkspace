// STATUS: PLATIN — Integration & Release, **Paket 13**: die Anbindung der Publish-Fläche an die Ablagezone
//
// ## Warum hier **kein** zweiter Zieh-Mechanismus steht
//
// Dies ist die **Empfängerseite**. Sie führt **keine** eigene Zieh-Session und misst **keine** Schwelle: die
// Zugschwelle und der Langdruck sind anderswo entschieden (`DRAG_THRESHOLD_PX` in Paket 5,
// `DRAG_TOUCH_LONGPRESS_MS` in Paket 6), und die Zustellung entscheidet die **Matrix**.
//
// Diese Schicht **übersetzt nur** — wie `dragSessionBindings` in Paket 5: je Ereignis ein Aufruf, **kein** eigener
// Zweig über Fachlichkeit. *Ein Zweig hier wäre eine zweite Wahrheit.*
//
// ## Die zwei Fallen, jede an genau einer Stelle
//
// **① `getData()` ist während `dragenter` / `dragover` leer** (Schutzmodus des Browsers). Deshalb fragt diese
// Schicht **zuletzt** den Inhalt und **zuerst** den Anspruch: `claimPublishWorkspaceDropZone` liest **nur**
// `dataTransfer.types`. Erst wenn der Anspruch `ok` ist, folgt `preventDefault()` — *ohne diesen Aufruf gäbe es
// nie ein `drop`, und genau das war der P1-Defekt `W-443` in Paket 9.* Gelesen wird der Träger **bei der Ablage**.
//
// **② Der Datei-Empfänger der Leinwand hat `stopPropagation()` im `drop`.** Ein Arbeitsflächen-Zug, der auf einem
// **Rahmen** abgelegt wird, erreichte einen Blasen-Handler deshalb **nie** — und verschwände still. Diese
// Schicht wird von der Ansicht in der **Capture**-Phase gebunden (`onDropCapture`), damit die Entscheidung
// „wem gehört dieser Zug" **vor** dem Rahmen fällt. Sie fällt an der MIME-Art: *genau ein Empfänger pro Zug.*
// Ist der Zug **nicht** unserer, wird **nichts** abgefangen — der Bildpfad der Leinwand bleibt unangetastet.
//
// ## Was hier `NOT_TESTED` bleibt
//
// Das **Binden** selbst — `dragenter`, `dragover`, `dragleave`, `drop`, `keydown` — dafür braucht es einen Browser
// mit Ereignissen, den diese Umgebung nicht hat. Geprüft sind die reinen Übersetzer (`isPublishWorkspaceDrag`,
// `readPublishWorkspaceTransfer`, `claim…`/`hold…`, `resolvePublishWorkspaceDropCommand`) und die Regeln.
import { useCallback, useMemo, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceDropIntent } from '../../../shared/workspace-interaction';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import type { DragSessionState } from '../../../shell/workspace/drag/dragSession';
// **Die eine Übersetzung** `pointerType` → `DragInputKind` (Paket 6, `W-446`) — *Publish führt **keine** zweite.*
import { dragInputKindFromPointerType, type DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import {
  applyPublishWorkspaceDropCommand,
  choosePublishWorkspaceDropIntent,
  claimPublishWorkspaceDropZone,
  confirmPublishWorkspaceDropZone,
  createPublishWorkspaceDropZone,
  dropPublishWorkspaceDropZone,
  holdPublishWorkspaceDropZone,
  isPublishWorkspaceDrag,
  leavePublishWorkspaceDropZone,
  publishWorkspaceDropZoneFromDragSession,
  readPublishWorkspaceTransfer,
  resolvePublishWorkspaceDropCommand,
} from './publishWorkspaceDropZone';
import type { PublishWorkspaceDataTransferLike, PublishWorkspaceDropZoneContext } from './publishWorkspaceDropZone';
import type { PublishWorkspaceDropZoneState, PublishWorkspaceDropZoneStep } from './publishWorkspaceDropZoneContract';

/** Die Ablagefläche, wie der DOM sie zeigt — **strukturell**, ohne DOM-Typen (wie `DragPointerLike` in Paket 5). */
export interface PublishDragEventLike {
  readonly dataTransfer?: (PublishWorkspaceDataTransferLike & { dropEffect?: string }) | null;
  readonly preventDefault?: () => void;
  readonly stopPropagation?: () => void;
  /** Das Element, an dem der Handler hängt — für „hat der Zeiger die Fläche wirklich verlassen". */
  readonly currentTarget?: unknown;
  readonly relatedTarget?: unknown;
}

/** Ein Tastenereignis — nur der Name der Taste, das Ziel und das Abfangen werden gebraucht. */
export interface PublishKeyEventLike {
  readonly key?: unknown;
  readonly target?: unknown;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly preventDefault?: () => void;
}

export interface PublishWorkspaceDropZoneOptions {
  /** Die Fläche **ist** dieses Dokument — die Zielkennung und die eigene App werden nicht geraten. */
  readonly targetDocument: WorkspaceDocument;
  /**
   * Die im Workspace **bekannten** Dokumente — fehlt die Quelle, sagt das der Resolver (**benannt**).
   * *Ohne Quellenliste ist das Ergebnis „keine Route" und damit fail-closed — nicht etwa ein stiller Erfolg.*
   */
  readonly documents?: Readonly<Record<string, WorkspaceDocument>>;
  /**
   * **Paket 15 — der Modus.** `'Live'` / `'Frozen'`, sobald der Nutzer ihn **gewählt** hat; **abwesend**, solange
   * nicht. Er wird als **Frage** an den Resolver gereicht (bedingt gespreizt, nie als `undefined`) — *und diese
   * Schicht erfindet keinen Default.*
   *
   * Ohne ihn bleibt ein Live-Verweis ein **benannter** Fehlschlag (`drop_live_mode_required`) — *keine stille
   * Zustellung und **kein** `route-not-capable`.*
   */
  readonly requestedMode?: unknown;
}

export interface PublishWorkspaceDropZoneBindings {
  readonly state: PublishWorkspaceDropZoneState;
  /**
   * Die Eingabeart, mit der die Zone gerade bedient wird — sie entscheidet **nur** die angezeigte Strategie
   * (Paket 6: Langdruck, Toleranz, Zeigerfreiheit). Die Übersetzung aus `PointerEvent.pointerType` wird
   * **nicht** hier erfunden: sie kommt aus der **einen** Übersetzung `dragInputKindFromPointerType` (Paket 6,
   * `W-446`) — *fail-closed ergibt Unbekanntes `'touch'`.* `'keyboard'` setzt die Zone selbst, wenn sie ohne
   * Zeiger bedient wurde: *das ist keine Zeigereingabe und hat deshalb keine Übersetzung.*
   */
  readonly inputKind: DragInputKind;
  readonly noteInputKind: (pointerType: unknown) => void;
  readonly onDragEnter: (event: PublishDragEventLike) => void;
  readonly onDragOver: (event: PublishDragEventLike) => void;
  readonly onDragLeave: (event: PublishDragEventLike) => void;
  readonly onDrop: (event: PublishDragEventLike) => void;
  readonly onKeyDown: (event: PublishKeyEventLike) => void;
  /** Der Empfänger folgt einer **laufenden** Zieh-Session aus Paket 5 — der einzige Weg zu einer echten Vorschau. */
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

/** Ob der Zeiger die Fläche **wirklich** verlassen hat — ein Wechsel zwischen Kindern ist kein Verlassen. */
function leftTheSurface(event: PublishDragEventLike): boolean {
  const related = event.relatedTarget;
  if (!related) return true;
  const host = event.currentTarget as { contains?: (node: unknown) => boolean } | null | undefined;
  if (typeof host?.contains !== 'function') return true;
  return !host.contains(related);
}

export function usePublishWorkspaceDropZone(options: PublishWorkspaceDropZoneOptions): PublishWorkspaceDropZoneBindings {
  const { targetDocument, documents, requestedMode } = options;
  const targetDocumentId = targetDocument.id;
  const targetApp = targetDocument.kind;
  const [state, setState] = useState<PublishWorkspaceDropZoneState>(() => createPublishWorkspaceDropZone());
  const [inputKind, setInputKind] = useState<DragInputKind>('mouse');
  /**
   * Der jüngste Zustand liegt **auch** in einer Referenz: Ablage und Taste brauchen ihn **synchron**, bevor React
   * neu gerendert hat — *sonst entschiede diese Schicht über einen veralteten Zustand.*
   */
  const current = useRef(state);

  const noteInputKind = useCallback((pointerType: unknown) => {
    // **Keine zweite Wahrheit** (Paket 6, `W-446`): die Übersetzung kommt aus `dragInputKindFromPointerType` —
    // *fail-closed ergibt Unbekanntes `'touch'`, also die **strengste** Regel (Langdruck nötig).*
    setInputKind(dragInputKindFromPointerType(pointerType));
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
   *
   * **Paket 15:** der Modus wird **bedingt gespreizt** — ein ausdrückliches `undefined` wäre der heimliche
   * Default, den Paket 15 verbietet. *Er wird gesagt oder gar nicht gereicht; diese Schicht erfindet keinen.*
   */
  const context = useMemo<PublishWorkspaceDropZoneContext>(
    () => ({
      registry: FABRIC_WORKSPACE_DROP_REGISTRY,
      targetApp,
      targetDocumentId,
      documents: documentsById,
      ...(requestedMode === undefined ? {} : { requestedMode }),
    }),
    [documentsById, requestedMode, targetApp, targetDocumentId],
  );

  const dispatch = useCallback((step: (previous: PublishWorkspaceDropZoneState) => PublishWorkspaceDropZoneStep): void => {
    const next = step(current.current);
    current.current = next.state;
    setState(next.state);
  }, []);

  const onDragEnter = useCallback((event: PublishDragEventLike) => {
    const dataTransfer = event.dataTransfer ?? null;
    // **Der Anspruch kommt zuerst und liest nur `types`** — der Inhalt ist hier geschützt (P1-Defekt `W-443`).
    const claim = claimPublishWorkspaceDropZone(current.current, context, dataTransfer);
    if (!claim.ok) return; // fremder Zug: der Datei-Empfänger der Leinwand behält ihn
    event.preventDefault?.();
    if (dataTransfer && typeof dataTransfer === 'object') dataTransfer.dropEffect = 'copy';
    current.current = claim.state;
    setState(claim.state);
  }, [context]);

  const onDragOver = useCallback((event: PublishDragEventLike) => {
    const dataTransfer = event.dataTransfer ?? null;
    // Beim **wiederholten** `dragover` bleibt ein entschiedener Fall stehen — *ein bewegter Zeiger überschreibt
    // keine Tatsache.* Ein **neuer** Zug (`dragenter`) darf ihn dagegen ablösen.
    const claim = holdPublishWorkspaceDropZone(current.current, context, dataTransfer);
    if (!claim.ok) return;
    event.preventDefault?.();
    if (dataTransfer && typeof dataTransfer === 'object') dataTransfer.dropEffect = 'copy';
    current.current = claim.state;
    setState(claim.state);
  }, [context]);

  const onDragLeave = useCallback((event: PublishDragEventLike) => {
    if (!leftTheSurface(event)) return;
    dispatch((previous) => leavePublishWorkspaceDropZone(previous, 'drag-left'));
  }, [dispatch]);

  const onDrop = useCallback((event: PublishDragEventLike) => {
    const dataTransfer = event.dataTransfer ?? null;
    if (!isPublishWorkspaceDrag(dataTransfer)) return; // Dateien gehören der Leinwand
    event.preventDefault?.();
    // Genau **ein** Empfänger pro Zug: der Rahmen-Drop der Leinwand ruft `stopPropagation`, und diese Schicht
    // ist in der Capture-Phase gebunden — hier wird der fremde Pfad deshalb ausdrücklich beendet.
    event.stopPropagation?.();
    // **Erst jetzt** wird der Inhalt gelesen — bei der Ablage ist `getData()` lesbar.
    const read = readPublishWorkspaceTransfer(dataTransfer);
    // Auch ohne lesbaren Inhalt wird **benannt** abgelehnt statt still verschluckt: `undefined` führt im reinen
    // Modul zu `publish-drop-transfer-missing` und damit zu einer angesagten Ablehnung.
    dispatch((previous) => dropPublishWorkspaceDropZone(previous, { ...context, payload: read.ok ? read.payload : undefined }));
  }, [context, dispatch]);

  const onKeyDown = useCallback((event: PublishKeyEventLike) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
    // Enter/Leertaste auf einem Knopf gehören dem Knopf — sonst liefe dieselbe Zustellung zweimal.
    if (targetTagName(event.target) === 'button' && (event.key === 'Enter' || event.key === ' ')) return;
    const resolved = resolvePublishWorkspaceDropCommand(current.current, event.key);
    if (!resolved.ok) return; // eine Taste, die kein Befehl ist, wird **nicht** abgefangen
    event.preventDefault?.();
    // Die Zone wurde **ohne Zeiger** bedient — das ist die Eingabeart, die die Anzeige nennen muss.
    setInputKind('keyboard');
    dispatch((previous) => applyPublishWorkspaceDropCommand(previous, resolved.command, context));
  }, [context, dispatch]);

  const onDragSession = useCallback((session: DragSessionState) => {
    dispatch((previous) => publishWorkspaceDropZoneFromDragSession(previous, session, context));
  }, [context, dispatch]);

  const confirm = useCallback(() => {
    dispatch((previous) => confirmPublishWorkspaceDropZone(previous, context));
  }, [context, dispatch]);

  const chooseIntent = useCallback((intent: WorkspaceDropIntent) => {
    dispatch((previous) => choosePublishWorkspaceDropIntent(previous, intent, context));
  }, [context, dispatch]);

  const dismiss = useCallback(() => {
    dispatch((previous) => leavePublishWorkspaceDropZone(previous, 'keyboard-dismiss'));
  }, [dispatch]);

  return {
    state,
    inputKind,
    noteInputKind,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onKeyDown,
    onDragSession,
    confirm,
    chooseIntent,
    dismiss,
  };
}
