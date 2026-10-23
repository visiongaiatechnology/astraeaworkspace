// STATUS: PLATIN — Integration & Release, **Paket 9**: Quellvertrag der Writer-Ablagezone
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat in diesem Projekt **keine** Node-Typen ✓ — `node:fs` ergäbe
// `TS2307` ✓ (gemessen, dreimal in diesem Projekt ✓). Also liegt der Vertrag hier ✓.
//
// Was dieser Vertrag **nicht** kann ✗: das Binden der Zeiger- und Tastenereignisse auslösen ✓ — dafür fehlt
// der Browser ✓. Er prüft, **dass** die Fläche gebunden ist ✓ und **dass** die Zustellung nur über die
// vorhandene Matrix läuft ✓; er behauptet **nicht**, dass eine Geste ankommt ✓.
//
// **Kommentare werden vor jeder „darf nicht vorkommen"-Prüfung entfernt** ✓: der Kopf dieser Module *nennt*
// die vorhandenen Namen (`supportedIntents`, `FABRIC_WORKSPACE_DROP_REGISTRY` ✓) — *ein Satz über eine
// verbotene Sache ist nicht die Sache* ✓. Genau diese Verwechslung hat die erste Fassung dieses Vertrags
// dreimal rot gemacht ✓ (gemessen: `supportedIntents`, `'none'` ✓) — der Vertrag war falsch, nicht der Code ✓.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const writer = path.resolve(here, '../../..');
const read = (relative) => readFileSync(path.resolve(writer, relative), 'utf8');
/** Entfernt Kommentare — dieselbe Form wie in `writerFindingsBoundaries.contract.test.mjs` ✓. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const editor = read('editor/WriterEditor.tsx');
const zone = read('integrations/workspace-drop/writerWorkspaceDropZone.ts');
const contract = read('integrations/workspace-drop/writerWorkspaceDropZoneContract.ts');
const touch = read('integrations/workspace-drop/writerWorkspaceDropZoneTouch.ts');
const overlay = read('integrations/workspace-drop/WriterWorkspaceDropZoneOverlay.tsx');
const hook = read('integrations/workspace-drop/useWriterWorkspaceDropZone.ts');

const DROP_DIR = path.resolve(writer, 'integrations/workspace-drop');
const dropFiles = readdirSync(DROP_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);
const allDropCode = code(dropFiles.map((name) => read(`integrations/workspace-drop/${name}`)).join('\n'));

describe('Paket 9 — die Fläche ist wirklich gebunden', () => {
  it('hängt das Ablageziel an die Writer-Oberfläche', () => {
    expect(editor).toContain('useWriterWorkspaceDropZone({ targetDocument: document, documents: workspaceDocuments })');
    expect(editor).toContain('<WriterWorkspaceDropZoneOverlay');
    expect(editor).toContain('state={workspaceDropZone.state}');
    expect(editor).toContain('onConfirm={workspaceDropZone.confirm}');
    expect(editor).toContain('onChooseIntent={workspaceDropZone.chooseIntent}');
    expect(editor).toContain('onDismiss={workspaceDropZone.dismiss}');
  });

  it('bindet alle vier Zeigerereignisse und die Tastatur an die Fläche', () => {
    for (const handler of ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop', 'onKeyDown']) {
      expect(editor).toContain(`${handler}={workspaceDropZone.${handler}}`);
    }
  });

  it('nimmt genau diese Oberfläche als Ziel — die Kennung wird nicht geraten', () => {
    expect(hook).toContain('targetDocument.id');
    expect(hook).toContain('record[targetDocument.id] = targetDocument;');
  });
});

describe('Paket 9 — nur die vorhandene Route, kein privater Pfad', () => {
  it('liest die eine MIME-Konstante und die versiegelte Matrix', () => {
    expect(zone).toContain('FABRIC_WORKSPACE_OBJECT_DRAG_MIME');
    expect(zone).toContain('FABRIC_WORKSPACE_DROP_REGISTRY');
    expect(zone).toContain("from '../../../../shell/fabric/fabricGraphWorkspaceDrop'");
  });

  it('stellt über den vorhandenen Resolver zu und urteilt nicht selbst', () => {
    expect(zone).toContain('evaluateWorkspaceDrop(');
    expect(zone).toContain('resolveWorkspaceDrop(');
    expect(zone).toContain("from '../../../../shared/workspace-interaction'");
    // Eine zweite Matrix wäre eine zweite Wahrheit.
    expect(allDropCode).not.toContain('new WorkspaceInteractionRegistry');
    expect(allDropCode).not.toContain('registerAdapter');
  });

  it('baut keinen zweiten Parser und keinen zweiten Träger', () => {
    expect(allDropCode).not.toContain('JSON.parse');
    expect(allDropCode).not.toContain('astraea.workspace.drag');
    expect(allDropCode).not.toContain('supportedIntents');
    expect(allDropCode).not.toContain('createWorkspaceDragPayload');
    expect(allDropCode).not.toContain('serializeWorkspaceDragPayload');
    expect(allDropCode).not.toContain('setData(');
    expect(allDropCode).not.toContain('application/x-astraea');
  });

  it('führt keinen zweiten Zieh-Mechanismus', () => {
    expect(allDropCode).not.toContain('setPointerCapture');
    expect(allDropCode).not.toContain('pointermove');
    expect(allDropCode).not.toContain('createDragSession(');
    expect(allDropCode).not.toContain('DRAG_THRESHOLD_PX =');
  });

  it('folgt der vorhandenen Zieh-Session, statt sie nachzubauen', () => {
    expect(zone).toContain('isDragActive(session)');
    expect(zone).toContain('session.payload');
    expect(zone).toContain("from '../../../../shell/workspace/drag/dragSession'");
  });
});

describe('Paket 9 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Form und Worte', () => {
    for (const phase of ['closed', 'open', 'ready', 'choice', 'refused', 'resolved']) {
      expect(contract).toContain(`${phase}: { glyph:`);
    }
    expect(contract).toContain('WRITER_WORKSPACE_DROP_ZONE_PRESENTATION');
    expect(overlay).toContain('{state.glyph}');
    expect(overlay).toContain('{state.headline}');
    expect(overlay).toContain('{state.detail}');
    expect(overlay).toContain('data-writer-drop-zone-glyph={state.glyph}');
    expect(overlay).toContain('data-writer-drop-zone-pattern={state.pattern}');
    expect(overlay).toContain('data-writer-drop-zone-frame={state.pattern}');
  });

  it('versteckt keinen Zustand hinter Hover', () => {
    expect(overlay).not.toContain('opacity-0');
    expect(allDropCode).not.toContain('opacity-0');
  });

  it('erlaubt und verbietet über einen benannten Zustand, nicht über eine Anzeigefarbe', () => {
    expect(contract).toContain("readonly acceptance: 'unknown' | 'accepted' | 'refused';");
    expect(contract).toContain('readonly preview: WriterWorkspaceDropPreview | null;');
    expect(overlay).toContain('data-writer-drop-zone-acceptance={state.acceptance}');
    expect(overlay).toContain('data-writer-drop-zone-code={state.code ?? ');
    expect(overlay).not.toContain('className={state.phase');
  });
});

describe('Paket 9 — die Tastatur ist modelliert, nicht nachgerüstet', () => {
  it('bindet die Taste an einen Befehl und führt denselben Weg aus', () => {
    expect(hook).toContain('resolveWriterWorkspaceDropCommand(state, event.key)');
    expect(hook).toContain('applyWriterWorkspaceDropCommand(state, resolved.command, context)');
    expect(zone).toContain('export function confirmWriterWorkspaceDropZone(');
    expect(zone).toContain('export function chooseWriterWorkspaceDropIntent(');
    // Derselbe Weg: „bestätigen" im Zustand `choice` ist wörtlich die Ablage.
    expect(zone).toContain("if (state.phase === 'choice') return dropWriterWorkspaceDropZone(state, context);");
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
  });
});

describe('Paket 9 — Touch ist entschieden und begründet', () => {
  it('legt die Langdruck-Schwelle als benannte Zahl fest', () => {
    expect(touch).toContain('export const WRITER_DROP_ZONE_LONG_PRESS_MS = 450;');
    expect(touch).toContain('export function writerWorkspaceDropZoneTouchDragBegins(');
  });

  it('benutzt für die Toleranz die Schwelle der Zieh-Session statt einer zweiten Zahl', () => {
    expect(touch).toContain('DRAG_THRESHOLD_PX');
    expect(touch).toContain("from '../../../../shell/workspace/drag/dragSession'");
    expect(code(touch)).not.toMatch(/const [A-Z_]*THRESHOLD[A-Z_]* = \d/);
  });

  it('schaltet das Scrollen nicht ab — `manipulation`, nie `none`', () => {
    expect(touch).toContain("WRITER_DROP_ZONE_TOUCH_ACTION = 'manipulation'");
    expect(allDropCode).not.toContain('touch-action: none');
    expect(allDropCode).not.toMatch(/touchAction:\s*['"]none['"]/);
    expect(overlay).toContain('touchAction: WRITER_DROP_ZONE_TOUCH_ACTION');
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session', () => {
    expect(touch).toContain("WRITER_DROP_ZONE_TOUCH_CANCEL_REASON: WriterWorkspaceDropZoneCloseReason = 'pointer-lost'");
    expect(contract).toContain("Extract<DragEndReason, 'pointer-lost' | 'window-blur'>");
  });
});

describe('W-443 — die Zone entscheidet auf der Typenliste, nicht auf dem Träger', () => {
  /** Die Rümpfe von `dragenter` und `dragover` — der Befund saß genau in ihrem frühen Ausstieg. */
  const enterBody = hook.slice(hook.indexOf('const onDragEnter'), hook.indexOf('const onDragOver'));
  const overBody = hook.slice(hook.indexOf('const onDragOver'), hook.indexOf('const onDragLeave'));
  const dropBody = hook.slice(hook.indexOf('const onDrop'), hook.indexOf('const onKeyDown'));

  it('entscheidet in `dragenter`/`dragover` auf `types`, gelesen wird erst bei der Ablage', () => {
    for (const body of [enterBody, overBody]) {
      expect(body).toContain('writerWorkspaceDropZoneCarriesTransfer(event.dataTransfer)');
    }
    expect(dropBody).toContain('readWriterWorkspaceTransfer(event.dataTransfer)');
  });

  it('lässt `preventDefault()` nicht vom lesbaren Träger abhängen', () => {
    for (const body of [enterBody, overBody]) {
      const guard = body.indexOf('event.preventDefault()');
      const read = body.indexOf('readWriterWorkspaceTransfer');
      // Der Befund: `read` stand **vor** dem Guard und kehrte bei `!ok` zurück → kein `drop` (W-443).
      // Erlaubt ist: gar nicht lesen (−1) oder erst **nach** dem Guard lesen.
      expect(guard).toBeGreaterThan(-1);
      expect(read === -1 || read > guard).toBe(true);
    }
  });

  it('entscheidet auf genau der einen MIME-Konstante der Fabric-Oberfläche', () => {
    const reader = code(zone).slice(code(zone).indexOf('export function writerWorkspaceDropZoneCarriesTransfer'));
    expect(reader).toContain('FABRIC_WORKSPACE_OBJECT_DRAG_MIME');
    expect(reader).toContain('Array.from(dataTransfer.types');
    expect(reader).not.toContain('application/x-astraea');
  });

  it('entscheidet ohne lesbaren Träger nichts, sondern zeigt nur den leeren Zustand', () => {
    expect(zone).toContain('export function revealWriterWorkspaceDropZone(');
    expect(zone).toContain("if (state.phase !== 'closed') return ok(state);");
    expect(enterBody).toContain('revealWriterWorkspaceDropZone(current, context)');
    expect(overBody).toContain('revealWriterWorkspaceDropZone(current, context)');
  });
});

describe('Paket 15 — der Modus wird mitgeführt, nicht erfunden', () => {
  const zoneCode = code(zone);
  const assessBody = zoneCode.slice(zoneCode.indexOf('function assess('), zoneCode.indexOf('function applyAssessment('));
  const routeBody = zoneCode.slice(zoneCode.indexOf('function routeWithIntent('), zoneCode.indexOf('export function createWriterWorkspaceDropZone('));

  it('führt `requestedMode` bedingt in die Fähigkeitsfrage und in die Zustellung', () => {
    // *Ein ausdrückliches `undefined` wäre der heimliche Default, den Paket 15 verbietet* — also bedingtes Spreizen.
    expect(assessBody).toContain('evaluateWorkspaceDrop({');
    expect(assessBody).toContain('...(requestedMode === undefined ? {} : { requestedMode })');
    expect(routeBody).toContain('resolveWorkspaceDrop({');
    expect(routeBody).toContain('...(requestedMode === undefined ? {} : { requestedMode })');
    expect((zoneCode.match(/\.\.\.\(requestedMode === undefined \? \{\} : \{ requestedMode \}\)/g) ?? [])).toHaveLength(2);
  });

  it('erfindet nirgends einen Modus', () => {
    expect(zoneCode).not.toContain('requestedMode: undefined');
    expect(zoneCode).not.toMatch(/requestedMode\s*\?\?\s*['"](Live|Frozen)['"]/);
    expect(zoneCode).not.toMatch(/mode\s*=\s*['"](Live|Frozen)['"]/);
  });

  it('gibt dem Modusschritt denselben Weg wie der Ablage und der Absicht', () => {
    expect(zone).toContain('export function chooseWriterWorkspaceDropMode(');
    const modeBody = zoneCode.slice(zoneCode.indexOf('export function chooseWriterWorkspaceDropMode('));
    expect(modeBody).toContain('routeWithIntent(');
    expect(modeBody).toContain("'LIVE_REFERENCE'");
    expect(modeBody).toContain('mode,');
  });

  it('lässt die Zone den Modus nur durchreichen — die Regel bleibt im Resolver', () => {
    // Keine eigene Modus-Liste in der Zone: die zwei Modi stehen in `shared` (eine Definition).
    expect(zoneCode).not.toContain("'Frozen'");
    expect(code(contract)).toContain('WRITER_WORKSPACE_LIVE_MODE_LABEL');
  });
});

describe('Paket 15 — der sichtbare Wähler (Form der Notes-Zone)', () => {
  const contractCode = code(contract);
  const overlayCode = code(overlay);

  it('leitet die Modi aus dem einen Wort-Register ab, nicht aus einer zweiten Liste', () => {
    expect(contractCode).toContain('WRITER_WORKSPACE_LIVE_MODES = Object.keys(WRITER_WORKSPACE_LIVE_MODE_LABEL)');
    // Die Wörter sind die **vorhandenen**: Live-Verweis und eingefrorene Momentaufnahme.
    expect(contractCode).toContain('Live: WRITER_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE');
    expect(contractCode).toContain('Frozen: WRITER_WORKSPACE_DROP_INTENT_LABEL.FROZEN_SNAPSHOT');
    expect(contractCode).toContain('WRITER_WORKSPACE_DROP_MODE_PROMPT');
  });

  it('fragt den Modus über eine gelesene Bedingung, nicht über eine geratene', () => {
    expect(zone).toContain('export function writerWorkspaceDropZoneNeedsMode(');
    const needs = code(zone).slice(code(zone).indexOf('export function writerWorkspaceDropZoneNeedsMode('));
    expect(needs).toContain("state.code === 'drop_live_mode_required'");
    expect(needs).toContain("choice.integrationKind === 'live'");
    expect(needs).toContain('choice.mode === null');
  });

  it('bietet zwei echte Knöpfe, die den Modus MIT der Absicht sagen', () => {
    expect(overlayCode).toContain('writerWorkspaceDropZoneNeedsMode(state)');
    expect(overlayCode).toContain('WRITER_WORKSPACE_LIVE_MODES.map((mode) => (');
    expect(overlayCode).toContain('data-writer-drop-zone-mode={mode}');
    expect(overlayCode).toContain("onChooseIntent('LIVE_REFERENCE', mode)");
    expect(overlayCode).toContain('{WRITER_WORKSPACE_LIVE_MODE_LABEL[mode]}');
    // **Kein Default** ✗: kein Knopf sagt den Modus ohne den Klick.
    expect(overlayCode).not.toContain("onChooseIntent('LIVE_REFERENCE')");
    expect(overlayCode).not.toContain("requestedMode: 'Live'");
  });

  it('führt Art und Modus im Zustellungs-Markup und reicht den Modus bis in den Modusschritt', () => {
    expect(overlay).toContain('data-writer-drop-zone-resolution-kind={state.resolution.integrationKind}');
    expect(overlay).toContain("data-writer-drop-zone-resolution-mode={state.resolution.mode ?? ''}");
    expect(hook).toContain('readonly chooseIntent: (intent: WorkspaceDropIntent, mode?: unknown) => void;');
    expect(hook).toContain('chooseWriterWorkspaceDropMode(state, mode, context)');
  });
});
