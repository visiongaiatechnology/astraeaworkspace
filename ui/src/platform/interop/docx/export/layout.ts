// STATUS: PLATIN
import type { Paragraph, TextBlockObject, WorkspaceDocument, WriterPageSetupConfig, WriterSectionBreakType, WriterSectionDefinition } from '../../../../shared/contracts/workspace';
import { resolveWriterColumnLayoutMm } from '../../../document-layout/writerColumns';
import { resolveWriterMarginDefinitionMm } from '../../../document-layout/writerPageMargins';
import { millimetersToTwips, resolveWriterPaperDimensionsMm } from '../../../document-layout/writerPaperSizes';
import { isWriterHexColor, resolveWriterPageBackgroundColor } from '../../../../shared/writer/layout/pageDecorations';
import { resolveLinkedWriterHeaderFooterSetup } from '../../../../shared/writer/layout/headerFooter';
import { escapeXml } from '../../../../shared/interoperability/xml';
export function sectionPropertiesXml(
  setup: WriterPageSetupConfig | undefined,
  followingBreakType?: WriterSectionBreakType,
  headerFooterReferences = '',
  pageNumberStart?: number,
): string {
  const dimensions = resolveWriterPaperDimensionsMm(setup ?? {
    paperSize: 'A4',
    customWidthMm: undefined,
    customHeightMm: undefined,
  });
  const portraitW = millimetersToTwips(dimensions.width);
  const portraitH = millimetersToTwips(dimensions.height);
  const landscape = setup?.orientation === 'landscape';
  const w = landscape ? portraitH : portraitW;
  const h = landscape ? portraitW : portraitH;

  const marginDefinition = resolveWriterMarginDefinitionMm(setup ?? {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    paperColor: 'white',
    showPageNumbers: true,
    headerText: '',
    footerText: '',
  });
  const top = millimetersToTwips(marginDefinition.top);
  const bottom = millimetersToTwips(marginDefinition.bottom);
  const left = millimetersToTwips(marginDefinition.inside);
  const right = millimetersToTwips(marginDefinition.outside);
  const gutter = millimetersToTwips(marginDefinition.gutter);
  const bodyWidthMm = (landscape ? dimensions.height : dimensions.width) -
    marginDefinition.inside - marginDefinition.outside - marginDefinition.gutter;
  const columnLayout = resolveWriterColumnLayoutMm(setup ?? {}, bodyWidthMm);
  const columnsXml = columnLayout.customWidths
    ? `<w:cols w:num="${columnLayout.count}" w:space="${millimetersToTwips(columnLayout.gap)}" w:equalWidth="0">${columnLayout.widths.map((columnWidth, index) => `<w:col w:w="${millimetersToTwips(columnWidth)}" w:space="${index === columnLayout.count - 1 ? 0 : millimetersToTwips(columnLayout.gap)}"/>`).join('')}</w:cols>`
    : `<w:cols w:num="${columnLayout.count}" w:space="${millimetersToTwips(columnLayout.gap)}"/>`;

  const wordBreakType = followingBreakType === 'continuous'
    ? 'continuous'
    : followingBreakType === 'even-page'
      ? 'evenPage'
      : followingBreakType === 'odd-page'
        ? 'oddPage'
        : 'nextPage';
  const breakXml = followingBreakType ? `<w:type w:val="${wordBreakType}"/>` : '';
  const border = setup?.pageBorders;
  const borderXml = border && isWriterHexColor(border.color)
    ? (() => {
        const style = border.style === 'solid' ? 'single' : border.style;
        const size = Math.min(96, Math.max(4, Math.round(border.widthPt * 8)));
        const space = Math.min(31, Math.max(0, Math.round(border.paddingMm * 72 / 25.4)));
        const side = (name: 'top' | 'left' | 'bottom' | 'right'): string =>
          `<w:${name} w:val="${style}" w:sz="${size}" w:space="${space}" w:color="${border.color.slice(1).toUpperCase()}"/>`;
        return `<w:pgBorders w:offsetFrom="page">${side('top')}${side('left')}${side('bottom')}${side('right')}</w:pgBorders>`;
      })()
    : '';
  const watermark = setup?.watermark;
  const borderExtension = border && isWriterHexColor(border.color)
    ? ` vgt:borderStyle="${border.style}" vgt:borderWidthPt="${border.widthPt}" vgt:borderColor="${border.color.slice(1).toUpperCase()}" vgt:borderPaddingMm="${border.paddingMm}"`
    : '';
  const decorationExtension = setup
    ? `<vgt:pageDecorations vgt:backgroundColor="${resolveWriterPageBackgroundColor(setup).slice(1)}"${borderExtension}${watermark ? ` vgt:watermarkEnabled="${watermark.enabled ? '1' : '0'}" vgt:watermarkText="${escapeXml(watermark.text.slice(0, 120))}" vgt:watermarkOpacity="${watermark.opacity}" vgt:watermarkRotation="${watermark.rotationDeg}" vgt:watermarkColor="${isWriterHexColor(watermark.color) ? watermark.color.slice(1).toUpperCase() : '94A3B8'}"` : ''}/>`
    : '';
  const titlePageXml = setup?.firstPageDifferent ? '<w:titlePg/>' : '';
  const pageNumberFormat = setup?.pageNumberFormat === 'roman-upper' || setup?.pageNumberFormat === 'roman'
    ? 'upperRoman'
    : setup?.pageNumberFormat === 'roman-lower'
      ? 'lowerRoman'
      : setup?.pageNumberFormat === 'alpha-upper' || setup?.pageNumberFormat === 'alpha'
        ? 'upperLetter'
        : setup?.pageNumberFormat === 'alpha-lower'
          ? 'lowerLetter'
          : 'decimal';
  const effectiveStart = pageNumberStart ?? setup?.pageNumberStart;
  const pageNumberXml = setup?.showPageNumbers || effectiveStart !== undefined || setup?.chapterNumbering
    ? `<w:pgNumType w:fmt="${pageNumberFormat}"${effectiveStart !== undefined ? ` w:start="${effectiveStart}"` : ''}${setup?.chapterNumbering ? ' w:chapStyle="1" w:chapSep="hyphen"' : ''}/>`
    : '';
  return `<w:sectPr>${headerFooterReferences}${breakXml}${titlePageXml}<w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="720" w:footer="720" w:gutter="${gutter}"/>${columnsXml}${pageNumberXml}${borderXml}${decorationExtension}</w:sectPr>`;
}

export function findWriterText(doc: WorkspaceDocument): TextBlockObject | null {
  for (const id of doc.root_object_ids) {
    const object = doc.objects[id];
    if (object?.type === 'TextBlock') return object.data;
  }
  for (const object of Object.values(doc.objects)) if (object.type === 'TextBlock') return object.data;
  return null;
}

export function contentTypes(
  headerFooterParts: readonly ExportHeaderFooterPart[],
  imageParts: readonly { readonly contentType: string; readonly extension: string }[] = [],
): string {
  const overrides = headerFooterParts.map((part) =>
    `<Override PartName="/word/${part.name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${part.kind}+xml"/>`,
  ).join('');
  // A package that references a media part without declaring its content type is rejected by Word, so
  // the extension defaults are part of the image fix (W-288), not an extra.
  const imageDefaults = [...new Map(imageParts.map((part) => [part.extension, part.contentType])).entries()]
    .map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageDefaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}</Types>`;
}

export interface ExportHeaderFooterPart {
  kind: 'header' | 'footer';
  name: string;
  relationshipId: string;
  text: string;
  includePageNumber: boolean;
  alignment: 'left' | 'center' | 'right';
}

export interface ExportHeaderFooterPackage {
  parts: ExportHeaderFooterPart[];
  referencesBySectionStart: Map<number, string>;
}

export function buildHeaderFooterPackage(
  sections: readonly ExportWriterSection[],
  firstRelationshipNumber: number,
): ExportHeaderFooterPackage {
  const parts: ExportHeaderFooterPart[] = [];
  const referencesBySectionStart = new Map<number, string>();
  const partByContent = new Map<string, ExportHeaderFooterPart>();
  let nextRelationshipNumber = firstRelationshipNumber;
  let nextHeaderNumber = 1;
  let nextFooterNumber = 1;

  const allocatePart = (
    kind: 'header' | 'footer',
    text: string,
    includePageNumber: boolean,
    alignment: 'left' | 'center' | 'right',
  ): ExportHeaderFooterPart => {
    const key = `${kind}\u0000${text}\u0000${includePageNumber}\u0000${alignment}`;
    const existing = partByContent.get(key);
    if (existing) return existing;
    const number = kind === 'header' ? nextHeaderNumber++ : nextFooterNumber++;
    const part: ExportHeaderFooterPart = {
      kind,
      name: `${kind}${number}.xml`,
      relationshipId: `rId${nextRelationshipNumber++}`,
      text,
      includePageNumber,
      alignment,
    };
    parts.push(part);
    partByContent.set(key, part);
    return part;
  };

  sections.forEach((section, sectionIndex) => {
    const setup = section.pageSetup;
    const previousSetup = sections[sectionIndex - 1]?.pageSetup;
    const linkedHeader = sectionIndex > 0 && setup.linkToPreviousHeader !== false;
    const linkedFooter = sectionIndex > 0 && setup.linkToPreviousFooter !== false;
    const position = setup.pageNumberPosition ?? 'footer-right';
    const numberKind = setup.showPageNumbers ? position.split('-')[0] as 'header' | 'footer' : undefined;
    const numberAlignment = position.split('-')[1] as 'left' | 'center' | 'right';
    const previousPosition = previousSetup?.pageNumberPosition ?? 'footer-right';
    const previousNumberKind = previousSetup?.showPageNumbers ? previousPosition.split('-')[0] as 'header' | 'footer' : undefined;
    const previousNumberAlignment = previousPosition.split('-')[1] as 'left' | 'center' | 'right';
    const references: string[] = [];
    const appendReference = (
      kind: 'header' | 'footer',
      type: 'default' | 'first' | 'even',
      text: string | undefined,
      required: boolean,
    ): void => {
      const includePageNumber = numberKind === kind;
      if (!required && !text && !includePageNumber) return;
      const part = allocatePart(kind, text ?? '', includePageNumber, numberAlignment);
      references.push(`<w:${kind}Reference w:type="${type}" r:id="${part.relationshipId}"/>`);
    };
    const headerNumberChanged = numberKind !== previousNumberKind ||
      (numberKind === 'header' && numberAlignment !== previousNumberAlignment);
    const footerNumberChanged = numberKind !== previousNumberKind ||
      (numberKind === 'footer' && numberAlignment !== previousNumberAlignment);
    if (!linkedHeader || headerNumberChanged) {
      appendReference('header', 'default', setup.headerText, sectionIndex > 0);
      appendReference('header', 'first', setup.firstPageHeaderText, setup.firstPageDifferent === true);
      appendReference('header', 'even', setup.evenPageHeaderText, setup.oddEvenDifferent === true);
    }
    if (!linkedFooter || footerNumberChanged) {
      appendReference('footer', 'default', setup.footerText, sectionIndex > 0);
      appendReference('footer', 'first', setup.firstPageFooterText, setup.firstPageDifferent === true);
      appendReference('footer', 'even', setup.evenPageFooterText, setup.oddEvenDifferent === true);
    }
    referencesBySectionStart.set(section.startIndex, references.join(''));
  });
  return { parts, referencesBySectionStart };
}

export function headerFooterPartXml(part: ExportHeaderFooterPart): string {
  const root = part.kind === 'header' ? 'hdr' : 'ftr';
  const textParagraph = part.text
    ? `<w:p><w:r><w:t xml:space="preserve">${escapeXml(part.text)}</w:t></w:r></w:p>`
    : '';
  const pageParagraph = part.includePageNumber
    ? `<w:p><w:pPr><w:jc w:val="${part.alignment}"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${root} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${textParagraph}${pageParagraph || '<w:p/>'}</w:${root}>`;
}

export interface ExportWriterSection {
  startIndex: number;
  pageSetup: WriterPageSetupConfig;
  breakType: WriterSectionBreakType;
  restartPageNumberAt?: number;
}

export function resolveExportWriterSections(
  paragraphs: readonly Paragraph[],
  defaultPageSetup: WriterPageSetupConfig,
  sections: readonly WriterSectionDefinition[],
): ExportWriterSection[] {
  const paragraphIndexes = new Map(paragraphs.map((paragraph, index) => [paragraph.id, index]));
  const usedStarts = new Set<number>();
  const resolved = sections
    .map((section): ExportWriterSection | null => {
      const startIndex = paragraphIndexes.get(section.startParagraphId);
      if (startIndex === undefined || usedStarts.has(startIndex)) return null;
      usedStarts.add(startIndex);
      return {
        startIndex,
        pageSetup: section.pageSetup,
        breakType: section.breakType ?? 'next-page',
        restartPageNumberAt: section.restartPageNumberAt,
      };
    })
    .filter((section): section is ExportWriterSection => section !== null)
    .sort((left, right) => left.startIndex - right.startIndex);
  if (resolved[0]?.startIndex !== 0) {
    resolved.unshift({
      startIndex: 0,
      pageSetup: defaultPageSetup,
      breakType: 'next-page',
      restartPageNumberAt: defaultPageSetup.pageNumberStart,
    });
  }
  let previousSetup: WriterPageSetupConfig | undefined;
  for (const section of resolved) {
    section.pageSetup = resolveLinkedWriterHeaderFooterSetup(
      section.pageSetup,
      previousSetup ?? (section.startIndex === 0 ? undefined : defaultPageSetup),
    );
    previousSetup = section.pageSetup;
  }
  return resolved;
}
