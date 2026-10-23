// Reachability contract for BATCH-PRESENT-2 (Paket 4/5/6/7/11/12).
//
// Same reason as the BATCH-1 wiring contract: a pure rule that no visible surface calls is not a
// feature. Each assertion names the surface that must use the single definition.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), 'utf8');

const slideEditor = read('../../editor/SlideContentEditor.tsx');
const stageCanvas = read('../../canvas/PresentStageCanvas.tsx');
const sceneObjectView = read('../../canvas/rendering/PresentSceneObjectView.tsx');
const floatingImage = read('../../canvas/PresentFloatingImageView.tsx');
const inspector = read('../../editor/inspector/PresentObjectInspector.tsx');
const toolbar = read('../../editor/toolbar/PresentTopToolbar.tsx');
const masterModal = read('../../design/PresentMasterThemeModal.tsx');
const media = read('../../media/presentMediaSecurity.ts');

describe('BATCH-PRESENT-2 reachability', () => {
  it('places a text box at the click point and hands it the caret (Paket 4)', () => {
    expect(slideEditor).toContain('createPresentTextObject(id, point ?? { xPercent: 12, yPercent: 28 })');
    expect(slideEditor).toContain('armedTool');
    expect(slideEditor).toContain('setFocusRequestId(id)');
    expect(stageCanvas).toContain('onCanvasClick({ xPercent: point.x, yPercent: point.y })');
    expect(stageCanvas).toContain('onDoubleClick');
    expect(toolbar).toContain("onToggleArmedTool('text')");
    // The caret request reaches the textarea itself, not just the state.
    expect(stageCanvas).toContain('autoFocusText={focusRequestId === object.id}');
    // PR-005 (M1): the editor is rendered only in the text-edit mode, and the creation path
    // enters that mode — the caret handoff therefore lives on the editing textarea.
    expect(sceneObjectView).toContain('autoFocus');
    expect(sceneObjectView).toContain('onAutoFocusHandled');
    expect(slideEditor).toContain('setTextEditingObjectId(id)');
    expect(sceneObjectView).toContain('textEditing ? (');
    expect(sceneObjectView).toContain('data-present-text-preview="true"');
  });

  it('applies text formatting to the visible selection through the one rule (Paket 5)', () => {
    expect(inspector).toContain('onApplyTextFormat');
    expect(slideEditor).toContain('applyPresentTextFormat(objects, latest.current.selectedSceneObjectIds, patch)');
    expect(inspector).toContain('Line spacing');
    expect(inspector).toContain("onApplyTextFormat?.({ lineHeight: Number(e.target.value) })");
    // The old direct single-object patch must be gone, otherwise two rules would exist.
    expect(inspector).not.toContain("onPatchObject(selectedObject.id, { fontSizePt:");
  });

  it('inserts images with their measured intrinsic size and resizes them aspect-correctly (Paket 6)', () => {
    expect(media).toContain('presentImageInsertionFromFile');
    expect(slideEditor).toContain('presentImageBoxForIntrinsicSize(');
    expect(slideEditor).toContain('withPresentImageIntrinsicSize(');
    expect(stageCanvas).toContain('resizePresentImageBox(');
    expect(stageCanvas).toContain('readPresentImageIntrinsicSize(image, aspect)');
    expect(floatingImage).toContain('presentImageCropClipPath(image)');
    expect(floatingImage).toContain('data-present-image-cropped');
    // The hard-coded box that distorted every image must be gone.
    expect(slideEditor).not.toContain('widthPercent: 28,\n      heightPercent: 18,');
  });

  it('keeps the palettes keyboard-reachable (Paket 7)', () => {
    expect(toolbar).toContain('PresentInsertDropdowns');
    const dropdowns = read('../../editor/toolbar/PresentInsertDropdowns.tsx');
    expect(dropdowns).toContain('aria-haspopup="menu"');
    expect(dropdowns).toContain("event.key === 'Escape'");
    expect(dropdowns).toContain('role="menuitem"');
  });

  it('updates masters and themes through the dependency-aware rules (Paket 11/12)', () => {
    expect(masterModal).toContain('applyPresentMasterUpdate(presentData, id, patch, { detachSlideIds })');
    expect(masterModal).toContain('assignPresentSlideMaster(presentData, activeSlideId, masterId)');
    expect(masterModal).toContain('listPresentMasterDependents(presentData)');
    expect(masterModal).toContain('applyPresentTheme(presentData, themeId)');
    expect(masterModal).toContain('data-present-master-status');
    // The toolbar theme picker must report what it preserved instead of silently swapping the id.
    expect(toolbar).toContain('onApplyThemeToDeck');
    expect(slideEditor).toContain('applyPresentTheme(normalizedPresentData, themeId)');
    expect(slideEditor).toContain('Theme applied. Preserved:');
    // No component may edit a master definition field directly any more.
    expect(masterModal).not.toContain('updateMasterDefinition(');
  });
});
