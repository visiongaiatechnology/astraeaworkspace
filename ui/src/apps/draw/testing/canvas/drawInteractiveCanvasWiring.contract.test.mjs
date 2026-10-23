// STATUS: PLATIN — source contract for the Draw interactive canvas wiring.
//
// This is the test that fails if the P0 defect comes back: the main viewport must not render the
// exported SVG through an `<img>`, and the visible component must actually call the existing pure
// interaction engines instead of carrying a second hit-test/z-order rule of its own. Comments are
// stripped before asserting, so a comment can never satisfy a wiring assertion.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const drawRoot = path.resolve(here, '../..');

/**
 * Removes comments but keeps string literals verbatim.
 *
 * A first version blanked string *content* as well (the trick the import-depth guard uses to find
 * specifiers); that made every JSX attribute assertion — `role="application"`, `motion-reduce` —
 * unmatchable, which the run showed immediately. Here the strings are the evidence, so they stay.
 */
function stripComments(source) {
  let out = '';
  let state = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (character === '/' && next === '/') { state = 'line'; out += '  '; index += 1; continue; }
      if (character === '/' && next === '*') { state = 'block'; out += '  '; index += 1; continue; }
      if (character === "'" || character === '"' || character === '`') { state = character; out += character; continue; }
      out += character;
      continue;
    }
    if (state === 'line') {
      if (character === '\n') { state = 'code'; out += '\n'; continue; }
      out += ' ';
      continue;
    }
    if (state === 'block') {
      if (character === '*' && next === '/') { state = 'code'; out += '  '; index += 1; continue; }
      out += character === '\n' ? '\n' : ' ';
      continue;
    }
    out += character;
    if (character === '\\') { out += next ?? ''; index += 1; continue; }
    if (character === state) state = 'code';
  }
  return out;
}

const read = (relative) => stripComments(readFileSync(path.join(drawRoot, relative), 'utf8'));
const readRaw = (relative) => readFileSync(path.join(drawRoot, relative), 'utf8');

describe('Draw canvas source contract', () => {
  const canvas = read('canvas/DrawCanvas.tsx');
  const surface = read('canvas/DrawInteractiveSurface.tsx');

  it('no longer renders the exported SVG into an <img> in the main viewport', () => {
    expect(canvas).not.toContain('svgDataUrl');
    expect(canvas).not.toMatch(/<img\b/u);
    expect(canvas).not.toMatch(/data:image\/svg\+xml/u);
    // The export path may still build SVG, but only for download, not for the surface.
    expect(canvas).toContain('buildDrawSvg');
  });

  it('renders the interactive surface as a real SVG application widget', () => {
    expect(surface).toMatch(/role="application"/u);
    expect(surface).toMatch(/tabIndex=\{0\}/u);
    expect(surface).toContain('describeDrawSceneNode');
    expect(surface).toContain('describeDrawConnectorNode');
    expect(surface).toContain('projectDrawOverlay');
    expect(surface).toContain('drawStateToken');
    expect(surface).toContain('onDoubleClick');
    expect(surface).toContain('data-vgt-handle');
  });
});

describe('Draw canvas wiring contract', () => {
  const canvas = read('canvas/DrawCanvas.tsx');
  const session = read('interactions/drawCanvasSession.ts');
  const surface = read('canvas/DrawInteractiveSurface.tsx');

  it('routes pointer and keyboard input through the session and the existing controller', () => {
    for (const call of [
      'drawSessionPointerDown', 'drawSessionPointerMove', 'drawSessionPointerUp', 'drawSessionPointerCancel',
      'drawSessionDoubleClick', 'drawSessionKeyDown', 'drawSessionSetText', 'drawSessionEndText',
      'drawSessionCommand', 'DrawInteractiveSurface',
    ]) {
      expect(canvas, call).toContain(call);
    }
    // The session composes the existing engines instead of re-implementing them.
    for (const engineCall of [
      'beginDrawPointerInteraction', 'updateDrawPointerInteraction', 'endDrawPointerInteraction',
      'applyDrawKeyboardInteraction', 'hitTestDrawScene', 'moveDrawObjects', 'applyDrawZOrder',
      'groupDrawSelection', 'ungroupDrawSelection', 'deleteDrawObjects', 'setDrawObjectText',
    ]) {
      expect(session, engineCall).toContain(engineCall);
    }
    // No second hit-test or z-order implementation may appear in the session.
    expect(session).not.toMatch(/function\s+hitTest/u);
    expect(session).not.toMatch(/paintIndex/u);
  });

  it('wires every panel and the shape-library drop target into the visible component', () => {
    for (const panel of ['DrawShapeLibraryPanel', 'DrawLayerPanel', 'DrawStyleInspectorPanel']) {
      expect(canvas, panel).toContain(panel);
    }
    expect(canvas).toContain('insertStencilAtPageCentre');
    expect(canvas).toContain('layoutDrawPage');
    expect(canvas).toContain('exportDrawVisio');
    expect(canvas).toContain('importDrawVisio');
    expect(canvas).toContain('buildDrawPng');
    expect(canvas).toContain('packNativeDraw');
  });

  it('keeps live persistence on the canonical document path only', () => {
    // Exactly one persistence sink: the workspace document handed in by the shell.
    expect(canvas).toContain('onUpdateDocument({...workspaceDocument,drawData:');
    expect(canvas).not.toMatch(/localStorage/u);
    expect(canvas).not.toMatch(/indexedDB/u);
    // Keep the two app-guide anchors and the IME guard the shell contracts require.
    expect(canvas).toContain('Draw:first');
    expect(canvas).toContain('Draw:second');
    expect(canvas).toContain('isImeCompositionEvent');
  });

  it('respects reduced motion for the surface transitions', () => {
    expect(surface).toContain('motion-reduce');
  });
});

describe('Draw locale contract', () => {
  it('defines the interactive copy for all seven locales in one table', () => {
    const raw = readRaw('drawInteractionLocale.ts');
    expect(raw).toContain("'en-US'");
    for (const locale of ["'de-DE'", "'es-ES'", "'it-IT'", "'ja-JP'", "'ru-RU'", "'zh-CN'"]) {
      expect(raw, locale).toContain(locale);
    }
  });
});
