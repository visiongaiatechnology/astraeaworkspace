// STATUS: PLATIN
import type { Paragraph, TextSpan, WriterEquationBlockData, WriterTableBlockData } from '../../../../shared/contracts/workspace';
import { wordStyleId } from '../styles';
import { equationLatexToOmml } from '../../../../shared/interoperability/equation';
import { escapeXml } from '../../../../shared/interoperability/xml';
import { imageToWordXml, type DocxImageResource } from './images';
export function paragraphToWordXml(paragraph: Paragraph, sectionPropertiesXml?: string): string {
  const pPr: string[] = [];
  const heading = paragraph.style.heading_level;
  if (heading) pPr.push(`<w:pStyle w:val="Heading${heading}"/>`);
  else if (paragraph.style.style_name && paragraph.style.style_name !== 'normal') {
    pPr.push(`<w:pStyle w:val="${wordStyleId(paragraph.style.style_name)}"/>`);
  }
  if (paragraph.style.alignment !== 'left') {
    const value = paragraph.style.alignment === 'justify' ? 'both' : paragraph.style.alignment;
    pPr.push(`<w:jc w:val="${value}"/>`);
  }
  if (paragraph.style.text_direction === 'rtl') pPr.push('<w:bidi/>');
  else if (paragraph.style.text_direction === 'ltr') pPr.push('<w:bidi w:val="0"/>');
  if (paragraph.style.line_break_mode === 'break-word' || paragraph.style.line_break_mode === 'anywhere') {
    pPr.push('<w:wordWrap/>');
  } else if (paragraph.style.line_break_mode === 'normal' || paragraph.style.line_break_mode === 'keep-all') {
    pPr.push('<w:wordWrap w:val="0"/>');
  }
  if (paragraph.style.hyphenation_mode === 'none') pPr.push('<w:suppressAutoHyphens/>');
  /**
   * WR-042 — paragraph spacing is semantic content, not decoration.
   *
   * The direct cursor stores the clicked distance as `space_before`; the DOCX exporter wrote
   * no `w:spacing` at all, so that distance vanished on export and came back as the generic
   * default. Word counts in twips (1 pt = 20 twips), and only a positive value is written so
   * an untouched paragraph does not gain an empty spacing element.
   */
  const spaceBeforePt = Number.isFinite(paragraph.style.space_before) ? Math.max(0, paragraph.style.space_before ?? 0) : 0;
  const spaceAfterPt = Number.isFinite(paragraph.style.space_after) ? Math.max(0, paragraph.style.space_after ?? 0) : 0;
  if (spaceBeforePt > 0 || spaceAfterPt > 0) {
    pPr.push(`<w:spacing w:before="${Math.round(spaceBeforePt * 20)}" w:after="${Math.round(spaceAfterPt * 20)}"/>`);
  }
  if (sectionPropertiesXml) pPr.push(sectionPropertiesXml);
  const runs = paragraph.spans
    .map((span) => spanToWordXml(span, paragraph.style.text_direction === 'rtl'))
    .join('');
  const listPrefix = paragraph.style.list_style === 'bullet' ? '• ' : paragraph.style.list_style === 'number' ? '1. ' : '';
  const columnBreak = paragraph.style.column_break_before
    ? '<w:r><w:br w:type="column"/></w:r>'
    : '';
  const pageBreak = paragraph.style.page_break_before
    ? '<w:r><w:br w:type="page"/></w:r>'
    : '';
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${pageBreak}${columnBreak}${listPrefix ? `<w:r><w:t xml:space="preserve">${escapeXml(listPrefix)}</w:t></w:r>` : ''}${runs || '<w:r><w:t></w:t></w:r>'}</w:p>`;
}

function equationToWordXml(equation: WriterEquationBlockData): string {
  const latex = equation.latex.normalize('NFKC').slice(0, 16_384);
  const attributes = [
    `vgt:id="${escapeXml(equation.id.slice(0, 160))}"`,
    `vgt:latex="${escapeXml(latex)}"`,
    `vgt:displayMode="${equation.displayMode === false ? '0' : '1'}"`,
    equation.caption ? `vgt:caption="${escapeXml(equation.caption.slice(0, 512))}"` : '',
  ].filter(Boolean).join(' ');
  const omml = equationLatexToOmml(latex).replace(
    '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">',
    `<m:oMath ${attributes}>`,
  );
  return `<m:oMathPara>${omml}</m:oMathPara>`;
}

export function writerBodyWithEquations(
  paragraphs: readonly Paragraph[],
  equations: readonly WriterEquationBlockData[],
  sectionPropertiesByEndParagraph: ReadonlyMap<number, string>,
  images: readonly DocxImageResource[] = [],
): string[] {
  const byAnchor = new Map<string, WriterEquationBlockData[]>();
  const unanchored: WriterEquationBlockData[] = [];
  for (const equation of equations.slice(0, 4_096)) {
    if (!equation.anchorParagraphId) {
      unanchored.push(equation);
      continue;
    }
    const list = byAnchor.get(equation.anchorParagraphId) ?? [];
    list.push(equation);
    byAnchor.set(equation.anchorParagraphId, list);
  }
  // Images follow the same rule as equations: the ones with an anchor sit directly under their
  // paragraph, the rest at the end. Before W-288 they were not written at all.
  const imagesByAnchor = new Map<string, DocxImageResource[]>();
  const unanchoredImages: DocxImageResource[] = [];
  for (const resource of images) {
    const anchor = resource.image.anchorParagraphId;
    if (!anchor) {
      unanchoredImages.push(resource);
      continue;
    }
    const list = imagesByAnchor.get(anchor) ?? [];
    list.push(resource);
    imagesByAnchor.set(anchor, list);
  }
  const body: string[] = [];
  let drawingId = 0;
  const pushImages = (list: readonly DocxImageResource[]) => {
    for (const resource of list) {
      drawingId += 1;
      body.push(imageToWordXml(resource, drawingId));
    }
  };
  paragraphs.forEach((paragraph, index) => {
    body.push(paragraphToWordXml(paragraph, sectionPropertiesByEndParagraph.get(index)));
    for (const equation of byAnchor.get(paragraph.id) ?? []) body.push(equationToWordXml(equation));
    pushImages(imagesByAnchor.get(paragraph.id) ?? []);
  });
  for (const equation of unanchored) body.push(equationToWordXml(equation));
  pushImages(unanchoredImages);
  return body;
}

function spanToWordXml(span: TextSpan, rightToLeft = false): string {
  const props: string[] = [];
  if (span.bold) props.push('<w:b/>');
  if (span.italic) props.push('<w:i/>');
  if (span.underline) props.push('<w:u w:val="single"/>');
  if (span.strikethrough) props.push('<w:strike/>');
  if (rightToLeft) props.push('<w:rtl/>');
  if (span.font_size_pt) props.push(`<w:sz w:val="${Math.max(2, Math.round(span.font_size_pt * 2))}"/>`);
  if (span.text_color && /^#[0-9A-Fa-f]{6}$/.test(span.text_color)) props.push(`<w:color w:val="${span.text_color.slice(1)}"/>`);
  const chunks = span.text.split('\n');
  const content = chunks.map((chunk, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(chunk)}</w:t>`).join('');
  return `<w:r>${props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''}${content}</w:r>`;
}

export function tableToWordXml(table: WriterTableBlockData): string {
  const allRows = [
    { id: `${table.id}-header`, cells: table.columns.map((content, index) => ({ id: `h-${index}`, content })) },
    ...table.rows,
  ];
  const rows = allRows.map((row, rowIndex) => `<w:tr>${row.cells.map((cell) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r>${rowIndex === 0 ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(cell.content)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C2D1"/><w:left w:val="single" w:sz="4" w:color="B8C2D1"/><w:bottom w:val="single" w:sz="4" w:color="B8C2D1"/><w:right w:val="single" w:sz="4" w:color="B8C2D1"/><w:insideH w:val="single" w:sz="4" w:color="D6DCE5"/><w:insideV w:val="single" w:sz="4" w:color="D6DCE5"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;
}
