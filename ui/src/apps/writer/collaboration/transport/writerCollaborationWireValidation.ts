// STATUS: DIAMANT VGT SUPREME — Bounded Writer Collaboration Wire Validation
import type {
  WriterCollaborationTransportMessage,
  WriterSyncNode,
  WriterSyncOperation,
  WriterVectorClock,
} from '../types/writerCollaborationTypes';

export const WRITER_COLLABORATION_PROTOCOL = 'astraea-writer-syncgraph-v1' as const;
export const MAX_COLLABORATION_MESSAGE_BYTES = 2 * 1024 * 1024;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_FIELD_LENGTH = 128;
const MAX_VECTOR_ACTORS = 4_096;
const MAX_PARENT_IDS = 64;
const MAX_CURSOR_OFFSET = 100_000_000;
const MAX_LOGICAL_TIME = 9_007_199_254_740_990;

interface WireEnvelope {
  protocol: typeof WRITER_COLLABORATION_PROTOCOL;
  payload: WriterCollaborationTransportMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && !/\p{Cc}/u.test(value);
}

function safeCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function boundedIndex(value: unknown): value is number {
  return safeCounter(value) && value <= MAX_CURSOR_OFFSET;
}

function logicalCounter(value: unknown): value is number {
  return safeCounter(value) && value <= MAX_LOGICAL_TIME;
}

function encodedSizeWithinBoundary(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string'
      && new TextEncoder().encode(serialized).byteLength <= MAX_COLLABORATION_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

function validParagraphIdentity(value: unknown, expectedId?: string): boolean {
  if (!isRecord(value) || !boundedString(value.id)) return false;
  return expectedId === undefined || value.id === expectedId;
}

function validVectorClock(value: unknown): value is WriterVectorClock {
  if (!isRecord(value) || !isRecord(value.clock)) return false;
  const entries = Object.entries(value.clock);
  if (entries.length > MAX_VECTOR_ACTORS) return false;
  return entries.every(([actorId, counter]) => boundedString(actorId) && logicalCounter(counter));
}

function validOperation(value: unknown): value is WriterSyncOperation {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length !== 1) return false;
  const [kind, raw] = entries[0];
  if (!isRecord(raw)) return false;

  switch (kind) {
    case 'InsertParagraph':
      return boundedString(raw.block_id)
        && boundedIndex(raw.index)
        && validParagraphIdentity(raw.paragraph);
    case 'DeleteParagraph':
      return boundedString(raw.block_id)
        && boundedString(raw.paragraph_id)
        && boundedIndex(raw.index)
        && validParagraphIdentity(raw.cached_paragraph, raw.paragraph_id);
    case 'ReplaceParagraph':
      return boundedString(raw.block_id)
        && boundedString(raw.paragraph_id)
        && validParagraphIdentity(raw.before, raw.paragraph_id)
        && validParagraphIdentity(raw.after, raw.paragraph_id);
    case 'MoveParagraph':
      return boundedString(raw.block_id)
        && boundedString(raw.paragraph_id)
        && boundedIndex(raw.from_index)
        && boundedIndex(raw.to_index);
    case 'SetWriterData':
      return Object.hasOwn(raw, 'before') && Object.hasOwn(raw, 'after');
    case 'SetWriterDataField':
      return boundedString(raw.field, MAX_FIELD_LENGTH)
        && Object.hasOwn(raw, 'before')
        && Object.hasOwn(raw, 'after');
    default:
      return false;
  }
}

function validSyncNode(value: unknown, documentId: string): value is WriterSyncNode {
  if (!isRecord(value)) return false;
  if (!boundedString(value.op_id) || !boundedString(value.actor_id) || !boundedString(value.document_id)) return false;
  if (value.document_id !== documentId || !logicalCounter(value.lamport_time) || value.lamport_time === 0) return false;
  if (typeof value.timestamp_utc !== 'number' || !Number.isSafeInteger(value.timestamp_utc)) return false;
  if (!Array.isArray(value.parent_ids) || value.parent_ids.length > MAX_PARENT_IDS) return false;
  if (!value.parent_ids.every((parent) => boundedString(parent))) return false;
  if (new Set(value.parent_ids).size !== value.parent_ids.length || value.parent_ids.includes(value.op_id)) return false;
  if (value.signature !== undefined && value.signature !== null && !boundedString(value.signature, 8_192)) return false;
  return validOperation(value.operation);
}

function validCursor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return boundedString(value.paragraphId)
    && boundedIndex(value.anchor)
    && boundedIndex(value.focus);
}

function validPayload(value: unknown): value is WriterCollaborationTransportMessage {
  if (!isRecord(value)) return false;
  if (!boundedString(value.kind, 32) || !boundedString(value.documentId) || !boundedString(value.senderSessionId)) return false;
  if (value.targetSessionId !== undefined && !boundedString(value.targetSessionId)) return false;

  switch (value.kind) {
    case 'sync-node':
      return validSyncNode(value.node, value.documentId);
    case 'sync-request':
      return validVectorClock(value.vectorClock);
    case 'sync-batch-end':
      return boundedString(value.targetSessionId) && typeof value.hasMore === 'boolean';
    case 'presence': {
      if (!isRecord(value.presence)) return false;
      const presence = value.presence;
      if (!boundedString(presence.actorId) || !boundedString(presence.sessionId)) return false;
      if (presence.sessionId !== value.senderSessionId || presence.documentId !== value.documentId) return false;
      if (!boundedString(presence.documentId) || !boundedString(presence.displayName, MAX_DISPLAY_NAME_LENGTH)) return false;
      if (typeof presence.updatedAt !== 'number' || !Number.isSafeInteger(presence.updatedAt) || presence.updatedAt < 0) return false;
      if (presence.activeParagraphId !== undefined && presence.activeParagraphId !== null && !boundedString(presence.activeParagraphId)) return false;
      return presence.cursor === undefined || validCursor(presence.cursor);
    }
    case 'leave':
      return boundedString(value.actorId);
    default:
      return false;
  }
}

export function validateWriterCollaborationEnvelope(message: unknown): WriterCollaborationTransportMessage | null {
  if (!encodedSizeWithinBoundary(message) || !isRecord(message)) return null;
  if (message.protocol !== WRITER_COLLABORATION_PROTOCOL || !validPayload(message.payload)) return null;
  return message.payload;
}

export function createWriterCollaborationEnvelope(payload: WriterCollaborationTransportMessage): WireEnvelope {
  return { protocol: WRITER_COLLABORATION_PROTOCOL, payload };
}

export function writerCollaborationEnvelopeFitsBoundary(payload: WriterCollaborationTransportMessage): boolean {
  return encodedSizeWithinBoundary(createWriterCollaborationEnvelope(payload));
}
