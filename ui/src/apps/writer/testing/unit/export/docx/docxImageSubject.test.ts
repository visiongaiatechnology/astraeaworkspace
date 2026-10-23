// STATUS: DIAMANT VGT SUPREME — a blocked export names the image that blocks it (W-297)
//
// W-297, measured: the DOCX export refuses a foreign image format by decision (never silently dropping
// content — that is the point of the file), and the message said **what** was wrong but not **which** image.
// In a document with thirty pictures the user had to guess. The messages now carry the image's own name and
// its position, and they deliberately never carry the data URL: an error travels into logs and dialogs, and
// a base64 image inside one is both a leak and unreadable.
//
// My first version of this file guessed the boundaries — it used `image/webp` as the "foreign" format and
// 200 images as "too many", and both are **supported** by this module. The limits are imported now, so the
// test cannot drift away from the code it checks.
import { describe, expect, it } from 'vitest';
import {
  MAX_DOCX_IMAGE_BYTES,
  MAX_DOCX_IMAGES,
  collectDocxImagePackage,
} from '../../../../../../platform/interop/docx/export/images';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/writer/workspaceWriterMedia';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
/** A format this export genuinely does not support (png, jpeg, jpg, gif, webp and bmp are supported). */
const FOREIGN = 'data:image/tiff;base64,AAAA';
const SUPPORTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp'] as const;

function image(overrides: Partial<WriterImageBlockData> = {}): WriterImageBlockData {
  return {
    id: 'img-1',
    name: 'Schaubild.png',
    dataUrl: PNG,
    intrinsicWidth: 800,
    intrinsicHeight: 600,
    widthPercent: 60,
    alignment: 'center',
    ...overrides,
  } as WriterImageBlockData;
}

/** Runs the export and returns the message, so no test has to guess the wording. */
function messageOf(images: readonly WriterImageBlockData[]): string {
  try {
    collectDocxImagePackage(images, 160, 10);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

describe('the formats this export supports are the ones the module lists', () => {
  it('packages every supported format', () => {
    for (const mimeType of SUPPORTED) {
      const pkg = collectDocxImagePackage([image({ dataUrl: `data:${mimeType};base64,iVBORw0KGgo=` })], 160, 10);
      expect(pkg.parts, mimeType).toHaveLength(1);
    }
  });
});

describe('a blocked export says which image is in the way', () => {
  it('names a foreign format, with position and name', () => {
    const images = [image(), image({ id: 'img-2', name: 'Diagramm.tif', dataUrl: FOREIGN })];
    const message = messageOf(images);
    expect(message).toContain('Bildformat image/tiff');
    expect(message).toContain('Diagramm.tif');
    // Position makes it findable even if the name is not unique.
    expect(message).toContain('2 von 2');
  });

  it('names the image for every way it can fail', () => {
    const cases: readonly [string, WriterImageBlockData, RegExp][] = [
      ['no data URL', image({ dataUrl: 'file:///C:/bilder/verlauf.png' }), /Daten-URL/u],
      ['empty payload', image({ dataUrl: 'data:image/png;base64,' }), /keine Daten/u],
      ['broken base64', image({ dataUrl: 'data:image/png;base64,!!!!' }), /Base64/u],
      ['foreign format', image({ dataUrl: FOREIGN }), /Bildformat/u],
    ];
    for (const [label, broken, reason] of cases) {
      const message = messageOf([image(), broken]);
      expect(message, label).toMatch(reason);
      expect(message, label).toContain('Schaubild.png');
      expect(message, label).toContain('2 von 2');
    }
  });

  it('falls back to the alternative text, and then to “ohne Namen”', () => {
    const unnamed = messageOf([image({ name: '', altText: 'Verlaufsdiagramm', dataUrl: FOREIGN })]);
    expect(unnamed).toContain('Verlaufsdiagramm');
    expect(unnamed).toContain('1 von 1');

    const anonymous = messageOf([image({ name: '', altText: '', dataUrl: FOREIGN })]);
    expect(anonymous).toContain('ohne Namen');
  });

  it('names the image that exceeds the single-image budget', () => {
    // The limit is imported, not guessed: the first version of this test used 64 KB and stayed far below it.
    const tooBig = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_DOCX_IMAGE_BYTES + 16) / 3) * 4)}`;
    const message = messageOf([image(), image({ id: 'img-2', name: 'Riesig.png', dataUrl: tooBig })]);
    expect(message).toContain('Riesig.png');
    expect(message).toContain('2 von 2');
    expect(message).toMatch(/zu groß/u);
  });
});

describe('an error message is not a place for image data', () => {
  it('never contains the data URL', () => {
    const message = messageOf([image({ name: 'Geheim.tif', dataUrl: 'data:image/tiff;base64,SECRETPAYLOAD123456' })]);
    expect(message).not.toContain('SECRETPAYLOAD');
    expect(message).not.toContain('base64,');
  });

  it('stays short enough for a dialog', () => {
    const message = messageOf([image({ name: 'x'.repeat(300), dataUrl: FOREIGN })]);
    expect(message.length).toBeLessThan(400);
  });
});

describe('the healthy path is untouched', () => {
  it('still packages a supported image', () => {
    const pkg = collectDocxImagePackage([image()], 160, 10);
    expect(pkg.resources).toHaveLength(1);
    expect(pkg.extensions).toContain('png');
  });

  it('still refuses more images than the limit allows', () => {
    const many = Array.from({ length: MAX_DOCX_IMAGES + 1 }, (_value, index) => image({ id: `img-${index}`, name: `Bild ${index}.png` }));
    expect(() => collectDocxImagePackage(many, 160, 10)).toThrow(/höchstens/u);
  });
});
