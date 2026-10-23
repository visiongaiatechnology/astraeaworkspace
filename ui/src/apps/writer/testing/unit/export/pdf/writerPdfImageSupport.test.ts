// STATUS: PLATIN — WR-043: PNG reaches the PDF, WebP is reported instead of vanishing
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import type { ImageBlockData, PageSetupConfig } from '../../../../types';
import { buildWriterPdf } from '../../../../interchange/export/pdf/writerPdfExport';
import {
  analyzeWriterPdfImageSupport,
  decodeWriterPdfImage,
} from '../../../../interchange/export/pdf/writerPdfImageSupport';

const PAGE_SETUP: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
};

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

/** A structurally valid PNG of colour type `colorType` (CRCs are irrelevant to the reader). */
function pngBytes(colorType: number, width = 1, height = 1): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, data: number[]): number[] => {
    const length = data.length;
    const bytes = [
      (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
      ...type.split('').map((character) => character.charCodeAt(0)),
      ...data,
      // CRC placeholder: the PDF reader does not verify it.
      0, 0, 0, 0,
    ];
    return bytes;
  };
  const ihdr = [
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    8, colorType, 0, 0, 0,
  ];
  const idat = [0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01];
  return new Uint8Array([...signature, ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', [])]);
}

function dataUrl(mime: string, bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

function image(id: string, source: string): ImageBlockData {
  return {
    id,
    name: `${id}.png`,
    dataUrl: source,
    intrinsicWidth: 1,
    intrinsicHeight: 1,
    widthPercent: 50,
    alignment: 'center',
    anchorParagraphId: 'p1',
    altText: id,
  } as ImageBlockData;
}

describe('WR-043 — image support classification', () => {
  it('classifies a grey PNG as an embeddable passthrough', () => {
    const decoded = decodeWriterPdfImage(dataUrl('image/png', pngBytes(0)));
    expect(decoded.kind).toBe('png');
    if (decoded.kind !== 'png') return;
    expect(decoded.colors).toBe(1);
    expect(decoded.colorSpace).toBe('/DeviceGray');
    expect(decoded.idat.length).toBeGreaterThan(0);
  });

  it('classifies an RGB PNG as three colour components', () => {
    const decoded = decodeWriterPdfImage(dataUrl('image/png', pngBytes(2)));
    expect(decoded.kind).toBe('png');
    if (decoded.kind !== 'png') return;
    expect(decoded.colors).toBe(3);
    expect(decoded.colorSpace).toBe('/DeviceRGB');
  });

  it('reports RGBA and palette problems instead of embedding them wrongly', () => {
    expect(decodeWriterPdfImage(dataUrl('image/png', pngBytes(6)))).toEqual({ kind: 'unsupported', reason: 'png-alpha' });
    expect(decodeWriterPdfImage(dataUrl('image/png', pngBytes(3)))).toEqual({ kind: 'unsupported', reason: 'png-palette-missing' });
  });

  it('reports WebP as unsupported (PDF has no WebP filter)', () => {
    expect(decodeWriterPdfImage('data:image/webp;base64,UklGRg==')).toEqual({ kind: 'unsupported', reason: 'webp' });
  });

  it('counts embeddable and unsupported images for the surface', () => {
    const support = analyzeWriterPdfImageSupport([
      { dataUrl: dataUrl('image/png', pngBytes(2)) },
      { dataUrl: 'data:image/webp;base64,UklGRg==' },
      { dataUrl: dataUrl('image/png', pngBytes(6)) },
    ]);
    expect(support).toEqual({ total: 3, embeddable: 1, unsupported: 2 });
  });
});

describe('WR-043 — the PDF really carries the PNG', () => {
  it('writes a FlateDecode image with the PNG predictor', () => {
    const pdf = buildWriterPdf(
      'PNG-Test',
      [paragraph('p1', 'Text mit Bild')],
      PAGE_SETUP,
      [],
      [image('img-1', dataUrl('image/png', pngBytes(2)))],
    );
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/FlateDecode');
    expect(text).toContain('/Predictor 15');
    expect(text).toContain('/DeviceRGB');
  });

  it('does not invent an image resource for a WebP', () => {
    const pdf = buildWriterPdf(
      'WebP-Test',
      [paragraph('p1', 'Text')],
      PAGE_SETUP,
      [],
      [image('img-1', 'data:image/webp;base64,UklGRg==')],
    );
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text).not.toContain('/Predictor 15');
  });
});
