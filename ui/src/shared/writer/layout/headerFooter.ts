// STATUS: PLATIN
// Canonical first/default/even header and footer resolution shared by screen and export paths.

import type { WriterPageSetupConfig as PageSetupConfig } from '../../contracts/workspace';

export type WriterHeaderFooterVariant = 'default' | 'first' | 'even';

export interface ResolvedWriterHeaderFooter {
  variant: WriterHeaderFooterVariant;
  headerText: string;
  footerText: string;
  headerLabel: string;
  footerLabel: string;
}

export const MAX_WRITER_HEADER_FOOTER_CHARACTERS = 4_096;

/**
 * W-314: **one** measure of "how long is this header/footer text" and **one** predicate for "does it fit",
 * so the validator and the DOCX importer cannot disagree about either.
 *
 * Counted in code points (`[...value]`), not UTF-16 units: `validateWriterHeaderFooter` counted that way from
 * the start, and an importer that counted `value.length` instead would refuse a file the validator accepts
 * (a 4 096-code-point text of astral characters is 8 192 units long).
 */
export function writerHeaderFooterTextLength(value: string): number {
  return [...value].length;
}

export function writerHeaderFooterTextWithinLimit(value: string | undefined): boolean {
  return value === undefined || writerHeaderFooterTextLength(value) <= MAX_WRITER_HEADER_FOOTER_CHARACTERS;
}

export function resolveLinkedWriterHeaderFooterSetup(
  pageSetup: PageSetupConfig,
  previousPageSetup: PageSetupConfig | undefined,
): PageSetupConfig {
  if (!previousPageSetup) return pageSetup;
  const linkedHeader = pageSetup.linkToPreviousHeader !== false;
  const linkedFooter = pageSetup.linkToPreviousFooter !== false;
  return {
    ...pageSetup,
    ...(linkedHeader ? {
      headerText: previousPageSetup.headerText,
      firstPageHeaderText: previousPageSetup.firstPageHeaderText,
      evenPageHeaderText: previousPageSetup.evenPageHeaderText,
    } : {}),
    ...(linkedFooter ? {
      footerText: previousPageSetup.footerText,
      firstPageFooterText: previousPageSetup.firstPageFooterText,
      evenPageFooterText: previousPageSetup.evenPageFooterText,
    } : {}),
  };
}

export function resolveWriterHeaderFooterVariant(
  pageSetup: PageSetupConfig,
  physicalPageIndex: number,
  sectionPageIndex: number,
): WriterHeaderFooterVariant {
  const normalizedPhysicalPage = Math.max(1, Math.trunc(physicalPageIndex));
  const normalizedSectionPage = Math.max(1, Math.trunc(sectionPageIndex));
  if (normalizedSectionPage === 1 && pageSetup.firstPageDifferent === true) return 'first';
  if (normalizedPhysicalPage % 2 === 0 && pageSetup.oddEvenDifferent === true) return 'even';
  return 'default';
}

export function resolveWriterHeaderFooter(
  pageSetup: PageSetupConfig,
  physicalPageIndex: number,
  sectionPageIndex: number,
): ResolvedWriterHeaderFooter {
  const variant = resolveWriterHeaderFooterVariant(pageSetup, physicalPageIndex, sectionPageIndex);
  if (variant === 'first') {
    return {
      variant,
      headerText: pageSetup.firstPageHeaderText ?? '',
      footerText: pageSetup.firstPageFooterText ?? '',
      headerLabel: 'Header (Erste Seite)',
      footerLabel: 'Footer (Erste Seite)',
    };
  }
  if (variant === 'even') {
    return {
      variant,
      headerText: pageSetup.evenPageHeaderText ?? '',
      footerText: pageSetup.evenPageFooterText ?? '',
      headerLabel: 'Header (Gerade Seite)',
      footerLabel: 'Footer (Gerade Seite)',
    };
  }
  return {
    variant,
    headerText: pageSetup.headerText,
    footerText: pageSetup.footerText,
    headerLabel: 'Header (Standard / Ungerade)',
    footerLabel: 'Footer (Standard / Ungerade)',
  };
}

export function writerHeaderFooterHasAnyContent(pageSetup: PageSetupConfig): boolean {
  return [
    pageSetup.headerText,
    pageSetup.footerText,
    pageSetup.firstPageDifferent ? pageSetup.firstPageHeaderText : undefined,
    pageSetup.firstPageDifferent ? pageSetup.firstPageFooterText : undefined,
    pageSetup.oddEvenDifferent ? pageSetup.evenPageHeaderText : undefined,
    pageSetup.oddEvenDifferent ? pageSetup.evenPageFooterText : undefined,
  ].some((value) => Boolean(value));
}

export function validateWriterHeaderFooter(pageSetup: PageSetupConfig): string | null {
  const values = [
    pageSetup.headerText,
    pageSetup.footerText,
    pageSetup.firstPageHeaderText,
    pageSetup.firstPageFooterText,
    pageSetup.evenPageHeaderText,
    pageSetup.evenPageFooterText,
  ];
  if (values.some((value) => !writerHeaderFooterTextWithinLimit(value))) {
    return `Kopf- und Fußzeilentexte dürfen jeweils höchstens ${MAX_WRITER_HEADER_FOOTER_CHARACTERS.toLocaleString('de-DE')} Zeichen enthalten.`;
  }
  return null;
}
