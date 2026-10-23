// STATUS: DIAMANT VGT SUPREME — ephemeral presence and durable review projections.

import type { WorkspaceCommentReviewObject, WorkspaceCommentReviewEntry, WorkspaceObject } from '../../shared/contracts/workspace';
import { boundedId, MAX_DISPLAY_NAME, MAX_SELECTION, SyncGraphBoundaryError, SYNCGRAPH_MAX_COMMENT_BODY, SYNCGRAPH_MAX_MENTIONS, SYNCGRAPH_MAX_PRESENCE, SYNCGRAPH_MAX_REVIEW_COMMENTS, SYNCGRAPH_PRESENCE_TTL_MS } from './syncGraphIngressPolicy';

export interface PresenceRecord {
  actorId: string;
  deviceId: string;
  sessionId: string;
  documentId: string;
  displayName: string;
  selectionAnchor?: string;
  updatedAt: number;
  expiresAt: number;
}

export class EphemeralPresenceRegistry {
  private readonly records = new Map<string, PresenceRecord>();
  upsert(input: Omit<PresenceRecord, 'updatedAt' | 'expiresAt'>, now = Date.now()): PresenceRecord {
    const sessionId = boundedId(input.sessionId, 'presence session');
    if (!this.records.has(sessionId) && this.records.size >= SYNCGRAPH_MAX_PRESENCE) throw new SyncGraphBoundaryError('BOUNDS');
    const displayName = input.displayName.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, MAX_DISPLAY_NAME);
    const selectionAnchor = input.selectionAnchor?.slice(0, MAX_SELECTION);
    const record: PresenceRecord = {
      actorId: boundedId(input.actorId, 'presence actor'), deviceId: boundedId(input.deviceId, 'presence device'), sessionId,
      documentId: boundedId(input.documentId, 'presence document'), displayName, selectionAnchor,
      updatedAt: now, expiresAt: now + SYNCGRAPH_PRESENCE_TTL_MS,
    };
    this.records.set(sessionId, record);
    return { ...record };
  }
  activeForDocument(documentId: string, now = Date.now()): PresenceRecord[] {
    const id = boundedId(documentId, 'presence document');
    this.sweep(now);
    return [...this.records.values()].filter((entry) => entry.documentId === id).sort((a, b) => b.updatedAt - a.updatedAt).map((entry) => ({ ...entry }));
  }
  sweep(now = Date.now()): void { for (const [id, entry] of this.records) if (entry.expiresAt <= now) this.records.delete(id); }
  get size(): number { return this.records.size; }
}

export function extractReviewMentions(body: string): string[] {
  const matches: string[] = [];
  const seen = new Set<string>();
  const regex = /(?:^|\s)@([\p{L}\p{N}_.-]{1,64})/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) && matches.length < SYNCGRAPH_MAX_MENTIONS) {
    const value = match[1].normalize('NFKC');
    const key = value.toLocaleLowerCase();
    if (!seen.has(key)) { seen.add(key); matches.push(value); }
  }
  return matches;
}

export interface DurableReviewInput { id: string; targetUri: string; authorId: string; body: string; createdAt?: number; }
export function createDurableReviewObject(input: DurableReviewInput): WorkspaceObject {
  const body = input.body.normalize('NFKC').replace(/\u0000/gu, '').trim().slice(0, SYNCGRAPH_MAX_COMMENT_BODY);
  if (!body) throw new SyncGraphBoundaryError('INVALID');
  const createdAt = input.createdAt ?? Date.now();
  if (!Number.isFinite(createdAt) || createdAt < 0) throw new SyncGraphBoundaryError('INVALID');
  const mentions = extractReviewMentions(body);
  const annotatedBody = mentions.length ? `${body}\n\n[mentions:${mentions.join(',')}]` : body;
  const entry: WorkspaceCommentReviewEntry = { id: `${boundedId(input.id, 'review id')}:0`, authorId: boundedId(input.authorId, 'review author'), createdAt, body: annotatedBody };
  const data: WorkspaceCommentReviewObject = { id: boundedId(input.id, 'review id'), targetUri: boundedId(input.targetUri, 'review target'), status: 'open', comments: [entry].slice(-SYNCGRAPH_MAX_REVIEW_COMMENTS) };
  return { type: 'CommentReview', data };
}
