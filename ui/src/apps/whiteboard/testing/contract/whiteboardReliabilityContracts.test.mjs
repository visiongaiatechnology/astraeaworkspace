// STATUS: PLATIN — source contracts that keep the Whiteboard reliability rules single-sourced.
// `Datei:Zeile` findings from the batch inventory are pinned here so a future edit cannot quietly
// reintroduce a second connector geometry, a pointer-only canvas or a silent drop truncation.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const rules = new Map();
/** Naive brace-matching rule extractor: returns the source text of one exported/declared symbol. */
function ruleOf(source, name) {
  if (rules.has(name)) return rules.get(name);
  const start = source.indexOf(name);
  if (start < 0) throw new Error(`symbol not found: ${name}`);
  let depth = 0;
  let index = source.indexOf('{', start);
  if (index < 0) throw new Error(`no body for ${name}`);
  const begin = index;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const text = source.slice(begin, index + 1);
  rules.set(name, text);
  return text;
}

const canvasExport = read('../../integrations/canvasExport.ts');
const exportScene = read('../../rendering/whiteboardExportScene.ts');
const canvas = read('../../app/WhiteboardCanvas.tsx');
const insertion = read('../../interactions/useWhiteboardObjectInsertion.ts');
const canvasInput = read('../../interactions/useWhiteboardCanvasInput.ts');
const manipulation = read('../../interactions/useWhiteboardManipulation.ts');
const miniMap = read('../../minimap/WhiteboardMiniMap.tsx');
const styles = read('../../canvas/WhiteboardCanvas.css');

describe('Whiteboard single-source geometry contracts', () => {
  it('keeps the raster exporter free of a second connector endpoint rule', () => {
    expect(canvasExport).not.toMatch(/from\.x\s*\+\s*from\.width/);
    expect(canvasExport).not.toMatch(/to\.x\s*\+\s*scene\.offsetX\s*-\s*/);
    expect(canvasExport).toContain("from '../rendering/whiteboardExportScene'");
    expect(canvasExport).toContain('buildWhiteboardExportScene(items)');
    expect(canvasExport).toContain('drawCanonicalPathData(ctx, routed.path)');
  });

  it('publishes connector bounds from the routing engine and consumes them in the export scene', () => {
    const diagramEngine = read('../../model/whiteboardDiagramEngine.ts');
    expect(diagramEngine).toContain('bounds: pathBounds(');
    expect(diagramEngine).not.toMatch(/bounds\?: /);
    expect(exportScene).toContain('path.bounds');
    expect(exportScene).toContain('buildWhiteboardRenderProjection');
  });

  it('renders ink through the shared ink path data rather than a local polyline rule', () => {
    expect(canvasExport).toContain('inkPathData(item.ink.points)');
    expect(canvasExport).not.toMatch(/ink\.points\.forEach/);
  });
});

describe('Whiteboard keyboard and pointer parity contracts', () => {
  it('resolves canvas keys through the pure keyboard engine and documents them for screen readers', () => {
    expect(canvas).toContain('resolveWhiteboardKeyboardCommand(');
    expect(canvas).toContain('WHITEBOARD_KEYBOARD_HELP');
    expect(canvas).toContain('aria-describedby="whiteboard-canvas-help whiteboard-canvas-summary"');
    expect(canvas).not.toMatch(/onKeyDown=\{\(event\) => \{ const step=event\.shiftKey/);
  });

  it('implements marquee selection on the canvas surface and suppresses the follow-up click', () => {
    expect(canvasInput).toContain('marqueeWhiteboardSelection(');
    expect(canvasInput).toContain('suppressClickRef');
    expect(canvasInput).toContain('clearSnapGuides');
    expect(canvas).toContain('data-vgt-whiteboard-marquee="true"');
    expect(canvas).toContain('data-vgt-whiteboard-guide={guide.kind}');
    expect(manipulation).toContain('applyWhiteboardDragSnap(');
  });

  it('exposes a keyboard object list with screen-reader descriptions', () => {
    expect(canvas).toContain('<WhiteboardObjectList');
    expect(canvas).toContain("whiteboardObjectsText('objectList', locale)");
    // Ergänzung 7 §4: the nine panel booleans are no longer free. They are derived from the dock set,
    // and the object list toggle reads the derived flag. `testing/dock/*` holds the full contract.
    expect(canvas).toContain("'object-list': showObjectList");
    expect(canvas).toContain('whiteboardDockFlags(');
    expect(canvas).toContain("toggleDockPanel('object-list')");
    const objectList = read('../../a11y/WhiteboardObjectList.tsx');
    expect(objectList).toContain('role="listbox"');
    expect(objectList).toContain('role="option"');
    expect(objectList).toContain('aria-selected={isSelected}');
    expect(objectList).toContain('describeWhiteboardItem(item, locale, { selected: isSelected })');
  });

  it('keeps the mini-map keyboard operable and synchronized with the viewport rectangle', () => {
    expect(miniMap).toContain('stepWorldCenterByKey(');
    expect(miniMap).toContain('tabIndex={0}');
    expect(miniMap).toContain("aria-live=\"polite\"");
    expect(miniMap).toContain('viewportBounds');
  });
});

describe('Whiteboard bounded-drop contracts', () => {
  it('plans the whole drop before inserting anything', () => {
    expect(insertion).toContain('planWhiteboardDrop(');
    expect(insertion).not.toMatch(/files\.item\(0\)/);
    expect(insertion).toContain('for (const entry of plan.entries)');
  });

  it('reuses the single PDF flattening path for dropped PDFs', () => {
    expect(insertion).toContain('importPdfPagesAsWhiteboardItems(file');
    expect(insertion).not.toMatch(/application\/pdf[\s\S]{0,200}drawImage/);
  });

  it('shows a drop target preview before the drop', () => {
    expect(canvas).toContain('onDragEnter=');
    expect(canvas).toContain('isWhiteboardFileDrag(');
    expect(canvas).toContain('data-vgt-whiteboard-drop-target="true"');
    expect(canvas).toContain("whiteboardObjectsText('dropTarget', locale)");
  });

  it('styles the new affordances with workspace tokens, reduced motion and forced colours', () => {
    for (const className of ['.whiteboard-marquee', '.whiteboard-snap-guide', '.whiteboard-drop-target', '.whiteboard-object-list']) {
      expect(styles, className).toContain(className);
    }
    expect(styles).toContain('var(--vgt-accent-strong');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('forced-colors: active');
  });
});

describe('Whiteboard drag snap pipeline contract', () => {
  it('routes every pointer drag through the single snap pipeline', () => {
    const engine = read('../../model/whiteboardManipulationEngine.ts');
    const pipeline = ruleOf(engine, 'export function applyWhiteboardDragSnap');
    expect(pipeline).toContain('snapWhiteboardPoint(');
    expect(pipeline).toContain('computeWhiteboardSmartSnap(');
    expect(pipeline).toContain('moveWhiteboardSelection(');
    expect(engine).toContain('computeWhiteboardSmartSnap');
  });
});

describe('Whiteboard empty canvas and load contract (AST-1011, AST-1114)', () => {
  it('no longer seeds a sample diagram into a new board', () => {
    const store = read('../../persistence/canvasItemsStore.ts');
    expect(store).not.toContain("id: 'term-start'");
    expect(store).not.toContain("id: 'proc-crypto'");
    expect(store).toMatch(/No canonical items and no legacy Shape objects[\s\S]{0,80}return \[\];/);
  });

  it('validates the persisted payload on load and reports a rejection visibly', () => {
    const store = read('../../persistence/canvasItemsStore.ts');
    expect(store).toContain('export function loadWhiteboardItemsFromDocument');
    // The loader's declaration slice (it returns a discriminated union, so brace matching would stop early).
    const loader = store.slice(
      store.indexOf('export function loadWhiteboardItemsFromDocument'),
      store.indexOf('export function getInitialItemsFromDoc'),
    );
    expect(loader).toContain('validateAndNormalizeWhiteboardItems');
    expect(loader).toContain('ok: false');
    const state = read('../../state/useWhiteboardState.ts');
    expect(state).toContain('loadWhiteboardItemsFromDocument(document)');
    expect(state).toContain('Whiteboard payload rejected');
  });

  it('shows the empty board hint on the canvas itself', () => {
    expect(canvas).toContain('data-vgt-whiteboard-empty-state="true"');
    expect(canvas).toContain("whiteboardObjectsText('emptyBoardTitle', locale)");
    expect(canvas).toContain("whiteboardObjectsText('emptyBoardHint', locale)");
  });
});

describe('Whiteboard typography contract (AST-1046, AST-1047)', () => {
  it('keeps one list of allowed values, owned by the style engine', () => {
    const engine = read('../../model/whiteboardTextStyleEngine.ts');
    expect(engine).toContain('WHITEBOARD_TEXT_SIZE_OPTIONS');
    expect(engine).toContain('WHITEBOARD_TEXT_WEIGHTS');
    expect(engine).toContain('WHITEBOARD_TEXT_FAMILIES');
    expect(engine).toContain('WHITEBOARD_TEXT_ALIGNS');
    const toolbar = read('../../toolbar/WhiteboardTextToolbar.tsx');
    expect(toolbar).toContain('WHITEBOARD_TEXT_SIZE_OPTIONS');
    expect(toolbar).toContain('WHITEBOARD_TEXT_WEIGHTS');
    expect(toolbar).toContain('WHITEBOARD_TEXT_FAMILIES');
    expect(toolbar).toContain('WHITEBOARD_TEXT_ALIGNS');
    // The toolbar renders the engine's lists; it must not keep a second literal option list.
    expect(toolbar).not.toMatch(/\[\s*10\s*,\s*12\s*,\s*14/);
  });

  it('normalises and bounds the field inside the canonical item pipeline', () => {
    const objectEngine = read('../../model/whiteboardObjectEngine.ts');
    expect(objectEngine).toContain('normalizeWhiteboardItemTextStyle');
    const style = read('../../model/whiteboardTextStyleEngine.ts');
    expect(style).toContain('WHITEBOARD_TEXT_SIZE_MIN');
    expect(style).toContain('WHITEBOARD_TEXT_SIZE_MAX');
    expect(style).toContain('whiteboardItemSupportsTextStyle');
  });

  it('has a caller in the DOM renderer and in both exports, all through one formatter', () => {
    expect(read('../../objects/WhiteboardItemsRenderer.tsx')).toContain('whiteboardTextRenderParams');
    expect(read('../../interchange/whiteboardSvgRenderProjection.ts')).toContain('whiteboardTextRenderParams');
    expect(canvasExport).toContain('whiteboardTextRenderParams');
    expect(canvas).toContain('<WhiteboardTextToolbar');
    expect(canvas).toContain('manipulation.setTextStyle');
  });
});

describe('Whiteboard mind-map authoring contract (AST-1081)', () => {
  it('offers the child-node action from the engine, the panel and the keyboard', () => {
    const engine = read('../../model/whiteboardDiagramEngine.ts');
    expect(engine).toContain('export function addWhiteboardMindMapChild');
    const panel = read('../../tools/WhiteboardDiagramPanel.tsx');
    expect(panel).toContain('data-vgt-whiteboard-add-child="true"');
    expect(panel).toContain('onAddChildNode');
    const keyboard = read('../../selection/whiteboardKeyboardEngine.ts');
    expect(keyboard).toContain("kind: 'add-child-node'");
    const manipulation = read('../../interactions/useWhiteboardManipulation.ts');
    expect(manipulation).toContain('addWhiteboardMindMapChild');
    expect(canvas).toContain("command.kind === 'add-child-node'");
    expect(canvas).toContain('onAddChildNode={');
  });
});

describe('Whiteboard mini-map persistence contract (AST-1088)', () => {
  it('renders the canonical saved locations and is wired to the persisted view config', () => {
    const map = read('../../minimap/WhiteboardMiniMap.tsx');
    expect(map).toContain('data-vgt-whiteboard-minimap-bookmarks="true"');
    expect(map).toContain('onNavigateBookmark');
    expect(map).toContain('onSaveBookmark');
    expect(canvas).toContain('bookmarks={view.bookmarks}');
    expect(canvas).toContain('onNavigateBookmark={navigateBookmark}');
    expect(canvas).toContain('onSaveBookmark={');
  });
});

describe('Whiteboard single-slot persistence contract (AST-1098, AST-1103)', () => {
  it('never invents a second extension slot for export or handoff provenance', () => {
    const files = [
      '../../integrations/whiteboardPresentHandoff.ts',
      '../../interchange/whiteboardExportImportEngine.ts',
      '../../integrations/WhiteboardInteropModal.tsx',
      '../../persistence/canvasItemsStore.ts',
      '../../state/useWhiteboardState.ts',
      '../../integrations/canvasExport.ts',
    ];
    for (const file of files) expect(read(file), file).not.toContain('wom_extensions');
  });

  it('documents the handoff source inside the derived document fields', () => {
    const handoff = read('../../integrations/whiteboardPresentHandoff.ts');
    expect(handoff).toContain('Source: ${sourceTitle}');
    expect(handoff).toContain('speakerNotes');
  });

  it('keeps the export a read-only derivation of the canonical items', () => {
    const engine = read('../../interchange/whiteboardExportImportEngine.ts');
    expect(engine).toContain('return items.map((item) => ({ ...item }))');
    expect(engine).toContain('export function itemsForWhiteboardScope');
  });
});
