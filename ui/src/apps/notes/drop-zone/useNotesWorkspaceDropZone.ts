// STATUS: PLATIN — Integration & Release, **Paket 12**: die Anbindung der Notes-Flächen an die Ablagezone
//
// ## Warum hier **kein** zweiter Zieh-Mechanismus steht
//
// Dies ist die **Empfängerseite**. Sie führt **keine** eigene Zieh-Session, misst **keine** Schwelle und setzt
// **keinen** Zeiger fest: die Zugschwelle und der Langdruck sind anderswo entschieden (`DRAG_THRESHOLD_PX` in
// Paket 5, `DRAG_TOUCH_LONGPRESS_MS` in Paket 6, `notesDropZoneTouch.ts` in diesem Paket), und die Zustellung
// entscheidet die **Matrix**. Die Notes-Leinwand behält ihre eigenen Gesten (Karten bewegen, Tinte, Scrollen).
//
// Diese Schicht **übersetzt nur** — wie `dragSessionBindings` in Paket 5: je Ereignis ein Aufruf, **kein** eigener
// Zweig über Fachlichkeit. Deshalb kommen auch die Regeln „eine andere Fläche ist eine neue Tatsache", „ein
// entschiedener Fall bleibt stehen" und „Verlassen schließt nur die überfahrene Fläche" **aus dem reinen Modul**.
//
// ## Der Inhalt kommt erst bei der Ablage — und das ist der Punkt
//
// Während `dragenter` / `dragover` liegt der Ablagespeicher im **geschützten** Modus: `getData()` liefert nichts,
// `types` dagegen schon. Deshalb fragt diese Schicht zuerst `isNotesWorkspaceDrag` (nur `types`) und ruft
// `preventDefault()` — *ohne das gäbe es nie ein `drop`* (P1-Defekt `W-443` in Paket 9). Der **Inhalt** wird beim
// Überfahren gelesen, wenn er sich lesen lässt; sonst bleibt das Urteil fail-closed (`reject`), und die Zone sagt
// an, dass sie den Träger noch nicht lesen kann. Bei der Ablage wird er **neu** gelesen.
//
// ## Warum die **vorhandene** Notes-Ablage unangetastet bleibt
//
// Ein Zug mit Dateien oder mit einem **Seitenverweis** (`NOTE_PAGE_DRAG_MIME`, `notesCanvasDrop`) trägt die
// Workspace-MIME **nicht**: diese Schicht rührt ihn nicht an, und der vorhandene Empfänger (`NotesFreeCanvas`)
// behält seine Ablage. *Zwei Empfänger für eine Ablage wären zwei Antworten.* Der Workspace-Träger wird **genau
// einmal** beansprucht: hier.
//
// ## Eine Maschine, zwei benannte Flächen
//
// Die Leinwand und die Seitenliste bekommen **je einen** Satz Handler (`surfaces.canvas` / `surfaces['page-list']`),
// aber **einen** Zustand: *zwei Maschinen für dieselbe Zustellung wären zwei Wahrheiten.* Welche Fläche der Zeiger
// überfährt, steht im Zustand (`surface`) und wird dem reinen Modul als Fläche gereicht — es prüft den Namen und
// lehnt einen unbekannten **benannt** ab.
//
// ## Was hier `NOT_TESTED` bleibt
//
// Das **Binden** selbst — `dragenter`, `dragover`, `dragleave`, `drop`, `keydown`, `pointerdown` — dafür braucht es
// einen Browser mit Ereignissen, den diese Umgebung nicht hat. Geprüft sind die reinen Übersetzer
// (`isNotesWorkspaceDrag`, `readNotesWorkspaceTransfer`, `resolveNotesDropCommand`) und die Regeln.
import { useCallback, useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceDropIntent, WorkspaceLiveMode } from '../../../shared/workspace-interaction';
import type { DragInputKind } from '../../../shell/workspace/drag/dragDropVerdict';
import type { DragSessionState } from '../../../shell/workspace/drag/dragSession';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  NOTES_DROP_ZONE_SURFACES,
  type NotesDropZoneState,
  type NotesDropZoneStep,
  type NotesDropZoneSurface,
} from './notesDropZoneContract';
import {
  applyNotesDropCommand,
  chooseNotesDropIntent,
  confirmNotesDropZone,
  createNotesDropZone,
  dropNotesDropZone,
  enterNotesDropZone,
  hoverNotesDropZone,
  isNotesWorkspaceDrag,
  leaveNotesDropZone,
  notesDropZoneFromDragSession,
  readNotesWorkspaceTransfer,
  resolveNotesDropCommand,
} from './notesDropZone';
import type { NotesDropZoneContext } from './notesDropZone';
import { notesDropInputKindFromPointerType } from './notesDropZoneTouch';

/**
 * Die im Workspace **bekannten** Dokumente — in **beiden** Formen, die diese Anwendung führt: die Shell reicht der
 * Notes-Ansicht ein `WorkspaceDocument[]` (wie allen anderen Notes-Ansichten), eine Prüfung reicht eine Zuordnung.
 * *Dieselben Dokumente, nur einmal nach Kennung geordnet — keine zweite Quelle.*
 */
export type NotesWorkspaceDocuments = readonly WorkspaceDocument[] | Readonly<Record<string, WorkspaceDocument>>;

export interface NotesWorkspaceDropZoneOptions {
  /** Die Fläche **ist** dieses Dokument — die Zielkennung und die eigene App werden nicht geraten. */
  readonly targetDocument: WorkspaceDocument;
  /** Die im Workspace **bekannten** Dokumente — fehlt die Quelle, sagt das der Resolver (benannt). */
  readonly documents: NotesWorkspaceDocuments;
}

/** Die Handler **einer** benannten Fläche — dieselben fünf Aufrufe, nur mit ihrem Flächennamen. */
export interface NotesWorkspaceDropZoneSurfaceHandlers {
  readonly onDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export interface NotesWorkspaceDropZoneBindings {
  readonly state: NotesDropZoneState;
  /**
   * Die Eingabeart, mit der die Zone gerade bedient wird — sie entscheidet **nur** die angezeigte Strategie
   * (Paket 6: Langdruck, Toleranz, Zeigerfreiheit). Die Übersetzung aus `PointerEvent.pointerType` wird **nicht**
   * hier erfunden: sie kommt aus der einen Übersetzung der Notes-Tinte (`normalizePointerType`).
   */
  readonly inputKind: DragInputKind;
  readonly notePointerType: (pointerType: unknown) => void;
  /** Die Handler je **benannter** Fläche — eine Maschine, zwei Orte. */
  readonly surfaces: Readonly<Record<NotesDropZoneSurface, NotesWorkspaceDropZoneSurfaceHandlers>>;
  /** Der Empfänger folgt einer **laufenden** Zieh-Session aus Paket 5 (Zeiger-Zug derselben Shell). */
  readonly onDragSession: (session: DragSessionState) => void;
  readonly confirm: () => void;
  readonly chooseIntent: (intent: WorkspaceDropIntent, mode?: WorkspaceLiveMode) => void;
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

export function useNotesWorkspaceDropZone(options: NotesWorkspaceDropZoneOptions): NotesWorkspaceDropZoneBindings {
  const { targetDocument, documents } = options;
  const targetDocumentId = targetDocument.id;
  const targetApp = targetDocument.kind;
  const [state, setState] = useState<NotesDropZoneState>(() => createNotesDropZone());
  const [inputKind, setInputKind] = useState<DragInputKind>('mouse');
  const notePointerType = useCallback((pointerType: unknown) => {
    setInputKind(notesDropInputKindFromPointerType(pointerType));
  }, []);
  const documentsById = useMemo(() => {
    const record: Record<string, WorkspaceDocument> = {};
    const list: readonly WorkspaceDocument[] = Array.isArray(documents) ? documents : Object.values(documents ?? {});
    for (const document of list) record[document.id] = document;
    // Das **Ziel** ist diese Fläche — es ist immer bekannt, auch wenn die Shell es nicht mitliefert.
    record[targetDocument.id] = targetDocument;
    return record;
  }, [documents, targetDocument]);
  /**
   * Die **eine** Autorität (Paket 4): die versiegelte Matrix der Shell. Hier wird **keine** zweite gebaut und
   * **keine** zweite Erlaubnisliste geführt. Die Fläche ist die einzige Angabe, die je Aufruf wechselt.
   */
  const contextFor = useCallback(
    (surface: NotesDropZoneSurface): NotesDropZoneContext => ({
      registry: FABRIC_WORKSPACE_DROP_REGISTRY,
      targetApp,
      targetDocumentId,
      documents: documentsById,
      surface,
    }),
    [documentsById, targetApp, targetDocumentId],
  );
  const apply = useCallback((step: NotesDropZoneStep) => {
    setState(step.state);
  }, []);

  const surfaces = useMemo(() => {
    const build = (surface: NotesDropZoneSurface): NotesWorkspaceDropZoneSurfaceHandlers => {
      const context = contextFor(surface);
      return {
        onDragEnter: (event) => {
          // Nur **unser** Zug: der Inhalt ist hier noch nicht lesbar, die MIME-Art aber schon.
          if (!isNotesWorkspaceDrag(event.dataTransfer)) return;
          event.preventDefault();
          const read = readNotesWorkspaceTransfer(event.dataTransfer);
          setState((current) => enterNotesDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
        },
        onDragOver: (event) => {
          if (!isNotesWorkspaceDrag(event.dataTransfer)) return;
          // `preventDefault` **muss** sein, sonst gibt es kein `drop` — entschieden wird hier aber nichts.
          event.preventDefault();
          const read = readNotesWorkspaceTransfer(event.dataTransfer);
          setState((current) => hoverNotesDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
        },
        onDragLeave: (event) => {
          const related = event.relatedTarget;
          if (related && event.currentTarget.contains(related as Node)) return; // nur das Verlassen der Fläche zählt
          setState((current) => leaveNotesDropZone(current, context, 'drag-left').state);
        },
        onDrop: (event) => {
          if (!isNotesWorkspaceDrag(event.dataTransfer)) return; // Dateien und Seitenverweise gehören der Seite
          event.preventDefault();
          // Der Inhalt wird **hier** gelesen, nicht beim Überfahren: im protected mode liefert `getData()` während
          // `dragover` nichts (W-443). Auch ohne lesbaren Inhalt wird **benannt** abgelehnt statt still
          // verschluckt: `undefined` führt im reinen Modul zu `notes-drop-transfer-missing`.
          const read = readNotesWorkspaceTransfer(event.dataTransfer);
          setState((current) => dropNotesDropZone(current, { ...context, payload: read.ok ? read.payload : undefined }).state);
        },
        onKeyDown: (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (isTypingTarget(event.target)) return;
          // Enter/Leertaste auf einem Knopf gehören dem Knopf — sonst liefe dieselbe Zustellung zweimal.
          if (targetTagName(event.target) === 'button' && (event.key === 'Enter' || event.key === ' ')) return;
          const resolved = resolveNotesDropCommand(state, event.key);
          if (!resolved.ok) return;
          event.preventDefault();
          // Die Zone wurde **ohne Zeiger** bedient — das ist die Eingabeart, die die Anzeige nennen muss.
          setInputKind('keyboard');
          apply(applyNotesDropCommand(state, resolved.command, context));
        },
      };
    };
    const built: Partial<Record<NotesDropZoneSurface, NotesWorkspaceDropZoneSurfaceHandlers>> = {};
    for (const surface of NOTES_DROP_ZONE_SURFACES) built[surface] = build(surface);
    return built as Record<NotesDropZoneSurface, NotesWorkspaceDropZoneSurfaceHandlers>;
  }, [apply, contextFor, state]);

  const onDragSession = useCallback((session: DragSessionState) => {
    setState((current) => notesDropZoneFromDragSession(current, session, contextFor('canvas')).state);
  }, [contextFor]);

  const confirm = useCallback(() => {
    apply(confirmNotesDropZone(state, contextFor(state.surface ?? 'canvas')));
  }, [apply, contextFor, state]);

  /**
   * **Die gewählte Absicht — mit oder ohne gesagten Modus** (Paket 15). Ohne Modus wird das Feld **gar nicht**
   * gesetzt: *ein `requestedMode: undefined` wäre der heimliche Default, den Paket 15 verbietet* — und der Resolver
   * antwortet dann **benannt** (`drop_live_mode_required`) statt still einen Modus zu wählen.
   */
  const chooseIntent = useCallback((intent: WorkspaceDropIntent, mode?: WorkspaceLiveMode) => {
    const context = contextFor(state.surface ?? 'canvas');
    apply(chooseNotesDropIntent(state, intent, mode === undefined ? context : { ...context, requestedMode: mode }));
  }, [apply, contextFor, state]);

  const dismiss = useCallback(() => {
    apply(leaveNotesDropZone(state, contextFor(state.surface ?? 'canvas'), 'keyboard-dismiss'));
  }, [apply, contextFor, state]);

  return { state, inputKind, notePointerType, surfaces, onDragSession, confirm, chooseIntent, dismiss };
}
