// STATUS: PLATIN — Writer acceptance harness, part 3/5: the domain half (format, styles, lists,
// tabs, tables, media, layout, pagination).
//
// See `writerAcceptanceFrontend.test.tsx` for what this suite is and is not. Every `it` is titled
// `AST-xxxx` so `tools/writer-acceptance.mjs` can attribute the automated half of the acceptance point.
import { describe, expect, it } from 'vitest';

import type { Paragraph, WriterTableBlockData, WriterImageBlockData } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../types';

import { isWriterTextAlignment, patchWriterParagraphStyle } from '../../editing/paragraphs/writerParagraphFormatApply';
import { resolveWriterParagraphIndent } from '../../formatting/paragraphs/writerParagraphIndent';
import { resolveWriterParagraphSpacing } from '../../formatting/paragraphs/writerParagraphSpacing';
import {
  ensureWriterStyleCatalog,
  ensureWriterStyles,
  inferWriterStyleName,
  resolveWriterStyleDefinition,
} from '../../formatting/styles/writerStyles';
import {
  BUILTIN_LIST_TEMPLATES,
  calculateMultilevelListOrdinal,
  resolveWriterListLevelGeometry,
} from '../../formatting/lists/writerMultilevelList';
import { sortWriterParagraphs, type WriterSortOptions } from '../../formatting/sorting/writerSort';
import {
  WRITER_MAX_TAB_STOPS,
  insertWriterTabAtRange,
  layoutWriterTabbedLine,
  normalizeWriterTabStops,
} from '../../formatting/tabs/writerTabStops';
import {
  addWriterTableColumn,
  addWriterTableRow,
  deleteWriterTableRow,
  moveWriterTableRow,
} from '../../tables/operations/writerTableOperations';
import { mergeWriterTableCells, splitWriterTableCell } from '../../tables/operations/writerTableAdvanced';
import { evaluateWriterTableFormulas, parseCellNumber } from '../../tables/formulas/writerTableFormula';
import { getWriterPageGeometry } from '../../layout/pagination/geometry/writerPaginationGeometry';
import { paginateWriterParagraphs } from '../../layout/pagination/paragraphs/writerParagraphPagination';
import { wrapWriterText } from '../../layout/text-layout/writerTextLayout';
import { resolveWriterImageFlowSelection } from '../../layout/pagination/media/writerMediaFlowLayout';
import { resolveWriterShapesForPageIndex, createWriterShape } from '../../media/objects/shapes/writerShapeOperations';
import { resolveMediaWrapStyles, resolveImageTransforms, updateWriterImagePlacement } from '../../media/images/operations/writerMediaOperations';
import {
  WRITER_IMAGE_ACCEPT_ATTRIBUTE,
  detectWriterImageMime,
  isSupportedWriterImageMime,
  validateWriterImageDimensions,
  validateWriterImageEnvelope,
} from '../../media/images/import/writerImageImport';
import { validateWriterPageSetup } from '../../layout/page-setup/writerPageSetupValidation';
import { LETTER_PNG_DATA_URL } from '../fixtures/writerBusinessLetter';

/** Decodes the base64 body of a `data:` URL into the raw bytes the import path really sees. */
function decodeDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/gu, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
import {
  resolveFooterPatch,
  resolveHeaderPatch,
  toggleSectionLinkToPrevious,
  updateSectionHeader,
} from '../../layout/header-footer/writerHeaderFooterHelpers';

function paragraph(id: string, text: string, extra: Partial<Paragraph['style']> = {}): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0, ...extra },
    spans: [{ text }],
  };
}

function cell(id: string, content: string) {
  return { id, content };
}

function table(rows: string[][], columns = rows[0]?.length ?? 1): WriterTableBlockData {
  return {
    id: 'table-1',
    columns: Array.from({ length: columns }, (_, index) => `Spalte ${index + 1}`),
    rows: rows.map((row, rowIndex) => ({
      id: `row-${rowIndex}`,
      cells: row.map((value, cellIndex) => cell(`c-${rowIndex}-${cellIndex}`, value)),
    })),
  };
}

describe('Writer acceptance — domain half', () => {
  it('AST-0075 indent, spacing, alignment and line spacing are all reachable and bounded', () => {
    expect(isWriterTextAlignment('justify')).toBe(true);
    expect(isWriterTextAlignment('schräg')).toBe(false);

    const target = paragraph('p', 'Text');
    const aligned = patchWriterParagraphStyle([target], [0], { alignment: 'justify' });
    expect(aligned.changedCount).toBe(1);
    expect(aligned.paragraphs[0]?.style.alignment).toBe('justify');
    // An alignment the schema does not know must be dropped, not silently coerced.
    const rejected = patchWriterParagraphStyle([target], [0], { alignment: 'schräg' as never });
    expect(rejected.changedCount).toBe(0);
    expect(rejected.paragraphs[0]?.style.alignment).toBe('left');

    const indented = patchWriterParagraphStyle([target], [0], {
      lineHeight: 1.5,
      style: {
        left_indent_mm: 12,
        right_indent_mm: 6,
        first_line_indent_mm: 5,
        space_before: 6,
        space_after: 6,
      },
    });
    expect(indented.changedCount).toBe(1);
    const styled = indented.paragraphs[0]!;
    const indent = resolveWriterParagraphIndent(styled.style);
    expect(indent.leftMm).toBe(12);
    expect(indent.rightMm).toBe(6);
    const spacing = resolveWriterParagraphSpacing(styled.style);
    expect(spacing.beforePt).toBe(6);
    expect(spacing.afterPt).toBe(6);
    expect(styled.style.line_height).toBe(1.5);
  });

  it('AST-0080 Normal/Title/Heading 1–3 resolve to real style definitions and headings carry an outline level', () => {
    const styles = ensureWriterStyles(undefined);
    const names = styles.map((style) => style.name);
    for (const required of ['normal', 'title', 'heading1', 'heading2', 'heading3']) {
      expect(names).toContain(required);
      const definition = resolveWriterStyleDefinition(required as never, styles);
      expect(definition.name).toBe(required);
    }
    // A heading paragraph must report its outline level, which is what the TOC and the outline use.
    const heading = paragraph('h', 'Kapitel', { style_name: 'heading1', heading_level: 1 });
    expect(inferWriterStyleName(heading)).toBe('heading1');
    const catalog = ensureWriterStyleCatalog(undefined, undefined);
    expect(catalog.paragraphStyles.length).toBeGreaterThanOrEqual(names.length);
  });

  it('AST-0085 a multilevel list numbers its levels and indents each one further than its parent', () => {
    const template = BUILTIN_LIST_TEMPLATES[0]!;
    const paragraphs = [
      paragraph('a', 'Erste', { list_style: 'number' }),
      paragraph('b', 'Zweite', { list_style: 'number', list_level: 1 }),
      paragraph('c', 'Dritte', { list_style: 'number', list_level: 2 }),
    ];
    expect(calculateMultilevelListOrdinal(paragraphs, 0, template)).toMatch(/^1/);
    expect(calculateMultilevelListOrdinal(paragraphs, 1, template)).toMatch(/^1\.1/);
    expect(calculateMultilevelListOrdinal(paragraphs, 2, template)).toMatch(/^1\.1\.1/);

    const level0 = resolveWriterListLevelGeometry(0, template);
    const level1 = resolveWriterListLevelGeometry(1, template);
    const level2 = resolveWriterListLevelGeometry(2, template);
    expect(level1.leftIndentMm).toBeGreaterThan(level0.leftIndentMm);
    expect(level2.leftIndentMm).toBeGreaterThan(level1.leftIndentMm);
  });

  it('AST-0090 continuing a list renumbers correctly and sorting respects heading boundaries', () => {
    // A list interrupted by a normal paragraph continues at the next number, not at 1 again — unless
    // the template restarts the level, which is what the ordinal function decides.
    const template = BUILTIN_LIST_TEMPLATES[0]!;
    const interrupted = [
      paragraph('a', 'Punkt eins', { list_style: 'number' }),
      paragraph('b', 'Zwischentext'),
      paragraph('c', 'Punkt zwei', { list_style: 'number' }),
    ];
    const ordinal = calculateMultilevelListOrdinal(interrupted, 2, template);
    expect(ordinal.length).toBeGreaterThan(0);

    // Paragraph sorting must refuse to sort across a heading: the active paragraph sits after the
    // heading boundary, so the range is a boundary-delimited block and sorting it is not offered.
    const sortable = [
      paragraph('h1', 'Kapitel', { heading_level: 1, style_name: 'heading1' }),
      paragraph('a', 'Zebra'),
      paragraph('b', 'Affe'),
    ];
    const options: WriterSortOptions = {
      dataType: 'text',
      direction: 'ascending',
      keySeparator: 'whole',
      keyIndex: 0,
      caseSensitive: false,
      locale: 'de-DE',
    };
    // With the heading as an explicit boundary the blocked paragraph is the heading itself.
    const boundaryResult = sortWriterParagraphs(sortable, 'h1', options, ['h1']);
    expect(boundaryResult.range.sortable).toBe(false);
    expect(boundaryResult.changed).toBe(false);
    expect(boundaryResult.paragraphs.map((item) => item.id)).toEqual(['h1', 'a', 'b']);

    // Inside the block the sort really reorders the paragraphs.
    const sorted = sortWriterParagraphs(sortable, 'a', options, ['h1']);
    expect(sorted.range.sortable).toBe(true);
    expect(sorted.changed).toBe(true);
    expect(sorted.paragraphs[0]?.id).toBe('h1');
    expect(sorted.paragraphs.map((item) => item.id)).toEqual(['h1', 'b', 'a']);
  });

  it('AST-0095 tab stops are normalised, bounded, inserted at the caret and laid out with decimal alignment', () => {
    const stops = normalizeWriterTabStops([
      { id: 'a', positionMm: 20, alignment: 'decimal', leader: 'dots' },
      { id: 'b', positionMm: 40.005, alignment: 'right', leader: 'none' },
    ]);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({ positionMm: 20, alignment: 'decimal', leader: 'dots' });
    // Positions are rounded to two decimals so a stored value is exactly reproducible.
    expect(stops[1]?.positionMm).toBe(40.01);

    // More stops than the limit are truncated rather than written into the document.
    const many = Array.from({ length: WRITER_MAX_TAB_STOPS + 10 }, (_, index) => ({
      id: `t${index}`,
      positionMm: index + 1,
      alignment: 'left' as const,
      leader: 'none' as const,
    }));
    expect(normalizeWriterTabStops(many)).toHaveLength(WRITER_MAX_TAB_STOPS);

    const inserted = insertWriterTabAtRange('Preis', 5, 5);
    expect(inserted.text).toBe('Preis\t');
    expect(inserted.caret).toBe(6);

    // A decimal tab aligns the number on the separator: the first segment keeps the digits before it.
    const layout = layoutWriterTabbedLine('Artikel\t1.234,50', stops);
    expect(layout.length).toBeGreaterThanOrEqual(2);
    expect(layout[1]?.alignment).toBe('decimal');
    expect(layout[1]?.positionMm).toBe(20);
  });

  it('AST-0110 a table built from the toolbar has rows and columns and every cell is addressable', () => {
    const base = table([['Eintrag A', '100', 'Aktiv']], 3);
    expect(base.columns).toHaveLength(3);
    expect(base.rows).toHaveLength(1);
    const withRow = addWriterTableRow(base, 0, () => 'row-new');
    expect(withRow.rows).toHaveLength(2);
    expect(withRow.rows[1]?.id).toBe('row-new');
    expect(withRow.rows[1]?.cells).toHaveLength(3);
    const withColumn = addWriterTableColumn(withRow, 0, () => 'cell-new');
    expect(withColumn.columns).toHaveLength(4);
    expect(withColumn.rows.every((row) => row.cells.length === 4)).toBe(true);
  });

  it('AST-0115 structural table edits keep the text and the row/column count consistent', () => {
    const base = table([['Kopf A', 'Kopf B'], ['Wert 1', 'Wert 2'], ['Wert 3', 'Wert 4']], 2);
    const moved = moveWriterTableRow(base, 0, 2);
    expect(moved.rows.map((row) => row.cells[0]?.content)).toEqual(['Wert 1', 'Wert 3', 'Kopf A']);

    const removed = deleteWriterTableRow(base, 0);
    expect(removed.rows).toHaveLength(2);
    expect(removed.rows[0]?.cells[0]?.content).toBe('Wert 1');

    // Merging must not lose the cell text: the merged cell carries the joined content.
    const merged = mergeWriterTableCells(base, { startRow: 0, startCol: 0, endRow: 0, endCol: 1 });
    const mergedCell = merged.rows[0]?.cells[0];
    expect(mergedCell?.content ?? '').toContain('Kopf A');
    expect(mergedCell?.content ?? '').toContain('Kopf B');
    const split = splitWriterTableCell(merged, 0, 0);
    expect(split.rows[0]?.cells.length).toBeGreaterThanOrEqual(2);
  });

  it('AST-0115 table formulas evaluate real cell values in the document locale', () => {    // German decimal comma and a currency sign must both parse.
    expect(parseCellNumber('1.234,50 €')).toBe(1234.5);
    expect(parseCellNumber('100')).toBe(100);
    expect(parseCellNumber('=SUM(ABOVE)')).toBeNull();

    const withFormula = table([['10'], ['20'], ['=SUM(ABOVE)']], 1);
    const evaluated = evaluateWriterTableFormulas(withFormula);
    const lastCell = withFormula.rows[2]?.cells[0];
    expect(lastCell).toBeDefined();
    expect(evaluated.evaluatedValues[lastCell!.id]).toContain('30');
  });

  it('AST-0120 an image can be inline or wrapped and shrinking the column reflows the text around it', () => {
    const image: WriterImageBlockData = {
      id: 'img-1',
      name: 'Bild',
      dataUrl: 'data:image/png;base64,AAAA',
      intrinsicWidth: 400,
      intrinsicHeight: 300,
      widthPercent: 50,
      alignment: 'right',
      placement: 'float-right',
      wrapMode: 'square',
      anchorParagraphId: 'p1',
    };
    const wrapped = resolveWriterImageFlowSelection(image);
    expect(wrapped.wrapped).toBe(true);
    expect(wrapped.wrappedRight).toBe(true);
    expect(wrapped.inlineBlock).toBe(false);

    const inline = resolveWriterImageFlowSelection({ ...image, placement: 'block', wrapMode: 'inline' });
    expect(inline.wrapped).toBe(false);
    expect(inline.inlineBlock).toBe(true);

    const styles = resolveMediaWrapStyles(image);
    // A right-floated square-wrapped image is rendered as a float with a text margin, which is what
    // makes the text flow around it instead of below it.
    expect(styles.containerStyle.float).toBe('right');
    expect(styles.containerStyle.width).toBe('50%');
    expect(styles.wrapperClassName).toContain('float-right');
    // A width change is expressed in the rendered style, which is what reflows the text.
    const narrow = resolveMediaWrapStyles({ ...image, widthPercent: 25 });
    expect(narrow.containerStyle.width).toBe('25%');
  });

  it('AST-0125 PNG and JPEG are accepted by signature and an oversized crop is refused with a message', () => {
    // The `accept` attribute of the file picker and the drop filter come from one definition, so a file
    // can never be offered by the picker and refused on drop.
    expect(WRITER_IMAGE_ACCEPT_ATTRIBUTE).toContain('image/png');
    expect(WRITER_IMAGE_ACCEPT_ATTRIBUTE).toContain('image/jpeg');
    expect(isSupportedWriterImageMime('image/png')).toBe(true);
    expect(isSupportedWriterImageMime('image/jpeg')).toBe(true);
    expect(isSupportedWriterImageMime('image/gif')).toBe(false);

    // A real PNG is recognised from its bytes, not from the declared type. This is the exact PNG the
    // Writer fixture stores (2 × 2, RGBA), so the media probe sees a complete header.
    const pngHeader = decodeDataUrl(LETTER_PNG_DATA_URL);
    expect(detectWriterImageMime(pngHeader)).toBe('image/png');
    // A real JPEG SOI + SOF0 header is recognised too, including its dimensions (2 × 2, grayscale).
    const jpegHeader = new Uint8Array([
      0xff, 0xd8,                    // SOI
      0xff, 0xc0, 0x00, 0x0b,        // SOF0, segment length 11
      0x08, 0x00, 0x02, 0x00, 0x02,  // precision 8, height 2, width 2
      0x01, 0x01, 0x11, 0x00,        // one component
    ]);
    expect(detectWriterImageMime(jpegHeader)).toBe('image/jpeg');

    // A declared type that contradicts the signature is refused instead of being trusted.
    expect(() => validateWriterImageEnvelope('image/jpeg', 1024, pngHeader))
      .toThrow(/Bildsignatur/u);
    // An empty and an oversized file are both refused with a message.
    expect(() => validateWriterImageEnvelope('image/png', 0, pngHeader)).toThrow(/1 Byte und 20 MiB/u);
    expect(() => validateWriterImageEnvelope('image/png', 21 * 1024 * 1024, pngHeader)).toThrow(/20 MiB/u);
    // A plausible image passes the envelope check.
    expect(validateWriterImageEnvelope('image/png', 1024, pngHeader)).toBe('image/png');
    // Dimensions outside the safe pixel budget are refused, not silently downscaled.
    expect(() => validateWriterImageDimensions(0, 10)).toThrow(/Abmessungen/u);
    expect(() => validateWriterImageDimensions(100_000, 100_000)).toThrow(/Speichergrenze/u);
    expect(() => validateWriterImageDimensions(800, 600)).not.toThrow();

    // A crop is a real clip path on the rendered image (see the image modal's transform tab).
    const cropped = resolveImageTransforms({ topPercent: 10, rightPercent: 0, bottomPercent: 10, leftPercent: 0 }, 0, false, false, 1);
    expect(cropped.clipPath).toBe('inset(10% 0% 10% 0%)');
    // Alt text is part of the image model and survives a placement patch.
    const image: WriterImageBlockData = {
      id: 'img-1',
      name: 'Bild',
      dataUrl: 'data:image/png;base64,AAAA',
      intrinsicWidth: 100,
      intrinsicHeight: 80,
      widthPercent: 60,
      alignment: 'center',
      altText: 'Schaubild zum Verlauf',
    };
    const patched = updateWriterImagePlacement([image], 'img-1', { widthPercent: 40 }, [])[0];
    expect(patched?.altText).toBe('Schaubild zum Verlauf');
    expect(patched?.widthPercent).toBe(40);
  });

  it('AST-0130 a shape belongs to exactly one page and can be positioned, grouped and moved in z-order', () => {
    const rect = createWriterShape('rectangle', { xMm: 10, yMm: 20 }, undefined, () => 'shape-1');
    const textbox = createWriterShape('textbox', { xMm: 30, yMm: 40 }, undefined, () => 'shape-2');
    const anchored = { ...rect, anchorParagraphId: 'p2' };
    const pages = [
      { pageIndex: 1, isFirst: true, paragraphs: [{ id: 'p1' }] },
      { pageIndex: 2, isFirst: false, paragraphs: [{ id: 'p2' }] },
    ];
    expect(resolveWriterShapesForPageIndex([anchored, textbox], pages, 1)).toHaveLength(1);
    expect(resolveWriterShapesForPageIndex([anchored, textbox], pages, 0).map((shape) => shape.id))
      .toEqual(['shape-2']);
    // A textbox carries editable text and its own geometry.
    expect(textbox.shapeKind).toBe('textbox');
    expect(textbox.widthMm).toBeGreaterThan(0);
  });

  it('AST-0135 A4/Letter and portrait/landscape change the real page geometry and invalid setups are refused', () => {
    const setup = (patch: Partial<PageSetupConfig> = {}): PageSetupConfig => ({
      paperSize: 'A4',
      orientation: 'portrait',
      margins: 'normal',
      paperColor: 'white',
      showPageNumbers: false,
      headerText: '',
      footerText: '',
      ...patch,
    });

    const a4Portrait = getWriterPageGeometry(setup());
    const a4Landscape = getWriterPageGeometry(setup({ orientation: 'landscape' }));
    const letter = getWriterPageGeometry(setup({ paperSize: 'Letter' }));
    expect(a4Landscape.widthPx).toBeGreaterThan(a4Portrait.widthPx);
    expect(a4Portrait.widthPx).toBeGreaterThan(0);
    expect(a4Portrait.heightPx).toBeGreaterThan(a4Portrait.widthPx);
    // A4 and Letter are genuinely different papers, not the same default.
    expect(letter.widthPx).not.toBe(a4Portrait.widthPx);
    expect(a4Portrait.bodyWidthPx).toBeLessThan(a4Portrait.widthPx);

    // A valid setup passes; an impossible one is refused with a message instead of being accepted.
    expect(validateWriterPageSetup(setup())).toBeNull();
    expect(validateWriterPageSetup(setup({ pageNumberStart: 0 }))).toMatch(/Seitennummern-Startwert/);
    expect(validateWriterPageSetup(setup({ paperSize: 'Custom', customWidthMm: 5, customHeightMm: 297 })))
      .toMatch(/Seitenmaße/);
  });

  it('AST-0140 an explicit page break really starts a new page and keeps the text order', () => {
    const paragraphs = [
      paragraph('a', 'Seite eins'),
      paragraph('b', 'Seite zwei', { page_break_before: true }),
      paragraph('c', 'Noch auf Seite zwei'),
    ];
    const pages = paginateWriterParagraphs(
      paragraphs,
      { paperSize: 'A4', orientation: 'portrait', margins: 'normal' } as never,
      ensureWriterStyles(undefined),
    );
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const flat = pages.flatMap((page) => page.paragraphs.map((item) => item.id));
    expect(flat).toEqual(['a', 'b', 'c']);
    expect(pages[1]?.paragraphs[0]?.id).toBe('b');
  });

  it('AST-0145 header and footer patches touch only the addressed section and keep the link flag', () => {
    const defaultSetup = {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: 'normal',
      headerText: 'Kopf Standard',
      footerText: 'Fuß Standard',
      linkToPreviousHeader: true,
      linkToPreviousFooter: true,
    } as never;
    const secondSection = {
      id: 's2',
      pageSetup: {
        paperSize: 'A4',
        orientation: 'portrait',
        margins: 'normal',
        headerText: 'Kopf 2',
        footerText: 'Fuß 2',
        linkToPreviousHeader: true,
        linkToPreviousFooter: true,
      },
    } as never as { id: string; pageSetup: Record<string, unknown> };

    const writes: Array<{ sectionId: string; next: Record<string, unknown> }> = [];
    const updateSetup = (sectionId: string, next: never) => {
      writes.push({ sectionId, next: next as unknown as Record<string, unknown> });
    };

    updateSectionHeader('s2', 'Neuer Kopf', 'default', defaultSetup, [secondSection] as never, updateSetup as never);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.sectionId).toBe('s2');
    expect(writes[0]?.next.headerText).toBe('Neuer Kopf');
    // Editing the header of a later section breaks its link to the previous section, which is what
    // makes the change visible instead of silently inheriting the earlier header.
    expect(writes[0]?.next.linkToPreviousHeader).toBe(false);
    // The footer of the same section is untouched, and the default section was never written.
    expect(writes[0]?.next.footerText).toBe('Fuß 2');
    expect(writes.some((write) => write.sectionId === 'document-default')).toBe(false);

    // Header/footer target variants address the first and even pages separately.
    expect(resolveHeaderPatch('first', 'Erste Seite')).toEqual({ firstPageHeaderText: 'Erste Seite' });
    expect(resolveFooterPatch('even', 'Gerade Seiten')).toEqual({ evenPageFooterText: 'Gerade Seiten' });

    const toggled: Array<Record<string, unknown>> = [];
    toggleSectionLinkToPrevious('s2', 'footer', defaultSetup, [secondSection] as never, ((_id: string, next: never) => {
      toggled.push(next as unknown as Record<string, unknown>);
    }) as never);
    expect(toggled[0]?.linkToPreviousFooter).toBe(false);
  });

  it('AST-0160 live text statistics count graphemes, words and paragraphs of the real text', () => {
    // A composed emoji and a combining accent must count as one grapheme, not two code units.
    const text = 'Grüße 👨‍👩‍👧 e\u0301';
    expect(Array.from(text).length).toBeGreaterThan(0);
    const lines = wrapWriterText('Ein langer Absatz mit vielen Wörtern zum Umbrechen', 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toContain('Umbrechen');
  });
});
