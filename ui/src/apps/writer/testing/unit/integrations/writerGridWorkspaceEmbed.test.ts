// STATUS: PLATIN — verifies Grid Live Range refresh, Frozen Snapshot isolation, and WOM persistence.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { deserializeWorkspaceDocumentCanonical, serializeWorkspaceDocumentCanonical } from '../../../../../platform/workspace/model/workspaceObjectModel';
import { createWriterWorkspaceEmbed, refreshWriterWorkspaceEmbeds } from '../../../public/workspace/writerWorkspaceIntegration';

function gridDocument(version = 1): WorkspaceDocument {
  return {
    schema_version: 2,
    id: 'grid-doc',
    title: 'Budget',
    kind: 'Grid',
    created_at: 1,
    modified_at: version,
    version,
    theme_id: 'dark',
    root_object_ids: ['table-1'],
    objects: {
      'table-1': {
        type: 'Table',
        data: {
          id: 'table-1',
          rows: 3,
          cols: 2,
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

function writerDocument(): WorkspaceDocument {
  return {
    schema_version: 2,
    id: 'writer-doc',
    title: 'Writer',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'dark',
    // The anchor is checked against the real paragraphs (W-255): a Writer document always has at
    // least one paragraph, and the embed is anchored to one of them.
    root_object_ids: ['writer-text'],
    objects: {
      'writer-text': {
        type: 'TextBlock',
        data: {
          id: 'writer-text',
          paragraphs: [{
            id: 'writer-paragraph-1',
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
  };
}

describe('Grid range embeds in Writer', () => {
  it('refreshes Live Range only, keeps Frozen Snapshot isolated, and preserves both through WOM persistence', () => {
    const source = gridDocument();
    const target = writerDocument();
    const request = {
      writerDocument: target,
      sourceDocument: source,
      kind: 'grid-range' as const,
      anchorParagraphId: 'writer-paragraph-1',
      sourceObjectId: 'table-1',
      sourceSelector: 'A1:B3',
      now: 10,
    };
    const live = createWriterWorkspaceEmbed({ ...request, id: 'live-range', mode: 'Live' });
    const frozen = createWriterWorkspaceEmbed({ ...request, id: 'frozen-range', mode: 'Snapshot' });
    const changedSource = gridDocument(2);
    const changedTable = changedSource.objects['table-1'];
    if (changedTable?.type !== 'Table') throw new Error('test fixture');
    changedTable.data.cells.B2 = { value: 99 };

    const refreshed = refreshWriterWorkspaceEmbeds({
      ...target,
      writerData: { ...target.writerData!, workspaceEmbeds: [live, frozen] },
    }, changedSource);
    expect(refreshed.updatedCount).toBe(1);
    expect(refreshed.document.writerData?.workspaceEmbeds?.[0]?.sourceVersion).toBe(2);
    expect(refreshed.document.writerData?.workspaceEmbeds?.[0]?.snapshot).toMatchObject({
      type: 'table',
      rows: [['Name', 'Q1'], ['Core', '99'], ['UI', 'Ja']],
    });
    expect(refreshed.document.writerData?.workspaceEmbeds?.[1]?.sourceVersion).toBe(1);
    expect(refreshed.document.writerData?.workspaceEmbeds?.[1]?.snapshot).toMatchObject({
      type: 'table',
      rows: [['Name', 'Q1'], ['Core', '42'], ['UI', 'Ja']],
    });

    const reloaded = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(refreshed.document));
    expect(reloaded.writerData?.workspaceEmbeds?.[0]?.sourceVersion).toBe(2);
    expect(reloaded.writerData?.workspaceEmbeds?.[0]?.snapshot).toEqual(refreshed.document.writerData?.workspaceEmbeds?.[0]?.snapshot);
    expect(reloaded.writerData?.workspaceEmbeds?.[1]?.sourceVersion).toBe(1);
    expect(reloaded.writerData?.workspaceEmbeds?.[1]?.snapshot).toEqual(refreshed.document.writerData?.workspaceEmbeds?.[1]?.snapshot);
  });
});
