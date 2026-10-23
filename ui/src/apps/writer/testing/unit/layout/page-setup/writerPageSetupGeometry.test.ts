// STATUS: DIAMANT VGT SUPREME — Paper format and margins: preview must equal the laid-out page
//
// The acceptance is "A4/Letter, Hoch/Quer, Ränder ändern und mit Vorschau korrekt
// speichern". The dialog previews the usable body width with
// `pageWidth - inside - outside - gutter`, while pagination derives it from
// `resolveWriterPhysicalPageMarginsMm`. Nothing pinned that the two agree — this
// file does, for every preset, both orientations and both page sides.
import { describe, expect, it } from 'vitest';
import type { PageSetupConfig } from '../../../../types';
import {
  resolveWriterMarginDefinitionMm,
  resolveWriterPhysicalPageMarginsMm,
  WRITER_MARGIN_PRESETS_MM,
} from '../../../../../../platform/document-layout/writerPageMargins';
import { resolveWriterPaperDimensionsMm } from '../../../../../../platform/document-layout/writerPaperSizes';
import { validateWriterPageSetup } from '../../../../layout/page-setup/writerPageSetupValidation';

const setup = (overrides: Partial<PageSetupConfig> = {}): PageSetupConfig => ({
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  // The decoration checks run before the margin checks, so the fixture has to be
  // a valid page setup or every case would fail for the wrong reason.
  paperColor: 'white',
  ...overrides,
} as PageSetupConfig);

/** Exactly the formula the page-setup dialog previews with. */
function previewBodyWidthMm(config: PageSetupConfig): number {
  const dimensions = resolveWriterPaperDimensionsMm(config);
  const pageWidth = config.orientation === 'landscape' ? dimensions.height : dimensions.width;
  const margins = resolveWriterMarginDefinitionMm(config);
  return pageWidth - margins.inside - margins.outside - margins.gutter;
}

/** Exactly the formula pagination lays out with. */
function laidOutBodyWidthMm(config: PageSetupConfig, pageIndex = 1): number {
  const dimensions = resolveWriterPaperDimensionsMm(config);
  const pageWidth = config.orientation === 'landscape' ? dimensions.height : dimensions.width;
  const physical = resolveWriterPhysicalPageMarginsMm(config, pageIndex);
  return pageWidth - physical.left - physical.right;
}

const PRESETS = ['normal', 'narrow', 'wide', 'mirrored'] as const;

describe('Writer page setup geometry', () => {
  it('knows A4 and Letter with their real millimetre sizes', () => {
    expect(resolveWriterPaperDimensionsMm(setup({ paperSize: 'A4' })))
      .toEqual({ width: 210, height: 297 });
    expect(resolveWriterPaperDimensionsMm(setup({ paperSize: 'Letter' })))
      .toEqual({ width: 215.9, height: 279.4 });
  });

  it('swaps width and height for landscape and back for portrait', () => {
    const a4 = resolveWriterPaperDimensionsMm(setup({ paperSize: 'A4' }));
    const portrait = setup({ orientation: 'portrait' });
    const landscape = setup({ orientation: 'landscape' });
    expect(previewBodyWidthMm(landscape)).toBeGreaterThan(previewBodyWidthMm(portrait));
    // The landscape body is the portrait page height minus the side margins.
    expect(laidOutBodyWidthMm(landscape))
      .toBeCloseTo(a4.height - WRITER_MARGIN_PRESETS_MM.normal.inside - WRITER_MARGIN_PRESETS_MM.normal.outside, 6);
  });

  it('gives A4 and Letter different usable widths', () => {
    const a4 = laidOutBodyWidthMm(setup({ paperSize: 'A4' }));
    const letter = laidOutBodyWidthMm(setup({ paperSize: 'Letter' }));
    expect(letter).not.toBe(a4);
    expect(letter - a4).toBeCloseTo(5.9, 6);
  });

  it('previews exactly the width pagination lays out — every preset, both orientations', () => {
    for (const paperSize of ['A4', 'Letter'] as const) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        for (const margins of PRESETS) {
          const config = setup({ paperSize, orientation, margins });
          expect(previewBodyWidthMm(config)).toBeCloseTo(laidOutBodyWidthMm(config), 9);
        }
      }
    }
  });

  it('previews exactly the width pagination lays out for custom margins and a gutter', () => {
    const config = setup({
      margins: 'custom',
      orientation: 'landscape',
      customMargins: { top: 10, bottom: 10, left: 15, right: 20, gutter: 8 },
    });
    expect(previewBodyWidthMm(config)).toBeCloseTo(laidOutBodyWidthMm(config), 9);
    expect(laidOutBodyWidthMm(config)).toBeCloseTo(297 - 15 - 20 - 8, 6);
  });

  it('keeps the usable width identical on odd and even pages, only swapping the sides', () => {
    const config = setup({ margins: 'mirrored' });
    const odd = resolveWriterPhysicalPageMarginsMm(config, 1);
    const even = resolveWriterPhysicalPageMarginsMm(config, 2);
    expect(odd.left).not.toBe(even.left);
    expect(odd.left + odd.right).toBeCloseTo(even.left + even.right, 9);
    expect(laidOutBodyWidthMm(config, 1)).toBeCloseTo(laidOutBodyWidthMm(config, 2), 9);
  });

  it('accepts the shipped presets and A4/Letter in both orientations', () => {
    for (const paperSize of ['A4', 'Letter'] as const) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        for (const margins of PRESETS) {
          expect(validateWriterPageSetup(setup({ paperSize, orientation, margins }))).toBeNull();
        }
      }
    }
  });

  it('refuses margins that would leave less than 10 mm of usable width', () => {
    // A5 landscape is 210 mm wide; 105 + 105 mm of side margins leaves nothing.
    const impossible = setup({
      paperSize: 'A5',
      orientation: 'landscape',
      margins: 'custom',
      customMargins: { top: 10, bottom: 10, left: 105, right: 105, gutter: 0 },
    });
    expect(validateWriterPageSetup(impossible)).toContain('10 mm');
  });

  it('refuses margins outside 0–200 mm and custom sizes outside 25–2000 mm', () => {
    expect(validateWriterPageSetup(setup({
      margins: 'custom',
      customMargins: { top: -1, bottom: 10, left: 10, right: 10, gutter: 0 },
    }))).toContain('200 mm');
    expect(validateWriterPageSetup(setup({ paperSize: 'Custom', customWidthMm: 10, customHeightMm: 297 })))
      .toContain('25');
    expect(validateWriterPageSetup(setup({ paperSize: 'Custom', customWidthMm: 210 }))).toContain('25');
  });

  it('refuses top and bottom margins that would leave no usable height', () => {
    const impossible = setup({
      paperSize: 'A5',
      orientation: 'landscape',
      margins: 'custom',
      customMargins: { top: 100, bottom: 100, left: 10, right: 10, gutter: 0 },
    });
    expect(validateWriterPageSetup(impossible)).toContain('10 mm');
  });
});
