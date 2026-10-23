// STATUS: PLATIN
import { secureRandomId } from '../../../shared/crypto/secureRandom';
import type { TextBlockObject, WorkspaceDocument, WriterSectionDefinition } from '../../../shared/contracts/workspace';
import { decodeUtf8, readZip } from '../zip';
import { captureWriterXmlPreservation } from '../writerPreservation';
import { extractStartTags, readAttribute } from '../../../shared/interoperability/xml';
import { stripActiveOfficePackageParts } from '../officeHostileIntake';
import { validateOpcPackageGraph } from '../officePackageGraph';
import { DOCX_REGENERATED_XML_PARTS, DOCX_ZIP_LIMITS, MAX_DOCX_FILE_BYTES, WORD_DOCUMENT } from './constants';
import { blocks, ensureXmlSize, parseEquations, parseParagraph, parseTables, removeBlocks } from './import/xmlParsing';
import { importSectionHeaderFooter, parseDocumentRelationships, type ImportedHeaderFooter } from './import/headerFooter';
import { importedPageSetup, ooxmlHexColor, parsePageNumberStart, parseSectionBreakType } from './import/pageSetup';
import { parseWriterStyles } from './styles';
import { parseDocxImages } from './import/images';
// W-177: report-only. This module changes nothing about what the importer produces.
import { reportDocxImportOmissions, type DocxImportOmissions } from './import/importOmissions';
import { resolveWriterPaperDimensionsMm } from '../../document-layout/writerPaperSizes';
import { resolveWriterMarginDefinitionMm } from '../../document-layout/writerPageMargins';
export async function importDocx(
  bytes: Uint8Array,
  fileName: string,
  /**
   * W-177: optional sink for the parts this import walks past.
   *
   * Additive and side-effect free — an existing caller does not change, and the returned document is
   * byte-identical with and without it. It receives the report instead of the XML, so the caller cannot
   * be tempted to reinterpret content here; the decision about what a loss *means* belongs to the app.
   */
  omissionsSink?: (omissions: DocxImportOmissions) => void,
): Promise<WorkspaceDocument> {
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_DOCX_FILE_BYTES) throw new Error('DOCX package exceeds import size limit');
  const { entries } = stripActiveOfficePackageParts(await readZip(bytes, DOCX_ZIP_LIMITS));
  validateOpcPackageGraph(entries, WORD_DOCUMENT, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
  const documentBytes = entries.get(WORD_DOCUMENT);
  if (!documentBytes || !entries.has('[Content_Types].xml')) throw new Error('Not a valid DOCX package');
  const xml = decodeUtf8(documentBytes);
  ensureXmlSize(xml);
  if (omissionsSink) {
    omissionsSink(reportDocxImportOmissions(xml, {
      hasNoteParts: entries.has('word/footnotes.xml') || entries.has('word/endnotes.xml'),
    }));
  }

  const bodyWithoutTables = removeBlocks(xml, 'tbl');
  const paragraphXmlBlocks = blocks(bodyWithoutTables, 'p');
  const paragraphs = paragraphXmlBlocks.map(parseParagraph);
  if (!paragraphs.length) {
    paragraphs.push({
      id: 'docx-p-1',
      style: { style_name: 'normal', alignment: 'left', line_height: 1.45, space_before: 0, space_after: 4 },
      spans: [{ text: '' }],
    });
  }
  const textBlock: TextBlockObject = { id: 'docx-text-root', paragraphs };
  const tables = parseTables(xml);
  const equations = parseEquations(xml, paragraphs);
  const settingsBytes = entries.get('word/settings.xml');
  const settingsXml = settingsBytes ? decodeUtf8(settingsBytes) : '';
  if (settingsXml) ensureXmlSize(settingsXml);
  const relationshipBytes = entries.get('word/_rels/document.xml.rels');
  const relationshipXml = relationshipBytes ? decodeUtf8(relationshipBytes) : '';
  const relationshipTargets = parseDocumentRelationships(relationshipXml);
  const oddEvenDifferent = /<(?:[A-Za-z_][\w.-]*:)?evenAndOddHeaders(?:\s[^>]*)?\/?\s*>/u.test(settingsXml);
  const documentBackgroundTag = extractStartTags(xml, 'background')[0] ?? '';
  const documentBackgroundColor = ooxmlHexColor(readAttribute(documentBackgroundTag, 'color'));
  const allSectionProperties = blocks(xml, 'sectPr');
  const finalSectionProperties = allSectionProperties.at(-1) ?? xml;
  const paragraphSectionBoundaries = paragraphXmlBlocks
    .map((paragraphXml, paragraphIndex) => ({
      paragraphIndex,
      sectionXml: blocks(paragraphXml, 'sectPr')[0],
    }))
    .filter((boundary): boundary is { paragraphIndex: number; sectionXml: string } =>
      typeof boundary.sectionXml === 'string',
    );
  const firstSectionProperties = paragraphSectionBoundaries[0]?.sectionXml ?? finalSectionProperties;
  const importedHeaderFooterBySection = new Map<string, ImportedHeaderFooter>();
  for (const sectionXml of allSectionProperties) {
    if (!importedHeaderFooterBySection.has(sectionXml)) {
      importedHeaderFooterBySection.set(
        sectionXml,
        await importSectionHeaderFooter(entries, sectionXml, relationshipTargets, oddEvenDifferent),
      );
    }
  }
  const emptyHeaderFooter: ImportedHeaderFooter = {
    headerText: '',
    footerText: '',
    firstPageDifferent: false,
    oddEvenDifferent,
    hasHeaderReferences: false,
    hasFooterReferences: false,
    hasPageNumberField: false,
  };
  const importedDefaultPageSetup = importedPageSetup(
    firstSectionProperties,
    settingsXml,
    importedHeaderFooterBySection.get(firstSectionProperties) ?? emptyHeaderFooter,
    documentBackgroundColor,
  );
  let previousImportedPageSetup = importedDefaultPageSetup;
  // W-307: measured before this line existed — `exportDocx` wrote `word/media/image1.png` and the drawing,
  // and the import returned `images: []`. A document the application had exported itself lost every picture
  // on the way back, while the text survived, so the file looked complete.
  //
  // The column width is derived exactly as the exporter derives it, so a picture keeps its share of the text
  // column across a round trip instead of drifting.
  const importedPaper = resolveWriterPaperDimensionsMm({
    paperSize: importedDefaultPageSetup.paperSize,
    customWidthMm: importedDefaultPageSetup.customWidthMm,
    customHeightMm: importedDefaultPageSetup.customHeightMm,
  });
  const importedMargins = resolveWriterMarginDefinitionMm(importedDefaultPageSetup);
  const importedImages = parseDocxImages({
    paragraphXmlBlocks,
    paragraphIds: paragraphs.map((paragraph) => paragraph.id),
    relationshipTargets,
    entries,
    textColumnWidthMm: Math.max(1, importedPaper.width - (importedMargins.inside + importedMargins.outside)),
  }).images;
  const sections: WriterSectionDefinition[] = paragraphSectionBoundaries
    .map((boundary, boundaryIndex): WriterSectionDefinition | null => {
      const startParagraph = paragraphs[boundary.paragraphIndex + 1];
      if (!startParagraph) return null;
      const followingProperties = paragraphSectionBoundaries[boundaryIndex + 1]?.sectionXml
        ?? finalSectionProperties;
      return {
        id: `docx-section-${boundaryIndex + 1}`,
        startParagraphId: startParagraph.id,
        pageSetup: (() => {
          const importedHeaderFooter = importedHeaderFooterBySection.get(followingProperties)
            ?? emptyHeaderFooter;
          const parsedSetup = importedPageSetup(
            followingProperties,
            settingsXml,
            {
              ...importedHeaderFooter,
              linkToPreviousHeader: !importedHeaderFooter.hasHeaderReferences,
              linkToPreviousFooter: !importedHeaderFooter.hasFooterReferences,
            },
            documentBackgroundColor,
          );
          const inheritedSetup = !importedHeaderFooter.hasHeaderReferences && !importedHeaderFooter.hasFooterReferences
            ? {
                ...parsedSetup,
                showPageNumbers: previousImportedPageSetup.showPageNumbers,
                pageNumberPosition: previousImportedPageSetup.pageNumberPosition,
              }
            : parsedSetup;
          previousImportedPageSetup = inheritedSetup;
          return inheritedSetup;
        })(),
        breakType: parseSectionBreakType(boundary.sectionXml),
        restartPageNumberAt: parsePageNumberStart(followingProperties),
      };
    })
    .filter((section): section is WriterSectionDefinition => section !== null);
  const stylesBytes = entries.get('word/styles.xml');
  const importedStyles = stylesBytes ? parseWriterStyles(decodeUtf8(stylesBytes)) : [];
  const now = Date.now();
  const title = fileName.replace(/\.docx$/i, '') || 'Imported Document';

  return {
    schema_version: 1,
    id: secureRandomId('docx'),
    title,
    kind: 'Writer',
    created_at: now,
    modified_at: now,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlock.id],
    objects: { [textBlock.id]: { type: 'TextBlock', data: textBlock } },
    writerData: {
      pageSetup: {
        ...importedDefaultPageSetup,
      },
      sections,
      tables,
      images: [...importedImages],
      equations,
      styles: importedStyles,
      styleCatalog: importedStyles.length ? {
        paragraphStyles: importedStyles,
        characterStyles: [],
        listStyles: [],
        tableStyles: [],
        linkedStyles: [],
      } : undefined,
      interopPreservation: captureWriterXmlPreservation(
        entries,
        'docx',
        xml,
        DOCX_REGENERATED_XML_PARTS,
      ),
    },
  };
}
