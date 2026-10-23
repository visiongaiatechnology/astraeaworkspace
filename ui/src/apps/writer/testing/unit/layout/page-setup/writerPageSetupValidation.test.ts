// STATUS: PLATIN — Writer page setup boundary tests
import { describe, expect, it } from 'vitest';
import type { WriterPageSetupConfig } from '../../../../../../shared/contracts/workspace';
import { validateWriterPageSetup } from '../../../../layout/page-setup/writerPageSetupValidation';

const VALID_SETUP: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

describe('Writer page setup validation', () => {
  it('accepts bounded standard and custom layouts', () => {
    expect(validateWriterPageSetup(VALID_SETUP)).toBeNull();
    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      paperSize: 'Custom',
      customWidthMm: 210,
      customHeightMm: 297,
      columns: 3,
      columnGapMm: 12,
    })).toBeNull();
  });

  it('rejects invalid custom geometry and non-finite values', () => {
    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      paperSize: 'Custom',
      customWidthMm: Number.NaN,
      customHeightMm: 297,
    })).toMatch(/25 und 2.000/);
  });

  it('rejects unsafe margin and column-gap boundaries', () => {
    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      margins: 'custom',
      customMargins: { top: -1, bottom: 20, left: 20, right: 20, gutter: 0 },
    })).toMatch(/Seitenränder/);
    expect(validateWriterPageSetup({ ...VALID_SETUP, columnGapMm: 101 })).toMatch(/Spaltenabstand/);
  });

  it('accepts 4 columns and bounded column widths and page borders', () => {
    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      columns: 4,
      columnWidthsMm: [32.3, 32.3, 32.3, 32.3],
      pageBorders: {
        style: 'solid',
        widthPt: 2,
        color: '#000000',
        paddingMm: 10,
      },
    })).toBeNull();

    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      columns: 5 as unknown as 4,
    })).toMatch(/zwischen eins und vier/);

    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      columnWidthsMm: [0],
    })).toMatch(/Individuelle Spaltenbreiten/);
  });

  it('rejects oversized first, even, and default header or footer content', () => {
    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      firstPageDifferent: true,
      firstPageHeaderText: 'x'.repeat(4_097),
    })).toMatch(/4\.096/);
    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      oddEvenDifferent: true,
      evenPageFooterText: 'x'.repeat(4_097),
    })).toMatch(/4\.096/);
    expect(validateWriterPageSetup({
      ...VALID_SETUP,
      headerText: 'x'.repeat(4_097),
    })).toMatch(/4\.096/);
  });
});
