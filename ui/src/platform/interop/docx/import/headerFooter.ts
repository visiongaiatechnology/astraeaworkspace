// STATUS: PLATIN
import type { WriterPageSetupConfig } from '../../../../shared/contracts/workspace';
import {
  MAX_WRITER_HEADER_FOOTER_CHARACTERS,
  writerHeaderFooterTextLength,
  writerHeaderFooterTextWithinLimit,
} from '../../../../shared/writer/layout/headerFooter';
import { decodeUtf8 } from '../../zip';
import { blocks, ensureXmlSize, removeBlocks } from './xmlParsing';
import { extractStartTags, extractTextNodes, readAttribute } from '../../../../shared/interoperability/xml';
function normalizeWordRelationshipTarget(target: string): string | null {
  const normalized = target.replace(/\\/gu, '/');
  if (!normalized || normalized.includes('\0')) return null;
  const parts = (normalized.startsWith('/') ? normalized.slice(1) : `word/${normalized}`).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  const path = resolved.join('/');
  return path.startsWith('word/') ? path : null;
}

export function parseDocumentRelationships(xml: string): Map<string, string> {
  const targets = new Map<string, string>();
  if (!xml) return targets;
  ensureXmlSize(xml);
  for (const relationship of extractStartTags(xml, 'Relationship')) {
    const id = readAttribute(relationship, 'Id');
    const target = readAttribute(relationship, 'Target');
    const type = readAttribute(relationship, 'Type') ?? '';
    const targetMode = readAttribute(relationship, 'TargetMode');
    if (
      !id || !target || targetMode === 'External' ||
      // W-307: image relationships belong in this map too. It is a lookup by `rId`, so header and footer
      // resolution is unaffected — and the picture import finally has a way to resolve `a:blip r:embed`.
      (!type.endsWith('/header') && !type.endsWith('/footer') && !type.endsWith('/image'))
    ) continue;
    const normalizedTarget = normalizeWordRelationshipTarget(target);
    if (normalizedTarget) targets.set(id, normalizedTarget);
  }
  return targets;
}

interface ImportedHeaderFooterPart {
  text: string;
  hasPageNumber: boolean;
  alignment?: 'left' | 'center' | 'right';
}

/**
 * W-314: the importer used to read all six header/footer texts with **no** character bound while
 * `validateWriterHeaderFooter` (called by the DOCX exporter *and* by the PDF export) refuses anything above
 * `MAX_WRITER_HEADER_FOOTER_CHARACTERS`. Measured consequence: a foreign DOCX with a 5 000-character header
 * imported fine, and then **every** export of that document threw `Invalid Writer header/footer` — the file
 * could be opened and edited, but never exported. The bound is now applied where the text enters the model, with
 * the *same* predicate the validator uses, and it refuses with a message that names the limit instead of cutting
 * the text silently (a quiet cut would have produced a document that no longer matches the source file).
 */
function assertHeaderFooterTextWithinLimit(text: string, label: string): string {
  if (!writerHeaderFooterTextWithinLimit(text)) {
    throw new Error(`DOCX ${label} text exceeds the ${MAX_WRITER_HEADER_FOOTER_CHARACTERS}-character limit (${writerHeaderFooterTextLength(text)} characters). Shorten it in the source document.`);
  }
  return text;
}

async function optionalHeaderFooterPart(entries: Map<string, Uint8Array>, name: string, label: string): Promise<ImportedHeaderFooterPart> {
  const bytes = entries.get(name);
  if (!bytes) return { text: '', hasPageNumber: false };
  const xml = decodeUtf8(bytes);
  ensureXmlSize(xml);
  const pageField = blocks(xml, 'fldSimple').find((field) => /\bPAGE\b/iu.test(readAttribute(field.match(/^<[^>]+>/u)?.[0] ?? '', 'instr') ?? ''));
  const hasComplexPageField = extractTextNodes(xml, 'instrText').some((value) => /\bPAGE\b/iu.test(value));
  const hasPageNumber = Boolean(pageField || hasComplexPageField);
  const withoutSimpleFields = removeBlocks(xml, 'fldSimple');
  let complexFieldDepth = 0;
  const withoutFields = withoutSimpleFields.replace(
    /<(?:[A-Za-z_][\w.-]*:)?r(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?r\s*>/gu,
    (run) => {
      const fieldCharacters = extractStartTags(run, 'fldChar');
      const begins = fieldCharacters.filter((tag) => readAttribute(tag, 'fldCharType') === 'begin').length;
      const ends = fieldCharacters.filter((tag) => readAttribute(tag, 'fldCharType') === 'end').length;
      const insideField = complexFieldDepth > 0 || begins > 0;
      complexFieldDepth = Math.max(0, complexFieldDepth + begins - ends);
      return insideField ? '' : run;
    },
  );
  const text = assertHeaderFooterTextWithinLimit(extractTextNodes(withoutFields, 't').join(' ').trim(), label);
  const fieldParagraph = blocks(xml, 'p').find((paragraph) => /\bPAGE\b/iu.test(paragraph));
  const alignmentTag = fieldParagraph?.match(/<(?:[A-Za-z_][\w.-]*:)?jc\b[^>]*>/u)?.[0] ?? '';
  const rawAlignment = readAttribute(alignmentTag, 'val');
  const alignment = rawAlignment === 'center' || rawAlignment === 'right' ? rawAlignment : 'left';
  return { text, hasPageNumber, alignment: hasPageNumber ? alignment : undefined };
}

export interface ImportedHeaderFooter {
  headerText: string;
  footerText: string;
  firstPageDifferent: boolean;
  oddEvenDifferent: boolean;
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  evenPageHeaderText?: string;
  evenPageFooterText?: string;
  hasHeaderReferences: boolean;
  hasFooterReferences: boolean;
  hasPageNumberField: boolean;
  pageNumberPosition?: WriterPageSetupConfig['pageNumberPosition'];
  linkToPreviousHeader?: boolean;
  linkToPreviousFooter?: boolean;
}

export async function importSectionHeaderFooter(
  entries: Map<string, Uint8Array>,
  sectionXml: string,
  relationshipTargets: ReadonlyMap<string, string>,
  oddEvenDifferent: boolean,
): Promise<ImportedHeaderFooter> {
  const headerReferences = extractStartTags(sectionXml, 'headerReference');
  const footerReferences = extractStartTags(sectionXml, 'footerReference');
  const readReference = async (
    references: readonly string[],
    type: 'default' | 'first' | 'even',
    label: string,
  ): Promise<ImportedHeaderFooterPart | undefined> => {
    const reference = references.find((candidate) => (readAttribute(candidate, 'type') ?? 'default') === type);
    if (!reference) return undefined;
    const relationshipId = readAttribute(reference, 'id');
    const target = relationshipId ? relationshipTargets.get(relationshipId) : undefined;
    return target ? optionalHeaderFooterPart(entries, target, `${label} (${type})`) : undefined;
  };
  const [headerText, footerText, firstHeader, firstFooter, evenHeader, evenFooter] = await Promise.all([
    readReference(headerReferences, 'default', 'header'),
    readReference(footerReferences, 'default', 'footer'),
    readReference(headerReferences, 'first', 'first-page header'),
    readReference(footerReferences, 'first', 'first-page footer'),
    readReference(headerReferences, 'even', 'even-page header'),
    readReference(footerReferences, 'even', 'even-page footer'),
  ]);
  return {
    headerText: headerText?.text ?? '',
    footerText: footerText?.text ?? '',
    firstPageDifferent: /<(?:[A-Za-z_][\w.-]*:)?titlePg(?:\s[^>]*)?\/?\s*>/u.test(sectionXml),
    oddEvenDifferent,
    firstPageHeaderText: firstHeader?.text,
    firstPageFooterText: firstFooter?.text,
    evenPageHeaderText: evenHeader?.text,
    evenPageFooterText: evenFooter?.text,
    hasHeaderReferences: headerReferences.length > 0,
    hasFooterReferences: footerReferences.length > 0,
    hasPageNumberField: [headerText, footerText, firstHeader, firstFooter, evenHeader, evenFooter]
      .some((part) => part?.hasPageNumber === true),
    pageNumberPosition: (() => {
      const headerPart = [headerText, firstHeader, evenHeader].find((part) => part?.hasPageNumber);
      if (headerPart) return `header-${headerPart.alignment ?? 'left'}` as WriterPageSetupConfig['pageNumberPosition'];
      const footerPart = [footerText, firstFooter, evenFooter].find((part) => part?.hasPageNumber);
      return footerPart
        ? `footer-${footerPart.alignment ?? 'left'}` as WriterPageSetupConfig['pageNumberPosition']
        : undefined;
    })(),
  };
}
