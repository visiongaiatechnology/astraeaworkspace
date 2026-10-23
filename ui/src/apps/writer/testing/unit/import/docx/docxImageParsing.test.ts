// STATUS: DIAMANT VGT SUPREME — reading pictures out of a DOCX (W-307)
//
// The round trip covers the happy path end to end (`docxImageRoundTrip.test.ts`). This file tests the rules
// of the pure module directly, because two of them the round trip **cannot** reach yet:
//
//   • a floating picture (`wp:anchor`) — the exporter writes inline drawings only today (W-290), so only a
//     hand-written document can prove that the reader understands an anchor;
//   • the cases that must not throw — a chart, a shape, a picture whose media part is missing. A Word file
//     is allowed to contain drawings this application does not model, and refusing the whole document would
//     make the importer useless.
import { describe, expect, it } from 'vitest';
import { parseDocxImages } from '../../../../../../platform/interop/docx/import/images';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const drawing = (body: string, docPr = '<wp:docPr id="1" name="Schaubild.png" descr="Quartalsverlauf"/>'): string =>
  `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>${body}${docPr}<a:graphic><a:blip r:embed="rId7"/></a:graphic></w:drawing></w:r></w:p>`;

const inline = (distances = 'distT="0" distB="0" distL="0" distR="0"'): string =>
  drawing(`<wp:inline ${distances}><wp:extent cx="2160000" cy="1080000"/></wp:inline>`);

const anchor = (inner: string, attributes = 'distT="0" distB="0" distL="0" distR="0" behindDoc="0"'): string =>
  drawing(`<wp:anchor ${attributes}><wp:extent cx="2160000" cy="1080000"/>${inner}</wp:anchor>`);

const input = (paragraphXmlBlocks: readonly string[], overrides: Partial<Parameters<typeof parseDocxImages>[0]> = {}) => ({
  paragraphXmlBlocks,
  paragraphIds: paragraphXmlBlocks.map((_xml, index) => `p-${index + 1}`),
  relationshipTargets: new Map([['rId7', 'word/media/image1.png']]),
  entries: new Map([['word/media/image1.png', PNG_BYTES]]),
  textColumnWidthMm: 160,
  ...overrides,
});

describe('an inline picture', () => {
  it('becomes a block picture with its name, text and size', () => {
    const { images, missingMedia } = parseDocxImages(input([inline()]));
    expect(missingMedia).toEqual([]);
    expect(images).toHaveLength(1);
    const image = images[0]!;
    expect(image.placement).toBe('block');
    expect(image.wrapMode).toBe('inline');
    expect(image.name).toBe('Schaubild.png');
    expect(image.altText).toBe('Quartalsverlauf');
    expect(image.alignment).toBe('center');
    expect(image.anchorParagraphId).toBe('p-1');
    // 2 160 000 EMU = 60 mm of a 160 mm column.
    expect(image.widthPercent).toBe(38);
    expect(image.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('keeps the display size inside the model’s own bounds', () => {
    const tooWide = drawing('<wp:inline><wp:extent cx="72000000" cy="1000"/></wp:inline>');
    const tooNarrow = drawing('<wp:inline><wp:extent cx="3600" cy="1000"/></wp:inline>');
    expect(parseDocxImages(input([tooWide])).images[0]!.widthPercent).toBe(100);
    expect(parseDocxImages(input([tooNarrow])).images[0]!.widthPercent).toBe(20);
  });
});

describe('a floating picture — the pattern the round trip cannot produce yet (W-290)', () => {
  it('reads which side it floats to', () => {
    const left = anchor('<wp:positionH relativeFrom="column"><wp:align>left</wp:align></wp:positionH>');
    const right = anchor('<wp:positionH relativeFrom="column"><wp:align>right</wp:align></wp:positionH>');
    expect(parseDocxImages(input([left])).images[0]!.placement).toBe('float-left');
    expect(parseDocxImages(input([right])).images[0]!.placement).toBe('float-right');
  });

  it('reads every wrap mode the model knows', () => {
    const cases: readonly [string, string][] = [
      ['<wp:wrapSquare wrapText="bothSides"/>', 'square'],
      ['<wp:wrapTight wrapText="bothSides"/>', 'tight'],
      ['<wp:wrapThrough wrapText="bothSides"/>', 'through'],
      ['<wp:wrapTopAndBottom/>', 'top-bottom'],
      ['<wp:wrapNone/>', 'in-front-of-text'],
    ];
    for (const [xml, expected] of cases) {
      const block = parseDocxImages(input([anchor(xml)])).images[0]!;
      expect(block.wrapMode, xml).toBe(expected);
    }
  });

  it('tells “behind the text” apart from “in front of it”', () => {
    const behind = anchor('<wp:wrapNone/>', 'behindDoc="1"');
    expect(parseDocxImages(input([behind])).images[0]!.wrapMode).toBe('behind-text');
  });

  it('reads the wrap distances in millimetres', () => {
    const block = anchor('<wp:wrapSquare/>', 'distT="72000" distB="36000" distL="18000" distR="54000" behindDoc="0"');
    const image = parseDocxImages(input([block])).images[0]!;
    expect(image.wrapDistanceTopMm).toBe(2);
    expect(image.wrapDistanceBottomMm).toBe(1);
    expect(image.wrapDistanceLeftMm).toBe(0.5);
    expect(image.wrapDistanceRightMm).toBe(1.5);
  });
});

describe('drawings this application does not model are left alone, not fatal', () => {
  it('ignores a drawing without a picture', () => {
    const chart = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/></wp:inline><a:graphic><c:chart r:id="rId9"/></a:graphic></w:drawing></w:r></w:p>';
    expect(parseDocxImages(input([chart])).images).toEqual([]);
  });

  it('reports a picture whose media part is missing instead of dropping it in silence', () => {
    const result = parseDocxImages(input([inline()], { entries: new Map() }));
    expect(result.images).toEqual([]);
    expect(result.missingMedia).toEqual(['word/media/image1.png']);
  });

  it('reports a relationship that cannot be resolved', () => {
    const result = parseDocxImages(input([inline()], { relationshipTargets: new Map() }));
    expect(result.images).toEqual([]);
    expect(result.missingMedia).toEqual(['rId7']);
  });

  it('skips a format it cannot name rather than guessing one', () => {
    const result = parseDocxImages(input([inline()], {
      relationshipTargets: new Map([['rId7', 'word/media/image1.tiff']]),
      entries: new Map([['word/media/image1.tiff', PNG_BYTES]]),
    }));
    expect(result.images).toEqual([]);
    expect(result.missingMedia).toEqual(['word/media/image1.tiff']);
  });

  it('reads a picture even when its paragraph holds no text', () => {
    const images = parseDocxImages(input([inline(), '<w:p><w:r><w:t>Text ohne Bild</w:t></w:r></w:p>'])).images;
    expect(images).toHaveLength(1);
    expect(images[0]!.anchorParagraphId).toBe('p-1');
  });

  it('stops at the picture limit instead of reading a hostile package forever', () => {
    const many = Array.from({ length: 300 }, () => inline());
    expect(parseDocxImages(input(many)).images.length).toBeLessThanOrEqual(256);
  });
});

describe('the name is never empty', () => {
  it('falls back when the document carries no name', () => {
    const unnamed = drawing('<wp:inline><wp:extent cx="2160000" cy="1080000"/></wp:inline>', '<wp:docPr id="1"/>');
    const image = parseDocxImages(input([unnamed])).images[0]!;
    expect(image.name).toBe('Bild 1');
    expect(image.altText).toBeUndefined();
  });
});
