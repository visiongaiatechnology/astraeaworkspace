// STATUS: DIAMANT VGT SUPREME
import { describe, expect, it } from 'vitest';
import { createPdfFromRenderPages } from '../../../platform/rendering/pdfCreationService';
import { renderSnapshotSignature } from '../../../platform/rendering/deterministicSnapshot';
import { createDeterministicSvgSnapshot } from '../../../platform/rendering/svgSnapshotService';
import { resolveCanonicalPageGeometry } from '../../../platform/rendering/renderGeometry';
import type { RenderSnapshotPage } from '../../../platform/rendering/renderTypes';

function fixture(): RenderSnapshotPage[] {
  const geometry = resolveCanonicalPageGeometry({
    widthMm: 210,
    heightMm: 297,
    marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
  }, 'pt');
  return [{
    geometry,
    primitives: [
      { kind: 'text', x: 48, y: 64, text: 'Astraea deterministic render', color: '#111111', font: '12px sans-serif', sourceId: 'title' },
      { kind: 'rect', x: 48, y: 82, width: 144, height: 24, color: '#e2e8f0', sourceId: 'box' },
    ],
  }];
}

describe('shared rendering determinism', () => {
  it('produces a stable canonical screenshot/export signature', () => {
    expect(renderSnapshotSignature(fixture())).toBe(renderSnapshotSignature(fixture()));
  });

  it('produces byte-identical vector screenshots for identical canonical pages', () => {
    expect(createDeterministicSvgSnapshot(fixture()[0]!)).toBe(createDeterministicSvgSnapshot(fixture()[0]!));
  });

  it('produces byte-identical PDF output for identical canonical pages', () => {
    expect(Array.from(createPdfFromRenderPages(fixture(), 'Determinism')))
      .toEqual(Array.from(createPdfFromRenderPages(fixture(), 'Determinism')));
  });
});
