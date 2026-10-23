// STATUS: PLATIN — AST-0691…AST-0709 + AST-0711: ink zoom, table/code editing, daily-note identity, preview zoom.
import { describe, expect, it } from 'vitest';
import type { NoteNotebook } from '../../../../shared/contracts/workspace';
import {
  NOTE_INK_MAX_ZOOM,
  NOTE_INK_MIN_ZOOM,
  NOTE_INK_ZOOM_STEP,
  clampInkZoom,
  formatInkViewBox,
  panInkViewBox,
  resolveInkViewBox,
  stepInkZoom,
} from '../../canvas/ink/notesInkZoom';
import {
  NOTE_TABLE_MAX_COLUMNS,
  NOTE_TABLE_MAX_ROWS,
  editMarkdownTable,
  locateFencedCodeBlock,
  locateMarkdownTable,
  setFencedCodeLanguage,
} from '../../editor/markdown/notesTableEditing';
import {
  NOTE_PREVIEW_MAX_ZOOM,
  NOTE_PREVIEW_MIN_ZOOM,
  clampNotePreviewZoom,
  formatNotePreviewZoom,
  notePreviewZoomStyle,
  stepNotePreviewZoom,
  supportsNotePreviewZoom,
} from '../../media/notesAttachmentZoom';
import { createNotePageFromTemplate, dailyNoteTitle, findDailyNotePage } from '../../model/noteModel';

const TABLE = ['Intro', '| A | B |', '| --- | --- |', '| 1 | 2 |', 'After'].join('\n');

describe('AST-0691 lossless ink zoom', () => {
  it('zooms as a viewBox transform over unchanged geometry', () => {
    const document = { width: 640, height: 360 };
    expect(resolveInkViewBox(document, 1)).toEqual({ minX: 0, minY: 0, width: 640, height: 360, zoom: 1 });
    const zoomed = resolveInkViewBox(document, 2);
    expect(zoomed.width).toBe(320);
    expect(zoomed.height).toBe(180);
    expect(zoomed.minX).toBe(160);
    expect(zoomed.minY).toBe(90);
    expect(formatInkViewBox(zoomed)).toBe('160 90 320 180');
  });

  it('clamps the zoom and steps in both directions', () => {
    expect(clampInkZoom(99)).toBe(NOTE_INK_MAX_ZOOM);
    expect(clampInkZoom(0)).toBe(NOTE_INK_MIN_ZOOM);
    expect(clampInkZoom(Number.NaN)).toBe(1);
    expect(stepInkZoom(1, 1)).toBe(1 + NOTE_INK_ZOOM_STEP);
    expect(stepInkZoom(1, -1)).toBe(1 - NOTE_INK_ZOOM_STEP);
    expect(stepInkZoom(NOTE_INK_MAX_ZOOM, 1)).toBe(NOTE_INK_MAX_ZOOM);
    expect(stepInkZoom(1, 1, true)).toBe(1 + NOTE_INK_ZOOM_STEP * 4);
  });

  it('pans inside the visible band only and survives a hostile document', () => {
    const document = { width: 640, height: 360 };
    const box = resolveInkViewBox(document, 2);
    // Zoomed to 2× the visible band is 320×180, so minX may range from 0 to 320 (320 is fully right).
    expect(panInkViewBox(box, document, 1000, 1000, 640).minX).toBe(320);
    expect(panInkViewBox(box, document, -1000, -1000, 640).minX).toBe(0);
    expect(panInkViewBox(box, document, 10, 10, 0)).toBe(box);
    const broken = resolveInkViewBox({ width: Number.NaN, height: Number.NaN }, 1);
    expect(broken).toMatchObject({ width: 1, height: 1 });
  });
});

describe('AST-0706 table structure editing', () => {
  it('locates a table and reports its shape', () => {
    const lines = TABLE.split('\n');
    expect(locateMarkdownTable(lines, 1)).toEqual({ headerLineIndex: 1, columns: 2, rows: 3 });
    expect(locateMarkdownTable(lines, 0)).toBeNull();
    expect(locateMarkdownTable(lines, 4)).toBeNull();
    expect(locateMarkdownTable(lines, 99)).toBeNull();
  });

  it('adds and removes columns while keeping every row the same width', () => {
    const added = editMarkdownTable(TABLE, 1, 'add-column-right');
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const rows = added.content.split('\n').slice(1, 4);
    expect(rows.every((row) => row.split('|').length - 2 === 3)).toBe(true);
    expect(rows[0]).toContain('Column 3');

    const removed = editMarkdownTable(added.content, 1, 'delete-column');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.content.split('\n').slice(1, 4).every((row) => row.split('|').length - 2 === 2)).toBe(true);
  });

  it('adds and removes rows without touching the separator line', () => {
    const added = editMarkdownTable(TABLE, 1, 'add-row-below');
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.content.split('\n')).toHaveLength(6);
    expect(added.content.split('\n')[2]).toBe('| --- | --- |');

    // Deleting a row needs at least two data rows; with one body row the edit must refuse (asserted below).
    const twoRows = ['Intro', '| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |', 'After'].join('\n');
    const removed = editMarkdownTable(twoRows, 1, 'delete-row');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.content).toBe(['Intro', '| A | B |', '| --- | --- |', '| 1 | 2 |', 'After'].join('\n'));
  });

  it('refuses instead of producing a malformed table', () => {
    expect(editMarkdownTable('plain text', 0, 'add-row-below').ok).toBe(false);
    const single = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');
    expect(editMarkdownTable(single, 0, 'delete-row')).toEqual({ ok: false, message: 'A table keeps at least one data row; delete the table instead.' });
    const minimal = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');
    expect(editMarkdownTable(minimal, 0, 'delete-column').ok).toBe(false);
    const manyColumns = [`| ${Array.from({ length: NOTE_TABLE_MAX_COLUMNS }, (_, i) => `c${i}`).join(' | ')} |`, `| ${Array.from({ length: NOTE_TABLE_MAX_COLUMNS }, () => '---').join(' | ')} |`, `| ${Array.from({ length: NOTE_TABLE_MAX_COLUMNS }, () => '').join(' | ')} |`].join('\n');
    expect(editMarkdownTable(manyColumns, 0, 'add-column-right').ok).toBe(false);
    const manyRows = ['| A | B |', '| --- | --- |', ...Array.from({ length: NOTE_TABLE_MAX_ROWS - 2 }, () => '|  |  |')].join('\n');
    expect(editMarkdownTable(manyRows, 0, 'add-row-below').ok).toBe(false);
  });
});

describe('AST-0706 fenced code language', () => {
  const content = ['Intro', '```ts', 'const a = 1;', '```', 'After'].join('\n');

  it('locates a fence and sets a sanitised language without touching the body', () => {
    const lines = content.split('\n');
    expect(locateFencedCodeBlock(lines, 1)).toEqual({ openLineIndex: 1, closeLineIndex: 3, language: 'ts' });
    expect(locateFencedCodeBlock(lines, 0)).toBeNull();
    expect(locateFencedCodeBlock(['```', 'body'], 0)).toEqual({ openLineIndex: 0, closeLineIndex: null, language: '' });

    const result = setFencedCodeLanguage(content, 1, 'Python 3; rm -rf /');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.content.split('\n');
    expect(next[1]).toBe('```python3rm-rf');
    expect(next[2]).toBe('const a = 1;');
    expect(setFencedCodeLanguage('no fence here', 0, 'ts').ok).toBe(false);
  });
});

describe('AST-0696 bounded attachment preview zoom', () => {
  it('only images and PDFs are zoomable', () => {
    expect(supportsNotePreviewZoom('image')).toBe(true);
    expect(supportsNotePreviewZoom('pdf')).toBe(true);
    expect(supportsNotePreviewZoom('text')).toBe(false);
    expect(supportsNotePreviewZoom(null)).toBe(false);
  });

  it('clamps, steps and formats the zoom', () => {
    expect(clampNotePreviewZoom(99)).toBe(NOTE_PREVIEW_MAX_ZOOM);
    expect(clampNotePreviewZoom(0)).toBe(NOTE_PREVIEW_MIN_ZOOM);
    expect(clampNotePreviewZoom(Number.NaN)).toBe(1);
    expect(stepNotePreviewZoom(1, 1)).toBe(1.25);
    expect(stepNotePreviewZoom(NOTE_PREVIEW_MAX_ZOOM, 1)).toBe(NOTE_PREVIEW_MAX_ZOOM);
    expect(formatNotePreviewZoom(1.5)).toBe('150%');
    expect(formatNotePreviewZoom(Number.NaN)).toBe('100%');
  });

  it('composes a transform that never squashes a PDF frame', () => {
    expect(notePreviewZoomStyle('image', 2)).toEqual({ transform: 'scale(2)', transformOrigin: 'top center' });
    expect(notePreviewZoomStyle('pdf', 2)).toEqual({ transform: 'scale(2)', transformOrigin: 'top center', width: '50%' });
  });
});

describe('AST-0711/AST-0715 recurring daily note', () => {
  const now = Date.UTC(2026, 8, 28, 12, 0, 0);

  it('derives the title from the day and finds the note across the whole notebook', () => {
    expect(dailyNoteTitle(now)).toBe('Daily Note: 2026-09-28');
    const live = createNotePageFromTemplate('daily', now);
    // The trashed duplicate must NOT win, so it deliberately carries a different id.
    const deletedDuplicate = { ...createNotePageFromTemplate('daily', now), id: 'page-daily-trashed', trashedAt: 5 };
    const notebook: Pick<NoteNotebook, 'sections'> = {
      sections: [
        { id: 's1', title: 'Inbox', pages: [deletedDuplicate], createdAt: 1, updatedAt: 1 },
        { id: 's2', title: 'Journal', pages: [live], createdAt: 1, updatedAt: 1 },
        { id: 's3', title: 'Archive', pages: [], createdAt: 1, updatedAt: 1, trashedAt: 9 },
      ],
    };
    expect(findDailyNotePage(notebook, now)?.id).toBe(live.id);
    // A trashed SECTION is skipped entirely, even when it holds the only copy of the day.
    const onlyInTrashedSection: Pick<NoteNotebook, 'sections'> = {
      sections: [{ id: 's1', title: 'Archive', pages: [live], createdAt: 1, updatedAt: 1, trashedAt: 9 }],
    };
    expect(findDailyNotePage(onlyInTrashedSection, now)).toBeNull();
    expect(findDailyNotePage(notebook, now + 86_400_000)).toBeNull();
    expect(findDailyNotePage({ sections: [] }, now)).toBeNull();
  });
});
