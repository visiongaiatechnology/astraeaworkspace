// STATUS: PLATIN — Source contract: the print path uses the export renderer
//
// W-206: the toolbar's print button called `window.print()`, which prints the application shell
// and lets the browser paginate it again, while the export dialog printed the exact PDF. The
// acceptance asks for print preview geometry to correspond to the real document pages, so the
// two paths have to be one. No unit test can see a click handler's wiring, hence this contract.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const editorState = read('../../../editor/useWriterState.ts');
const exportModal = read('../../../interchange/export/WriterExportModal.tsx');

/** The body of `handlePrint`, from its declaration to its dependency list. */
const printBlock = () => editorState.slice(
  editorState.indexOf('const handlePrint'),
  editorState.indexOf('}, [document, paragraphs, pageSetup, tables, images, styles, sections, writerData]);'),
);

describe('Writer print path contract', () => {
  it('prints through the PDF renderer, not through the application shell', () => {
    const block = printBlock();
    // The renderer call is the primary path: it comes first, inside the `try`.
    const rendererCall = block.indexOf('openWriterPdfForPrint(');
    const shellPrint = block.indexOf('window.print()');
    expect(rendererCall).toBeGreaterThan(-1);
    expect(block.slice(0, rendererCall)).toContain('try {');
    // `window.print()` may only remain inside the catch, as the documented fallback.
    expect(shellPrint).toBeGreaterThan(rendererCall);
    expect(block.includes('catch {')).toBe(true);
    expect(block.indexOf('catch {')).toBeLessThan(shellPrint);
    expect(editorState).toContain('The browser blocked the print window');
  });

  it('hands the whole document to the renderer', () => {
    // Page setup, sections, tables, images and styles: without them the print would differ
    // from the export for the very documents the acceptance talks about.
    const block = printBlock();
    expect(block).toContain('document.title');
    expect(block).toContain('pageSetup');
    expect(block).toContain('tables');
    expect(block).toContain('images');
    expect(block).toContain('styles');
    expect(block).toContain('sections');
    expect(block).toContain('bookmarks');
  });

  it('uses the same builder as the export dialog', () => {
    // Both entry points must reach `buildWriterPdf`; that is what makes preview and export
    // share one renderer, one geometry and one set of page breaks.
    expect(exportModal).toContain('openWriterPdfForPrint(');
    expect(exportModal).toContain('downloadWriterPdf(');
    expect(exportModal).toContain('buildWriterPdf(');
  });

  it('never leaves the click without a reaction', () => {
    // A blocked popup must not end in an unhandled throw.
    const block = editorState.slice(
      editorState.indexOf('const handlePrint'),
      editorState.indexOf('}, [document, paragraphs, pageSetup, tables, images, styles, sections, writerData]);'),
    );
    expect(block).toContain('window.print();');
    expect(block).not.toMatch(/catch\s*\{\s*\}/u);
  });
});

describe('the geometry comparison stays honest', () => {
  it('compares against the pagination the screen uses', () => {
    const geometryTest = read('writerPrintPreviewGeometry.test.ts');
    expect(geometryTest).toContain("import { paginateWriterSections } from '../../../layout/pagination/writerPagination';");
    expect(geometryTest).toContain('const screenPages =');
    // Not a hard-coded page size: the comparison reads the MediaBox out of the produced PDF.
    expect(geometryTest).toContain('/\\/MediaBox');
    expect(geometryTest).not.toContain('595.28');
  });
});
