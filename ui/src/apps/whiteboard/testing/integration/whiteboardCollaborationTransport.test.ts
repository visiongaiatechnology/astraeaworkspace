import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhiteboardCollaborationComment } from '../../../../shared/contracts/workspace';
import {
  createLocalWhiteboardCollaborationTransport,
  type WhiteboardCollaborationMessage,
} from '../../integrations/whiteboardCollaborationTransport';

class FakeBroadcastChannel {
  static readonly instances: FakeBroadcastChannel[] = [];

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: unknown[] = [];
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  close(): void {
    this.closed = true;
  }

  dispatch(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

function presenceMessage(documentId: string, senderSessionId: string): Extract<WhiteboardCollaborationMessage, { kind: 'presence' }> {
  return {
    kind: 'presence',
    documentId,
    senderSessionId,
    presence: {
      actorId: `actor-${senderSessionId}`,
      sessionId: senderSessionId,
      displayName: 'Peer',
      documentId,
      x: 0,
      y: 0,
      updatedAt: 1,
    },
  };
}

describe('local Whiteboard collaboration transport', () => {
  beforeEach(() => {
    FakeBroadcastChannel.instances.length = 0;
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses collision-free channel names for distinct hostile and long document IDs', () => {
    const documentIds = [
      'doc:private',
      'doc_private',
      `${'x'.repeat(128)}-first`,
      `${'x'.repeat(128)}-second`,
    ];
    const transports = documentIds.map((documentId) => createLocalWhiteboardCollaborationTransport(documentId));
    const channelNames = FakeBroadcastChannel.instances.map((channel) => channel.name);

    expect(new Set(channelNames).size).toBe(documentIds.length);
    for (const transport of transports) transport.close();
  });

  it('rejects malformed document IDs before opening a channel', () => {
    expect(() => createLocalWhiteboardCollaborationTransport('')).toThrow('whiteboard_collaboration_document_id_invalid');
    expect(FakeBroadcastChannel.instances).toHaveLength(0);
  });

  it('accepts self-consistent presence and rejects spoofed sender/session identities', () => {
    const transport = createLocalWhiteboardCollaborationTransport('doc-1');
    const channel = FakeBroadcastChannel.instances[0];
    const received: WhiteboardCollaborationMessage[] = [];
    transport.subscribe((message) => received.push(message));
    const valid = presenceMessage('doc-1', 'wb-session-peer');
    const mismatchedSession = {
      ...valid,
      presence: { ...valid.presence, sessionId: 'wb-session-other' },
    };
    const mismatchedActor = {
      ...valid,
      presence: { ...valid.presence, actorId: 'actor-wb-session-other' },
    };

    channel.dispatch(valid);
    channel.dispatch(mismatchedSession);
    channel.dispatch(mismatchedActor);

    expect(received).toEqual([valid]);
    transport.close();
  });

  it('rejects item operations and comments attributed to another session', () => {
    const transport = createLocalWhiteboardCollaborationTransport('doc-1');
    const channel = FakeBroadcastChannel.instances[0];
    const received: WhiteboardCollaborationMessage[] = [];
    transport.subscribe((message) => received.push(message));
    const operation = {
      id: 'op-1',
      actorId: 'actor-wb-session-owner',
      actorName: 'Owner',
      at: 1,
      objectId: 'item-1',
      version: { lamport: 1, actorId: 'actor-wb-session-owner' },
      kind: 'delete' as const,
    };
    const comment: WhiteboardCollaborationComment = {
      id: 'comment-1',
      authorId: 'actor-wb-session-owner',
      authorName: 'Owner',
      body: 'Hello',
      mentions: [],
      createdAt: 1,
      updatedAt: 1,
    };

    channel.dispatch({ kind: 'item-ops', documentId: 'doc-1', senderSessionId: 'wb-session-attacker', operations: [operation] });
    channel.dispatch({ kind: 'comment', documentId: 'doc-1', senderSessionId: 'wb-session-attacker', comment });

    expect(received).toEqual([]);
    transport.close();
  });

  it('enforces the 8 MB UTF-8 limit for sent and received snapshots', () => {
    const transport = createLocalWhiteboardCollaborationTransport('doc-1');
    const channel = FakeBroadcastChannel.instances[0];
    const received: WhiteboardCollaborationMessage[] = [];
    transport.subscribe((message) => received.push(message));
    const oversized = {
      kind: 'sync-request',
      documentId: 'doc-1',
      senderSessionId: 'wb-session-peer',
      snapshot: { items: [], state: { label: '\u{10000}'.repeat(2_100_000) } },
    } as unknown as WhiteboardCollaborationMessage;

    expect(() => transport.send(oversized)).toThrow('whiteboard_collaboration_message_too_large');
    channel.dispatch(oversized);

    expect(channel.sent).toEqual([]);
    expect(received).toEqual([]);
    transport.close();
  });
});
