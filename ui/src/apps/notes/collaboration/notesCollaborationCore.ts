// STATUS: DIAMANT VGT SUPREME — Notes object-semantic merge helper only; durable causal/queue/transport truth remains vgt-syncgraph.

import type { NoteComment, NotePage, NotePageRevision, NotePropertyValue } from '../../../shared/contracts/workspace';
import { createNoteEntityId, createPageRevision, sanitizeNoteProperties, sanitizeNoteTitle } from '../model/notesHierarchy';

const MAX_COMMENTS = 2_000;
const MAX_COMMENT_BODY = 16_384;
const MAX_MENTIONS = 64;
const MAX_CONFLICT_TEXT = 2_000_000;

export function extractNoteMentions(body: string): string[] {
  const mentions: string[] = [];
  const seen = new Set<string>();
  const regex = /(?:^|\s)@([\p{L}\p{N}_.-]{1,64})/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null && mentions.length < MAX_MENTIONS) {
    const value = match[1].normalize('NFKC');
    const key = value.toLocaleLowerCase();
    if (!seen.has(key)) { seen.add(key); mentions.push(value); }
  }
  return mentions;
}

export function createNoteComment(input: { authorId: string; authorName: string; body: string; parentId?: string | null }, now = Date.now()): NoteComment {
  const body = input.body.normalize('NFKC').replace(/\u0000/g, '').trim().slice(0, MAX_COMMENT_BODY);
  if (!body) throw new Error('Comment text is required.');
  return {
    id: createNoteEntityId('comment'),
    authorId: sanitizeNoteTitle(input.authorId, 'local-author').slice(0, 160),
    authorName: sanitizeNoteTitle(input.authorName, 'Local author').slice(0, 128),
    body,
    mentions: extractNoteMentions(body),
    parentId: input.parentId ?? null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
}

export function appendNoteComment(page: NotePage, comment: NoteComment): NotePage {
  const comments = page.comments ?? [];
  if (comment.parentId && !comments.some((entry) => entry.id === comment.parentId && !entry.parentId)) throw new Error('Reply target does not exist.');
  if (comments.some((entry) => entry.id === comment.id)) return page;
  return { ...page, comments: [...comments, comment].slice(-MAX_COMMENTS), last_modified: Math.max(page.last_modified, comment.updatedAt) };
}

export function resolveNoteCommentThread(page: NotePage, rootId: string, resolved: boolean, now = Date.now()): NotePage {
  if (!(page.comments ?? []).some((entry) => entry.id === rootId && !entry.parentId)) return page;
  return {
    ...page,
    comments: (page.comments ?? []).map((entry) => entry.id === rootId || entry.parentId === rootId ? { ...entry, resolvedAt: resolved ? now : null, updatedAt: now } : entry),
    last_modified: Math.max(page.last_modified, now),
  };
}

export function createNamedNoteSnapshot(page: NotePage, name: string, now = Date.now()): NotePageRevision {
  const safeName = sanitizeNoteTitle(name, 'Named snapshot').slice(0, 120);
  return { ...createPageRevision(page, now), name: safeName };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeScalar<T>(base: T, local: T, remote: T): { value: T; conflict: boolean } {
  if (same(local, remote)) return { value: local, conflict: false };
  if (same(local, base)) return { value: remote, conflict: false };
  if (same(remote, base)) return { value: local, conflict: false };
  return { value: local, conflict: true };
}

function mergeTags(base: readonly string[], local: readonly string[], remote: readonly string[]): { value: string[]; conflict: boolean } {
  const scalar = mergeScalar(base, local, remote);
  if (!scalar.conflict) return { value: [...scalar.value], conflict: false };
  return { value: Array.from(new Set([...local, ...remote])).slice(0, 64), conflict: true };
}

function mergeProperties(base: Record<string, NotePropertyValue> | undefined, local: Record<string, NotePropertyValue> | undefined, remote: Record<string, NotePropertyValue> | undefined): { value: Record<string, NotePropertyValue>; conflicts: number } {
  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(local ?? {}), ...Object.keys(remote ?? {})]);
  const result: Record<string, NotePropertyValue> = {};
  let conflicts = 0;
  for (const key of keys) {
    const merged = mergeScalar(base?.[key], local?.[key], remote?.[key]);
    if (merged.conflict) conflicts += 1;
    if (merged.value !== undefined) result[key] = merged.value;
  }
  return { value: sanitizeNoteProperties(result), conflicts };
}

function lineChange(base: string[], variant: string[]): { start: number; end: number; replacement: string[] } {
  let prefix = 0;
  while (prefix < base.length && prefix < variant.length && base[prefix] === variant[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < base.length - prefix && suffix < variant.length - prefix && base[base.length - 1 - suffix] === variant[variant.length - 1 - suffix]) suffix += 1;
  return { start: prefix, end: base.length - suffix, replacement: variant.slice(prefix, variant.length - suffix) };
}

function mergeText(baseText: string, localText: string, remoteText: string): { value: string; conflict: boolean } {
  const scalar = mergeScalar(baseText, localText, remoteText);
  if (!scalar.conflict) return { value: scalar.value, conflict: false };
  const base = baseText.split('\n');
  const local = lineChange(base, localText.split('\n'));
  const remote = lineChange(base, remoteText.split('\n'));
  if (local.end <= remote.start || remote.end <= local.start) {
    const changes = [local, remote].sort((a, b) => b.start - a.start);
    const merged = [...base];
    for (const change of changes) merged.splice(change.start, change.end - change.start, ...change.replacement);
    return { value: merged.join('\n').slice(0, MAX_CONFLICT_TEXT), conflict: false };
  }
  const conflict = [
    '<!-- ASTRAEA-NOTES-CONFLICT: manual resolution required -->',
    '<<<<<<< LOCAL', localText, '=======', remoteText, '>>>>>>> REMOTE',
  ].join('\n').slice(0, MAX_CONFLICT_TEXT);
  return { value: conflict, conflict: true };
}

function mergeComments(local: readonly NoteComment[] | undefined, remote: readonly NoteComment[] | undefined): NoteComment[] {
  const byId = new Map<string, NoteComment>();
  for (const comment of [...(local ?? []), ...(remote ?? [])]) {
    const previous = byId.get(comment.id);
    if (!previous || comment.updatedAt >= previous.updatedAt) byId.set(comment.id, comment);
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-MAX_COMMENTS);
}

function mergeRevisions(local: readonly NotePageRevision[] | undefined, remote: readonly NotePageRevision[] | undefined): NotePageRevision[] {
  const byId = new Map<string, NotePageRevision>();
  for (const revision of [...(local ?? []), ...(remote ?? [])]) byId.set(revision.id, revision);
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-100);
}

export interface NotePageMergeResult { page: NotePage; conflicts: string[]; }

export function mergeNotePageConflict(base: NotePage, local: NotePage, remote: NotePage, now = Date.now()): NotePageMergeResult {
  if (base.id !== local.id || base.id !== remote.id) throw new Error('Page identity mismatch during collaboration merge.');
  const conflicts: string[] = [];
  const title = mergeScalar(base.title, local.title, remote.title); if (title.conflict) conflicts.push('title');
  const content = mergeText(base.content, local.content, remote.content); if (content.conflict) conflicts.push('content');
  const tags = mergeTags(base.tags, local.tags, remote.tags); if (tags.conflict) conflicts.push('tags');
  const properties = mergeProperties(base.properties, local.properties, remote.properties); if (properties.conflicts) conflicts.push('properties');
  const canvas = mergeScalar(base.canvas, local.canvas, remote.canvas); if (canvas.conflict) conflicts.push('canvas');
  const attachments = mergeScalar(base.attachments ?? [], local.attachments ?? [], remote.attachments ?? []); if (attachments.conflict) conflicts.push('attachments');
  const editorMode = mergeScalar(base.editorMode, local.editorMode, remote.editorMode); if (editorMode.conflict) conflicts.push('editorMode');
  const aliases = mergeScalar(base.aliases ?? [], local.aliases ?? [], remote.aliases ?? []); if (aliases.conflict) conflicts.push('aliases');
  const taskBindings = mergeScalar(base.taskBindings ?? [], local.taskBindings ?? [], remote.taskBindings ?? []); if (taskBindings.conflict) conflicts.push('taskBindings');
  const linkBindings = mergeScalar(base.linkBindings ?? [], local.linkBindings ?? [], remote.linkBindings ?? []); if (linkBindings.conflict) conflicts.push('linkBindings');
  return {
    page: {
      ...local,
      title: title.value,
      content: content.value,
      tags: tags.value,
      properties: properties.value,
      canvas: canvas.value,
      attachments: attachments.value,
      editorMode: editorMode.value,
      aliases: aliases.value,
      taskBindings: taskBindings.value,
      linkBindings: linkBindings.value,
      comments: mergeComments(local.comments, remote.comments),
      revisions: mergeRevisions(local.revisions, remote.revisions),
      lastAuthor: remote.last_modified >= local.last_modified ? remote.lastAuthor : local.lastAuthor,
      last_modified: Math.max(now, local.last_modified, remote.last_modified),
    },
    conflicts,
  };
}
