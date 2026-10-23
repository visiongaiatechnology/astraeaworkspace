// STATUS: DIAMANT VGT SUPREME — searchable OCR layer renderer for canonical structured PDFs.

import type { PdfOcrLayerModel } from '../../../../shared/contracts/workspace';
import type { PdfStructureSpec } from '../../editing/structuredPdfEditRendering';

export interface StructuredPdfOcrRenderResult {
  commands: string[];
  structureSpecs: PdfStructureSpec[];
  nextMcid: number;
}

const WIN_ANSI_SPECIAL = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

function winAnsiHex(value: string): string {
  let hex = '';
  for (const char of value.normalize('NFC').slice(0, 512)) {
    const code = char.codePointAt(0) ?? 0x3f;
    let byte = 0x3f;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) byte = code;
    else byte = WIN_ANSI_SPECIAL.get(code) ?? 0x3f;
    hex += byte.toString(16).padStart(2, '0').toUpperCase();
  }
  return hex || '3F';
}

export function renderStructuredPdfOcrLayer(
  layer: PdfOcrLayerModel | undefined,
  taggedStructure: boolean,
  startMcid: number,
): StructuredPdfOcrRenderResult {
  if (!layer?.lines.length) return { commands: [], structureSpecs: [], nextMcid: startMcid };
  const commands: string[] = ['3 Tr'];
  const structureSpecs: PdfStructureSpec[] = [];
  let nextMcid = startMcid;
  for (const line of layer.lines.slice(0, 20_000)) {
    let mcid: number | undefined;
    if (taggedStructure) {
      mcid = nextMcid++;
      commands.push(`/P <</MCID ${mcid}>> BDC`);
    }
    for (const word of line.words.slice(0, 60_000)) {
      const heightSize = Math.max(4, Math.min(72, word.bounds.height * 0.82));
      // Keep invisible OCR text inside the recognized bounding box. A conservative
      // Helvetica average glyph width avoids overlap between adjacent words and
      // improves deterministic extraction/search without altering the scan image.
      const averageGlyphWidthEm = 0.56;
      const widthSize = Math.max(
        4,
        Math.min(72, word.bounds.width / Math.max(1, word.text.length * averageGlyphWidthEm)),
      );
      const size = Math.min(heightSize, widthSize);
      commands.push(`/F1 ${size.toFixed(2)} Tf`);
      commands.push(`1 0 0 1 ${word.bounds.x.toFixed(2)} ${word.bounds.y.toFixed(2)} Tm`);
      commands.push(`<${winAnsiHex(word.text)}> Tj`);
    }
    if (taggedStructure && mcid !== undefined) {
      commands.push('EMC');
      structureSpecs.push({ role: 'P', mcid });
    }
  }
  commands.push('0 Tr');
  return { commands, structureSpecs, nextMcid };
}
