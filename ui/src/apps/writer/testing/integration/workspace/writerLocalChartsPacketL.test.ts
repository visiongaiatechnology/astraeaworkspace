// STATUS: DIAMANT VGT SUPREME — Writer local chart regression tests
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WriterPageSetupConfig, WriterTableBlockData } from '../../../../../shared/contracts/workspace';
import {
  createWriterWorkspaceEmbed,
  refreshWriterLocalChartEmbeds,
} from '../../../public/workspace/writerWorkspaceIntegration';

const pageSetup: WriterPageSetupConfig = {
  paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
  showPageNumbers: true, headerText: '', footerText: '', columns: 1, columnGapMm: 8,
};

function table(values: [string, string, string][]): WriterTableBlockData {
  return {
    id: 'sales-table',
    columns: ['Monat', 'Umsatz', 'Kosten'],
    caption: 'Quartalszahlen',
    rows: values.map((value, rowIndex) => ({
      id: `row-${rowIndex}`,
      cells: value.map((content, columnIndex) => ({ id: `cell-${rowIndex}-${columnIndex}`, content })),
    })),
  };
}

function writerDocument(sourceTable: WriterTableBlockData): WorkspaceDocument {
  return {
    id: 'writer', title: 'Report', kind: 'Writer', created_at: 1, modified_at: 1, version: 1,
    theme_id: 'default', root_object_ids: ['text'],
    objects: {
      text: {
        type: 'TextBlock',
        data: {
          id: 'text',
          paragraphs: [{ id: 'p1', style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: 'Report' }] }],
        },
      },
    },
    writerData: { pageSetup, tables: [sourceTable] },
  };
}

describe('Writer local charts', () => {
  it('creates a bounded chart snapshot from local Writer table data', () => {
    const writer = writerDocument(table([['Jan', '100', '40'], ['Feb', '120', '55']]));
    const embed = createWriterWorkspaceEmbed({
      writerDocument: writer,
      sourceDocument: writer,
      kind: 'writer-local-chart',
      mode: 'Live',
      anchorParagraphId: 'p1',
      sourceObjectId: 'sales-table',
      id: 'chart-1',
      now: 10,
    });
    expect(embed.snapshot.type).toBe('chart');
    if (embed.snapshot.type !== 'chart') throw new Error('Expected chart snapshot');
    expect(embed.snapshot.title).toBe('Quartalszahlen');
    expect(embed.snapshot.categories).toEqual(['Jan', 'Feb']);
    expect(embed.snapshot.series.map((series) => series.name)).toEqual(['Umsatz', 'Kosten']);
    expect(embed.snapshot.series[0]?.values).toEqual([100, 120]);
  });

  it('refreshes live local charts when their Writer table changes', () => {
    const initialTable = table([['Jan', '100', '40'], ['Feb', '120', '55']]);
    const writer = writerDocument(initialTable);
    const live = createWriterWorkspaceEmbed({
      writerDocument: writer, sourceDocument: writer, kind: 'writer-local-chart', mode: 'Live',
      anchorParagraphId: 'p1', sourceObjectId: 'sales-table', id: 'chart-live', now: 10,
    });
    const updatedTable = table([['Jan', '999', '40'], ['Feb', '120', '55']]);
    const refreshed = refreshWriterLocalChartEmbeds([live], [updatedTable], writer.id, 2, 20);
    const next = refreshed?.[0];
    expect(next?.sourceVersion).toBe(2);
    expect(next?.snapshot.type).toBe('chart');
    if (next?.snapshot.type !== 'chart') throw new Error('Expected chart snapshot');
    expect(next.snapshot.series[0]?.values[0]).toBe(999);
  });

  it('keeps snapshot-mode local charts frozen', () => {
    const initialTable = table([['Jan', '100', '40']]);
    const writer = writerDocument(initialTable);
    const snapshot = createWriterWorkspaceEmbed({
      writerDocument: writer, sourceDocument: writer, kind: 'writer-local-chart', mode: 'Snapshot',
      anchorParagraphId: 'p1', sourceObjectId: 'sales-table', id: 'chart-static', now: 10,
    });
    const refreshed = refreshWriterLocalChartEmbeds([snapshot], [table([['Jan', '999', '40']])], writer.id, 2, 20);
    expect(refreshed?.[0]).toEqual(snapshot);
  });
});
