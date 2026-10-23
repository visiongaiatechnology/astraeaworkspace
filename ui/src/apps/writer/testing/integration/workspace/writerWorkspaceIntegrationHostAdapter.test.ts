// STATUS: PLATIN — verifies the installed Writer implementation through the neutral Core API.
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { appendWriterWorkspaceEmbed, createWriterWorkspaceEmbed } from '../../../../../platform/workspace/integrations/writerWorkspaceIntegration';
import { createNewDocument } from '../../../../../edition/contracts/documentFactory';
import { installWriterWorkspaceIntegrationHost } from '../../../public/workspace/writerWorkspaceIntegrationHostAdapter';

let unregister: (() => void) | undefined;

afterEach(() => {
  unregister?.();
  unregister = undefined;
});

describe('Writer workspace integration host adapter', () => {
  it('routes bounded Grid snapshots and embed append through the Writer owner', () => {
    unregister = installWriterWorkspaceIntegrationHost();
    const writerDocument = createNewDocument('Writer');
    const sourceDocument = createNewDocument('Grid');
    const table = Object.values(sourceDocument.objects).find((item) => item.type === 'Table');
    if (!table || table.type !== 'Table') throw new Error('Expected seeded Grid table');
    const canonicalWriter = writerDocument as WorkspaceDocument;
    // The anchor is checked against the real paragraphs (W-255), so this test takes the paragraph the
    // document actually has instead of the invented id `paragraph-1` it used before. That assertion
    // also answers whether a freshly created Writer document has a paragraph to anchor to at all.
    const textBlock = Object.values(canonicalWriter.objects).find((item) => item.type === 'TextBlock');
    const anchorParagraphId = textBlock?.type === 'TextBlock' ? textBlock.data.paragraphs[0]?.id : undefined;
    expect(anchorParagraphId).toBeTruthy();

    const result = createWriterWorkspaceEmbed({
      writerDocument: canonicalWriter,
      sourceDocument,
      kind: 'grid-range',
      mode: 'Snapshot',
      anchorParagraphId: anchorParagraphId!,
      sourceObjectId: table.data.id,
      sourceSelector: 'A1:B2',
      id: 'grid-snapshot-1',
      now: 10,
    });

    expect(result.snapshot.type).toBe('table');
    if (result.snapshot.type !== 'table') throw new Error('Expected bounded table snapshot');
    expect(result.snapshot.columns).toHaveLength(2);
    expect(result.snapshot.rows).toHaveLength(2);
    expect(appendWriterWorkspaceEmbed([], result)).toEqual([result]);
  });
});
