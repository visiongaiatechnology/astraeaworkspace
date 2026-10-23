// STATUS: DIAMANT VGT SUPREME — a frozen snapshot stays frozen, a live one stays current
//
// Paket 44 acceptance: "Zahlenbereich als eingefrorenen Snapshot übernehmen und bei Quelländerung
// **stabil halten**."
//
// The frozen half was measured first and found sound: both refresh paths skip anything that is not
// `mode === 'Live'`, and a snapshot embed keeps its content and its source version while the source
// moves on. The live half had a defect (W-249): the "nothing changed" test compared the version only,
// so a source update that moved `modified_at` but not `version` left a live table showing stale
// numbers — while the range-link path refreshes on every update and this module treats `modified_at`
// as the freshness signal itself (it writes it and takes the later of the two).
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  appendWriterWorkspaceEmbed,
  createWriterWorkspaceEmbed,
  refreshWriterWorkspaceEmbeds,
} from '../../../public/workspace/writerWorkspaceIntegration';

const grid = (version: number, b2: number, modifiedAt = 1): WorkspaceDocument => ({
  schema_version: 1, id: 'grid-1', title: 'Zahlen', kind: 'Grid', created_at: 1, modified_at: modifiedAt,
  version, theme_id: 'default', root_object_ids: ['table-1'],
  objects: {
    'table-1': {
      type: 'Table',
      data: {
        id: 'table-1', rows: 3, cols: 2,
        cells: { A1: { value: 'Name' }, B1: { value: 'Q1' }, A2: { value: 'Core' }, B2: { value: b2 } },
      },
    },
  },
} as unknown as WorkspaceDocument);

/**
 * A Writer document with the paragraph the embed is anchored to.
 *
 * The anchor is checked against the real paragraphs (W-255), so a fixture without them would be
 * unrealistic: a Writer document always has at least one paragraph, and the anchor is one of them.
 */
const writer = (): WorkspaceDocument => ({
  schema_version: 1, id: 'writer-1', title: 'Bericht', kind: 'Writer', created_at: 1, modified_at: 1,
  version: 1, theme_id: 'default', root_object_ids: ['text-1'],
  objects: {
    'text-1': {
      type: 'TextBlock',
      data: {
        id: 'text-1',
        paragraphs: [{
          id: 'p-1',
          style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
          spans: [{ text: 'Anker' }],
        }],
      },
    },
  },
  writerData: {
    pageSetup: {
      paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
      showPageNumbers: true, headerText: '', footerText: '',
    },
    tables: [],
  },
} as unknown as WorkspaceDocument);

const embedRequest = (source: WorkspaceDocument, mode: 'Live' | 'Snapshot', now = 10) => ({
  writerDocument: writer(), sourceDocument: source, kind: 'grid-range' as const,
  mode, anchorParagraphId: 'p-1', sourceObjectId: 'table-1', sourceSelector: 'A1:B2', now,
});

const writerWith = (source: WorkspaceDocument, mode: 'Live' | 'Snapshot'): WorkspaceDocument => {
  const base = writer();
  const embed = createWriterWorkspaceEmbed(embedRequest(source, mode));
  return {
    ...base,
    writerData: { ...base.writerData!, workspaceEmbeds: appendWriterWorkspaceEmbed([], embed) },
  };
};

/** The rows the document currently shows for its first embed. */
const rowsOf = (document: WorkspaceDocument): string[][] | null => {
  const embed = document.writerData?.workspaceEmbeds?.[0];
  return embed?.snapshot.type === 'table' ? embed.snapshot.rows.map((row) => [...row]) : null;
};

describe('a frozen snapshot stays stable when the source changes', () => {
  it('keeps its content although the source moved on', () => {
    const frozen = writerWith(grid(1, 42), 'Snapshot');
    const refreshed = refreshWriterWorkspaceEmbeds(frozen, grid(7, 99, 900));
    expect(refreshed.updatedCount).toBe(0);
    expect(rowsOf(refreshed.document)).toEqual([['Name', 'Q1'], ['Core', '42']]);
  });

  it('keeps its recorded source version', () => {
    const frozen = writerWith(grid(1, 42), 'Snapshot');
    const refreshed = refreshWriterWorkspaceEmbeds(frozen, grid(7, 99, 900));
    expect(refreshed.document.writerData?.workspaceEmbeds?.[0]?.sourceVersion).toBe(1);
  });

  it('does not bump the writer version when nothing was refreshed', () => {
    const frozen = writerWith(grid(1, 42), 'Snapshot');
    const refreshed = refreshWriterWorkspaceEmbeds(frozen, grid(7, 99, 900));
    expect(refreshed.document).toBe(frozen);
  });

  it('stays stable when only the timestamp moved', () => {
    const frozen = writerWith(grid(1, 42), 'Snapshot');
    const refreshed = refreshWriterWorkspaceEmbeds(frozen, grid(1, 99, 900));
    expect(refreshed.updatedCount).toBe(0);
    expect(rowsOf(refreshed.document)).toEqual([['Name', 'Q1'], ['Core', '42']]);
  });
});

describe('a live embed follows the source', () => {
  it('takes a change that raises the version', () => {
    const live = writerWith(grid(1, 42), 'Live');
    const refreshed = refreshWriterWorkspaceEmbeds(live, grid(2, 99));
    expect(refreshed.updatedCount).toBe(1);
    expect(rowsOf(refreshed.document)).toEqual([['Name', 'Q1'], ['Core', '99']]);
    expect(refreshed.document.writerData?.workspaceEmbeds?.[0]?.sourceVersion).toBe(2);
  });

  it('takes a change that only moves the timestamp', () => {
    // W-249: this case used to be skipped, so the live table kept stale numbers.
    const live = writerWith(grid(1, 42), 'Live');
    const refreshed = refreshWriterWorkspaceEmbeds(live, grid(1, 99, 500));
    expect(refreshed.updatedCount).toBe(1);
    expect(rowsOf(refreshed.document)).toEqual([['Name', 'Q1'], ['Core', '99']]);
    expect(refreshed.document.writerData?.workspaceEmbeds?.[0]?.updatedAt).toBe(500);
  });

  it('does nothing when neither version nor timestamp moved', () => {
    const live = writerWith(grid(1, 42), 'Live');
    const refreshed = refreshWriterWorkspaceEmbeds(live, grid(1, 42));
    expect(refreshed.updatedCount).toBe(0);
    expect(refreshed.document).toBe(live);
  });

  it('leaves an embed of another source document alone', () => {
    const live = writerWith(grid(1, 42), 'Live');
    const otherSource = { ...grid(5, 99, 500), id: 'grid-2' } as WorkspaceDocument;
    const refreshed = refreshWriterWorkspaceEmbeds(live, otherSource);
    expect(refreshed.updatedCount).toBe(0);
    expect(rowsOf(refreshed.document)).toEqual([['Name', 'Q1'], ['Core', '42']]);
  });

  it('bumps the writer version and takes the later timestamp when it did refresh', () => {
    const live = writerWith(grid(1, 42), 'Live');
    const refreshed = refreshWriterWorkspaceEmbeds(live, grid(2, 99, 900));
    expect(refreshed.document.version).toBe(live.version + 1);
    expect(refreshed.document.modified_at).toBeGreaterThanOrEqual(900);
  });

  it('counts a source that cannot deliver the range as failed instead of throwing', () => {
    const live = writerWith(grid(1, 42), 'Live');
    const broken = grid(2, 99);
    const table = broken.objects['table-1'];
    if (table?.type !== 'Table') throw new Error('fixture');
    // The sheet shrinks below the linked range.
    table.data.rows = 1;
    const refreshed = refreshWriterWorkspaceEmbeds(live, broken);
    expect(refreshed.updatedCount).toBe(0);
    expect(refreshed.failedCount).toBe(1);
    expect(rowsOf(refreshed.document)).toEqual([['Name', 'Q1'], ['Core', '42']]);
  });
});
