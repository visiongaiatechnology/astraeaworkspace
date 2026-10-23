// STATUS: PLATIN — Integration & Release, **Paket 14**: Quellvertrag der Draw-Ablagezone
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat in diesem Projekt **keine** Node-Typen — `node:fs` ergäbe `TS2307`
// (gemessen, mehrfach in diesem Projekt). Also liegt der Vertrag hier.
//
// Was dieser Vertrag **nicht** kann: das **Binden** der Zeiger-, Ablage- und Tastenereignisse auslösen — dafür
// fehlt der Browser. Er prüft, **dass** die Fläche gebunden ist, **dass** die Zone **außerhalb** der Leinwand
// steht, **dass** der Zug an `types` beansprucht wird (**bevor** Inhalt gelesen wird — der P1-Defekt `W-443` aus
// Paket 9) und **dass** die Route nur über die vorhandene Matrix läuft; er behauptet **nicht**, dass eine Geste
// ankommt.
//
// **Kommentare werden vor jeder „darf nicht vorkommen"-Prüfung entfernt**: die Köpfe der Module *nennen* die
// vorhandenen Namen — *ein Satz über eine verbotene Sache ist nicht die Sache*. (Genau diese Verwechslung hat in
// Paket 9 den ersten Vertrag dreimal rot gemacht; der Vertrag war falsch, nicht der Code.)
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const drawRoot = path.resolve(here, '../..');
const read = (relative) => readFileSync(path.resolve(drawRoot, relative), 'utf8');
/** Entfernt Kommentare — dieselbe Form wie in `whiteboardDropZoneWiring.contract.test.mjs`. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const canvas = read('canvas/DrawCanvas.tsx');
const surface = read('canvas/DrawInteractiveSurface.tsx');
const zone = read('drop-zone/drawDropZone.ts');
const contract = read('drop-zone/drawDropZoneContract.ts');
const touch = read('drop-zone/drawDropZoneTouch.ts');
const overlay = read('drop-zone/DrawDropZoneOverlay.tsx');
const hook = read('drop-zone/useDrawDropZone.ts');
const styles = read('drop-zone/drawDropZone.css');

const DROP_DIR = path.resolve(drawRoot, 'drop-zone');
const dropFiles = readdirSync(DROP_DIR, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
const allDropCode = code(dropFiles.map((name) => read(`drop-zone/${name}`)).join('\n'));
const allDropRaw = dropFiles.map((name) => read(`drop-zone/${name}`)).join('\n');
const allDropIncludesCss = [...dropFiles, 'drop-zone/drawDropZone.css'].map((name) => (name.endsWith('.css') ? styles : read(`drop-zone/${name}`))).join('\n');

/** Ein Handler-Block aus der Bindung — für die Reihenfolge „erst beanspruchen, dann lesen". */
function handlerBlock(name) {
  const start = hook.indexOf(`const ${name} = useCallback(`);
  if (start < 0) throw new Error(`Handler ${name} fehlt in useDrawDropZone`);
  const rest = hook.slice(start + 1);
  const next = rest.search(/const on[A-Z][A-Za-z]* = useCallback\(/u);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('Paket 14 — die Fläche ist wirklich gebunden', () => {
  it('hängt die Ablagezone an die Draw-Leinwand', () => {
    expect(canvas).toContain('useDrawDropZone({ targetDocument: workspaceDocument, documents: workspaceDocuments })');
    expect(canvas).toContain('<DrawDropZoneOverlay');
    expect(canvas).toContain('state={drawDropZone.state}');
    expect(canvas).toContain('onConfirm={drawDropZone.confirm}');
    expect(canvas).toContain('onChooseIntent={drawDropZone.chooseIntent}');
    expect(canvas).toContain('onDismiss={drawDropZone.dismiss}');
    expect(canvas).toContain('inputKind={drawDropZone.inputKind}');
  });

  it('bindet alle vier Ablage-Ereignisse und die Tastatur an die Verweisfläche', () => {
    for (const handler of ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop']) {
      expect(canvas, handler).toContain(`${handler}={drawDropZone.${handler}}`);
    }
    expect(canvas).toContain('onKeyDown={drawDropZone.onKeyDown}');
    expect(canvas).toContain('data-vgt-draw-drop-zone-region="true"');
  });

  it('nimmt genau dieses Dokument als Ziel — App und Kennung werden nicht geraten', () => {
    expect(hook).toContain('targetDocument.id');
    expect(hook).toContain('targetDocument.kind');
    expect(hook).toContain('record[targetDocument.id] = targetDocument;');
  });

  it('liest die Zeigerart **nur** zur Anzeige und beginnt keine Geste', () => {
    // Ein Beobachter, kein Zug: der Zeiger-Handler nennt nur die Zeigerart für die Touch-Strategie.
    expect(canvas).toContain('drawDropZone.notePointerType(event.pointerType)');
    expect(code(canvas)).not.toContain('setPointerCapture');
    expect(code(canvas)).not.toContain('dataTransfer');
    expect(allDropCode).not.toContain('setPointerCapture');
    expect(allDropCode).not.toContain('pointermove');
  });

  it('stellt die Zone **außerhalb** der Zeichenfläche auf — das ist die Bedingung für die Tastatur-Alternative', () => {
    // Struktureller Nachweis am Quelltext: die Zone steht **hinter** der inneren Scroll-Fläche (also als
    // Geschwister des Inhalts) und damit außerhalb des SVG-Widgets. *Ein DOM-Nachweis wäre stärker — dafür fehlt
    // der Browser; das ist hier ausdrücklich ein Proxy und wird so berichtet.*
    const surfaceAt = canvas.indexOf('<DrawInteractiveSurface');
    const scrollCloseAt = canvas.indexOf('</div>', surfaceAt);
    const overlayAt = canvas.indexOf('<DrawDropZoneOverlay');
    expect(surfaceAt).toBeGreaterThan(0);
    expect(scrollCloseAt).toBeGreaterThan(surfaceAt);
    expect(overlayAt).toBeGreaterThan(scrollCloseAt);
    // Die Zeichenfläche selbst bleibt die Zeichenfläche: sie behält ihre eigene Geste (und ihr eigenes
    // `touch-none` für den Fingerstrich) — die Ablagezone ändert daran **nichts**.
    expect(surface).toContain('touch-none');
    expect(surface).toContain('DRAW_STENCIL_MIME');
    expect(canvas).toContain('data-vgt-canvas-scroll="true"');
  });

  it('beschreibt sich über die eine, dauerhaft vorhandene Ansageregion', () => {
    expect(canvas).toContain('aria-describedby={drawDropZone.announcerId}');
    expect(hook).toContain('announcerId: DRAW_DROP_ZONE_ANNOUNCER_ID');
    expect(contract).toContain("DRAW_DROP_ZONE_ANNOUNCER_ID = 'draw-drop-zone-announcer'");
  });
});

describe('Paket 14 — das Urteil kommt aus Paket 6, kein zweites', () => {
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
    expect(touch).toContain('DRAG_THRESHOLD_PX');
  });

  it('erfindet kein zweites Urteil und keine zweite Route', () => {
    // Das Urteil wird **gelesen**; die Route entscheidet der Resolver. Kein eigener Zweig über „erlaubt".
    expect(zone).toContain('evaluateWorkspaceDrop(');
    expect(zone).toContain('resolveWorkspaceDrop(');
    expect(zone).not.toMatch(/verdict\s*[:=]\s*['"](?:accept|reject)['"]/);
    expect(zone).not.toMatch(/return\s+['"](?:accept|reject)['"]/);
  });
});

describe('Paket 14 — nur die vorhandene Route, kein privater Pfad', () => {
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
    expect(allDropCode).not.toContain('createDragSession(');
    expect(allDropCode).not.toContain('DRAG_THRESHOLD_PX =');
    expect(allDropCode).not.toContain('DRAG_TOUCH_LONGPRESS_MS =');
    // Keine eigene Langdruck-Zahl: die Entscheidung wird aus Paket 5/6 **gelesen**.
    expect(code(touch)).not.toMatch(/const [A-Z_]*LONG_PRESS[A-Z_]* = \d/);
    expect(code(touch)).not.toMatch(/const [A-Z_]*THRESHOLD[A-Z_]* = \d/);
  });
});

describe('Paket 14 — der Zug wird an `types` beansprucht, nicht am Inhalt (W-443)', () => {
  it('prüft die MIME-Art **vor** jedem `preventDefault()` und **vor** dem Lesen des Inhalts', () => {
    for (const name of ['onDragEnter', 'onDragOver', 'onDrop']) {
      const block = handlerBlock(name);
      const claimAt = block.indexOf('isDrawWorkspaceDrag(event.dataTransfer)');
      const preventAt = block.indexOf('preventDefault()');
      const readAt = block.indexOf('readDrawWorkspaceTransfer(event.dataTransfer)');
      expect(claimAt, `${name}: Beanspruchung fehlt`).toBeGreaterThan(-1);
      expect(preventAt, `${name}: preventDefault fehlt`).toBeGreaterThan(-1);
      expect(claimAt, `${name}: erst lesen, dann beanspruchen`).toBeLessThan(readAt);
      expect(claimAt, `${name}: erst lesen, dann beanspruchen`).toBeLessThan(preventAt);
      // Und ohne die MIME-Art wird **nichts** getan (Stempel- und Dateizüge gehören der Zeichenfläche).
      expect(block).toContain('return;');
    }
    expect(zone).toContain('export function isDrawWorkspaceDrag(');
    expect(zone).toContain('dataTransfer?.types');
  });

  it('fasst die Tastatur nicht an, wenn sie in ein Eingabefeld geht, und überschreibt keine Modifikatortasten', () => {
    expect(hook).toContain('isTypingTarget(event.target)');
    expect(hook).toContain('event.altKey || event.ctrlKey || event.metaKey');
    expect(hook).toContain("targetTagName(event.target) === 'button'");
  });

  it('lässt eine aufgelöste Taste **nicht** zusätzlich auf die Zeichnung wirken', () => {
    // Draw-spezifisch: das Draw-Wurzelelement behandelt `Escape` (Auswahl löschen) und `Delete` selbst. Eine
    // Taste, die die Zone aufgelöst hat, gehört der Zone — sonst wirkte dasselbe `Escape` zweimal.
    expect(hook).toContain('event.stopPropagation();');
    expect(hook.indexOf('event.stopPropagation();')).toBeGreaterThan(hook.indexOf('event.preventDefault();'));
    expect(canvas).toContain('onKeyDown={drawDropZone.onKeyDown}');
    expect(overlay).toContain('onKeyDown={onKeyDown}');
  });
});

describe('Paket 14 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Form und Worte', () => {
    for (const view of ['closed', 'open', 'ready', 'choice', 'refused', 'resolved']) {
      expect(contract, view).toContain(`${view}: { glyph:`);
    }
    expect(contract).toContain('DRAW_DROP_ZONE_PRESENTATION');
    expect(overlay).toContain('{presentation.glyph}');
    expect(overlay).toContain('{presentation.headline}');
    expect(overlay).toContain('data-vgt-draw-drop-zone-glyph={presentation.glyph}');
    expect(overlay).toContain('data-vgt-draw-drop-zone-pattern={presentation.pattern}');
    expect(styles).toContain('.draw-drop-zone[data-vgt-draw-drop-zone-pattern="dashed"]');
    expect(styles).toContain('.draw-drop-zone[data-vgt-draw-drop-zone-pattern="solid"]');
    expect(styles).toContain('.draw-drop-zone[data-vgt-draw-drop-zone-pattern="double"]');
  });

  it('liest Erlaubnis und Grund aus dem Urteil statt aus einer Anzeigefarbe', () => {
    expect(overlay).toContain('data-vgt-draw-drop-zone-verdict={state.target.verdict}');
    expect(overlay).toContain('data-vgt-draw-drop-zone-reason={refusalCode ?? ');
    expect(overlay).toContain('drawDropZoneRefusalCode(state)');
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
    expect(overlay).toContain('DRAW_DROP_ZONE_IDLE_ANNOUNCEMENT');
    expect(overlay).toContain('data-vgt-draw-drop-zone-announcer={view}');
    // Die Ansageregion steht **vor** der bedingten Zone: sie wird nicht mit ihr geboren.
    expect(overlay.indexOf('data-vgt-draw-drop-zone-announcer')).toBeLessThan(overlay.indexOf('{visible && ('));
  });
});

describe('Paket 14 — die Zone ist echtes DOM, keine gemalte Fläche', () => {
  it('rendert eine semantische Region und kein SVG/Canvas-Rechteck', () => {
    expect(overlay).toContain('data-vgt-draw-drop-zone-canvas="dom-overlay"');
    expect(overlay).toContain('<section');
    expect(code(overlay)).not.toContain('<svg');
    expect(code(overlay)).not.toContain('<canvas');
    expect(code(overlay)).not.toContain('data-vgt-shape');
    // Die Fläche wird als **Wort** genannt, nicht als Ort im Pixel.
    expect(overlay).toContain('DRAW_DROP_ZONE_SURFACE_LABEL');
    expect(contract).toContain("DRAW_DROP_ZONE_SURFACE_LABEL = 'Drawing canvas'");
  });

  it('fängt keinen Zug ab: die Schicht ist durchlässig, nur die Knöpfe sind bedienbar', () => {
    expect(styles).toContain('.draw-drop-zone-layer');
    expect(styles).toMatch(/\.draw-drop-zone-layer\s*\{[^}]*pointer-events:\s*none/u);
    expect(styles).toMatch(/\.draw-drop-zone__button\s*\{[^}]*pointer-events:\s*auto/u);
  });
});

describe('Paket 14 — die Tastatur ist modelliert, nicht nachgerüstet', () => {
  it('bindet die Taste an einen Befehl und führt denselben Weg aus', () => {
    expect(hook).toContain('resolveDrawDropCommand(state, event.key)');
    expect(hook).toContain('applyDrawDropCommand(state, resolved.command, context)');
    expect(zone).toContain('export function confirmDrawDropZone(');
    expect(zone).toContain('export function chooseDrawDropIntent(');
    // Derselbe Weg: „bestätigen" im Zustand `choice` ist wörtlich die Ablage.
    expect(zone).toContain("if (state.decision.kind === 'choice') return dropDrawDropZone(state, context);");
    // Und die Tastatur braucht **kein** Überfahren: der gemeinsame Abschluss fragt den Zustand nicht danach.
    expect(zone).toContain('function commitTransfer(');
    expect(zone).toContain('return commitTransfer(state, context);');
  });

  it('gibt jedem Knopf ein Tastenkürzel und bietet keine zeigergebundene Alternative als einzigen Weg', () => {
    expect(overlay).toContain('aria-keyshortcuts="Enter"');
    expect(overlay).toContain('aria-keyshortcuts="Escape"');
    expect(overlay).toContain('aria-keyshortcuts={choice.shortcutLabel}');
    expect(code(overlay)).not.toContain('onPointerDown');
    expect(code(overlay)).not.toContain('onMouseDown');
    expect(code(overlay)).not.toContain('onTouchStart');
    expect(code(overlay)).not.toMatch(/<div role="button"/);
  });

  it('erklärt jeden benannten Grund in Worten — auch die ungebundene Taste', () => {
    expect(contract).toContain("'draw-drop-key-unbound'");
    expect(contract).toContain('DRAW_DROP_ZONE_LOCAL_REFUSAL_TEXT');
    expect(contract).toContain('DRAW_DROP_VERDICT_REFUSAL_TEXT');
    expect(contract).toContain('new WorkspaceInteractionError(code as WorkspaceInteractionErrorCode).message');
  });
});

describe('Paket 14 — Touch ist entschieden und begründet', () => {
  it('legt `touch-action` benannt fest: `manipulation`, nie `none`', () => {
    expect(touch).toContain("DRAW_DROP_ZONE_TOUCH_ACTION: DrawDropZoneTouchAction = 'manipulation'");
    expect(allDropIncludesCss).not.toContain('touch-action: none');
    expect(allDropIncludesCss).not.toMatch(/touchAction:\s*['"]none['"]/);
    expect(overlay).toContain('touchAction: DRAW_DROP_ZONE_TOUCH_ACTION');
    // Die Stilregel der Zone schaltet das Verschieben der Fläche **nicht** ab.
    expect(styles).not.toMatch(/\.draw-drop-zone[^{]*\{[^}]*touch-action:\s*none/u);
    // Und die Entscheidung ist **eine**: Panning bleibt, die Zeichengeste bleibt beim Canvas.
    expect(touch).toContain('TOUCH_ACTION_KEEPS_PANNING');
    expect(touch).toContain('drawingGestureStaysWithCanvas');
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session und den Langdruck aus Paket 6', () => {
    expect(touch).toContain("DRAW_DROP_ZONE_TOUCH_CANCEL_REASON: DrawDropZoneCloseReason = 'pointer-lost'");
    expect(contract).toContain("Extract<DragEndReason, 'pointer-lost' | 'window-blur'>");
    expect(touch).toContain('DRAG_TOUCH_LONGPRESS_MS');
    expect(touch).toContain('drawDropZoneTouchDragBegins(');
  });

  it('übersetzt die Zeigerart genau einmal und behält die Tastatur als eigenen Weg', () => {
    expect(touch).toContain('export function drawDropInputKindFromPointerType(');
    expect(hook).toContain('drawDropInputKindFromPointerType(pointerType)');
    expect(touch).toContain('drawDropZoneInputHint(');
    expect(overlay).toContain('drawDropZoneInputHint(inputKind)');
    expect(overlay).toContain('data-vgt-draw-drop-zone-input={inputKind}');
    // Die Tastatur ist **kein** Zeiger: sie wird dort gesetzt, wo die Taste ankommt.
    expect(hook).toContain("setInputKind('keyboard')");
  });

  it('hält den Befund ehrlich: die Ausführung bleibt `NOT_TESTED`', () => {
    expect(allDropRaw).toContain('NOT_TESTED');
    expect(canvas).toContain('Paket 14');
  });
});

describe('Paket 15 — der Modus wird mitgeführt, nicht erfunden (AST-1948)', () => {
  it('führt `requestedMode` bedingt in **beide** Aufrufe — Fähigkeitsfrage **und** Zustellung', () => {
    // **Zwei** Stellen sind Pflicht: fehlt die Fähigkeitsfrage, wäre ein Live-Verweis „nicht fähig", obwohl die
    // Route ihn trägt; fehlt die Zustellung, verspräche die Fläche einen Modus, den sie nicht nennt.
    expect((zone.match(/requestedMode: context\.requestedMode/g) ?? [])).toHaveLength(2);
    expect(zone).toContain('...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),');
    expect(zone).toContain('evaluateWorkspaceDrop({');
    expect(zone).toContain('resolveWorkspaceDrop(');
    // *Ein explizites `undefined` wäre der heimliche Default.*
    expect(zone).not.toContain('requestedMode: undefined');
    // **Der Kontext gehört der Zone** (`DrawDropZoneContext` in `drawDropZone.ts`) — *nicht* dem Vertrag: der
    // Vertrag trägt das **Ergebnis** (`DrawDropRoute`). *Eigener Fehler, korrigiert: die erste Fassung prüfte
    // `requestedMode` im Vertrag und war damit rot — der Vertrag war falsch, nicht der Code.*
    expect(zone).toContain('readonly requestedMode?: unknown;');
    expect(contract).not.toContain('readonly requestedMode?: unknown;');
  });

  it('nennt die Art der Zustellung und den **gesagten** Modus — und bei einer Kopie gar keinen', () => {
    expect(contract).toContain('readonly integrationKind: WorkspaceIntegrationKind;');
    expect(contract).toContain('readonly mode?: WorkspaceLiveMode;');
    expect(zone).toContain('integrationKind: selection.integrationKind,');
    expect(zone).toContain('...(selection.mode === undefined ? {} : { mode: selection.mode }),');
    expect(overlay).toContain('data-vgt-draw-drop-zone-route-kind={route.integrationKind}');
    expect(overlay).toContain('data-vgt-draw-drop-zone-route-mode={route.mode ?? ');
  });

  it('sagt den fehlenden Modus **benannt** an, statt ihn zu erfinden — die Vokabel gehört dem Resolver', () => {
    // Der **Code** der Zone entscheidet nichts über den Modus: der Name kommt aus dem Resolver
    // (`workspaceInteractionResolver.ts`), die Zone **liest** ihn nur. *Kommentare werden vorher entfernt —
    // ein Satz über den Namen ist nicht der Name.*
    expect(contract).toContain('drop_live_mode_required');
    expect(code(zone)).not.toContain('drop_live_mode_required');
    expect(contract).toContain('Kein heimlicher Default');
    expect(contract).toContain('WorkspaceLiveMode');
  });
});
