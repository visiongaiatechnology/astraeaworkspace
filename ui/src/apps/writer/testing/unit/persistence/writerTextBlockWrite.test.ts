// STATUS: PLATIN — Writer TextBlock write planning (no silent no-op on empty documents)
import { describe, expect, it } from 'vitest';
import type { Paragraph, WorkspaceDocument, WorkspaceObject } from '../../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../../app/bootstrap/seedDocDefaultsOpenCore';
import {
  planWriterTextBlockWrite,
  resolveWriterTextBlockId,
} from '../../../persistence/writerTextBlockWrite';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };

function paragraph(id: string, text: string): Paragraph {
  return { id, style: { ...STYLE }, spans: [{ text }] };
}

function tableObject(id: string): WorkspaceObject {
  return { type: 'Table', data: { id, rows: 2, cols: 2, cells: {} } };
}

/** A Writer document stripped back to an empty object model. */
function baseDocument(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  const document = createNewDocument('Writer');
  return { ...document, root_object_ids: [], objects: {}, ...overrides };
}

describe('Writer TextBlock write planning', () => {
  it('writes paragraphs into an existing TextBlock without changing its identity', () => {
    const document = baseDocument({
      root_object_ids: ['tb-existing'],
      objects: { 'tb-existing': { type: 'TextBlock', data: { id: 'tb-existing', paragraphs: [] } } },
    });
    const write = planWriterTextBlockWrite({
      document,
      primaryTextBlockId: 'tb-existing',
      existingTextBlock: { id: 'tb-existing', paragraphs: [] },
      paragraphs: [paragraph('p1', 'Alpha')],
    });
    expect(write?.textBlockId).toBe('tb-existing');
    expect(write?.rootObjectIds).toEqual(['tb-existing']);
    expect(write?.objects['tb-existing']).toMatchObject({
      type: 'TextBlock',
      data: { id: 'tb-existing', paragraphs: [paragraph('p1', 'Alpha')] },
    });
  });

  it('creates the missing TextBlock so an empty document cannot silently drop input', () => {
    const document = baseDocument();
    const write = planWriterTextBlockWrite({
      document,
      paragraphs: [paragraph('p1', 'First line')],
    });
    expect(write).not.toBeNull();
    expect(write?.textBlockId).toBe(`tb-${document.id}`);
    expect(write?.rootObjectIds).toEqual([`tb-${document.id}`]);
    expect(write?.objects[`tb-${document.id}`]).toMatchObject({
      type: 'TextBlock',
      data: { id: `tb-${document.id}`, paragraphs: [paragraph('p1', 'First line')] },
    });
  });

  it('keeps foreign root objects and places the created TextBlock first', () => {
    const document = baseDocument({
      root_object_ids: ['tbl-1'],
      objects: { 'tbl-1': tableObject('tbl-1') },
    });
    const write = planWriterTextBlockWrite({ document, paragraphs: [paragraph('p1', 'Alpha')] });
    expect(write?.rootObjectIds).toEqual([`tb-${document.id}`, 'tbl-1']);
    expect(write?.objects['tbl-1']).toBe(document.objects['tbl-1']);
  });

  it('replaces a stale non-TextBlock primary id instead of nesting the document fragment', () => {
    const document = baseDocument({
      root_object_ids: ['tbl-1'],
      objects: { 'tbl-1': tableObject('tbl-1') },
    });
    const write = planWriterTextBlockWrite({
      document,
      primaryTextBlockId: 'tbl-1',
      paragraphs: [paragraph('p1', 'Alpha')],
    });
    expect(write?.rootObjectIds).toEqual(['tbl-1']);
    expect(write?.objects['tbl-1']).toMatchObject({ type: 'TextBlock' });
  });

  it('returns null only when there is neither content nor an existing block', () => {
    expect(planWriterTextBlockWrite({ document: baseDocument(), paragraphs: [] })).toBeNull();
    const existing = planWriterTextBlockWrite({
      document: baseDocument(),
      existingTextBlock: { id: 'tb-x', paragraphs: [] },
      paragraphs: [],
    });
    expect(existing).not.toBeNull();
    expect(existing?.textBlockId).toBe('tb-x');
  });

  it('derives a stable identifier per document', () => {
    const first = baseDocument();
    const second = baseDocument({ id: 'doc-99' });
    expect(resolveWriterTextBlockId(first)).toBe(`tb-${first.id}`);
    expect(resolveWriterTextBlockId(second)).toBe('tb-doc-99');
    expect(resolveWriterTextBlockId(first)).toBe(resolveWriterTextBlockId(first));
  });

  it('survives a JSON save/reopen cycle with byte-identical payload data', () => {
    const document = baseDocument();
    const paragraphs = [paragraph('p1', 'Erster Absatz'), paragraph('p2', 'Zweiter Absatz')];
    const write = planWriterTextBlockWrite({ document, paragraphs });
    expect(write).not.toBeNull();
    const saved = JSON.stringify({ root_object_ids: write?.rootObjectIds, objects: write?.objects });
    const reopened = JSON.parse(saved) as {
      root_object_ids: string[];
      objects: Record<string, WorkspaceObject>;
    };
    const reopenedId = reopened.root_object_ids[0];
    expect(reopenedId).toBe(write?.textBlockId);
    const reopenedBlock = reopenedId ? reopened.objects[reopenedId] : undefined;
    expect(reopenedBlock?.type).toBe('TextBlock');
    if (reopenedBlock?.type !== 'TextBlock') throw new Error('Reopened document lost its TextBlock.');
    expect(reopenedBlock.data.paragraphs).toEqual(paragraphs);
    expect(reopenedBlock.data.paragraphs.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('does not mutate the input document or paragraph array', () => {
    const document = baseDocument();
    const paragraphs = [paragraph('p1', 'Alpha')];
    const documentSnapshot = JSON.stringify(document);
    const paragraphsSnapshot = JSON.stringify(paragraphs);
    planWriterTextBlockWrite({ document, paragraphs });
    expect(JSON.stringify(document)).toBe(documentSnapshot);
    expect(JSON.stringify(paragraphs)).toBe(paragraphsSnapshot);
  });
});
