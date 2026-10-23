// Reachability contract for the Present editor (BATCH-PRESENT, Paket 1/2/3/8/9/10).
//
// This file exists because a pure, fully tested module that no component imports is not
// functionality. Each assertion below names the visible surface that must use the single
// definition, so "the model exists" can never be confused with "the user can do it".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), 'utf8');

const stageCanvas = read('../../canvas/PresentStageCanvas.tsx');
const sceneObjectView = read('../../canvas/rendering/PresentSceneObjectView.tsx');
const slideEditor = read('../../editor/SlideContentEditor.tsx');
const presentCanvas = read('../../PresentCanvas.tsx');
const sidebar = read('../../editor/navigation/PresentSidebar.tsx');
const toolbar = read('../../editor/toolbar/PresentTopToolbar.tsx');
const inspector = read('../../editor/inspector/PresentObjectInspector.tsx');

describe('Present editor reachability contract', () => {
  it('wires the object selector, marquee, alt-click stack pick and snapping into the stage canvas', () => {
    expect(stageCanvas).toContain("from './model/presentSelection'");
    expect(stageCanvas).toContain('presentObjectsInMarquee(sceneObjects, rect, aspect)');
    expect(stageCanvas).not.toContain('marqueeHits = (_rect');
    expect(stageCanvas).toContain('pickPresentObjectInStack');
    expect(stageCanvas).toContain('presentSelectionBounds');
    expect(stageCanvas).toContain("from './model/presentSnapping'");
    expect(stageCanvas).toContain('computePresentSnapGeometry');
    expect(stageCanvas).toContain("from './model/presentTransform'");
    expect(stageCanvas).toContain('rotatePresentSelection');
    expect(stageCanvas).toContain('resizePresentSelection');
    expect(stageCanvas).toContain('nudgePresentSelection');
    // The marquee must be a real rubber band with a visible rectangle, not just a state variable.
    expect(stageCanvas).toContain('data-present-marquee');
    expect(stageCanvas).toContain('data-present-snap-guide');
    expect(stageCanvas).toContain('data-present-grid="true"');
  });

  it('routes keyboard, toolbar and inspector actions through the one executor', () => {
    expect(slideEditor).toContain("from './presentCanvasCommands'");
    // W-401: the editor uses the snapshot-advancing runner, not the raw apply, so two commands in
    // the same tick accumulate instead of the second one discarding the first.
    expect(slideEditor).toContain('runPresentCanvasCommand(');
    expect(slideEditor).not.toContain('applyPresentCanvasCommand(');
    expect(slideEditor).toContain("from './presentEditorCommands'");
    expect(slideEditor).toContain('resolvePresentEditorCommand');
    expect(toolbar).toContain('onCommand');
    expect(inspector).toContain('onCommand');
    // The toolbar and the inspector must not re-implement grouping - they send commands.
    expect(toolbar).not.toContain('groupPresentObjects');
    expect(inspector).not.toContain('groupPresentObjects');
  });

  it('has exactly one keyboard owner: no second window keydown handler in the canvas root', () => {
    expect(presentCanvas).not.toContain("addEventListener('keydown'");
    expect(presentCanvas).not.toContain('resolvePresentEditorCommand');
    // The presenter's own modal keeps its keys, which is why the editor disables itself instead.
    expect(presentCanvas).toContain('keyboardEnabled={!isPresenterMode}');
  });

  it('renders the object transform from the single flip-aware definition', () => {
    expect(sceneObjectView).toContain('presentObjectTransform');
    // The inline rotate-only template is what silently dropped flipX/flipY before.
    expect(sceneObjectView).not.toContain('transform: `rotate(');
  });

  it('offers the empty-deck entry, the layout choice and the slide keyboard commands in the UI', () => {
    expect(sidebar).toContain('data-present-blank-deck="true"');
    expect(sidebar).toContain('data-present-new-slide-layout="true"');
    expect(sidebar).toContain('PRESENT_SLIDE_LAYOUT_PRESETS');
    expect(presentCanvas).toContain('createEmptyPresentDeck');
    expect(presentCanvas).toContain('createPresentSlide');
    expect(presentCanvas).toContain('PRESENT_DECK_SLIDE_LIMIT');
    // Ctrl/Cmd+Arrow moves the active slide: the keyboard equivalent of dragging a thumbnail.
    expect(slideEditor).toContain("case 'move-slide'");
    expect(presentCanvas).toContain('onMoveSlide={handleMoveActiveSlide}');
    // The two-content layout is reachable from the toolbar (it was declared and never rendered).
    expect(toolbar).toContain("layout: 'split'");
    expect(stageCanvas).toContain("slide.layout === 'split'");
  });

  it('bounds hostile input on the canvas instead of truncating silently', () => {
    // Rejected drops must produce a visible, announced reason.
    expect(stageCanvas).toContain('data-present-drop-error');
    expect(stageCanvas).toContain("is not an image");
    expect(stageCanvas).toContain('role="alert"');
    // Duplicate batch and slide count are bounded.
    expect(read('../../editor/presentCanvasCommands.ts')).toContain('PRESENT_MAX_DUPLICATE_BATCH');
    expect(presentCanvas).toContain('This deck already has the maximum');
  });

  it('routes the live-link reopen path through the failure-tolerant rule, not through a raw throw', () => {
    // Paket 15 on reopen: the snapshot port throws when it is not installed or when a source cannot
    // be turned into a bounded snapshot. That exception used to escape the render effect, so opening
    // a deck with one live link next to an unreadable source failed to mount instead of reporting
    // the offline state. The canvas must therefore call the rule that catches it.
    expect(presentCanvas).toContain("from './integrations/presentLiveLinkRefresh'");
    expect(presentCanvas).toContain('refreshPresentLiveLinks(');
    expect(presentCanvas).toContain('data-present-link-failure');
    // ...and must not reach the throwing per-object refresh directly any more.
    expect(presentCanvas).not.toContain('refreshPresentWorkspaceObject(');
  });

  it('keeps the reopen read a repair and not a seed', () => {
    // `ensurePresentDesign` runs on the reopen path (`PresentCanvas.tsx` line ~51). If it filled an
    // authored *empty* collection with built-in content, Save -> Close -> Reopen would not return
    // the payload that was saved.
    const design = read('../../design/presentDesign.ts');
    expect(design).toContain('themes: model.themes ?? DEFAULT_PRESENT_THEMES');
    expect(design).toContain('masters: model.masters ?? DEFAULT_PRESENT_MASTERS');
    expect(design).not.toContain('DEFAULT_PRESENT_THEMES,\n    masters: model.masters?.length');
  });
});
