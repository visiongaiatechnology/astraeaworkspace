// STATUS: PLATIN — AST-0681/AST-0684: the search scan over user data is bounded and a truncation is reported.
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage } from '../../../../shared/contracts/workspace';
import { createNotesSearchScan, searchNotesDetailed } from '../../search/notesSearchEngine';

function page(id: string, content: string): NotePage {
  return { id, title: id, content, tags: [], backlinks: [], last_modified: 1_700_000_000_000, revisions: [] };
}

function notebookWith(count: number): NoteNotebook {
  return {
    id: 'nb', title: 'Notebook', createdAt: 1, updatedAt: 1, trashedAt: null,
    sections: [{
      id: 'sec', title: 'Section', createdAt: 1, updatedAt: 1, trashedAt: null,
      pages: Array.from({ length: count }, (_, index) => page(`page-${String(index).padStart(4, '0')}`, `needle body ${index}`)),
    }],
  };
}

describe('AST-0684 bounded search scan', () => {
  it('measures the number of scanned pages for a complete scan', () => {
    const scan = createNotesSearchScan();
    const results = searchNotesDetailed([notebookWith(25)], { query: 'needle', scope: 'notebook', activeNotebookId: 'nb' }, scan);
    expect(scan.truncated).toBe(false);
    expect(scan.scannedPages).toBe(25);
    expect(results).toHaveLength(25);
  });

  it('stops at the budget and reports the truncation instead of hiding it', () => {
    const scan = createNotesSearchScan(10);
    const results = searchNotesDetailed([notebookWith(50)], { query: 'needle', scope: 'notebook', activeNotebookId: 'nb' }, scan);
    expect(scan.truncated).toBe(true);
    expect(scan.scannedPages).toBe(10);
    expect(results).toHaveLength(10);
    expect(scan.budget).toBe(10);
  });

  it('accepts a budget of one page and still answers deterministically', () => {
    const scan = createNotesSearchScan(1);
    const results = searchNotesDetailed([notebookWith(5)], { query: 'needle', scope: 'notebook', activeNotebookId: 'nb' }, scan);
    expect(scan.scannedPages).toBe(1);
    expect(scan.truncated).toBe(true);
    expect(results).toHaveLength(1);
  });

  it('keeps the default budget bounded and non-zero', () => {
    const scan = createNotesSearchScan();
    expect(scan.budget).toBeGreaterThan(0);
    expect(scan.budget).toBeLessThanOrEqual(20_000);
    expect(createNotesSearchScan(0).budget).toBe(1);
    expect(createNotesSearchScan(-5).budget).toBe(1);
    // A non-finite budget falls back to the canonical default instead of producing NaN comparisons.
    expect(createNotesSearchScan(Number.NaN).budget).toBe(scan.budget);
    expect(createNotesSearchScan(Number.POSITIVE_INFINITY).budget).toBe(scan.budget);
  });

  it('does not scan past the scope it was given', () => {
    const other: NoteNotebook = { ...notebookWith(5), id: 'nb-other', title: 'Other' };
    const scan = createNotesSearchScan();
    searchNotesDetailed([notebookWith(3), other], { query: 'needle', scope: 'notebook', activeNotebookId: 'nb' }, scan);
    expect(scan.scannedPages).toBe(3);
    expect(scan.truncated).toBe(false);
  });
});
