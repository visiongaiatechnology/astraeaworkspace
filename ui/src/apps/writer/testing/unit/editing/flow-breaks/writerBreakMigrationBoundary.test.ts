// STATUS: DIAMANT VGT SUPREME — Legacy break markers migrate once, never on every edit
//
// W-125: the projection ran on the render path, so a user typing `---PAGEBREAK---`
// into a paragraph lost the text and got a page break — in a brand-new document.
// The projection cannot tell a legacy marker from typed text; only the document
// boundary can. These tests pin the boundary rule.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  applyWriterBreakMigration,
  hasWriterPageBreakMarker,
  normalizeWriterBreakMarkers,
  WRITER_COLUMN_BREAK_MARKER,
  WRITER_PAGE_BREAK_MARKER,
} from '../../../../editing/flow-breaks/writerBreakMarkers';

const para = (id: string, text: string, style: Record<string, unknown> = {}): Paragraph => ({
  id,
  spans: [{ text }],
  style,
} as unknown as Paragraph);

const textOf = (paragraph: Paragraph): string => paragraph.spans.map((span) => span.text).join('');

describe('Writer break marker migration boundary', () => {
  it('projects a legacy marker once and reports the source array', () => {
    const opened = [para('p1', `A${WRITER_PAGE_BREAK_MARKER}B`), para('p2', 'C')];
    const migration = normalizeWriterBreakMarkers(opened);
    expect(migration.changedCount).toBe(1);
    expect(migration.source).toBe(opened);
    expect(textOf(migration.paragraphs[0]!)).toBe('AB');
    expect(migration.paragraphs[0]!.style.page_break_before).toBe(true);
  });

  it('renders the migration while the document is untouched', () => {
    const opened = [para('p1', WRITER_PAGE_BREAK_MARKER)];
    const migration = normalizeWriterBreakMarkers(opened);
    const rendered = applyWriterBreakMigration(opened, migration);
    expect(rendered).toBe(migration.paragraphs);
    expect(textOf(rendered[0]!)).toBe('');
  });

  it('keeps a typed marker as text once the document has been written', () => {
    const opened = [para('p1', 'Hallo')];
    const migration = normalizeWriterBreakMarkers(opened);
    // The user types the marker string; the write produces a new array.
    const typed = [para('p1', `Hallo ${WRITER_PAGE_BREAK_MARKER}`)];
    const rendered = applyWriterBreakMigration(typed, migration);
    expect(rendered).toBe(typed);
    expect(textOf(rendered[0]!)).toBe(`Hallo ${WRITER_PAGE_BREAK_MARKER}`);
    expect(hasWriterPageBreakMarker(textOf(rendered[0]!))).toBe(true);
    // Crucially: no page break was invented from the typed text.
    expect(rendered[0]!.style.page_break_before).toBeUndefined();
  });

  it('has already migrated the array a first edit builds on', () => {
    // The first edit runs on the projected paragraphs, so the written array is
    // canonical and the marker cannot come back on the next render.
    const opened = [para('p1', `A${WRITER_COLUMN_BREAK_MARKER}B`)];
    const migration = normalizeWriterBreakMarkers(opened);
    const firstEdit = applyWriterBreakMigration(opened, migration)
      .map((paragraph) => ({ ...paragraph, spans: [{ text: `${textOf(paragraph)}!` }] }));
    const afterWrite = applyWriterBreakMigration(firstEdit, migration);
    expect(afterWrite).toBe(firstEdit);
    expect(afterWrite.some((paragraph) => hasWriterPageBreakMarker(textOf(paragraph)))).toBe(false);
    expect(afterWrite[0]!.style.column_break_before).toBe(true);
  });

  it('returns the live array by reference when nothing was migrated', () => {
    const opened = [para('p1', 'ohne Marke')];
    const migration = normalizeWriterBreakMarkers(opened);
    expect(migration.changedCount).toBe(0);
    expect(migration.paragraphs[0]).toBe(opened[0]);
    expect(applyWriterBreakMigration(opened, migration)).toBe(opened);
  });

  it('treats an empty document as untouched', () => {
    const empty: Paragraph[] = [];
    const migration = normalizeWriterBreakMarkers(empty);
    expect(applyWriterBreakMigration(empty, migration)).toBe(empty);
  });

  it('does not mutate the opened array', () => {
    const opened = [para('p1', `A${WRITER_PAGE_BREAK_MARKER}`)];
    const snapshot = JSON.stringify(opened);
    normalizeWriterBreakMarkers(opened);
    applyWriterBreakMigration(opened, normalizeWriterBreakMarkers(opened));
    expect(JSON.stringify(opened)).toBe(snapshot);
  });
});
