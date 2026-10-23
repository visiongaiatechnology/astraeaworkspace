// STATUS: DIAMANT VGT SUPREME — Astraea Notes hierarchy, trash, recents and revision domain

import type {
  NoteNotebook,
  NotePage,
  NotePageRevision,
  NotePropertyValue,
  NoteSection,
  NoteSectionGroup,
} from '../../../shared/contracts/workspace';
import { normalizeNoteProtectionPolicy } from '../security/notesSecurity';

export const MAX_NOTE_SUBPAGE_DEPTH = 8;
export const MAX_NOTE_SECTION_GROUP_DEPTH = 8;
export const MAX_NOTE_RECENTS = 64;
export const MAX_NOTE_NAVIGATION_HISTORY = 128;
export const MAX_NOTE_REVISIONS = 100;
export const NOTE_REVISION_COALESCE_MS = 30_000;

function randomHex(bytes = 12): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createNoteEntityId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'note';
  const uuid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : randomHex(16);
  return `${safePrefix}-${uuid}`;
}

export function sanitizeNoteTitle(value: string, fallback: string): string {
  const compact = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (compact || fallback).slice(0, 240);
}

export function sanitizeNoteProperties(
  properties: Record<string, NotePropertyValue> | undefined
): Record<string, NotePropertyValue> {
  if (!properties) return {};
  const out: Record<string, NotePropertyValue> = {};
  for (const [rawKey, rawValue] of Object.entries(properties).slice(0, 64)) {
    const key = rawKey.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
    if (!key) continue;
    if (typeof rawValue === 'string') out[key] = rawValue.slice(0, 2_048);
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) out[key] = rawValue;
    else if (typeof rawValue === 'boolean' || rawValue === null) out[key] = rawValue;
  }
  return out;
}

export function normalizeNotePage(page: NotePage, now = Date.now()): NotePage {
  return {
    ...page,
    title: sanitizeNoteTitle(page.title, 'Untitled Note'),
    content: typeof page.content === 'string' ? page.content : '',
    tags: Array.from(new Set((page.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 64),
    backlinks: Array.from(new Set(page.backlinks ?? [])).slice(0, 512),
    aliases: Array.from(new Set((page.aliases ?? []).map((alias) => sanitizeNoteTitle(alias, '')).filter(Boolean))).slice(0, 32),
    workspaceLinks: (page.workspaceLinks ?? []).slice(-256).map((link) => ({
      ...link,
      id: String(link.id).slice(0, 180),
      relation: link.relation,
      targetDocumentId: String(link.targetDocumentId).slice(0, 180),
      targetKind: String(link.targetKind).slice(0, 64),
      targetObjectId: link.targetObjectId ? String(link.targetObjectId).slice(0, 180) : undefined,
      uri: String(link.uri).slice(0, 2048),
      createdAt: Number.isFinite(link.createdAt) ? link.createdAt : now,
    })),
    properties: sanitizeNoteProperties(page.properties),
    parentPageId: page.parentPageId ?? null,
    created_at: page.created_at ?? page.last_modified ?? now,
    last_modified: page.last_modified ?? now,
    trashedAt: page.trashedAt ?? null,
    revisions: (page.revisions ?? []).slice(-MAX_NOTE_REVISIONS),
    attachments: page.attachments ?? [],
    comments: (page.comments ?? []).slice(-2_000).map((comment) => ({
      ...comment,
      id: String(comment.id).slice(0, 160),
      authorId: sanitizeNoteTitle(String(comment.authorId ?? ''), 'local-author').slice(0, 160),
      authorName: sanitizeNoteTitle(String(comment.authorName ?? ''), 'Local author').slice(0, 128),
      body: String(comment.body ?? '').normalize('NFKC').replace(/\u0000/g, '').trim().slice(0, 16_384),
      mentions: Array.from(new Set((comment.mentions ?? []).map((mention) => sanitizeNoteTitle(String(mention), '')).filter(Boolean))).slice(0, 64),
      parentId: comment.parentId ? String(comment.parentId).slice(0, 160) : null,
      createdAt: Number.isFinite(comment.createdAt) ? comment.createdAt : now,
      updatedAt: Number.isFinite(comment.updatedAt) ? comment.updatedAt : now,
      resolvedAt: Number.isFinite(comment.resolvedAt) ? comment.resolvedAt : null,
    })).filter((comment) => comment.body),
    protection: normalizeNoteProtectionPolicy(page.protection),
    sensitiveMode: Boolean(page.sensitiveMode),
    lastAuthor: page.lastAuthor ? {
      authorId: sanitizeNoteTitle(String(page.lastAuthor.authorId ?? ''), 'local-author').slice(0, 160),
      displayName: sanitizeNoteTitle(String(page.lastAuthor.displayName ?? ''), 'Local author').slice(0, 128),
      updatedAt: Number.isFinite(page.lastAuthor.updatedAt) ? page.lastAuthor.updatedAt : now,
    } : undefined,
  };
}

export function normalizeNoteSection(section: NoteSection, now = Date.now()): NoteSection {
  return {
    ...section,
    title: sanitizeNoteTitle(section.title, 'Untitled Section'),
    pages: (section.pages ?? []).map((page) => normalizeNotePage(page, now)),
    groupId: section.groupId ?? null,
    properties: sanitizeNoteProperties(section.properties),
    createdAt: section.createdAt ?? now,
    updatedAt: section.updatedAt ?? now,
    trashedAt: section.trashedAt ?? null,
    protection: normalizeNoteProtectionPolicy(section.protection),
  };
}

function normalizeSectionGroups(groups: NoteSectionGroup[] | undefined, now: number): NoteSectionGroup[] {
  const raw = (groups ?? []).slice(0, 256).map((group) => ({
    ...group,
    title: sanitizeNoteTitle(group.title, 'Section Group'),
    parentGroupId: group.parentGroupId ?? null,
    createdAt: group.createdAt ?? now,
    updatedAt: group.updatedAt ?? now,
  }));
  const ids = new Set(raw.map((group) => group.id));
  return raw.map((group) => ({
    ...group,
    parentGroupId: group.parentGroupId && ids.has(group.parentGroupId) && group.parentGroupId !== group.id
      ? group.parentGroupId
      : null,
  }));
}

export function normalizeNoteNotebook(notebook: NoteNotebook, now = Date.now()): NoteNotebook {
  const sections = (notebook.sections ?? []).map((section) => normalizeNoteSection(section, now));
  const validPageIds = new Set(sections.flatMap((section) => section.pages.map((page) => page.id)));
  return {
    ...notebook,
    title: sanitizeNoteTitle(notebook.title, 'Untitled Notebook'),
    sections,
    sectionGroups: normalizeSectionGroups(notebook.sectionGroups, now),
    recentPageIds: (notebook.recentPageIds ?? []).filter((id) => validPageIds.has(id)).slice(0, MAX_NOTE_RECENTS),
    navigationHistory: (notebook.navigationHistory ?? []).filter((entry) => validPageIds.has(entry.pageId)).slice(-MAX_NOTE_NAVIGATION_HISTORY),
    properties: sanitizeNoteProperties(notebook.properties),
    templates: (notebook.templates ?? []).slice(0, 128),
    authorAttributionEnabled: Boolean(notebook.authorAttributionEnabled),
    protection: normalizeNoteProtectionPolicy(notebook.protection),
    savedSearches: (notebook.savedSearches ?? []).slice(-128).map((search) => ({
      id: String(search.id).slice(0, 160),
      name: String(search.name).normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 96) || 'Saved search',
      query: String(search.query ?? '').normalize('NFKC').slice(0, 1024),
      scope: ['page', 'section', 'notebook', 'all'].includes(search.scope) ? search.scope : 'section',
      tag: search.tag ? String(search.tag).normalize('NFKC').trim().slice(0, 96) : null,
      dateFrom: typeof search.dateFrom === 'number' && Number.isFinite(search.dateFrom) ? search.dateFrom : null,
      dateTo: typeof search.dateTo === 'number' && Number.isFinite(search.dateTo) ? search.dateTo : null,
      includeArchived: Boolean(search.includeArchived),
      favoritesOnly: Boolean(search.favoritesOnly),
      createdAt: typeof search.createdAt === 'number' && Number.isFinite(search.createdAt) ? search.createdAt : now,
      updatedAt: typeof search.updatedAt === 'number' && Number.isFinite(search.updatedAt) ? search.updatedAt : now,
    })),
    createdAt: notebook.createdAt ?? now,
    updatedAt: notebook.updatedAt ?? now,
    trashedAt: notebook.trashedAt ?? null,
  };
}

export function findPageInNotebook(notebook: NoteNotebook, pageId: string): { section: NoteSection; page: NotePage } | null {
  for (const section of notebook.sections) {
    const page = section.pages.find((candidate) => candidate.id === pageId);
    if (page) return { section, page };
  }
  return null;
}

export function getPageDepth(section: NoteSection, pageId: string): number {
  const byId = new Map(section.pages.map((page) => [page.id, page]));
  let current = byId.get(pageId);
  let depth = 0;
  const visited = new Set<string>();
  while (current?.parentPageId) {
    if (visited.has(current.id)) return MAX_NOTE_SUBPAGE_DEPTH + 1;
    visited.add(current.id);
    current = byId.get(current.parentPageId);
    depth += 1;
    if (depth > MAX_NOTE_SUBPAGE_DEPTH) return depth;
  }
  return depth;
}

export function canSetPageParent(section: NoteSection, pageId: string, parentPageId: string | null): boolean {
  return noteParentRejectionReason(section, pageId, parentPageId) === null;
}

export type NoteParentRejectionReason = 'missing' | 'self' | 'cycle' | 'depth';

/**
 * AST-0654: names the concrete reason a hierarchy change is rejected so the UI can show a message
 * instead of silently keeping the old parent. `null` means the change is allowed.
 */
export function noteParentRejectionReason(
  section: NoteSection,
  pageId: string,
  parentPageId: string | null
): NoteParentRejectionReason | null {
  if (parentPageId === null) return null;
  if (pageId === parentPageId) return 'self';
  const byId = new Map(section.pages.map((page) => [page.id, page]));
  const child = byId.get(pageId);
  const parent = byId.get(parentPageId);
  if (!child || !parent) return 'missing';
  let cursor: NotePage | undefined = parent;
  let depth = 1;
  const visited = new Set<string>();
  while (cursor?.parentPageId) {
    if (cursor.parentPageId === pageId || visited.has(cursor.id)) return 'cycle';
    visited.add(cursor.id);
    cursor = byId.get(cursor.parentPageId);
    depth += 1;
    if (depth > MAX_NOTE_SUBPAGE_DEPTH) return 'depth';
  }
  return depth <= MAX_NOTE_SUBPAGE_DEPTH ? null : 'depth';
}

export function setPageParent(section: NoteSection, pageId: string, parentPageId: string | null): NoteSection {
  if (!canSetPageParent(section, pageId, parentPageId)) return section;
  return {
    ...section,
    updatedAt: Date.now(),
    pages: section.pages.map((page) => page.id === pageId ? { ...page, parentPageId } : page),
  };
}

export interface NoteParentRejection {
  pageId: string;
  parentPageId: string | null;
  reason: NoteParentRejectionReason;
  message: string;
}

const NOTE_PARENT_REJECTION_MESSAGES: Readonly<Record<NoteParentRejectionReason, string>> = Object.freeze({
  missing: 'That page is no longer part of this section.',
  self: 'A page cannot be its own parent.',
  cycle: 'That move would create a circular page hierarchy, so it was rejected.',
  depth: `That move would exceed the maximum of ${MAX_NOTE_SUBPAGE_DEPTH} subpage levels, so it was rejected.`,
});

/**
 * AST-0654: every rejected hierarchy change is visible and fail-closed.
 * Returns `null` when the change is allowed, otherwise the concrete rejection including its reason.
 */
export function describeNoteParentRejection(
  section: NoteSection,
  pageId: string,
  parentPageId: string | null,
): NoteParentRejection | null {
  const reason = noteParentRejectionReason(section, pageId, parentPageId);
  if (!reason) return null;
  return { pageId, parentPageId, reason, message: NOTE_PARENT_REJECTION_MESSAGES[reason] };
}

export function canSetSectionGroupParent(
  groups: NoteSectionGroup[],
  groupId: string,
  parentGroupId: string | null
): boolean {
  if (parentGroupId === null) return true;
  if (groupId === parentGroupId) return false;
  const byId = new Map(groups.map((group) => [group.id, group]));
  if (!byId.has(groupId) || !byId.has(parentGroupId)) return false;
  let cursor = byId.get(parentGroupId);
  let depth = 1;
  const visited = new Set<string>();
  while (cursor?.parentGroupId) {
    if (cursor.parentGroupId === groupId || visited.has(cursor.id)) return false;
    visited.add(cursor.id);
    cursor = byId.get(cursor.parentGroupId);
    depth += 1;
    if (depth > MAX_NOTE_SECTION_GROUP_DEPTH) return false;
  }
  return depth <= MAX_NOTE_SECTION_GROUP_DEPTH;
}

export function recordPageVisit(notebook: NoteNotebook, pageId: string, now = Date.now()): NoteNotebook {
  const exists = notebook.sections.some((section) => section.pages.some((page) => page.id === pageId));
  if (!exists) return notebook;
  const recentPageIds = [pageId, ...(notebook.recentPageIds ?? []).filter((id) => id !== pageId)].slice(0, MAX_NOTE_RECENTS);
  const navigationHistory = [...(notebook.navigationHistory ?? []), { pageId, visitedAt: now }].slice(-MAX_NOTE_NAVIGATION_HISTORY);
  return {
    ...notebook,
    recentPageIds,
    navigationHistory,
    updatedAt: now,
    sections: notebook.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => page.id === pageId ? { ...page, lastOpenedAt: now } : page),
    })),
  };
}

export function createPageRevision(page: NotePage, now = Date.now()): NotePageRevision {
  return {
    id: createNoteEntityId('rev'),
    timestamp: now,
    title: page.title,
    content: page.content,
    tags: [...page.tags],
    properties: { ...sanitizeNoteProperties(page.properties) },
    // DEF-NOTES-004: the revision must carry the mode and the canvas, otherwise restoring a freeform
    // revision silently produced an empty document page.
    ...(page.editorMode ? { editorMode: page.editorMode } : {}),
    ...(page.canvas ? { canvas: page.canvas } : {}),
  };
}

export function appendPageRevision(previous: NotePage, next: NotePage, now = Date.now()): NotePage {
  const changed = previous.title !== next.title
    || previous.content !== next.content
    || JSON.stringify(previous.tags) !== JSON.stringify(next.tags)
    || JSON.stringify(previous.properties ?? {}) !== JSON.stringify(next.properties ?? {});
  if (!changed) return next;
  const revisions = previous.revisions ?? [];
  const snapshot = createPageRevision(next, now);
  const last = revisions[revisions.length - 1];
  const bounded = last && now - last.timestamp < NOTE_REVISION_COALESCE_MS
    ? [...revisions.slice(0, -1), snapshot]
    : [...revisions, snapshot];
  return { ...next, revisions: bounded.slice(-MAX_NOTE_REVISIONS) };
}

export function softDeletePage(section: NoteSection, pageId: string, now = Date.now()): NoteSection {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of section.pages) {
      if (page.parentPageId === pageId || (page.parentPageId && descendants.has(page.parentPageId))) {
        if (!descendants.has(page.id)) {
          descendants.add(page.id);
          changed = true;
        }
      }
    }
  }
  return {
    ...section,
    updatedAt: now,
    pages: section.pages.map((page) => page.id === pageId || descendants.has(page.id)
      ? { ...page, trashedAt: now }
      : page),
  };
}

export function restorePage(section: NoteSection, pageId: string): NoteSection {
  return {
    ...section,
    updatedAt: Date.now(),
    pages: section.pages.map((page) => page.id === pageId ? { ...page, trashedAt: null } : page),
  };
}
