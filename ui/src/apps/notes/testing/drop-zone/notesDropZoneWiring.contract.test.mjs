// STATUS: PLATIN — Integration & Release, **Paket 12**: Quellvertrag der Notes-Ablagezone
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat in diesem Projekt **keine** Node-Typen — `node:fs` ergäbe `TS2307`
// (gemessen, dreimal in diesem Projekt). Also liegt der Vertrag hier.
//
// Was dieser Vertrag **nicht** kann: das **Binden** der Zeiger-, Ablage- und Tastenereignisse auslösen — dafür
// fehlt der Browser. Er prüft, **dass** die Flächen gebunden sind, **dass** die Zone **neben** den vorhandenen
// Komponenten steht (und nicht in ihnen), **dass** die Zustellung nur über die vorhandene Matrix läuft und
// **dass** der Zug an `types` beansprucht wird (W-443). Er behauptet **nicht**, dass eine Geste ankommt.
//
// **Kommentare werden vor jeder „darf nicht vorkommen"-Prüfung entfernt**: der Kopf der Module *nennt* die
// vorhandenen Namen — *ein Satz über eine verbotene Sache ist nicht die Sache*.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const notes = path.resolve(here, '../..');
const dropDir = path.resolve(notes, 'drop-zone');

const read = (relative) => readFileSync(path.resolve(notes, relative), 'utf8');
/** Entfernt Kommentare — dieselbe Form wie in `whiteboardDropZoneWiring.contract.test.mjs`. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const editor = read('editor/NotesEditor.tsx');
const body = read('editor/NotesEditorBody.tsx');
const navigation = read('navigation/NotesEditorNavigation.tsx');
const pageList = read('navigation/NotesPagesList.tsx');
const canvas = read('canvas/NotesFreeCanvas.tsx');
/**
 * Die eine Autorität der Shell — **gelesen**. Der Notes-Eintrag darin ist **koordiniert** gesetzt (Manifest +
 * Adapter, Form A, hinter dem Whiteboard-Block) und wird hier als **Fremdeintrag** geprüft: *dieses Paket trägt
 * die Route nicht selbst ein* (siehe den Test unten).
 */
const shellRegistry = readFileSync(path.resolve(notes, '../../shell/fabric/fabricGraphWorkspaceDrop.ts'), 'utf8');

const dropFiles = readdirSync(dropDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
const allDropRaw = dropFiles.map((name) => read(`drop-zone/${name}`)).join('\n');
const allDropCode = code(allDropRaw);

const zone = read('drop-zone/notesDropZone.ts');
const contract = read('drop-zone/notesDropZoneContract.ts');
const touch = read('drop-zone/notesDropZoneTouch.ts');
const overlay = read('drop-zone/NotesWorkspaceDropZoneOverlay.tsx');
const surface = read('drop-zone/NotesWorkspaceDropZoneSurface.tsx');
const hook = read('drop-zone/useNotesWorkspaceDropZone.ts');
const css = read('drop-zone/notesDropZone.css');

describe('Paket 12 — die Flächen sind wirklich gebunden', () => {
  it('hängt die Ablagezone an die Notes-Oberfläche — Ziel und Dokumente werden nicht geraten', () => {
    expect(editor).toContain('useNotesWorkspaceDropZone({');
    expect(editor).toContain('targetDocument: editor.document');
    expect(editor).toContain('documents: editor.workspaceDocuments');
    expect(editor).toContain('<NotesEditorNavigation editor={editor} dropZone={workspaceDropZone} />');
    expect(editor).toContain('<NotesEditorBody editor={editor} dropZone={workspaceDropZone} />');
    expect(hook).toContain('targetDocument.id');
    expect(hook).toContain('targetDocument.kind');
    expect(hook).toContain('record[targetDocument.id] = targetDocument;');
  });

  it('bindet die **zwei** benannten Flächen: die Seitenliste und die Leinwand', () => {
    expect(navigation).toContain('<NotesWorkspaceDropZoneSurface surface="page-list" zone={dropZone}');
    expect(navigation).toContain('<NotesPagesList');
    expect(body).toContain('<NotesWorkspaceDropZoneSurface surface="canvas" zone={dropZone}');
    expect(body).toContain('<NotesFreeCanvas');
    // Die Zone **umschließt** die Fläche: erst die Zone, dann die Komponente.
    expect(navigation.indexOf('<NotesWorkspaceDropZoneSurface surface="page-list"')).toBeLessThan(navigation.indexOf('<NotesPagesList'));
    expect(body.indexOf('<NotesWorkspaceDropZoneSurface surface="canvas"')).toBeLessThan(body.indexOf('<NotesFreeCanvas'));
  });

  it('lässt die vorhandenen Komponenten unangetastet — die Zone steht **daneben**, nicht darin', () => {
    // Die Seitenliste behält ihren Baumvertrag: genau **eine** Tab-Stelle und **kein** `role="status"` im Ruhezustand
    // (`NotesPagesList.render.test.tsx` prüft beides ehrlich). Läge die Ansageregion **in** ihr, wäre dieser
    // geprüfte Vertrag still verändert worden.
    expect(pageList).not.toContain('notes-drop-zone');
    expect(pageList).not.toContain('workspaceDropZone');
    // Und die Leinwand behält ihre eigene Ablage (Dateien, Seitenverweise) und ihre Zeigergesten.
    expect(canvas).not.toContain('notes-drop-zone');
    expect(canvas).toContain('NOTE_PAGE_DRAG_MIME');
    expect(canvas).toContain('handleNotePageDrop');
    expect(canvas).toContain('onDropFiles');
  });
});

describe('Paket 12 — das Urteil kommt aus Paket 6, kein zweites', () => {
  it('liest die vorhandene Zieh-Session und das vorhandene Ablageurteil', () => {
    expect(zone).toContain("from '../../../shell/workspace/drag/dragSession'");
    expect(zone).toContain('isDragActive(');
    expect(zone).toContain("from '../../../shell/workspace/drag/dragDropVerdict'");
    expect(zone).toContain('hoverDropTarget(');
    expect(zone).toContain('commitDropTarget(');
    expect(zone).toContain('createDropTarget(');
    expect(zone).toContain('leaveDropTarget(');
    expect(touch).toContain("from '../../../shell/workspace/drag/dragDropVerdict'");
    expect(touch).toContain('dragThresholdForInput(');
    expect(touch).toContain('requiresLongPress(');
    expect(touch).toContain('isPointerFree(');
    expect(touch).toContain("from '../../../shell/workspace/drag/dragSession'");
    expect(touch).toContain('DRAG_THRESHOLD_PX');
  });

  it('erfindet kein zweites Urteil und keine zweite Zustellung', () => {
    // Das Urteil wird **gelesen**; die Zustellung entscheidet der Resolver. Kein eigener Zweig über „erlaubt".
    expect(zone).toContain('evaluateWorkspaceDrop(');
    expect(zone).toContain('resolveWorkspaceDrop(');
    expect(zone).not.toMatch(/verdict\s*[:=]\s*['"](?:accept|reject)['"]/);
    expect(zone).not.toMatch(/return\s+['"](?:accept|reject)['"]/);
  });

  it('liest die eine MIME-Konstante und reicht die versiegelte Matrix hinein', () => {
    expect(zone).toContain('FABRIC_WORKSPACE_OBJECT_DRAG_MIME');
    expect(zone).toContain("from '../../../shell/fabric/fabricGraphWorkspaceDrop'");
    expect(hook).toContain('FABRIC_WORKSPACE_DROP_REGISTRY');
    expect(hook).toContain("from '../../../shell/fabric/fabricGraphWorkspaceDrop'");
    expect(hook).toContain('registry: FABRIC_WORKSPACE_DROP_REGISTRY');
    expect(zone).toContain("from '../../../shared/workspace-interaction'");
  });

  it('baut keine zweite Matrix und trägt keine zweite Route ein', () => {
    expect(allDropCode).not.toContain('new WorkspaceInteractionRegistry');
    expect(allDropCode).not.toContain('registerAdapter');
    expect(allDropCode).not.toContain('registerAppManifest');
  });

  it('baut keinen zweiten Parser und keinen zweiten Träger', () => {
    expect(allDropCode).not.toContain('JSON.parse');
    expect(allDropCode).not.toContain('astraea.workspace.drag');
    expect(allDropCode).not.toContain('createWorkspaceDragPayload');
    expect(allDropCode).not.toContain('serializeWorkspaceDragPayload');
    expect(allDropCode).not.toContain('setData(');
    expect(allDropCode).not.toContain('application/x-astraea');
    // Der **eine** Parser (Paket 7) wird **benutzt**, nicht nachgebaut.
    expect(zone).toContain('parseWorkspaceDragPayload(');
  });

  it('führt keinen zweiten Zieh-Mechanismus und keine zweite Schwelle', () => {
    expect(allDropCode).not.toContain('setPointerCapture');
    expect(allDropCode).not.toContain('pointermove');
    expect(allDropCode).not.toContain('createDragSession(');
    expect(allDropCode).not.toContain('DRAG_THRESHOLD_PX =');
    expect(allDropCode).not.toContain('DRAG_TOUCH_LONGPRESS_MS =');
    expect(allDropCode).not.toContain('beginDrag(');
    // Keine eigene Langdruck-Zahl und keine eigene Zugschwelle: die Entscheidungen werden aus Paket 5/6 **gelesen**.
    expect(code(touch)).not.toMatch(/const [A-Z_]*LONG_PRESS[A-Z_]* = \d/);
    expect(code(touch)).not.toMatch(/const [A-Z_]*THRESHOLD[A-Z_]* = \d/);
    // Der einzige Zeiger-Handler auf der Fläche **beobachtet** — er fängt nichts ab.
    expect(surface).toContain('zone.notePointerType(event.pointerType)');
    expect(code(surface)).not.toContain('preventDefault');
    expect(code(surface)).not.toContain('setPointerCapture');
    expect(code(surface)).not.toContain('pointermove');
  });
});

describe('Paket 12 — der Zug wird an `types` beansprucht (W-443)', () => {
  it('entscheidet auf der Typenliste, weil `getData` während `dragover` geschützt ist', () => {
    // Ohne diese Unterscheidung gäbe es nie ein `preventDefault` — und damit nie ein `drop`.
    expect(zone).toContain('export function isNotesWorkspaceDrag(');
    expect(zone).toContain('FABRIC_WORKSPACE_OBJECT_DRAG_MIME');
    expect(hook).toContain('isNotesWorkspaceDrag(event.dataTransfer)');
    const firstCheck = hook.indexOf('isNotesWorkspaceDrag(event.dataTransfer)');
    const firstPrevent = hook.indexOf('event.preventDefault()');
    expect(firstCheck).toBeGreaterThan(0);
    expect(firstPrevent).toBeGreaterThan(firstCheck);
    // `dragenter`, `dragover` und `drop` rufen `preventDefault` — drei Stellen, kein Sonderfall.
    expect((code(hook).match(/event\.preventDefault\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Und der Inhalt wird bei der Ablage **neu** gelesen.
    expect(hook).toContain('readNotesWorkspaceTransfer(event.dataTransfer)');
  });

  it('beansprucht **nur** die Workspace-MIME — Dateien und Seitenverweise bleiben der Seite', () => {
    expect(hook).toContain('// Dateien und Seitenverweise gehören der Seite');
    expect(allDropCode).not.toContain('NOTE_PAGE_DRAG_MIME');
    expect(allDropCode).not.toContain("'Files'");
  });
});

describe('Paket 12 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Form und Worte', () => {
    for (const view of ['closed', 'open', 'ready', 'choice', 'refused', 'resolved']) {
      expect(contract, view).toContain(`${view}: { glyph:`);
    }
    expect(contract).toContain('NOTES_DROP_ZONE_PRESENTATION');
    expect(overlay).toContain('{presentation.glyph}');
    expect(overlay).toContain('{presentation.headline}');
    expect(overlay).toContain('data-vgt-notes-drop-zone-glyph={presentation.glyph}');
    expect(overlay).toContain('data-vgt-notes-drop-zone-pattern={presentation.pattern}');
    expect(css).toContain('.notes-drop-zone[data-vgt-notes-drop-zone-pattern="dashed"]');
    expect(css).toContain('.notes-drop-zone[data-vgt-notes-drop-zone-pattern="solid"]');
    expect(css).toContain('.notes-drop-zone[data-vgt-notes-drop-zone-pattern="double"]');
  });

  it('liest Erlaubnis, Fläche und Grund aus dem Urteil statt aus einer Anzeigefarbe', () => {
    expect(overlay).toContain('data-vgt-notes-drop-zone-verdict={state.target.verdict}');
    expect(overlay).toContain('data-vgt-notes-drop-zone-surface-text={surface}');
    expect(overlay).toContain('data-vgt-notes-drop-zone-reason={refusalCode ?? ');
    expect(overlay).toContain('notesDropZoneRefusalCode(state)');
    expect(overlay).not.toContain('className={state.phase');
  });

  it('versteckt keinen Zustand hinter Hover oder `aria-hidden`', () => {
    expect(overlay).not.toContain('opacity-0');
    expect(allDropCode).not.toContain('opacity-0');
    // Nur das **Zeichen** ist dekorativ; es steht zusätzlich als Wort und `data`-Attribut da.
    expect((overlay.match(/aria-hidden="true"/g) ?? [])).toHaveLength(1);
    expect(overlay).toContain('role="status"');
    expect(overlay).toContain('aria-live="assertive"');
    expect(overlay).toContain('aria-atomic="true"');
  });

  it('lässt die Ansageregion auch im leeren Zustand im DOM — sonst bliebe die Ansage stumm', () => {
    expect(overlay).toContain('notesDropZoneIdleAnnouncement(surface)');
    expect(overlay).toContain('data-vgt-notes-drop-zone-announcer={view}');
    // Die Ansageregion steht **vor** der bedingten Zone: sie wird nicht mit ihr geboren.
    expect(overlay.indexOf('data-vgt-notes-drop-zone-announcer')).toBeLessThan(overlay.indexOf('{visible && ('));
    // Und sie ist **beschrieben** — die fokussierbare Fläche verweist auf dieselbe Kennung.
    expect(overlay).toContain('id={notesDropZoneAnnouncerId(surface)}');
    expect(surface).toContain('aria-describedby={notesDropZoneAnnouncerId(surface)}');
  });
});

describe('Paket 12 — die Tastatur ist modelliert, nicht nachgerüstet', () => {
  it('bindet die Taste an einen Befehl und führt denselben Weg aus', () => {
    expect(hook).toContain('resolveNotesDropCommand(state, event.key)');
    expect(hook).toContain('applyNotesDropCommand(state, resolved.command, context)');
    expect(zone).toContain('export function confirmNotesDropZone(');
    expect(zone).toContain('export function chooseNotesDropIntent(');
    // Derselbe Weg: „bestätigen" im Zustand `choice` ist wörtlich die Ablage.
    expect(zone).toContain("if (state.decision.kind === 'choice') return dropNotesDropZone(state, context);");
    // Und die Tastatur braucht **kein** Überfahren: der gemeinsame Abschluss fragt den Zustand nicht danach.
    expect(zone).toContain('function commitTransfer(');
    expect(zone).toContain('return commitTransfer(state, context);');
  });

  it('ist **ohne** Zeiger erreichbar: die Fläche selbst ist fokussierbar', () => {
    // Eine Zone, die nur während eines Zeigerzuges existiert, wäre per Tastatur unerreichbar — ein Befund.
    expect(surface).toContain('tabIndex={0}');
    expect(surface).toContain('role="group"');
    expect(surface).toContain('aria-label={notesDropZoneTargetLabel(surface)}');
  });

  it('gibt jedem Knopf ein Tastenkürzel und lässt die Tastatur nicht ins Eingabefeld greifen', () => {
    expect(overlay).toContain('aria-keyshortcuts="Enter"');
    expect(overlay).toContain('aria-keyshortcuts="Escape"');
    expect(overlay).toContain('aria-keyshortcuts={choice.shortcutLabel}');
    expect(hook).toContain('isTypingTarget(event.target)');
    expect(hook).toContain('event.altKey || event.ctrlKey || event.metaKey');
  });

  it('bietet keine zeigergebundene Alternative als einzigen Weg', () => {
    expect(code(overlay)).not.toContain('onPointerDown');
    expect(code(overlay)).not.toContain('onMouseDown');
    expect(code(overlay)).not.toContain('onTouchStart');
    expect(code(overlay)).not.toMatch(/<div role="button"/);
  });
});

describe('Paket 12 — Touch ist entschieden und begründet', () => {
  it('legt `touch-action` benannt fest: `manipulation`, nie `none`', () => {
    expect(touch).toContain("NOTES_DROP_ZONE_TOUCH_ACTION: NotesDropZoneTouchAction = 'manipulation'");
    expect(touch).toContain('TOUCH_ACTION_KEEPS_PANNING');
    expect(surface).toContain('touchAction: NOTES_DROP_ZONE_TOUCH_ACTION');
    expect(allDropCode).not.toContain('touch-action: none');
    expect(allDropCode).not.toMatch(/touchAction:\s*['"]none['"]/);
    // Die Stilregel sagt **nichts** über `touch-action` — die Entscheidung lebt im reinen Modul, nicht zweimal.
    expect(code(css)).not.toMatch(/touch-action/);
    expect(code(surface)).not.toContain('preventDefault');
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session und den Langdruck aus Paket 6', () => {
    expect(touch).toContain("NOTES_DROP_ZONE_TOUCH_CANCEL_REASON: NotesDropZoneCloseReason = 'pointer-lost'");
    expect(contract).toContain("Extract<DragEndReason, 'pointer-lost' | 'window-blur'>");
    expect(touch).toContain('DRAG_TOUCH_LONGPRESS_MS');
    expect(touch).toContain('notesDropZoneTouchDragBegins(');
    // Die Eingabeart wird über die **vorhandene** Übersetzung der Notes-Tinte gelesen, nicht neu geschrieben.
    expect(touch).toContain("from '../canvas/ink/notesInkEngine'");
    expect(touch).toContain('normalizePointerType(');
  });

  it('beschreibt die Entscheidung im Markup, statt sie zu behaupten', () => {
    expect(overlay).toContain('notesDropZoneInputHint(inputKind)');
    expect(overlay).toContain('data-vgt-notes-drop-zone-input={inputKind}');
    expect(hook).toContain('notesDropInputKindFromPointerType(');
  });

  it('hält die Notes-Zone aus dem Canvas-Kollektiv der Stilregeln (keine Fremdklassen)', () => {
    expect(code(css)).not.toMatch(/\.notes-drop-zone[^{]*\{[^}]*\.notes-canvas/);
    expect(allDropRaw).toContain('NOT_TESTED');
  });
});

describe('Paket 12 — der Befund an der Grenze ist gemessen, nicht behauptet', () => {
  it('die versiegelte Matrix der Shell trägt die Notes-Route — als **Fremdeintrag**, nicht aus diesem Paket', () => {
    // Der Produktionsstand **nach** dem koordinierten Eintrag: Grid → Notes ist da (`fabric-grid-table-to-notes`,
    // Form A, hinter dem Whiteboard-Block). Der Eintrag gehört der Shell-Datei — er wurde mit den drei
    // Prüfstellen in **einem** Zug gesetzt, die den früheren Zustand festhielten.
    expect(shellRegistry).toContain("app: 'Grid'");
    expect(shellRegistry).toContain("app: 'Writer'");
    expect(shellRegistry).toContain("app: 'Present'");
    expect(shellRegistry).toContain("app: 'Notes'");
    expect(shellRegistry).toContain("targetApp: 'Notes'");
    expect(shellRegistry).toContain("id: 'fabric-grid-table-to-notes'");
    // Und **dieses Paket** trägt die Route weiterhin **nicht selbst** ein: keine zweite Matrix, kein zweiter
    // Adapter in `apps/notes/**`.
    expect(allDropCode).not.toContain("app: 'Notes'");
    expect(allDropCode).not.toContain("targetApp: 'Notes'");
  });

  it('jeder relative Import der eigenen Module zeigt auf eine vorhandene Datei', () => {
    // **Selbstkontrolle der Pfade** — auch der **type-only** Importe: ein falscher Pfad ist im Typlauf unsichtbar,
    // wenn die Datei nur Typen liefert, und würde erst beim Bündeln auffallen.
    const specifierPattern = /(?:from\s+'([^']+)'|import\s+'([^']+)')/g;
    const missing = [];
    for (const name of dropFiles) {
      const file = path.resolve(dropDir, name);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(specifierPattern)) {
        const specifier = match[1] ?? match[2];
        if (!specifier || !specifier.startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), specifier);
        const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.css`, `${base}.mjs`, path.join(base, 'index.ts')];
        if (!candidates.some((candidate) => existsSync(candidate))) missing.push(`${name} → ${specifier}`);
      }
    }
    expect(missing).toEqual([]);
  });
});