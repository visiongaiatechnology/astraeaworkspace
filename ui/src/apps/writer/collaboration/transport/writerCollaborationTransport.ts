// STATUS: DIAMANT VGT SUPREME — Explicit Local Collaboration Transport Adapter
import type {
  WriterCollaborationTransport,
  WriterCollaborationTransportMessage,
} from '../types/writerCollaborationTypes';
import {
  createWriterCollaborationEnvelope,
  validateWriterCollaborationEnvelope,
  writerCollaborationEnvelopeFitsBoundary,
} from './writerCollaborationWireValidation';

function channelName(documentId: string): string {
  const normalized = documentId.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 128);
  return `astraea-writer-${normalized}`;
}

export function localWriterTransportAvailable(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

export function createLocalWriterCollaborationTransport(documentId: string): WriterCollaborationTransport {
  if (!localWriterTransportAvailable()) throw new Error('Local collaboration transport is unavailable');
  const channel = new BroadcastChannel(channelName(documentId));
  const handlers = new Set<(message: WriterCollaborationTransportMessage) => void>();

  channel.onmessage = (event: MessageEvent<unknown>) => {
    const payload = validateWriterCollaborationEnvelope(event.data);
    if (!payload || payload.documentId !== documentId) return;
    for (const handler of handlers) handler(payload);
  };

  return {
    id: 'local-broadcast',
    label: 'Lokale Workspace-Sitzung',
    send(message) {
      if (!writerCollaborationEnvelopeFitsBoundary(message)) {
        throw new Error('Collaboration transport message exceeds or violates the configured resource boundary');
      }
      channel.postMessage(createWriterCollaborationEnvelope(message));
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      handlers.clear();
      channel.close();
    },
  };
}
