// STATUS: DIAMANT VGT SUPREME — a DOCX round trip must not lose its pictures (W-307)
//
// W-307, measured before the fix: `exportDocx` wrote `word/media/image1.png` **and** the drawing, and
// `importDocx` returned `images: []`. Opening a document the application had just exported lost **every
// picture, silently** — the text survived, so the file looked complete. That is why this is a data-loss
// finding and not a fidelity one.
//
// The witness here is a second code path, not a second assertion: the document goes out through the exporter
// and comes back through the importer, and the test compares what the user had with what the user gets.
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../../../../../platform/interop/docx/exporter';
import { importDocx } from '../../../../../../platform/interop/docx/importer';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/writer/workspaceWriterMedia';
import { buildBusinessLetter, LETTER_PNG_DATA_URL } from '../../../fixtures/writerBusinessLetter';
import type { TextBlockObject, WorkspaceDocument } from '../../../../../../shared/contracts/workspace';

/** The letter with the given pictures, so the round trip can be asked about placement as well. */
function letterWith(images: readonly Partial<WriterImageBlockData>[]): WorkspaceDocument {
  const letter = buildBusinessLetter();
  const existing = letter.writerData?.images?.[0];
  if (!existing) throw new Error('Die Vorlage hat kein Bild — der Test kann so nichts prüfen.');
  return {
    ...letter,
    writerData: {
      ...letter.writerData!,
      images: images.map((overrides, index) => ({
        ...existing,
        id: `img-${index + 1}`,
        anchorParagraphId: 'letter-image-anchor',
        ...overrides,
      })) as WriterImageBlockData[],
    },
  };
}

const roundTrip = async (doc: WorkspaceDocument): Promise<WriterImageBlockData[]> => {
  const restored = await importDocx(exportDocx(doc), 'rundlauf.docx');
  return (restored.writerData?.images ?? []) as WriterImageBlockData[];
};

describe('the picture survives the round trip', () => {
  it('comes back at all — the measured defect was zero', async () => {
    const before = letterWith([{ name: 'Schaubild.png', altText: 'Quartalsverlauf' }]);
    const after = await roundTrip(before);
    expect(after).toHaveLength(1);
  });

  it('comes back with its bytes and its type', async () => {
    const after = await roundTrip(letterWith([{ name: 'Schaubild.png' }]));
    const image = after[0]!;
    expect(image.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    // The bytes are the picture, not a placeholder: compare the decoded payload with the original.
    const original = LETTER_PNG_DATA_URL.split(',')[1]!;
    expect(image.dataUrl.split(',')[1]).toBe(original);
  });

  it('keeps the name and the alternative text a screen reader needs', async () => {
    const after = await roundTrip(letterWith([{ name: 'Umsatz.png', altText: 'Umsatz je Quartal' }]));
    expect(after[0]!.name).toBe('Umsatz.png');
    expect(after[0]!.altText).toBe('Umsatz je Quartal');
  });

  it('points back at the paragraph it was anchored to', async () => {
    const before = letterWith([{ name: 'Schaubild.png' }]);
    const restored = await importDocx(exportDocx(before), 'rundlauf.docx');
    const image = (restored.writerData?.images ?? [])[0] as WriterImageBlockData;
    // My first version looked in `writerData.paragraphs`, which does not exist — the imported text lives in
    // the root text block. The anchor must name a paragraph that really exists, or the picture loses its place.
    const textBlock = restored.objects[restored.root_object_ids[0] ?? '']?.data as TextBlockObject;
    const paragraphIds = textBlock.paragraphs.map((paragraph) => paragraph.id);
    expect(paragraphIds).toContain(image.anchorParagraphId);
    expect(image.anchorParagraphId).toBeTruthy();
  });

  it('keeps its share of the text column, so it does not drift on every save', async () => {
    for (const widthPercent of [30, 60, 100]) {
      const after = await roundTrip(letterWith([{ name: 'Schaubild.png', widthPercent }]));
      expect(after[0]!.widthPercent, `widthPercent ${widthPercent}`).toBe(widthPercent);
    }
  });

  it('keeps the aspect ratio', async () => {
    const after = await roundTrip(letterWith([{ name: 'Schaubild.png', intrinsicWidth: 800, intrinsicHeight: 400 }]));
    const image = after[0]!;
    expect(image.intrinsicHeight / image.intrinsicWidth).toBeCloseTo(0.5, 1);
  });

  it('survives twice: a second round trip changes nothing', async () => {
    // The second trip starts from the **imported** document — my first version patched the imported images
    // back into the original letter, whose anchor paragraph no longer matched, so the export had nothing to
    // place and the second import correctly found no picture. The test was wrong, not the code.
    const first = await importDocx(exportDocx(letterWith([{ name: 'Schaubild.png', widthPercent: 60 }])), 'eins.docx');
    const once = (first.writerData?.images ?? []) as WriterImageBlockData[];
    const second = await importDocx(exportDocx(first), 'zwei.docx');
    const twice = (second.writerData?.images ?? []) as WriterImageBlockData[];
    expect(twice).toHaveLength(1);
    expect(twice[0]!.widthPercent).toBe(once[0]!.widthPercent);
    expect(twice[0]!.dataUrl).toBe(once[0]!.dataUrl);
    expect(twice[0]!.name).toBe(once[0]!.name);
  });

  it('brings several pictures back in order', async () => {
    const after = await roundTrip(letterWith([
      { name: 'Erstes.png', altText: 'erstes' },
      { name: 'Zweites.png', altText: 'zweites' },
      { name: 'Drittes.png', altText: 'drittes' },
    ]));
    expect(after.map((image) => image.name)).toEqual(['Erstes.png', 'Zweites.png', 'Drittes.png']);
  });
});

describe('the imported picture is a real Writer picture', () => {
  it('carries everything the editor needs to render it', async () => {
    const after = await roundTrip(letterWith([{ name: 'Schaubild.png', widthPercent: 50, alignment: 'center' }]));
    const image = after[0]!;
    expect(image.id.length).toBeGreaterThan(0);
    expect(image.dataUrl.length).toBeGreaterThan(64);
    expect(Number.isFinite(image.intrinsicWidth)).toBe(true);
    expect(Number.isFinite(image.intrinsicHeight)).toBe(true);
    expect(image.intrinsicWidth).toBeGreaterThan(0);
    expect(image.widthPercent).toBeGreaterThanOrEqual(20);
    expect(image.widthPercent).toBeLessThanOrEqual(100);
    expect(['left', 'center', 'right']).toContain(image.alignment);
    // An inline picture in the Writer model.
    expect(image.placement).toBe('block');
  });

  it('does not invent pictures for a document without any', async () => {
    const letter = buildBusinessLetter();
    const withoutImages = { ...letter, writerData: { ...letter.writerData!, images: [] } } as WorkspaceDocument;
    expect(await roundTrip(withoutImages)).toEqual([]);
  });
});
