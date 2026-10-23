// STATUS: DIAMANT VGT SUPREME — Citation Style Language (CSL) Engine
// Formats bibliographic references and in-text markers according to international standards

import type { WriterCitationSource, WriterCitation, CitationStyle, WriterParagraph } from '../../types';

export interface FormattedBibliographyEntry {
  sourceId: string;
  citationKey: string;
  formattedText: string;
  inTextMarker: string;
}

/**
 * Extracts author's last name from full string (e.g., 'Alan Turing' -> 'Turing').
 */
function getAuthorLastName(author: string): string {
  if (!author || !author.trim()) return 'Anonymous';
  const trimmed = author.trim();
  if (trimmed.includes(',')) {
    return trimmed.split(',')[0].trim();
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Formats in-text citation marker based on chosen style.
 */
export function formatInTextCitation(
  citation: WriterCitation,
  source: WriterCitationSource,
  style: CitationStyle,
  numericIndex: number = 1
): string {
  const lastName = getAuthorLastName(source.author);
  const year = source.year || 'n.d.';
  const prefix = citation.prefix ? `${citation.prefix} ` : '';
  const suffix = citation.suffix ? `, ${citation.suffix}` : '';
  const locator = citation.locator ? `, p. ${citation.locator}` : '';

  switch (style) {
    case 'APA':
      return `(${prefix}${lastName}, ${year}${locator}${suffix})`;

    case 'MLA':
      const pageMla = citation.locator ? ` ${citation.locator}` : '';
      return `(${prefix}${lastName}${pageMla}${suffix})`;

    case 'Chicago':
      return `(${prefix}${lastName} ${year}${locator}${suffix})`;

    case 'IEEE':
      return `[${numericIndex}]`;

    case 'ISO690':
      return `(${prefix}${lastName.toUpperCase()} ${year}${locator}${suffix})`;

    case 'Harvard':
      return `(${prefix}${lastName}, ${year}${locator}${suffix})`;

    default:
      return `(${lastName}, ${year})`;
  }
}

/**
 * Formats a single bibliography entry according to CSL rules.
 */
export function formatBibliographyEntry(
  source: WriterCitationSource,
  style: CitationStyle,
  numericIndex: number = 1
): string {
  const author = source.author?.trim() || 'Unknown Author';
  const title = source.title?.trim() || 'Untitled';
  const year = source.year?.trim() || 'n.d.';
  const journal = source.journal?.trim();
  const publisher = source.publisher?.trim();
  const url = source.url?.trim();
  const doi = source.doi?.trim();

  switch (style) {
    case 'APA': {
      // APA 7th: Author, A. (Year). Title. Journal/Publisher. https://doi.org/...
      let entry = `${author} (${year}). ${title}.`;
      if (journal) entry += ` ${journal}.`;
      else if (publisher) entry += ` ${publisher}.`;
      if (doi) entry += ` https://doi.org/${doi}`;
      else if (url) entry += ` ${url}`;
      return entry;
    }

    case 'MLA': {
      // MLA 9th: Author. Title. Publisher, Year. URL/DOI.
      let entry = `${author}. "${title}."`;
      if (journal) entry += ` ${journal},`;
      if (publisher) entry += ` ${publisher},`;
      entry += ` ${year}.`;
      if (doi) entry += ` DOI: ${doi}`;
      else if (url) entry += ` ${url}`;
      return entry;
    }

    case 'Chicago': {
      // Chicago 17th (Author-Date): Author. Year. Title. Place: Publisher.
      let entry = `${author}. ${year}. ${title}.`;
      if (journal) entry += ` ${journal}.`;
      else if (publisher) entry += ` ${publisher}.`;
      if (doi) entry += ` https://doi.org/${doi}`;
      else if (url) entry += ` ${url}`;
      return entry;
    }

    case 'IEEE': {
      // IEEE: [#] Author, "Title," Journal, Year.
      let entry = `[${numericIndex}] ${author}, "${title},"`;
      if (journal) entry += ` ${journal},`;
      if (publisher) entry += ` ${publisher},`;
      entry += ` ${year}.`;
      if (doi) entry += ` [Online]. Available: https://doi.org/${doi}`;
      else if (url) entry += ` [Online]. Available: ${url}`;
      return entry;
    }

    case 'ISO690': {
      // ISO 690: AUTHOR. Title. Year. Publisher.
      const upperAuthor = author.toUpperCase();
      let entry = `${upperAuthor}. ${title}.`;
      if (journal) entry += ` ${journal}.`;
      entry += ` ${year}.`;
      if (publisher) entry += ` ${publisher}.`;
      if (doi) entry += ` DOI ${doi}.`;
      else if (url) entry += ` Available at: ${url}`;
      return entry;
    }

    case 'Harvard': {
      let entry = `${author}, ${year}. ${title}.`;
      if (journal) entry += ` ${journal}.`;
      else if (publisher) entry += ` ${publisher}.`;
      if (doi) entry += ` doi:${doi}`;
      else if (url) entry += ` Available at: <${url}>`;
      return entry;
    }

    default:
      return `${author} (${year}). ${title}.`;
  }
}

/**
 * Generates an alphabetically or numerically sorted bibliography list.
 */
export function generateBibliography(
  sources: WriterCitationSource[],
  style: CitationStyle
): FormattedBibliographyEntry[] {
  if (!sources || sources.length === 0) return [];

  // IEEE is ordered by citation appearance or index, others are alphabetical by author
  const sorted = [...sources].sort((a, b) => {
    if (style === 'IEEE') return 0;
    const nameA = (a.author || '').toLowerCase();
    const nameB = (b.author || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return sorted.map((source, index) => {
    const num = index + 1;
    const marker = formatInTextCitation(
      { id: `c-${source.id}`, sourceId: source.id },
      source,
      style,
      num
    );
    const fullText = formatBibliographyEntry(source, style, num);

    return {
      sourceId: source.id,
      citationKey: `${getAuthorLastName(source.author)}_${source.year || 'nd'}`,
      formattedText: fullText,
      inTextMarker: marker,
    };
  });
}

/**
 * Transforms generated bibliography into WriterParagraph blocks ready for document insertion.
 */
export function generateWorksCitedParagraphs(
  sources: WriterCitationSource[],
  style: CitationStyle
): WriterParagraph[] {
  const entries = generateBibliography(sources, style);
  if (entries.length === 0) return [];

  const titleText = style === 'MLA' ? 'Works Cited' : style === 'IEEE' ? 'References' : 'Bibliography';
  const titlePar: WriterParagraph = {
    id: `biblio-header-${Date.now()}`,
    style: {
      style_name: 'heading1',
      heading_level: 1,
      alignment: 'left',
      line_height: 1.3,
      space_before: 16,
      space_after: 8,
    },
    spans: [{ text: titleText, bold: true, font_size_pt: 18 }],
  };

  const itemPars: WriterParagraph[] = entries.map((entry, idx) => ({
    id: `biblio-entry-${entry.sourceId}-${idx}`,
    style: {
      style_name: 'normal',
      alignment: 'left',
      line_height: 1.5,
      space_before: 4,
      space_after: 6,
      hanging_indent_mm: 12,
    },
    spans: [{ text: entry.formattedText, font_size_pt: 10 }],
  }));

  return [titlePar, ...itemPars];
}
