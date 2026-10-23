// STATUS: DIAMANT VGT SUPREME — Writer Collaboration / SyncGraph Regression Packet
import { describe, expect, it } from 'vitest';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { deriveWriterSyncOperations, WriterSyncDerivationError } from '../../../collaboration/operations/writerSyncOperations';
import { createWriterCollaborationEnvelope, validateWriterCollaborationEnvelope } from '../../../collaboration/transport/writerCollaborationWireValidation';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.15, space_before: 0, space_after: 8 },
    spans: [{ text }],
  };
}

function writerDocument(paragraphs: Paragraph[]): WorkspaceDocument {
  return {
    schema_version: 1,
    id: 'writer-collab-doc',
    title: 'Collaboration Test',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: ['writer-block'],
    objects: {
      'writer-block': { type: 'TextBlock', data: { id: 'writer-block', paragraphs } },
    },
    writerData: {
      pageSetup: {
        paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
        showPageNumbers: true, headerText: '', footerText: '',
      },
      tables: [],
      comments: [],
    },
  };
}

describe('Writer SyncGraph operation derivation', () => {
  it('derives stable insert/move/replace operations and field-level Writer payload changes', () => {
    const before = writerDocument([paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')]);
    const after = structuredClone(before);
    after.version = 9;
    after.modified_at = 999;
    const block = after.objects['writer-block'];
    if (!block || block.type !== 'TextBlock') throw new Error('test fixture broken');
    block.data.paragraphs = [paragraph('p2', 'Beta'), paragraph('p3', 'Gamma'), paragraph('p1', 'Alpha edited')];
    after.writerData = { ...after.writerData!, comments: [{ id: 'c1', paragraphId: 'p1', author: 'Alice', avatarColor: '#64748b', text: 'Review', resolved: false, createdAt: 5, replies: [] }] };

    const operations = deriveWriterSyncOperations(before, after);
    expect(operations.some((operation) => 'InsertParagraph' in operation)).toBe(true);
    expect(operations.some((operation) => 'MoveParagraph' in operation)).toBe(true);
    expect(operations.some((operation) => 'ReplaceParagraph' in operation)).toBe(true);
    const writerFields = operations.filter((operation) => 'SetWriterDataField' in operation);
    expect(writerFields).toHaveLength(1);
    expect(writerFields[0]).toMatchObject({ SetWriterDataField: { field: 'comments' } });
  });

  it('derives delete snapshots from the exact pre-change paragraph state', () => {
    const before = writerDocument([paragraph('p1', 'Keep'), paragraph('p2', 'Delete me')]);
    const after = writerDocument([paragraph('p1', 'Keep')]);
    const operations = deriveWriterSyncOperations(before, after);
    expect(operations[0]).toEqual({
      DeleteParagraph: {
        block_id: 'writer-block', paragraph_id: 'p2', index: 1, cached_paragraph: paragraph('p2', 'Delete me'),
      },
    });
  });

  it('ignores local version/timestamp noise but rejects unsupported document metadata changes', () => {
    const before = writerDocument([paragraph('p1', 'Stable')]);
    const metadataOnly = { ...before, version: 22, modified_at: 12345 };
    expect(deriveWriterSyncOperations(before, metadataOnly)).toEqual([]);
    expect(() => deriveWriterSyncOperations(before, { ...metadataOnly, title: 'Renamed' })).toThrow(WriterSyncDerivationError);
  });

  it('rejects unsynchronized non-Writer object mutations rather than silently dropping them', () => {
    const before = writerDocument([paragraph('p1', 'Stable')]);
    before.root_object_ids.push('ref-1');
    before.objects['ref-1'] = {
      type: 'WorkspaceReference',
      data: { id: 'ref-1', uri: 'vgt://workspace/document/grid/object/chart-1', mode: 'Live' },
    };
    const after = structuredClone(before);
    const ref = after.objects['ref-1'];
    if (!ref || ref.type !== 'WorkspaceReference') throw new Error('test fixture broken');
    ref.data.mode = 'Frozen';
    expect(() => deriveWriterSyncOperations(before, after)).toThrow(/changed outside/);
  });
});


describe('Writer collaboration wire validation', () => {
  it('accepts a bounded presence envelope and rejects hostile cursor offsets', () => {
    const valid = createWriterCollaborationEnvelope({
      kind: 'presence',
      documentId: 'writer-collab-doc',
      senderSessionId: 'session-a',
      presence: {
        actorId: 'actor-a',
        sessionId: 'session-a',
        displayName: 'Alice',
        documentId: 'writer-collab-doc',
        activeParagraphId: 'p1',
        cursor: { paragraphId: 'p1', anchor: 2, focus: 5 },
        updatedAt: 1234,
      },
    });
    expect(validateWriterCollaborationEnvelope(valid)?.kind).toBe('presence');
    const hostile = structuredClone(valid);
    if (hostile.payload.kind !== 'presence' || !hostile.payload.presence.cursor) throw new Error('fixture broken');
    hostile.payload.presence.cursor.anchor = Number.MAX_SAFE_INTEGER;
    expect(validateWriterCollaborationEnvelope(hostile)).toBe(null);
  });

  it('rejects duplicate causal parents before a sync node reaches native IPC', () => {
    const envelope = createWriterCollaborationEnvelope({
      kind: 'sync-node', documentId: 'writer-collab-doc', senderSessionId: 'session-a',
      node: {
        op_id: 'op-1', actor_id: 'actor-a', device_id: 'device-a', schema_version: 1, object_ids: ['writer-block', 'p1'],
        lamport_time: 2, parent_ids: ['op-0', 'op-0'],
        timestamp_utc: 2000, document_id: 'writer-collab-doc', signature: null,
        operation: { MoveParagraph: { block_id: 'writer-block', paragraph_id: 'p1', from_index: 0, to_index: 1 } },
      },
    });
    expect(validateWriterCollaborationEnvelope(envelope)).toBe(null);
  });

  it('rejects zero/unsafe logical clocks and self-referential causal parents on the wire', () => {
    const base = createWriterCollaborationEnvelope({
      kind: 'sync-node', documentId: 'writer-collab-doc', senderSessionId: 'session-a',
      node: {
        op_id: 'op-1', actor_id: 'actor-a', device_id: 'device-a', schema_version: 1, object_ids: ['writer-block', 'p1'],
        lamport_time: 1, parent_ids: [],
        timestamp_utc: 2000, document_id: 'writer-collab-doc', signature: null,
        operation: { MoveParagraph: { block_id: 'writer-block', paragraph_id: 'p1', from_index: 0, to_index: 1 } },
      },
    });
    const zero = structuredClone(base);
    if (zero.payload.kind !== 'sync-node') throw new Error('fixture broken');
    zero.payload.node.lamport_time = 0;
    expect(validateWriterCollaborationEnvelope(zero)).toBe(null);

    const unsafe = structuredClone(base);
    if (unsafe.payload.kind !== 'sync-node') throw new Error('fixture broken');
    unsafe.payload.node.lamport_time = Number.MAX_SAFE_INTEGER;
    expect(validateWriterCollaborationEnvelope(unsafe)).toBe(null);

    const selfParent = structuredClone(base);
    if (selfParent.payload.kind !== 'sync-node') throw new Error('fixture broken');
    selfParent.payload.node.parent_ids = ['op-1'];
    expect(validateWriterCollaborationEnvelope(selfParent)).toBe(null);

    const request = createWriterCollaborationEnvelope({
      kind: 'sync-request', documentId: 'writer-collab-doc', senderSessionId: 'session-a',
      vectorClock: { clock: { 'actor-a': Number.MAX_SAFE_INTEGER } },
    });
    expect(validateWriterCollaborationEnvelope(request)).toBe(null);
  });

  it('accepts bounded replay batch terminators only for an explicit target session', () => {
    const envelope = createWriterCollaborationEnvelope({
      kind: 'sync-batch-end', documentId: 'writer-collab-doc', senderSessionId: 'session-a',
      targetSessionId: 'session-b', hasMore: true,
    });
    expect(validateWriterCollaborationEnvelope(envelope)?.kind).toBe('sync-batch-end');
  });
});
