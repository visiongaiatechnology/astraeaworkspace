// STATUS: PLATIN
import type { WorkspaceDocument, WriterPageSetupConfig } from '../../../shared/contracts/workspace';
import { appendWriterPreservedXmlEntries, mergeWriterPreservedNamespaces } from '../writerPreservation';
import { utf8, writeStoredZip, type ZipEntry } from '../zip';
import { validateWriterPageDecorations, resolveWriterPageBackgroundColor } from '../../../shared/writer/layout/pageDecorations';
import { validateWriterHeaderFooter } from '../../../shared/writer/layout/headerFooter';
import { resolveWriterMarginDefinitionMm } from '../../document-layout/writerPageMargins';
import { resolveWriterPaperDimensionsMm } from '../../document-layout/writerPaperSizes';
import { collectDocxImagePackage } from './export/images';
import { escapeXml } from '../../../shared/interoperability/xml';
import { writerStylesXml } from './styles';
import { tableToWordXml, writerBodyWithEquations } from './export/body';
import { buildHeaderFooterPackage, contentTypes, findWriterText, resolveExportWriterSections, sectionPropertiesXml, headerFooterPartXml } from './export/layout';
export function exportDocx(doc: WorkspaceDocument): Uint8Array {
  if (doc.kind !== 'Writer') throw new Error('DOCX export requires a Writer document');
  const textBlock = findWriterText(doc);
  const setup = doc.writerData?.pageSetup;
  const paragraphs = textBlock?.paragraphs ?? [];
  const defaultSetup: WriterPageSetupConfig = setup ?? {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    paperColor: 'white',
    showPageNumbers: true,
    headerText: '',
    footerText: '',
  };
  const resolvedSections = resolveExportWriterSections(
    paragraphs,
    defaultSetup,
    doc.writerData?.sections ?? [],
  );
  for (const section of resolvedSections) {
    const decorationError = validateWriterPageDecorations(section.pageSetup);
    if (decorationError) throw new Error(`Invalid Writer page decoration: ${decorationError}`);
    const headerFooterError = validateWriterHeaderFooter(section.pageSetup);
    if (headerFooterError) throw new Error(`Invalid Writer header/footer: ${headerFooterError}`);
  }
  const headerFooterPackage = buildHeaderFooterPackage(resolvedSections, 2);
  const sectionPropertiesByEndParagraph = new Map<number, string>();
  resolvedSections.slice(0, -1).forEach((section, sectionIndex) => {
    const nextSection = resolvedSections[sectionIndex + 1];
    if (!nextSection) return;
    const endParagraphIndex = nextSection.startIndex - 1;
    if (endParagraphIndex >= section.startIndex) {
      sectionPropertiesByEndParagraph.set(
        endParagraphIndex,
        sectionPropertiesXml(
          section.pageSetup,
          nextSection.breakType,
          headerFooterPackage.referencesBySectionStart.get(section.startIndex),
          section.restartPageNumberAt,
        ),
      );
    }
  });
  const finalSectionSetup = resolvedSections.at(-1)?.pageSetup ?? defaultSetup;
  // W-288: images are embedded now. The text column the picture is measured against is the paper width
  // minus its left and right margins — the same area the layout uses — and the relationship numbering
  // continues after the header/footer parts so no `rId` is used twice.
  const margins = resolveWriterMarginDefinitionMm(finalSectionSetup);
  const paper = resolveWriterPaperDimensionsMm(finalSectionSetup);
  const landscape = finalSectionSetup.orientation === 'landscape';
  const textColumnWidthMm = Math.max(
    1,
    (landscape ? paper.height : paper.width) - (margins.inside + margins.outside),
  );
  const imagePackage = collectDocxImagePackage(
    doc.writerData?.images ?? [],
    textColumnWidthMm,
    headerFooterPackage.parts.length + 2,
  );
  const body = [
    ...writerBodyWithEquations(
      paragraphs,
      doc.writerData?.equations ?? [],
      sectionPropertiesByEndParagraph,
      imagePackage.resources,
    ),
    ...(doc.writerData?.tables ?? []).map(tableToWordXml),
  ].join('');
  const documentBackground = resolveWriterPageBackgroundColor(
    resolvedSections[0]?.pageSetup ?? defaultSetup,
  ).slice(1);
  const finalSection = resolvedSections.at(-1);
  let documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:vgt="urn:visiongaia:writer:2026" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" mc:Ignorable="vgt" mc:PreserveElements="vgt:pageDecorations"><w:background w:color="${documentBackground}"/><w:body>${body}${sectionPropertiesXml(finalSectionSetup, undefined, finalSection ? headerFooterPackage.referencesBySectionStart.get(finalSection.startIndex) : '', finalSection?.restartPageNumberAt)}</w:body></w:document>`;
  documentXml = mergeWriterPreservedNamespaces(documentXml, doc.writerData?.interopPreservation, 'docx');

  const documentRels: string[] = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
  ];
  for (const part of headerFooterPackage.parts) {
    documentRels.push(`<Relationship Id="${part.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${part.kind}" Target="${part.name}"/>`);
  }
  for (const part of imagePackage.parts) {
    documentRels.push(`<Relationship Id="${part.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${part.name}"/>`);
  }

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: utf8(contentTypes(headerFooterPackage.parts, imagePackage.parts)) },
    { name: '_rels/.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: utf8(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRels.join('')}</Relationships>`) },
    { name: 'word/styles.xml', data: utf8(writerStylesXml(doc)) },
    { name: 'word/settings.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:displayBackgroundShape/>${resolvedSections.some((section) => resolveWriterMarginDefinitionMm(section.pageSetup).mirrored) ? '<w:mirrorMargins/>' : ''}${resolvedSections.some((section) => section.pageSetup.oddEvenDifferent) ? '<w:evenAndOddHeaders/>' : ''}</w:settings>`) },
    { name: 'docProps/core.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>VGT Workspace</dc:creator><cp:lastModifiedBy>VGT Workspace</cp:lastModifiedBy></cp:coreProperties>`) },
    { name: 'docProps/app.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>VGT Workspace</Application></Properties>`) },
  ];
  for (const part of headerFooterPackage.parts) {
    entries.push({ name: `word/${part.name}`, data: utf8(headerFooterPartXml(part)) });
  }
  for (const part of imagePackage.parts) {
    entries.push({ name: `word/${part.name}`, data: part.bytes });
  }
  appendWriterPreservedXmlEntries(entries, doc.writerData?.interopPreservation, 'docx');
  return writeStoredZip(entries);
}
