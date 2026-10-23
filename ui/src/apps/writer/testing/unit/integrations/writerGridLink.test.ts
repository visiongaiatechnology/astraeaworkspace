// STATUS: PLATIN — Grid-to-Writer live-link tests
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { deserializeWorkspaceDocumentCanonical, serializeWorkspaceDocumentCanonical } from '../../../../../platform/workspace/model/workspaceObjectModel';
import {
  extractWriterTableFromGrid,
  parseWriterGridRange,
  refreshWriterGridLinks,
} from '../../../integrations/grid/writerGridLink';

function gridDocument(version = 1): WorkspaceDocument {
  return {
    schema_version: 1,
    id: 'grid-doc',
    title: 'Budget',
    kind: 'Grid',
    created_at: 1,
    modified_at: 1,
    version,
    theme_id: 'dark',
    root_object_ids: ['table-1'],
    objects: {
      'table-1': {
        type: 'Table',
        data: {
          id: 'table-1',
          rows: 3,
          cols: 3,
          cells: {
            A1: { value: 'Name' }, B1: { value: 'Q1' },
            A2: { value: 'Core' }, B2: { value: 42 },
            A3: { value: 'UI' }, B3: { value: true },
          },
        },
      },
    },
  };
}

describe('Writer Grid links', () => {
  it('parses and bounds A1 ranges against the actual table', () => {
    const table = gridDocument().objects['table-1'];
    if (table?.type !== 'Table') throw new Error('test fixture');
    expect(parseWriterGridRange('B3:A1', table.data)).toEqual({
      start: { col: 0, row: 0 },
      end: { col: 1, row: 2 },
    });
    expect(() => parseWriterGridRange('A1:D4', table.data)).toThrow(/außerhalb/);
  });

  it('extracts real values and records a canonical live source', () => {
    const table = extractWriterTableFromGrid(gridDocument(), 'table-1', 'A1:B3', 'Live', { tableId: 'writer-table' });
    expect(table.columns).toEqual(['Name', 'Q1']);
    // This expectation used to read `TRUE`, which cemented a second convention: the canonical
    // workspace-embed path spelled the same boolean `Ja`. One cell must not read two ways (W-239),
    // and the application's language is German, so `Ja`/`Nein` is the single convention now.
    expect(table.rows.map((row) => row.cells.map((cell) => cell.content))).toEqual([
      ['Core', '42'],
      ['UI', 'Ja'],
    ]);
    expect(table.gridSource?.uri).toContain('vgt://workspace/document/grid-doc/object/table-1');
  });

  it('refreshes live links while preserving Writer identity and anchor', () => {
    const source = gridDocument(2);
    const linked = extractWriterTableFromGrid(gridDocument(), 'table-1', 'A1:B3', 'Live', { tableId: 'writer-table' });
    linked.anchorParagraphId = 'paragraph-1';
    const writer: WorkspaceDocument = {
      ...gridDocument(),
      id: 'writer-doc',
      kind: 'Writer',
      writerData: {
        pageSetup: {
          paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
          showPageNumbers: true, headerText: '', footerText: '',
        },
        tables: [linked],
      },
    };
    const sourceTable = source.objects['table-1'];
    if (sourceTable?.type !== 'Table') throw new Error('test fixture');
    sourceTable.data.cells.B2 = { value: 99 };

    const result = refreshWriterGridLinks(writer, source, 'table-1');
    expect(result.updatedCount).toBe(1);
    expect(result.document.writerData?.tables[0]?.rows[0]?.cells[1]?.content).toBe('99');
    expect(result.document.writerData?.tables[0]?.anchorParagraphId).toBe('paragraph-1');
    expect(result.document.writerData?.tables[0]?.gridSource?.sourceVersion).toBe(2);
  });

  it('anchors Grid copies, refreshes only live tables, and preserves both modes through WOM persistence', () => {
    const activeParagraphId = 'writer-paragraph-2';
    const live = extractWriterTableFromGrid(gridDocument(), 'table-1', 'A1:B3', 'Live', {
      tableId: 'writer-live-table',
      anchorParagraphId: activeParagraphId,
    });
    const frozen = extractWriterTableFromGrid(gridDocument(), 'table-1', 'A1:B3', 'Frozen', {
      tableId: 'writer-frozen-table',
      anchorParagraphId: activeParagraphId,
    });
    expect(live.anchorParagraphId).toBe(activeParagraphId);
    expect(live.gridSource?.mode).toBe('Live');
    expect(frozen.anchorParagraphId).toBe(activeParagraphId);
    expect(frozen.gridSource).toBeUndefined();

    const writer: WorkspaceDocument = {
      schema_version: 2,
      id: 'writer-doc',
      kind: 'Writer',
      title: 'Writer',
      created_at: 1,
      modified_at: 1,
      version: 1,
      theme_id: 'dark',
      root_object_ids: [],
      objects: {},
      writerData: {
        pageSetup: {
          paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
          showPageNumbers: true, headerText: '', footerText: '',
        },
        tables: [live, frozen],
      },
    };
    const changedSource = gridDocument(2);
    const sourceTable = changedSource.objects['table-1'];
    if (sourceTable?.type !== 'Table') throw new Error('test fixture');
    sourceTable.data.cells.B2 = { value: 99 };

    const refreshed = refreshWriterGridLinks(writer, changedSource, 'table-1');
    expect(refreshed.updatedCount).toBe(1);
    expect(refreshed.document.writerData?.tables[0]?.rows[0]?.cells[1]?.content).toBe('99');
    expect(refreshed.document.writerData?.tables[0]?.anchorParagraphId).toBe(activeParagraphId);
    expect(refreshed.document.writerData?.tables[1]?.rows[0]?.cells[1]?.content).toBe('42');
    expect(refreshed.document.writerData?.tables[1]?.gridSource).toBeUndefined();

    const reloaded = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(refreshed.document));
    expect(reloaded.writerData?.tables[0]?.gridSource?.sourceVersion).toBe(2);
    expect(reloaded.writerData?.tables[0]?.anchorParagraphId).toBe(activeParagraphId);
    expect(reloaded.writerData?.tables[1]?.gridSource).toBeUndefined();
    expect(reloaded.writerData?.tables[1]?.rows[0]?.cells[1]?.content).toBe('42');
  });
});
