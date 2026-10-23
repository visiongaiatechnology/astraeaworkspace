// STATUS: PLATIN — Integration & Release, **Paket 14**: die Anbindung der Draw-Leinwand an die Ablagezone
//
// ## Warum hier **kein** zweiter Zieh-Mechanismus steht
//
// Dies ist die **Empfängerseite**. Sie führt **keine** eigene Zieh-Session und misst **keine** Schwelle: die
// Zugschwelle und der Langdruck sind anderswo entschieden (`DRAG_THRESHOLD_PX` / `DRAG_TOUCH_LONGPRESS_MS` in
// Paket 5/6, `drawDropZoneTouch.ts` in Paket 14), und die Route entscheidet die **Matrix**.
//
// Diese Schicht **übersetzt nur** — wie `dragSessionBindings` in Paket 5: je Ereignis ein Aufruf, **kein** eigener
// Zweig über Fachlichkeit. *Ein Zweig hier wäre eine zweite Wahrheit.* Deshalb kommen auch die Regeln „ein neuer
// Zug löst einen entschiedenen Fall ab", „ein bewegter Zeiger überschreibt nichts Entschiedenes" und „Verlassen
// schließt nur Überfahrenes" **aus dem reinen Modul**.
//
// ## Der Inhalt kommt erst bei der Ablage — und das ist der Punkt
//
// Während `dragenter` / `dragover` liegt der Ablagespeicher im **geschützten** Modus: `getData()` liefert nichts,
// `types` dagegen schon. Deshalb fragt diese Schicht zuerst `isDrawWorkspaceDrag` (nur `types`) und ruft
// `preventDefault()` — *ohne das gäbe es nie ein `drop`*. Der **Inhalt** wird beim Überfahren gelesen, wenn er
// sich lesen lässt; sonst bleibt das Urteil fail-closed (`reject` / `object-kind-unknown`), und die Zone **sagt
// an**, dass sie den Träger noch nicht lesen kann. Bei der Ablage wird er **neu** gelesen. **Genau dieser
// `types`-Blick war der P1-Defekt `W-443` in Paket 9 — er wird hier nicht wiederholt.**
//
// ## Warum Stempel- und Dateizüge **nicht** beansprucht werden
//
// Die Draw-Leinwand hat **zwei** vorhandene Empfänger: den Stempel-Zug (`DRAW_STENCIL_MIME`,
// `DrawInteractiveSurface`) und den Datei-Zug. Beide tragen die Workspace-MIME **nicht**, und diese Schicht rührt
// sie nicht an — sie steigt bei `isDrawWorkspaceDrag === false` **vor** jedem `preventDefault()` aus.
// *Zwei Empfänger für eine Ablage wären zwei Antworten.*
//
// ## Warum die Taste `stopPropagation` ruft
//
// Die Zone liegt **innerhalb** des Draw-Wurzelelements, und das Draw-Wurzelelement behandelt Tasten selbst
// (`drawSessionKeyDown`: `Escape` löscht die Auswahl, `Delete` löscht Objekte, Pfeile verschieben). Eine Taste,
// die die Zone als **ihren** Befehl aufgelöst hat, darf dort **nicht** ein zweites Mal wirken — *sonst würde ein
// `Escape` die Zone verwerfen **und** die Auswahl der Zeichnung löschen.* Ungebundene Tasten werden **nicht**
// abgefangen: sie gehören unverändert der Zeichenfläche.
//
// ## Was hier `NOT_TESTED` bleibt
//
// Das **Binden** selbst — `dragenter`, `dragover`, `dragleave`, `drop`, `keydown` — dafür braucht es einen Browser
// mit Ereignissen, den diese Umgebung nicht hat. Geprüft sind die reinen Übersetzer (`isDrawWorkspaceDrag`,
// `readDrawWorkspaceTransfer`, `resolveDrawDropCommand`) und die Regeln. Ebenso `NOT_TESTED`: ob die
// Tastatur-Verweisfläche den Canvas wirklich **ohne** Zeiger erreicht (Fokusreihenfolge) — dafür fehlt der Browser.
import { useCallback, useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceDropIntent } from '../../../shared/workspace-interaction';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import type { DragSessionState } from '../../../shell/workspace/drag/dragSession';
import type { DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import {
  applyDrawDropCommand,
  chooseDrawDropIntent,
  confirmDrawDropZone,
  createDrawDropZone,
  dropDrawDropZone,
  drawDropZoneFromDragSession,
  hoverDrawDropZone,
  isDrawWorkspaceDrag,
  leaveDrawDropZone,
  readDrawWorkspaceTransfer,
  resolveDrawDropCommand,
} from './drawDropZone';
import type { DrawDropZoneContext } from './drawDropZone';
import { DRAW_DROP_ZONE_ANNOUNCER_ID } from './drawDropZoneContract';
import type { DrawDropZoneState, DrawDropZoneStep } from './drawDropZoneContract';
import { drawDropInputKindFromPointerType } from './drawDropZoneTouch';

export interface DrawDropZoneOptions {
  /** Die Fläche **ist** dieses Dokument — die Zielkennung und die eigene App werden nicht geraten. */
  readonly targetDocument: WorkspaceDocument;
  /**
   * Die im Workspace **bekannten** Dokumente. Die Shell reicht Draw eine **Liste** (`workspaceDocuments`), der
   * Resolver braucht eine **Zuordnung** — die Übersetzung entsteht hier, **einmal**, statt in jeder Zone.
   * Fehlt die Quelle, sagt das der Resolver (benannt).
   */
  readonly documents?: readonly WorkspaceDocument[];
}

export interface DrawDropZoneBindings {
  readonly state: DrawDropZoneState;
  /**
   * Die Eingabeart, mit der die Zone gerade bedient wird — sie entscheidet **nur** die angezeigte Strategie
   * (Paket 6: Langdruck, Toleranz, Zeigerfreiheit). Die Übersetzung aus `PointerEvent.pointerType` kommt aus
   * `drawDropInputKindFromPointerType` (die **eine** Übersetzung dieses Typs in Draw).
   */
  readonly inputKind: DragInputKind;
  /** Die **eine** Ansageregion dieser Fläche — die Fläche beschreibt sich damit (`aria-describedby`). */
  readonly announcerId: string;
  readonly notePointerType: (pointerType: unknown) => void;
  readonly onDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  /**
   * Der Empfänger folgt einer **laufenden** Zieh-Session aus Paket 5 (Zeiger-Zug derselben Shell).
   * *Die Draw-Oberfläche treibt heute keine solche Sitzung — die Brücke ist modelliert und geprüft, aber in der
   * Produktion **nicht gebunden**; das wird berichtet, nicht behauptet.*
   */
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

export function useDrawDropZone(options: DrawDropZoneOptions): DrawDropZoneBindings {
  const { targetDocument, documents } = options;
  const targetDocumentId = targetDocument.id;
  const targetApp = targetDocument.kind;
  const [state, setState] = useState<DrawDropZoneState>(() => createDrawDropZone());
  const [inputKind, setInputKind] = useState<DragInputKind>('mouse');
  const notePointerType = useCallback((pointerType: unknown) => {
    setInputKind(drawDropInputKindFromPointerType(pointerType));
  }, []);
  const documentsById = useMemo(() => {
    const record: Record<string, WorkspaceDocument> = {};
    for (const entry of documents ?? []) record[entry.id] = entry;
    // Das **Ziel** ist diese Fläche — es ist immer bekannt, auch wenn die Shell es nicht mitliefert.
    record[targetDocument.id] = targetDocument;
    return record;
  }, [documents, targetDocument]);
  /**
   * Die **eine** Autorität (Paket 4): die versiegelte Matrix der Shell. Hier wird **keine** zweite gebaut und
   * **keine** zweite Erlaubnisliste geführt.
   */
  const context = useMemo<DrawDropZoneContext>(
    () => ({ registry: FABRIC_WORKSPACE_DROP_REGISTRY, targetApp, targetDocumentId, documents: documentsById }),
    [documentsById, targetApp, targetDocumentId],
  );
  const apply = useCallback((step: DrawDropZoneStep) => {
    setState(step.state);
  }, []);

  const onDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    // Nur **unser** Zug: der Inhalt ist hier noch nicht lesbar, die MIME-Art aber schon.
    if (!isDrawWorkspaceDrag(event.dataTransfer)) return;
    event.preventDefault();
    const read = readDrawWorkspaceTransfer(event.dataTransfer);
    setState((current) =>
      hoverDrawDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
  }, [context]);

  const onDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!isDrawWorkspaceDrag(event.dataTransfer)) return;
    // `preventDefault` **muss** sein, sonst gibt es kein `drop` — entschieden wird hier aber nichts.
    event.preventDefault();
    const read = readDrawWorkspaceTransfer(event.dataTransfer);
    setState((current) =>
      hoverDrawDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
  }, [context]);

  const onDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const related = event.relatedTarget;
    if (related && event.currentTarget.contains(related as Node)) return; // nur das Verlassen der Fläche zählt
    setState((current) => leaveDrawDropZone(current, 'drag-left').state);
  }, []);

  const onDrop = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!isDrawWorkspaceDrag(event.dataTransfer)) return; // Stempel und Dateien gehören der Zeichenfläche
    event.preventDefault();
    const read = readDrawWorkspaceTransfer(event.dataTransfer);
    // Auch ohne lesbaren Inhalt wird **benannt** abgelehnt statt still verschluckt: `undefined` führt im reinen
    // Modul zu `draw-drop-transfer-missing` und damit zu einer angesagten Ablehnung.
    setState((current) => dropDrawDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
  }, [context]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
    // Enter/Leertaste auf einem Knopf gehören dem Knopf — sonst liefe dieselbe Auflösung zweimal.
    if (targetTagName(event.target) === 'button' && (event.key === 'Enter' || event.key === ' ')) return;
    const resolved = resolveDrawDropCommand(state, event.key);
    if (!resolved.ok) return;
    event.preventDefault();
    // **Die Taste gehört jetzt der Zone** — sonst löschte dasselbe `Escape` zusätzlich die Zeichnungsauswahl.
    event.stopPropagation();
    // Die Zone wurde **ohne Zeiger** bedient — das ist die Eingabeart, die die Anzeige nennen muss.
    setInputKind('keyboard');
    apply(applyDrawDropCommand(state, resolved.command, context));
  }, [apply, context, state]);

  const onDragSession = useCallback((session: DragSessionState) => {
    setState((current) => drawDropZoneFromDragSession(current, session, context).state);
  }, [context]);

  const confirm = useCallback(() => {
    apply(confirmDrawDropZone(state, context));
  }, [apply, context, state]);

  const chooseIntent = useCallback((intent: WorkspaceDropIntent) => {
    apply(chooseDrawDropIntent(state, intent, context));
  }, [apply, context, state]);

  const dismiss = useCallback(() => {
    apply(leaveDrawDropZone(state, 'keyboard-dismiss'));
  }, [apply, state]);

  return {
    state,
    inputKind,
    announcerId: DRAW_DROP_ZONE_ANNOUNCER_ID,
    notePointerType,
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
