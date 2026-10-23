// STATUS: DIAMANT VGT SUPREME — shared dependency-free PDF creation service for canonical render pages
import type { RenderSnapshotPage } from './renderTypes';
import { managedColorToPdfRgb, parseManagedColor } from './colorManagement';
import { pdfUnicodeTextString, pdfWinAnsiLiteral } from '../interop/pdf/pdfTextStrings';
const MAX_PDF_PAGES = 10_000;
const MAX_PDF_PRIMITIVES = 2_000_000;

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error('render_pdf_non_finite');
  return (Math.round(value * 1000) / 1000).toString();
}

export function createPdfFromRenderPages(pages: readonly RenderSnapshotPage[], title = 'Astraea Workspace'): Uint8Array {
  if (!pages.length || pages.length > MAX_PDF_PAGES) throw new Error('render_pdf_page_limit');
  const primitiveCount = pages.reduce((sum, page) => sum + page.primitives.length, 0);
  if (primitiveCount > MAX_PDF_PRIMITIVES) throw new Error('render_pdf_primitive_limit');
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  // W-298: without `/Encoding` a reader does not read the bytes as CP1252, so German text would be mojibake.
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageIds: number[] = [];
  for (const page of pages) {
    const commands: string[] = [];
    for (const primitive of page.primitives) {
      if (primitive.kind === 'text' && primitive.text !== undefined) {
        const [r, g, b] = managedColorToPdfRgb(parseManagedColor(primitive.color ?? '#000000'));
        const size = Math.max(1, Number(/(\d+(?:\.\d+)?)px/u.exec(primitive.font ?? '')?.[1] ?? 12) * 72 / 96);
        commands.push(`BT /F1 ${number(size)} Tf ${number(r)} ${number(g)} ${number(b)} rg ${number(primitive.x)} ${number(page.geometry.height - primitive.y)} Td (${pdfWinAnsiLiteral(primitive.text)}) Tj ET`);
      } else if (primitive.kind === 'rect') {
        const [r, g, b] = managedColorToPdfRgb(parseManagedColor(primitive.color ?? '#000000'));
        commands.push(`${number(r)} ${number(g)} ${number(b)} rg ${number(primitive.x)} ${number(page.geometry.height - primitive.y - (primitive.height ?? 0))} ${number(primitive.width ?? 0)} ${number(primitive.height ?? 0)} re f`);
      } else if (primitive.kind === 'line') {
        const [r, g, b] = managedColorToPdfRgb(parseManagedColor(primitive.color ?? '#000000'));
        commands.push(`${number(r)} ${number(g)} ${number(b)} RG ${number(primitive.x)} ${number(page.geometry.height - primitive.y)} m ${number(primitive.x + (primitive.width ?? 0))} ${number(page.geometry.height - primitive.y - (primitive.height ?? 0))} l S`);
      }
    }
    const stream = commands.join('\n');
    const contentId = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${number(page.geometry.width)} ${number(page.geometry.height)}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const infoId = add(`<< /Title ${pdfUnicodeTextString(title)} /Producer (Astraea Workspace Shared PDF Service) >>`);
  let pdf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
