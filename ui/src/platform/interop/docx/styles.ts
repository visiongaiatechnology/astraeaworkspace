// STATUS: PLATIN
import type { WriterParagraphStyleName, WriterStyleDefinition, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { blocks, ensureXmlSize } from './import/xmlParsing';
import { escapeXml, readAttribute } from '../../../shared/interoperability/xml';
function writerStyleNameFromWordId(styleId: string | null): WriterParagraphStyleName | null {
  const normalized = (styleId ?? '').replace(/\s+/gu, '').toLowerCase();
  if (normalized === 'normal' || normalized === 'title' || normalized === 'subtitle' || normalized === 'quote' || normalized === 'caption') {
    return normalized;
  }
  const heading = normalized.match(/^heading([1-9])$/u);
  if (heading) return `heading${heading[1]}` as WriterParagraphStyleName;
  const toc = normalized.match(/^toc([1-9])$/u);
  return toc ? `toc${toc[1]}` as WriterParagraphStyleName : null;
}

export function wordStyleId(styleName: WriterParagraphStyleName | string): string {
  if (styleName === 'normal') return 'Normal';
  if (styleName === 'title') return 'Title';
  if (styleName === 'subtitle') return 'Subtitle';
  if (styleName === 'quote') return 'Quote';
  if (styleName === 'caption') return 'Caption';
  if (/^heading[1-9]$/u.test(styleName)) return `Heading${styleName.slice(7)}`;
  if (/^toc[1-9]$/u.test(styleName)) return `TOC${styleName.slice(3)}`;
  return 'Normal';
}

export function parseWriterStyles(stylesXml: string): WriterStyleDefinition[] {
  if (!stylesXml) return [];
  ensureXmlSize(stylesXml);
  const parsed: WriterStyleDefinition[] = [];
  for (const styleXml of blocks(stylesXml, 'style')) {
    const openingTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?style\b[^>]*>/u)?.[0] ?? '';
    if (readAttribute(openingTag, 'type') !== 'paragraph') continue;
    const name = writerStyleNameFromWordId(readAttribute(openingTag, 'styleId'));
    if (!name) continue;
    const nameTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?name\b[^>]*>/u)?.[0] ?? '';
    const basedOnTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?basedOn\b[^>]*>/u)?.[0] ?? '';
    const nextTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?next\b[^>]*>/u)?.[0] ?? '';
    const sizeTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?sz\b[^>]*>/u)?.[0] ?? '';
    const fontTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?rFonts\b[^>]*>/u)?.[0] ?? '';
    const colorTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?color\b[^>]*>/u)?.[0] ?? '';
    const alignmentTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?jc\b[^>]*>/u)?.[0] ?? '';
    const spacingTag = styleXml.match(/<(?:[A-Za-z_][\w.-]*:)?spacing\b[^>]*>/u)?.[0] ?? '';
    const alignmentRaw = readAttribute(alignmentTag, 'val');
    const alignment = alignmentRaw === 'center' || alignmentRaw === 'right' || alignmentRaw === 'both'
      ? (alignmentRaw === 'both' ? 'justify' : alignmentRaw)
      : 'left';
    const basedOn = writerStyleNameFromWordId(readAttribute(basedOnTag, 'val')) ?? undefined;
    const nextStyle = writerStyleNameFromWordId(readAttribute(nextTag, 'val')) ?? undefined;
    const fontSizeHalfPoints = Number(readAttribute(sizeTag, 'val') ?? 22);
    const beforeTwips = Number(readAttribute(spacingTag, 'before') ?? 0);
    const afterTwips = Number(readAttribute(spacingTag, 'after') ?? 160);
    const lineTwips = Number(readAttribute(spacingTag, 'line') ?? 360);
    const color = readAttribute(colorTag, 'val');
    parsed.push({
      name,
      label: readAttribute(nameTag, 'val') ?? wordStyleId(name),
      fontSizePt: Number.isFinite(fontSizeHalfPoints) ? fontSizeHalfPoints / 2 : 11,
      fontFamily: readAttribute(fontTag, 'ascii') ?? readAttribute(fontTag, 'hAnsi') ?? undefined,
      bold: /<(?:[A-Za-z_][\w.-]*:)?b(?:\s[^>]*)?\/?\s*>/u.test(styleXml),
      italic: /<(?:[A-Za-z_][\w.-]*:)?i(?:\s[^>]*)?\/?\s*>/u.test(styleXml),
      textColor: color && /^[0-9A-Fa-f]{6}$/u.test(color) ? `#${color.toUpperCase()}` : undefined,
      alignment,
      lineHeight: Number.isFinite(lineTwips) && lineTwips > 0 ? lineTwips / 240 : 1.5,
      spaceBefore: Number.isFinite(beforeTwips) ? beforeTwips / 20 : 0,
      spaceAfter: Number.isFinite(afterTwips) ? afterTwips / 20 : 8,
      basedOn,
      nextStyle,
      autoUpdate: /<(?:[A-Za-z_][\w.-]*:)?autoRedefine(?:\s[^>]*)?\/?\s*>/u.test(styleXml),
      textEffect: /<(?:[A-Za-z_][\w.-]*:)?shadow(?:\s[^>]*)?\/?\s*>/u.test(styleXml)
        ? 'subtle-shadow'
        : 'none',
    });
  }
  return parsed;
}

export function writerStylesXml(doc: WorkspaceDocument): string {
  const configured = doc.writerData?.styleCatalog?.paragraphStyles ?? doc.writerData?.styles ?? [];
  const byName = new Map(configured.map((style) => [style.name, style]));
  const fallbacks: WriterStyleDefinition[] = [
    { name: 'normal', label: 'Normal', fontSizePt: 11, bold: false, lineHeight: 1.5, spaceBefore: 0, spaceAfter: 8 },
    { name: 'title', label: 'Title', fontSizePt: 26, bold: true, lineHeight: 1.2, spaceBefore: 0, spaceAfter: 14, basedOn: 'normal', nextStyle: 'subtitle' },
    { name: 'subtitle', label: 'Subtitle', fontSizePt: 14, bold: false, italic: true, lineHeight: 1.35, spaceBefore: 0, spaceAfter: 12, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading1', label: 'heading 1', fontSizePt: 20, bold: true, lineHeight: 1.25, spaceBefore: 14, spaceAfter: 8, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading2', label: 'heading 2', fontSizePt: 15, bold: true, lineHeight: 1.3, spaceBefore: 12, spaceAfter: 7, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading3', label: 'heading 3', fontSizePt: 13, bold: true, lineHeight: 1.35, spaceBefore: 10, spaceAfter: 6, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading4', label: 'heading 4', fontSizePt: 12, bold: true, lineHeight: 1.4, spaceBefore: 9, spaceAfter: 5, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading5', label: 'heading 5', fontSizePt: 11, bold: true, lineHeight: 1.4, spaceBefore: 8, spaceAfter: 4, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading6', label: 'heading 6', fontSizePt: 11, bold: true, italic: true, lineHeight: 1.4, spaceBefore: 7, spaceAfter: 4, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading7', label: 'heading 7', fontSizePt: 10, bold: true, lineHeight: 1.4, spaceBefore: 6, spaceAfter: 3, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading8', label: 'heading 8', fontSizePt: 10, bold: false, italic: true, lineHeight: 1.4, spaceBefore: 5, spaceAfter: 3, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'heading9', label: 'heading 9', fontSizePt: 9, bold: true, italic: true, lineHeight: 1.4, spaceBefore: 4, spaceAfter: 2, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'quote', label: 'Quote', fontSizePt: 11, bold: false, italic: true, lineHeight: 1.55, spaceBefore: 8, spaceAfter: 10, basedOn: 'normal', nextStyle: 'normal' },
    { name: 'caption', label: 'Caption', fontSizePt: 9, bold: false, italic: true, lineHeight: 1.35, spaceBefore: 4, spaceAfter: 8, basedOn: 'normal', nextStyle: 'normal' },
    ...Array.from({ length: 9 }, (_, index): WriterStyleDefinition => ({
      name: `toc${index + 1}` as WriterParagraphStyleName,
      label: `TOC Level ${index + 1}`,
      fontSizePt: index === 0 ? 11 : Math.max(9, 11 - index * 0.25),
      bold: index === 0,
      lineHeight: 1.35,
      spaceBefore: index === 0 ? 3 : 1,
      spaceAfter: index === 0 ? 2 : 1,
      basedOn: 'normal',
      nextStyle: 'normal',
      firstLineIndentMm: index === 0 ? undefined : index * 5,
    })),
  ];
  for (const fallback of fallbacks) if (!byName.has(fallback.name)) byName.set(fallback.name, fallback);
  const definitions = [...byName.values()];
  const styles = definitions.map((style) => {
    const styleId = wordStyleId(style.name);
    const properties = [
      style.bold ? '<w:b/>' : '',
      style.italic ? '<w:i/>' : '',
      style.textEffect && style.textEffect !== 'none' ? '<w:shadow/>' : '',
      style.fontFamily ? `<w:rFonts w:ascii="${escapeXml(style.fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/gu, '') || 'Arial')}" w:hAnsi="${escapeXml(style.fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/gu, '') || 'Arial')}"/>` : '',
      `<w:sz w:val="${Math.max(2, Math.round(style.fontSizePt * 2))}"/>`,
      style.textColor && /^#[0-9A-Fa-f]{6}$/u.test(style.textColor) ? `<w:color w:val="${style.textColor.slice(1)}"/>` : '',
    ].join('');
    const alignment = style.alignment && style.alignment !== 'left'
      ? `<w:jc w:val="${style.alignment === 'justify' ? 'both' : style.alignment}"/>`
      : '';
    const spacing = `<w:spacing w:before="${Math.max(0, Math.round(style.spaceBefore * 20))}" w:after="${Math.max(0, Math.round(style.spaceAfter * 20))}" w:line="${Math.max(1, Math.round(style.lineHeight * 240))}" w:lineRule="auto"/>`;
    return `<w:style w:type="paragraph"${style.name === 'normal' ? ' w:default="1"' : ''} w:styleId="${styleId}"><w:name w:val="${escapeXml(style.label)}"/>${style.basedOn ? `<w:basedOn w:val="${wordStyleId(style.basedOn)}"/>` : ''}${style.nextStyle ? `<w:next w:val="${wordStyleId(style.nextStyle)}"/>` : ''}${style.autoUpdate ? '<w:autoRedefine/>' : ''}<w:pPr>${alignment}${spacing}</w:pPr><w:rPr>${properties}</w:rPr></w:style>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`;
}
