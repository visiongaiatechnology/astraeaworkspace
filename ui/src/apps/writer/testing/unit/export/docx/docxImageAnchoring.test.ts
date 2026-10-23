// STATUS: DIAMANT VGT SUPREME — text wraps around a floated picture (W-290)
//
// W-290, measured: `float-left` and `float-right` were exported as `<wp:inline>`, so a picture the author had
// placed **beside** the text pushed the text down instead. The code comment justified it ("a floating picture
// would need positioning data the Writer model does not carry per page") — but the model carries `placement`,
// `wrapMode` and the four wrap distances, and a float needs no page coordinates, only a position relative to
// the column and the paragraph.
//
// Two witnesses, because one is not enough for XML a word processor has to accept:
//   • the **round trip** through this project's own importer, which reads anchors (W-307);
//   • the **structure** of the produced XML, checked against the schema's child order.
// Neither replaces opening the file in Word — that stays for the visible acceptance.
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../../../../../platform/interop/docx/exporter';
import { importDocx } from '../../../../../../platform/interop/docx/importer';
import { imageToWordXml, resolveDocxImageSizeEmu } from '../../../../../../platform/interop/docx/export/images';
import type { DocxImageResource } from '../../../../../../platform/interop/docx/export/images';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/writer/workspaceWriterMedia';
import type { WorkspaceDocument } from '../../../../../../shared/contracts/workspace';
import { buildBusinessLetter } from '../../../fixtures/writerBusinessLetter';

/** `word/document.xml` out of the produced package — the place the drawing lands in. */
function documentXml(bytes: Uint8Array): string {
  const text = new TextDecoder('latin1').decode(bytes);
  const start = text.indexOf('<w:document');
  const end = text.indexOf('</w:document>');
  return start >= 0 && end > start ? text.slice(start, end) : text;
}

function letterWithImage(overrides: Partial<WriterImageBlockData>): WorkspaceDocument {
  const letter = buildBusinessLetter();
  const existing = letter.writerData?.images?.[0];
  if (!existing) throw new Error('Die Vorlage hat kein Bild.');
  return {
    ...letter,
    writerData: {
      ...letter.writerData!,
      images: [{ ...existing, id: 'img-1', anchorParagraphId: 'letter-image-anchor', ...overrides }],
    },
  };
}

const roundTripImage = async (overrides: Partial<WriterImageBlockData>): Promise<WriterImageBlockData> => {
  const restored = await importDocx(exportDocx(letterWithImage(overrides)), 'umbruch.docx');
  const images = (restored.writerData?.images ?? []) as WriterImageBlockData[];
  expect(images).toHaveLength(1);
  return images[0]!;
};

describe('a floated picture stays floated (the round trip is the witness)', () => {
  it('comes back floating to the same side', async () => {
    expect((await roundTripImage({ placement: 'float-left' })).placement).toBe('float-left');
    expect((await roundTripImage({ placement: 'float-right' })).placement).toBe('float-right');
  });

  it('comes back with its wrap mode', async () => {
    for (const wrapMode of ['square', 'tight', 'through', 'top-bottom', 'behind-text', 'in-front-of-text'] as const) {
      const restored = await roundTripImage({ placement: 'float-left', wrapMode });
      expect(restored.wrapMode, wrapMode).toBe(wrapMode);
    }
  });

  it('comes back with its wrap distances', async () => {
    const restored = await roundTripImage({
      placement: 'float-left',
      wrapMode: 'square',
      wrapDistanceLeftMm: 4,
      wrapDistanceRightMm: 2.5,
      wrapDistanceTopMm: 1,
      wrapDistanceBottomMm: 1.5,
    });
    expect(restored.wrapDistanceLeftMm).toBe(4);
    expect(restored.wrapDistanceRightMm).toBe(2.5);
    expect(restored.wrapDistanceTopMm).toBe(1);
    expect(restored.wrapDistanceBottomMm).toBe(1.5);
  });

  it('keeps an inline picture inline', async () => {
    const restored = await roundTripImage({ placement: 'block' });
    expect(restored.placement).toBe('block');
    expect(restored.wrapMode).toBe('inline');
  });
});

describe('the produced XML has the shape the schema demands', () => {
  const resource = (image: Partial<WriterImageBlockData>): DocxImageResource => {
    const full = { id: 'i', name: 'Schaubild.png', dataUrl: '', intrinsicWidth: 800, intrinsicHeight: 400, widthPercent: 50, alignment: 'left', ...image } as WriterImageBlockData;
    return { image: full, relationshipId: 'rId9', partName: 'word/media/image1.png', ...resolveDocxImageSizeEmu(full, 160) } as DocxImageResource;
  };

  it('uses an anchor for a float and an inline for a block picture', () => {
    expect(imageToWordXml(resource({ placement: 'float-left' }), 1)).toContain('<wp:anchor');
    expect(imageToWordXml(resource({ placement: 'float-left' }), 1)).not.toContain('<wp:inline');
    expect(imageToWordXml(resource({ placement: 'block' }), 1)).toContain('<wp:inline');
    expect(imageToWordXml(resource({}), 1)).toContain('<wp:inline');
  });

  it('writes the children in the schema’s order', () => {
    // CT_Anchor is a sequence, not a choice: Word refuses the file when the order is wrong.
    const xml = imageToWordXml(resource({ placement: 'float-right', wrapMode: 'square' }), 3);
    const order = ['<wp:simplePos', '<wp:positionH', '<wp:positionV', '<wp:extent', '<wp:effectExtent', '<wp:wrapSquare', '<wp:docPr', '<wp:cNvGraphicFramePr', '<a:graphic>'];
    let cursor = -1;
    for (const marker of order) {
      const at = xml.indexOf(marker);
      expect(at, marker).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('places a right-floated picture on the right of the column', () => {
    const xml = imageToWordXml(resource({ placement: 'float-right' }), 1);
    expect(xml).toContain('<wp:positionH relativeFrom="column"><wp:align>right</wp:align></wp:positionH>');
    expect(imageToWordXml(resource({ placement: 'float-left' }), 1)).toContain('<wp:align>left</wp:align>');
  });

  it('asks for the wrap the author chose', () => {
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'square' }), 1)).toContain('<wp:wrapSquare wrapText="bothSides"/>');
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'top-bottom' }), 1)).toContain('<wp:wrapTopAndBottom/>');
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'tight' }), 1)).toContain('<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon');
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'through' }), 1)).toContain('<wp:wrapThrough wrapText="bothSides"><wp:wrapPolygon');
  });

  it('puts a picture behind the text only when it was asked to', () => {
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'behind-text' }), 1)).toContain('behindDoc="1"');
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'behind-text' }), 1)).toContain('<wp:wrapNone/>');
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'in-front-of-text' }), 1)).toContain('behindDoc="0"');
    expect(imageToWordXml(resource({ placement: 'float-left', wrapMode: 'square' }), 1)).toContain('behindDoc="0"');
  });

  it('gives every drawing its own z-order', () => {
    // A shared `relativeHeight` would make the stacking depend on document order alone.
    expect(imageToWordXml(resource({ placement: 'float-left' }), 4)).toContain('relativeHeight="4"');
    expect(imageToWordXml(resource({ placement: 'float-left' }), 9)).toContain('relativeHeight="9"');
  });

  it('writes the distances in EMU and keeps them sane', () => {
    const xml = imageToWordXml(resource({ placement: 'float-left', wrapDistanceLeftMm: 4, wrapDistanceRightMm: 0 }), 1);
    expect(xml).toContain('distL="144000"'); // 4 mm
    expect(xml).toContain('distR="0"');
    // Word's own default when the model says nothing.
    expect(imageToWordXml(resource({ placement: 'float-left' }), 1)).toContain('distL="115200"'); // 3.2 mm
    // A nonsensical value must not produce broken XML.
    const absurd = imageToWordXml(resource({ placement: 'float-left', wrapDistanceLeftMm: -5, wrapDistanceTopMm: 9999 }), 1);
    expect(absurd).toContain('distL="0"');
    expect(absurd).toContain('distT="3600000"'); // clamped to 100 mm
  });

  it('does not move a floating picture twice with a paragraph alignment', () => {
    expect(imageToWordXml(resource({ placement: 'float-left', alignment: 'center' }), 1)).not.toContain('<w:jc');
    // …while an inline picture keeps its alignment, which is how it is positioned at all.
    expect(imageToWordXml(resource({ placement: 'block', alignment: 'center' }), 1)).toContain('<w:jc w:val="center"/>');
  });

  it('keeps the picture itself identical in both forms', () => {
    const inline = imageToWordXml(resource({ placement: 'block' }), 1);
    const anchor = imageToWordXml(resource({ placement: 'float-left' }), 1);
    const picture = /<a:graphic>.*<\/a:graphic>/u;
    expect(inline.match(picture)?.[0]).toBe(anchor.match(picture)?.[0]);
    expect(anchor).toContain('<a:blip r:embed="rId9"/>');
  });
});

describe('the exported package still holds what Word needs', () => {
  it('carries the anchor in document.xml and the picture in the media part', () => {
    const bytes = exportDocx(letterWithImage({ placement: 'float-right', wrapMode: 'square' }));
    const xml = documentXml(bytes);
    expect(xml).toContain('<wp:anchor');
    expect(xml).toContain('<wp:align>right</wp:align>');
    // The relationship and the part must both be there, or the anchor points at nothing.
    expect(new TextDecoder('utf8').decode(bytes)).toContain('word/media/image1.png');
  });
});
