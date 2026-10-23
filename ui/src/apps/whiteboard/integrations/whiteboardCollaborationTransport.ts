// STATUS: DIAMANT VGT SUPREME
// Bounded same-origin Whiteboard collaboration transport. Remote transports must implement this contract behind an approved network adapter.

import type { WhiteboardCollaborationComment } from '../../../shared/contracts/workspace';
import type { WhiteboardCollaborationSnapshot, WhiteboardItemOperation } from '../model/whiteboardCollaborationEngine';

export interface WhiteboardCollaborationPresence {
  actorId: string;
  sessionId: string;
  displayName: string;
  documentId: string;
  x: number;
  y: number;
  updatedAt: number;
}

export type WhiteboardCollaborationMessage =
  | { kind:'item-ops'; documentId:string; senderSessionId:string; operations:WhiteboardItemOperation[] }
  | { kind:'sync-request'; documentId:string; senderSessionId:string; snapshot?:WhiteboardCollaborationSnapshot }
  | { kind:'snapshot'; documentId:string; senderSessionId:string; targetSessionId:string; snapshot:WhiteboardCollaborationSnapshot }
  | { kind:'comment'; documentId:string; senderSessionId:string; comment:WhiteboardCollaborationComment }
  | { kind:'presence'; documentId:string; senderSessionId:string; presence:WhiteboardCollaborationPresence }
  | { kind:'leave'; documentId:string; senderSessionId:string; actorId:string };

export interface WhiteboardCollaborationTransport {
  readonly label: string;
  readonly secure: boolean;
  send(message: WhiteboardCollaborationMessage): void;
  subscribe(handler: (message: WhiteboardCollaborationMessage) => void): () => void;
  close(): void;
}

const MAX_MESSAGE_BYTES = 8_000_000;
const MAX_OPERATIONS = 10_000;
const MAX_SNAPSHOT_ITEMS = 100_000;
const clean = (value: unknown, max = 256): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function channelName(documentId: string): string {
  const encodedUnits: string[] = [];
  for (let index = 0; index < documentId.length; index += 1) {
    encodedUnits.push(documentId.charCodeAt(index).toString(16).padStart(4, '0'));
  }
  return `astraea-whiteboard-${encodedUnits.join('')}`;
}

function serializedMessageWithinByteLimit(value: unknown): boolean {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  if (typeof serialized !== 'string') return false;

  let byteLength = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    const codeUnit = serialized.charCodeAt(index);
    if (codeUnit <= 0x7f) byteLength += 1;
    else if (codeUnit <= 0x7ff) byteLength += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < serialized.length) {
      const nextUnit = serialized.charCodeAt(index + 1);
      if (nextUnit >= 0xdc00 && nextUnit <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else byteLength += 3;
    } else byteLength += 3;
    if (byteLength > MAX_MESSAGE_BYTES) return false;
  }
  return true;
}

function operationOk(value: unknown): value is WhiteboardItemOperation {
  if (!value || typeof value !== 'object') return false;
  const op = value as WhiteboardItemOperation;
  if (!clean(op.id) || !clean(op.actorId) || !clean(op.actorName,128) || !clean(op.objectId) || !finite(op.at)) return false;
  if (op.kind !== 'upsert' && op.kind !== 'delete') return false;
  if (!op.version || !Number.isSafeInteger(op.version.lamport) || op.version.lamport <= 0 || !clean(op.version.actorId) || op.version.actorId !== op.actorId) return false;
  if (op.kind === 'upsert') return !!op.item && op.item.id === op.objectId && clean(op.item.id);
  return true;
}

function commentOk(value: unknown): value is WhiteboardCollaborationComment {
  if (!value || typeof value !== 'object') return false;
  const c = value as WhiteboardCollaborationComment;
  return clean(c.id) && clean(c.authorId) && clean(c.authorName,128) && clean(c.body,16_384) && Array.isArray(c.mentions) && c.mentions.length <= 64 && finite(c.createdAt) && finite(c.updatedAt);
}

function snapshotOk(value: unknown): value is WhiteboardCollaborationSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as WhiteboardCollaborationSnapshot;
  return Array.isArray(snapshot.items) && snapshot.items.length <= MAX_SNAPSHOT_ITEMS && !!snapshot.state && typeof snapshot.state === 'object';
}

function messageOk(value: unknown, documentId: string): value is WhiteboardCollaborationMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as WhiteboardCollaborationMessage;
  if (!clean(message.documentId) || message.documentId !== documentId || !clean(message.senderSessionId)) return false;
  const expectedActorId = `actor-${message.senderSessionId}`;
  if (message.kind === 'item-ops') return Array.isArray(message.operations) && message.operations.length <= MAX_OPERATIONS && message.operations.every((operation) => operationOk(operation) && operation.actorId === expectedActorId);
  if (message.kind === 'sync-request') return message.snapshot === undefined || snapshotOk(message.snapshot);
  if (message.kind === 'snapshot') return clean(message.targetSessionId) && snapshotOk(message.snapshot);
  if (message.kind === 'comment') return commentOk(message.comment) && message.comment.authorId === expectedActorId;
  if (message.kind === 'presence') {
    const presence = message.presence;
    return !!presence && presence.actorId === expectedActorId && presence.sessionId === message.senderSessionId && clean(presence.displayName,128) && presence.documentId === documentId && finite(presence.x) && finite(presence.y) && finite(presence.updatedAt);
  }
  if (message.kind === 'leave') return message.actorId === expectedActorId;
  return false;
}

export const localWhiteboardTransportAvailable = (): boolean => typeof BroadcastChannel !== 'undefined';

export function createLocalWhiteboardCollaborationTransport(documentId: string): WhiteboardCollaborationTransport {
  if (!clean(documentId)) throw new Error('whiteboard_collaboration_document_id_invalid');
  if (!localWhiteboardTransportAvailable()) throw new Error('whiteboard_collaboration_transport_unavailable');
  const channel = new BroadcastChannel(channelName(documentId));
  const handlers = new Set<(message:WhiteboardCollaborationMessage)=>void>();
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!messageOk(event.data, documentId)) return;
    if (!serializedMessageWithinByteLimit(event.data)) return;
    for (const handler of handlers) handler(event.data);
  };
  return {
    label:'Local same-origin session',
    secure:false,
    send(message) {
      if (!messageOk(message,documentId)) throw new Error('whiteboard_collaboration_message_rejected');
      if (!serializedMessageWithinByteLimit(message)) throw new Error('whiteboard_collaboration_message_too_large');
      channel.postMessage(message);
    },
    subscribe(handler) { handlers.add(handler); return () => handlers.delete(handler); },
    close() { handlers.clear(); channel.close(); },
  };
}
