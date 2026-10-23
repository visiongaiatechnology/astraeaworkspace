// STATUS: PLATIN — Integration & Release, **Paket 11**: Quellvertrag der Whiteboard-Ablagezone
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat in diesem Projekt **keine** Node-Typen — `node:fs` ergäbe `TS2307`
// (gemessen, dreimal in diesem Projekt). Also liegt der Vertrag hier.
//
// Was dieser Vertrag **nicht** kann: das **Binden** der Zeiger-, Ablage- und Tastenereignisse auslösen — dafür
// fehlt der Browser. Er prüft, **dass** die Fläche gebunden ist, **dass** die Zone **außerhalb** der Leinwand
// steht und **dass** die Zustellung nur über die vorhandene Matrix läuft; er behauptet **nicht**, dass eine Geste
// ankommt.
//
// **Kommentare werden vor jeder „darf nicht vorkommen"-Prüfung entfernt**: der Kopf der Module *nennt* die
// vorhandenen Namen — *ein Satz über eine verbotene Sache ist nicht die Sache*. (Genau diese Verwechslung hat in
// Paket 9 den ersten Vertrag dreimal rot gemacht; der Vertrag war falsch, nicht der Code.)
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const whiteboard = path.resolve(here, '../..');
const read = (relative) => readFileSync(path.resolve(whiteboard, relative), 'utf8');
/**
 * Entfernt Kommentare — dieselbe Form wie in `writerWorkspaceDropZoneWiring.contract.test.mjs`.
 *
 * UND ENTFERNT ZEILENUMBRUECHE UND MEHRFACH-LEERZEICHEN (Runde 316): der
 * Vertrag unten prueft, dass der Hook MIT diesen Argumenten gerufen wird. Er
 * prueft NICHT, in welcher Zeile die Argumente stehen. Mein erster Anlauf tat
 * das — `toContain` auf eine einzeilige Zeichenkette —, und als der Hook einen
 * dritten Parameter bekam und der Aufruf mehrzeilig wurde, fiel der Waechter,
 * OBWOHL die Bindung unveraendert bestand. Ein Waechter, der auf die FORMATIERUNG
 * hereinfoellt, meldet einen Bruch, den es nicht gibt.
 */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const entzerrt = (source) => code(source).replace(/\s+/g, ' ');

const canvas = read('app/WhiteboardCanvas.tsx');
const zone = read('drop-zone/whiteboardDropZone.ts');
const contract = read('drop-zone/whiteboardDropZoneContract.ts');
const touch = read('drop-zone/whiteboardDropZoneTouch.ts');
const overlay = read('drop-zone/WhiteboardDropZoneOverlay.tsx');
const hook = read('drop-zone/useWhiteboardDropZone.ts');
const styles = read('canvas/WhiteboardCanvas.css');

const DROP_DIR = path.resolve(whiteboard, 'drop-zone');
const dropFiles = readdirSync(DROP_DIR, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
const allDropCode = code(dropFiles.map((name) => read(`drop-zone/${name}`)).join('\n'));
const allDropRaw = dropFiles.map((name) => read(`drop-zone/${name}`)).join('\n');

describe('Paket 11 — die Fläche ist wirklich gebunden', () => {
  it('hängt die Ablagezone an die Whiteboard-Fläche', () => {
    // GEPRUEFT WIRD DIE BINDUNG, NICHT DIE ZEILE — siehe `entzerrt` oben.
    expect(entzerrt(canvas)).toContain(
      'useWhiteboardDropZone({ targetDocument: document, documents: workspaceDocuments,',
    );
    expect(canvas).toContain('<WhiteboardDropZoneOverlay');
    expect(canvas).toContain('state={workspaceDropZone.state}');
    expect(canvas).toContain('onConfirm={workspaceDropZone.confirm}');
    expect(canvas).toContain('onChooseIntent={workspaceDropZone.chooseIntent}');
    expect(canvas).toContain('onDismiss={workspaceDropZone.dismiss}');
    expect(canvas).toContain('inputKind={workspaceDropZone.inputKind}');
  });

  /**
   * GAP-0042, Runde 316: DER VERBRAUCHER IST GEBUNDEN.
   *
   * Diese Zusicherung ist NEU, und sie ist der Grund, warum der alte Vertrag
   * ueberhaupt fiel: der Hook hat einen dritten Parameter bekommen. Ohne diese
   * Zeile waere die neue Verdrahtung ungeschuetzt — ein Rueckbau des
   * `onDelivered`-Rueckrufs wuerde keinen Waechter wecken, und die Zone meldete
   * wieder eine Platzierung ohne zu platzieren.
   */
  it('bindet den Verbraucher an die Fläche', () => {
    expect(entzerrt(canvas)).toContain('onDelivered: handleWorkspaceDropDelivered');
    expect(entzerrt(canvas)).toContain('acceptWhiteboardTableDrop(');
    expect(entzerrt(canvas)).toContain('updateItems([...items, step.item])');
    expect(entzerrt(hook)).toContain("if (step.state.decision.kind === 'delivered')");
    expect(entzerrt(hook)).toContain('options.onDelivered?.(step.state.decision.resolution)');
  });

  it('bindet alle vier Zeigerereignisse und die Tastatur an die Fläche', () => {
    for (const handler of ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop']) {
      expect(canvas, handler).toContain(`workspaceDropZone.${handler}(`);
    }
    expect(canvas).toContain('onKeyDown={workspaceDropZone.onKeyDown}');
  });

  it('nimmt genau diese Fläche als Ziel — App und Kennung werden nicht geraten', () => {
    expect(hook).toContain('targetDocument.id');
    expect(hook).toContain('targetDocument.kind');
    expect(hook).toContain('record[targetDocument.id] = targetDocument;');
  });

  it('lässt den Dateipfad unangetastet und trennt die beiden Empfänger an der MIME-Art', () => {
    // Der vorhandene Datei-Empfänger bleibt gebunden (der Vertrag der Zuverlässigkeit verlangt ihn) …
    expect(canvas).toContain('isWhiteboardFileDrag(');
    expect(canvas).toContain('data-vgt-whiteboard-drop-target="true"');
    // … und die Ablage entscheidet **genau einen** Empfänger pro Zug.
    expect(canvas).toContain('if (isWhiteboardWorkspaceDrag(event.dataTransfer)) {');
    expect(canvas).toContain('workspaceDropZone.onDrop(event);');
    expect(canvas).toContain('handleCanvasDrop(event);');
  });

  it('stellt die Zone **außerhalb** der Leinwand auf — das ist die Bedingung für die Tastatur-Alternative', () => {
    // Struktureller Nachweis am Quelltext: die Zone steht **hinter** dem Inhalt der Leinwand (nach dem
    // Hinweis-Knoten im Inneren) und damit als Geschwister, nicht als Kind. *Ein DOM-Nachweis wäre stärker —
    // dafür fehlt der Browser; das ist hier ausdrücklich ein Proxy und wird so berichtet.*
    const overlayAt = canvas.indexOf('<WhiteboardDropZoneOverlay');
    const insideCanvasAt = canvas.indexOf('{/* Floating Notification Toast */}');
    expect(insideCanvasAt).toBeGreaterThan(0);
    expect(overlayAt).toBeGreaterThan(insideCanvasAt);
    // Und die Zone liegt nicht in der Welt-Transformationsschicht der Leinwand.
    expect(canvas).not.toContain('origin-top-left transition-transform duration-100 ease-out pointer-events-none" style={{\n            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`');
  });
});

describe('Paket 11 — das Urteil kommt aus Paket 6, kein zweites', () => {
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
  });

  it('erfindet kein zweites Urteil und keine zweite Zustellung', () => {
    // Das Urteil wird **gelesen**; die Zustellung entscheidet der Resolver. Kein eigener Zweig über „erlaubt".
    expect(zone).toContain('evaluateWorkspaceDrop(');
    expect(zone).toContain('resolveWorkspaceDrop(');
    expect(zone).not.toMatch(/verdict\s*[:=]\s*['"](?:accept|reject)['"]/);
    expect(zone).not.toMatch(/return\s+['"](?:accept|reject)['"]/);
  });
});

describe('Paket 11 — nur die vorhandene Route, kein privater Pfad', () => {
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
    // Keine eigene Langdruck-Zahl: die Entscheidung wird aus Paket 6 **gelesen**.
    expect(code(touch)).not.toMatch(/const [A-Z_]*LONG_PRESS[A-Z_]* = \d/);
    expect(code(touch)).not.toMatch(/const [A-Z_]*THRESHOLD[A-Z_]* = \d/);
  });
});

describe('Paket 11 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Form und Worte', () => {
    for (const view of ['closed', 'open', 'ready', 'choice', 'refused', 'resolved']) {
      expect(contract, view).toContain(`${view}: { glyph:`);
    }
    expect(contract).toContain('WHITEBOARD_DROP_ZONE_PRESENTATION');
    expect(overlay).toContain('{presentation.glyph}');
    expect(overlay).toContain('{presentation.headline}');
    expect(overlay).toContain('data-vgt-whiteboard-drop-zone-glyph={presentation.glyph}');
    expect(overlay).toContain('data-vgt-whiteboard-drop-zone-pattern={presentation.pattern}');
    expect(styles).toContain('.whiteboard-drop-zone[data-vgt-whiteboard-drop-zone-pattern="dashed"]');
    expect(styles).toContain('.whiteboard-drop-zone[data-vgt-whiteboard-drop-zone-pattern="solid"]');
    expect(styles).toContain('.whiteboard-drop-zone[data-vgt-whiteboard-drop-zone-pattern="double"]');
  });

  it('liest Erlaubnis und Grund aus dem Urteil statt aus einer Anzeigefarbe', () => {
    expect(overlay).toContain('data-vgt-whiteboard-drop-zone-verdict={state.target.verdict}');
    expect(overlay).toContain('data-vgt-whiteboard-drop-zone-reason={refusalCode ?? ');
    expect(overlay).toContain('whiteboardDropZoneRefusalCode(state)');
    expect(overlay).not.toContain('className={state.phase');
  });

  it('versteckt keinen Zustand hinter Hover oder `aria-hidden`', () => {
    expect(overlay).not.toContain('opacity-0');
    expect(allDropCode).not.toContain('opacity-0');
    // Nur das **Zeichen** ist dekorativ; es steht zusätzlich als Wort und `data`-Attribut da.
    expect((overlay.match(/aria-hidden="true"/g) ?? [])).toHaveLength(1);
    expect(overlay).toContain('role="status"');
    expect(overlay).toContain('aria-live="assertive"');
  });

  it('lässt die Ansageregion auch im leeren Zustand im DOM — sonst bliebe die Ansage stumm', () => {
    expect(overlay).toContain('WHITEBOARD_DROP_ZONE_IDLE_ANNOUNCEMENT');
    expect(overlay).toContain('data-vgt-whiteboard-drop-zone-announcer={view}');
    // Die Ansageregion steht **vor** der bedingten Zone: sie wird nicht mit ihr geboren.
    expect(overlay.indexOf('data-vgt-whiteboard-drop-zone-announcer')).toBeLessThan(overlay.indexOf('{visible && ('));
  });
});

describe('Paket 11 — die Tastatur ist modelliert, nicht nachgerüstet', () => {
  it('bindet die Taste an einen Befehl und führt denselben Weg aus', () => {
    expect(hook).toContain('resolveWhiteboardDropCommand(state, event.key)');
    expect(hook).toContain('applyWhiteboardDropCommand(state, resolved.command, context)');
    expect(zone).toContain('export function confirmWhiteboardDropZone(');
    expect(zone).toContain('export function chooseWhiteboardDropIntent(');
    // Derselbe Weg: „bestätigen" im Zustand `choice` ist wörtlich die Ablage.
    expect(zone).toContain("if (state.decision.kind === 'choice') return dropWhiteboardDropZone(state, context);");
    // Und die Tastatur braucht **kein** Überfahren: der gemeinsame Abschluss fragt den Zustand nicht danach.
    expect(zone).toContain('function commitTransfer(');
    expect(zone).toContain('return commitTransfer(state, context);');
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

describe('Paket 11 — Touch ist entschieden und begründet', () => {
  it('legt `touch-action` benannt fest: `manipulation`, nie `none`', () => {
    expect(touch).toContain("WHITEBOARD_DROP_ZONE_TOUCH_ACTION = 'manipulation'");
    expect(allDropCode).not.toContain('touch-action: none');
    expect(allDropCode).not.toMatch(/touchAction:\s*['"]none['"]/);
    expect(overlay).toContain('touchAction: WHITEBOARD_DROP_ZONE_TOUCH_ACTION');
    // Auch die Zone in der Stilregel schaltet das Verschieben des Boards nicht ab.
    expect(styles).toContain('.whiteboard-drop-zone');
    expect(styles).not.toMatch(/\.whiteboard-drop-zone[^{]*\{[^}]*touch-action:\s*none/);
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session und den Langdruck aus Paket 6', () => {
    expect(touch).toContain("WHITEBOARD_DROP_ZONE_TOUCH_CANCEL_REASON: WhiteboardDropZoneCloseReason = 'pointer-lost'");
    expect(contract).toContain("Extract<DragEndReason, 'pointer-lost' | 'window-blur'>");
    expect(touch).toContain('DRAG_TOUCH_LONGPRESS_MS');
    expect(touch).toContain('whiteboardDropZoneTouchDragBegins(');
  });

  it('erkennt den Zug an `types`, weil `getData` während `dragover` geschützt ist', () => {
    // Ohne diese Unterscheidung gäbe es nie ein `preventDefault` und damit nie ein `drop`.
    expect(zone).toContain('export function isWhiteboardWorkspaceDrag(');
    expect(hook).toContain('isWhiteboardWorkspaceDrag(event.dataTransfer)');
    expect(hook).toContain('event.preventDefault();');
  });

  it('beschreibt die Entscheidung im Markup, statt sie zu behaupten', () => {
    expect(overlay).toContain('whiteboardDropZoneInputHint(inputKind)');
    expect(overlay).toContain('data-vgt-whiteboard-drop-zone-input={inputKind}');
    expect(hook).toContain('normalizePointerType(');
  });

  it('hält die Whiteboard-Zone aus dem Canvas-Kollektiv der Stilregeln (keine Fremdklassen)', () => {
    expect(styles).not.toMatch(/\.whiteboard-drop-zone__[a-z-]+ \{[\s\S]{0,120}\.whiteboard-(?:item|sticky|diagram)/);
    expect(allDropRaw).toContain('NOT_TESTED');
  });
});
