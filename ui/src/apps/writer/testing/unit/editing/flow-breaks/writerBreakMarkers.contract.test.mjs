// STATUS: PLATIN — Source contract for legacy break-marker normalisation
//
// The normalisation is unit-tested. What unit tests cannot reach is that the
// editor projects a loaded document onto the canonical representation **once, at
// the document boundary**, and that the marker strings have exactly one
// definition. The earlier version of this contract pinned the projection to the
// render path, which was the defect: it ran on every keystroke, so typing the
// marker string in a new document deleted the text and inserted a page break.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const editorState = read('../../../../editor/useWriterState.ts');
const measurement = read('../../../../layout/pagination/measurement/writerPaginationMeasurement.ts');
const markers = read('../../../../editing/flow-breaks/writerBreakMarkers.ts');

describe('Writer break-marker wiring contract', () => {
  it('migrates once per opened document, not on every edit', () => {
    expect(editorState).toContain('applyWriterBreakMigration(liveParagraphs, breakMigration)');
    // Keyed on the document and the text-source identity — never on the paragraphs, which change on
    // every keystroke.
    //
    // **GEZOGEN (AST-0737 Folge, W-445):** der Text kann jetzt aus einem **gelieferten Verweis**
    // kommen; dann ist **der Verweis** die zweite Identitaet, und die Projektion selbst liegt in
    // `editor/writerPrimaryTextProjection.ts`. *Geprueft wird weiter der **Schluessel**, nicht die
    // Anwesenheit einer Zeile: die Absaetze duerfen in ihm nicht vorkommen.*
    const breakProjection = editorState.slice(
      editorState.indexOf('const breakMigration = useMemo('),
      editorState.indexOf('const liveParagraphs'),
    );
    const breakKey = breakProjection.match(/\[document\.id,[^\]]*\],/)?.[0] ?? '';
    expect(breakKey).toBe('[document.id, primaryTextBlockId, primaryText.borrowedText?.referenceId],');
    expect(breakKey).not.toContain('paragraphs');
    // The render path must not project: die Normalisierung steht **genau einmal** im Modul.
    expect(editorState.match(/normalizeWriterBreakMarkers\(/g)?.length).toBe(1);
  });

  it('keeps the migration decision in a pure, testable function', () => {
    expect(markers).toContain('export function applyWriterBreakMigration(');
    expect(markers).toContain('return live === migration.source ? migration.paragraphs : live;');
    expect(markers).toContain('readonly source: Paragraph[];');
  });

  it('does not carry the marker strings a second time', () => {
    expect(measurement).not.toContain("'---PAGEBREAK---'");
    expect(measurement).not.toContain("'---COLUMNBREAK---'");
    expect(measurement).toContain('hasWriterPageBreakMarker(span.text)');
    expect(measurement).toContain('hasWriterColumnBreakMarker(span.text)');
  });

  it('keeps the marker definition in one module', () => {
    expect(markers).toContain("export const WRITER_PAGE_BREAK_MARKER = '---PAGEBREAK---';");
    expect(markers).toContain("export const WRITER_COLUMN_BREAK_MARKER = '---COLUMNBREAK---';");
    expect(markers).toContain('export function normalizeWriterBreakMarkers(');
  });

  it('keeps a paragraph without a marker by identity', () => {
    expect(markers).toContain('if (kinds.length === 0) return paragraph;');
    // And a canonical document keeps its array identity as well.
    expect(markers).toContain('if (changedCount === 0) return { paragraphs, changedCount, source: paragraphs };');
  });
});
