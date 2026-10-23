// STATUS: DIAMANT VGT SUPREME
// Direct-edit rendering primitives kept separate from the structured PDF serializer.

import type { PdfBase14Font, PdfLinkObject, PdfPageImage, PdfPageModel, PdfSectionModel } from '../../../shared/contracts/workspace';
import { reflowPdfText, resolvePdfBase14Font } from './pdfDirectContentEditing';
import { pdfUriByteStringLiteral, pdfWinAnsiLiteral } from '../../../platform/interop/pdf/pdfTextStrings';

export interface PdfStructureSpec {
  role: 'H1' | 'H2' | 'P' | 'Note' | 'Table' | 'TR' | 'TD' | 'Figure';
  mcid?: number;
  children?: PdfStructureSpec[];
  alt?: string;
}


export interface PositionedPdfTextLayout {
  role: 'H2' | 'P' | 'Note' | 'Table';
  lines: string[];
  font: PdfBase14Font;
  fontSize: number;
  lineHeight: number;
  color?: string;
  baselines: number[];
}

export function layoutPositionedPdfSection(section: PdfSectionModel): PositionedPdfTextLayout {
  if (!section.bounds) throw new Error(`Positioned PDF section ${section.id} has no bounds.`);
  const bounds = section.bounds;
  const text = section.isRedacted ? '[REDACTED]' : section.content;
  const bold = section.type === 'header' || section.type === 'key-value';
  const role = section.type === 'header' ? 'H2' : section.type === 'callout' ? 'Note' : section.type === 'table' ? 'Table' : 'P';
  const resolution = resolvePdfBase14Font(section.style?.requestedFont ?? section.style?.resolvedFont, bold);
  const fontSize = Math.max(4, Math.min(144, section.style?.fontSize ?? (section.type === 'header' ? 13 : 10)));
  const lineHeight = Math.max(0.8, Math.min(3, section.style?.lineHeight ?? 1.35));
  const lines = reflowPdfText(text, Math.max(1, bounds.width), { ...section.style, resolvedFont: resolution.resolved, fontSize });
  const maxLines = Math.max(1, Math.floor(bounds.height / (fontSize * lineHeight)));
  const visibleLines = lines.slice(0, maxLines);
  return {
    role,
    lines: visibleLines,
    font: resolution.resolved,
    fontSize,
    lineHeight,
    ...(section.style?.color ? { color: section.style.color } : {}),
    baselines: visibleLines.map((_line, lineIndex) => bounds.y + bounds.height - fontSize - lineIndex * fontSize * lineHeight),
  };
}

export interface StructuredPdfImageResource {
  image: PdfPageImage;
  objectId: number;
  resourceName: string;
}

export const directEditFontResourceName = (font: PdfBase14Font): 'F1' | 'F2' | 'F3' | 'F4' =>
  font === 'Helvetica-Bold' ? 'F2' : font === 'Times-Roman' ? 'F3' : font === 'Courier' ? 'F4' : 'F1';

const pdfRgb = (hex: string | undefined): [number, number, number] | null => !hex || !/^#[0-9a-fA-F]{6}$/u.test(hex) ? null : [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255];
const boxArray = (box: { x: number; y: number; width: number; height: number }): string => `[${box.x.toFixed(2)} ${box.y.toFixed(2)} ${(box.x + box.width).toFixed(2)} ${(box.y + box.height).toFixed(2)}]`;

export function renderDirectEditObjects(page: PdfPageModel, imageResources: readonly StructuredPdfImageResource[], taggedStructure: boolean, startingMcid: number): { commands: string[]; structureSpecs: PdfStructureSpec[]; nextMcid: number } {
  const commands: string[] = [];
  const structureSpecs: PdfStructureSpec[] = [];
  let nextMcid = startingMcid;
  const vectors = page.vectors ?? [];
  const positionedSections = page.sections.filter((section) => section.bounds);
  const objects: Array<{ kind: 'image' | 'vector' | 'section'; zIndex: number; index: number }> = [
    ...imageResources.map((resource, index) => ({ kind: 'image' as const, zIndex: resource.image.zIndex ?? 0, index })),
    ...vectors.map((vector, index) => ({ kind: 'vector' as const, zIndex: vector.zIndex ?? 0, index })),
    ...positionedSections.map((section, index) => ({ kind: 'section' as const, zIndex: section.zIndex ?? 0, index })),
  ].sort((a, b) => a.zIndex - b.zIndex || (a.kind === b.kind ? a.index - b.index : a.kind.localeCompare(b.kind)));

  for (const object of objects) {
    if (object.kind === 'section') {
      const section = positionedSections[object.index];
      const bounds = section.bounds!;
      const layout = layoutPositionedPdfSection(section);
      const mcid = taggedStructure ? nextMcid++ : -1;
      if (taggedStructure) {
        commands.push(`/${layout.role === 'Table' ? 'TD' : layout.role} <</MCID ${mcid}>> BDC`);
        if (layout.role === 'Table') structureSpecs.push({ role: 'Table', children: [{ role: 'TR', children: [{ role: 'TD', mcid }] }] });
        else structureSpecs.push({ role: layout.role, mcid });
      }
      commands.push('BT');
      const rgb = pdfRgb(layout.color);
      commands.push(`/${directEditFontResourceName(layout.font)} ${layout.fontSize.toFixed(1)} Tf`);
      if (rgb) commands.push(`${rgb[0].toFixed(4)} ${rgb[1].toFixed(4)} ${rgb[2].toFixed(4)} rg`);
      layout.lines.forEach((line, lineIndex) => {
        commands.push(`1 0 0 1 ${bounds.x.toFixed(2)} ${layout.baselines[lineIndex].toFixed(2)} Tm`);
        commands.push(`(${pdfWinAnsiLiteral(line)}) Tj`);
      });
      if (rgb) commands.push('0 0 0 rg');
      commands.push('ET');
      if (taggedStructure) commands.push('EMC');
      continue;
    }

    if (object.kind === 'vector') {
      const vector = vectors[object.index];
      const bounds = vector.bounds;
      if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw new Error(`Page ${page.pageNumber} vector ${vector.id} has invalid bounds.`);
      const stroke = pdfRgb(vector.strokeColor) ?? [0, 0, 0];
      const fill = pdfRgb(vector.fillColor);
      commands.push('q');
      if (taggedStructure) commands.push('/Artifact BMC');
      commands.push(`${stroke[0].toFixed(4)} ${stroke[1].toFixed(4)} ${stroke[2].toFixed(4)} RG`);
      commands.push(`${Math.max(0.1, Math.min(50, vector.lineWidth ?? 1)).toFixed(2)} w`);
      if (fill) commands.push(`${fill[0].toFixed(4)} ${fill[1].toFixed(4)} ${fill[2].toFixed(4)} rg`);
      if (vector.type === 'rectangle') commands.push(`${bounds.x.toFixed(2)} ${bounds.y.toFixed(2)} ${bounds.width.toFixed(2)} ${bounds.height.toFixed(2)} re ${fill ? 'B' : 'S'}`);
      else if (vector.type === 'line') commands.push(`${bounds.x.toFixed(2)} ${bounds.y.toFixed(2)} m ${(bounds.x + bounds.width).toFixed(2)} ${(bounds.y + bounds.height).toFixed(2)} l S`);
      else {
        const k = 0.5522847498, rx = bounds.width / 2, ry = bounds.height / 2, cx = bounds.x + rx, cy = bounds.y + ry;
        commands.push(`${(cx + rx).toFixed(2)} ${cy.toFixed(2)} m`);
        commands.push(`${(cx + rx).toFixed(2)} ${(cy + k * ry).toFixed(2)} ${(cx + k * rx).toFixed(2)} ${(cy + ry).toFixed(2)} ${cx.toFixed(2)} ${(cy + ry).toFixed(2)} c`);
        commands.push(`${(cx - k * rx).toFixed(2)} ${(cy + ry).toFixed(2)} ${(cx - rx).toFixed(2)} ${(cy + k * ry).toFixed(2)} ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} c`);
        commands.push(`${(cx - rx).toFixed(2)} ${(cy - k * ry).toFixed(2)} ${(cx - k * rx).toFixed(2)} ${(cy - ry).toFixed(2)} ${cx.toFixed(2)} ${(cy - ry).toFixed(2)} c`);
        commands.push(`${(cx + k * rx).toFixed(2)} ${(cy - ry).toFixed(2)} ${(cx + rx).toFixed(2)} ${(cy - k * ry).toFixed(2)} ${(cx + rx).toFixed(2)} ${cy.toFixed(2)} c ${fill ? 'B' : 'S'}`);
      }
      if (taggedStructure) commands.push('EMC');
      commands.push('Q');
      continue;
    }

    const resource = imageResources[object.index];
    const bounds = resource.image.bounds;
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw new Error(`Page ${page.pageNumber} image ${resource.image.id} has invalid bounds.`);
    if (taggedStructure) {
      const mcid = nextMcid++;
      commands.push(`/Figure <</MCID ${mcid}>> BDC`);
      structureSpecs.push({ role: 'Figure', mcid, alt: resource.image.altText?.trim().slice(0, 2_000) || undefined });
    }
    const crop = resource.image.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const visibleWidth = Math.max(0.01, 1 - crop.left - crop.right), visibleHeight = Math.max(0.01, 1 - crop.top - crop.bottom);
    const rotation = resource.image.rotation ?? 0, quarterTurn = rotation === 90 || rotation === 270;
    const preWidth = quarterTurn ? bounds.height : bounds.width, preHeight = quarterTurn ? bounds.width : bounds.height;
    const scaledWidth = preWidth / visibleWidth, scaledHeight = preHeight / visibleHeight;
    commands.push('q', `${bounds.x.toFixed(2)} ${bounds.y.toFixed(2)} ${bounds.width.toFixed(2)} ${bounds.height.toFixed(2)} re W n`);
    commands.push(`1 0 0 1 ${(bounds.x + bounds.width / 2).toFixed(2)} ${(bounds.y + bounds.height / 2).toFixed(2)} cm`);
    if (rotation === 90) commands.push('0 1 -1 0 0 0 cm'); else if (rotation === 180) commands.push('-1 0 0 -1 0 0 cm'); else if (rotation === 270) commands.push('0 -1 1 0 0 0 cm');
    commands.push(`1 0 0 1 ${(-preWidth / 2).toFixed(2)} ${(-preHeight / 2).toFixed(2)} cm`);
    commands.push(`${scaledWidth.toFixed(2)} 0 0 ${scaledHeight.toFixed(2)} ${(-crop.left * scaledWidth).toFixed(2)} ${(-crop.bottom * scaledHeight).toFixed(2)} cm`, `/${resource.resourceName} Do`, 'Q');
    if (taggedStructure) commands.push('EMC');
  }
  return { commands, structureSpecs, nextMcid };
}

export function buildPdfLinkAnnotationBody(link: PdfLinkObject, pageId: number, targetPageId?: number): string {
  const rect = boxArray(link.bounds);
  if (link.target.kind === 'url') return `<< /Type /Annot /Subtype /Link /P ${pageId} 0 R /Rect ${rect} /Border [0 0 0] /A << /S /URI /URI (${pdfUriByteStringLiteral(link.target.url)}) >> >>`;
  if (!targetPageId) throw new Error(`PDF link target page ${link.target.pageNumber} is unavailable.`);
  return `<< /Type /Annot /Subtype /Link /P ${pageId} 0 R /Rect ${rect} /Border [0 0 0] /A << /S /GoTo /D [${targetPageId} 0 R /Fit] >> >>`;
}
