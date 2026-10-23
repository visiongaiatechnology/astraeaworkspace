import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Round 43 — stacking contract for the Whiteboard workspace.
//
// The user report was concrete: three horizontal toolbars overlapped each other, and the top strip covered
// the ruler/dimension bar. Layout heights are not measurable in this test environment, but the *structure*
// that makes overlap impossible is fully decidable from the source:
//
//   1. the toolbar region is a normal flex child **before** the canvas region (no absolute/negative offset),
//   2. all contextual toolbars (manipulation/ink/text) live inside that region, not at hard-coded offsets,
//   3. the canvas region follows the toolbar region in the flow, so canvas + rulers always start below it,
//   4. dock panels live inside the canvas region and anchor to its small inset (12 px) instead of a guessed
//      magic number measured from the top of the workspace.
const canvasSource = readFileSync(new URL('../../app/WhiteboardCanvas.tsx', import.meta.url), 'utf8');
const canvasCss = readFileSync(new URL('../../canvas/WhiteboardCanvas.css', import.meta.url), 'utf8');
const toolbarCss = readFileSync(new URL('../../toolbar/WhiteboardToolbar.css', import.meta.url), 'utf8');

const indexOf = (needle: string, from = 0): number => {
  const index = canvasSource.indexOf(needle, from);
  expect(index, `missing in WhiteboardCanvas.tsx: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe('Whiteboard toolbar stacking contract (Round 43)', () => {
  it('renders the toolbar region in flow before the canvas region', () => {
    const toolbarRegion = indexOf('data-vgt-whiteboard-toolbar-region="true"');
    const toolbar = indexOf('<WhiteboardToolbar', toolbarRegion);
    const canvasRegion = indexOf('data-vgt-whiteboard-canvas-region="true"');
    expect(toolbar, 'toolbar inside the region').toBeGreaterThan(toolbarRegion);
    expect(canvasRegion, 'canvas region after toolbar region').toBeGreaterThan(toolbar);
    expect(indexOf('{/* Main Canvas Infinite Space */}', canvasRegion), 'canvas content inside the canvas region').toBeGreaterThan(canvasRegion);
  });

  it('keeps all contextual toolbars inside the same region (no hard-coded absolute stack)', () => {
    const toolbarRegion = indexOf('data-vgt-whiteboard-toolbar-region="true"');
    const canvasRegion = indexOf('data-vgt-whiteboard-canvas-region="true"');
    for (const componentName of ['<WhiteboardManipulationToolbar', '<WhiteboardInkToolbar', '<WhiteboardTextToolbar']) {
      const position = indexOf(componentName);
      expect(position, `${componentName} must be rendered in the toolbar region`).toBeGreaterThan(toolbarRegion);
      expect(position, `${componentName} must render before the canvas region`).toBeLessThan(canvasRegion);
    }
  });

  it('anchors dock panels inside the canvas region, below the toolbar region', () => {
    const canvasRegion = indexOf('data-vgt-whiteboard-canvas-region="true"');
    expect(indexOf('showObjectPalette && <WhiteboardObjectPalette'), 'object palette inside canvas region').toBeGreaterThan(canvasRegion);
    expect(indexOf('showFacilitationPanel && <WhiteboardFacilitationPanel'), 'facilitation panel inside canvas region').toBeGreaterThan(canvasRegion);
    expect(canvasCss, 'panels anchor just inside the canvas region').toMatch(/--wb-dock-top:\s*12px;/);
    expect(canvasCss, 'no stale absolute toolbar height derivation').not.toContain('--wb-toolbar-layer-start');
  });

  it('uses a wrapping flex region and never an absolute/negative-offset toolbar layer', () => {
    expect(canvasSource).toContain('className="whiteboard-toolbar-region"');
    expect(canvasSource).not.toMatch(/whiteboard-toolbar__layer/);
    expect(toolbarCss).not.toContain('whiteboard-toolbar__layer');
    expect(toolbarCss).not.toContain('inset-block-start');
    expect(toolbarCss).not.toMatch(/margin-top:\s*-/);
    expect(toolbarCss).toMatch(/\.whiteboard-toolbar-region\s*\{[^}]*display:\s*flex;/s);
    expect(toolbarCss).toMatch(/\.whiteboard-toolbar-region\s*\{[^}]*flex-direction:\s*column;/s);
    expect(toolbarCss).not.toMatch(/\.whiteboard-toolbar__bar\s*\{[^}]*position:\s*absolute;/s);
  });
});
