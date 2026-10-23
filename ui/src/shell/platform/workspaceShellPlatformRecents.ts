import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';

import { securityPolicyForDocument, securityProfileLabel } from '../../platform/security/securityProfiles';

import { MAX_RECENTS, RECENTS_KEY, safeParse, safeStorageGet, safeStorageSet, validDocumentId, validDocumentKind, type ShellStorageLike } from './workspaceShellPlatformStorage';

export interface ShellRecentEntry {
  documentId: string;
  kind: DocumentKind;
  lastOpenedAt: number;
}

export interface ShellRecentProjection extends ShellRecentEntry {
  label: string;
  metadataProtected: boolean;
  availability: 'open' | 'stored' | 'missing';
  canOpen: boolean;
  previewDataUrl: string;
  approximateSizeBytes: number | null;
  locationLabel: string;
  protectionClass: string;
  modifiedAt: number;
  modifiedLabel: string;
}

export function loadShellRecents(storage: ShellStorageLike | null): ShellRecentEntry[] {
  if (!storage) return [];
  const raw = safeParse(safeStorageGet(storage, RECENTS_KEY));
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ShellRecentEntry[] = [];
  for (const candidate of raw.slice(0, MAX_RECENTS * 2)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const value = candidate as Partial<ShellRecentEntry>;
    if (!validDocumentId(value.documentId) || !validDocumentKind(value.kind)) continue;
    if (!Number.isSafeInteger(value.lastOpenedAt) || (value.lastOpenedAt ?? 0) <= 0) continue;
    if (seen.has(value.documentId)) continue;
    seen.add(value.documentId);
    out.push({ documentId: value.documentId, kind: value.kind, lastOpenedAt: value.lastOpenedAt as number });
    if (out.length >= MAX_RECENTS) break;
  }
  return out.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export function recordShellRecent(
  storage: ShellStorageLike | null,
  document: Pick<WorkspaceDocument, 'id' | 'kind'>,
  now = Date.now(),
): ShellRecentEntry[] {
  if (!validDocumentId(document.id) || !validDocumentKind(document.kind) || !Number.isSafeInteger(now) || now <= 0) {
    throw new Error('Shell recent entry is invalid');
  }
  const next = [
    { documentId: document.id, kind: document.kind, lastOpenedAt: now },
    ...loadShellRecents(storage).filter((entry) => entry.documentId !== document.id),
  ].slice(0, MAX_RECENTS);
  safeStorageSet(storage, RECENTS_KEY, JSON.stringify(next));
  return next;
}

function recentRelativeTime(timestamp: number, now: number): string {
  const delta = Math.max(0, now - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Minute${minutes === 1 ? '' : 'n'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Stunde${hours === 1 ? '' : 'n'}`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}
function recentPreviewDataUrl(kind: DocumentKind, label: string): string {
  const safeKind = kind.replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  const safeLabel = label.replace(/[<>&"']/g, '').slice(0, 28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96" viewBox="0 0 160 96"><rect width="160" height="96" rx="10" fill="#0c0817"/><rect x="10" y="10" width="140" height="76" rx="7" fill="#120c22" stroke="#6d5bd0" stroke-opacity=".45"/><text x="18" y="34" fill="#c4b5fd" font-family="system-ui,sans-serif" font-size="11" font-weight="700">${safeKind}</text><text x="18" y="56" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="10">${safeLabel}</text><path d="M18 70h78" stroke="#64748b" stroke-opacity=".55"/><path d="M18 77h112" stroke="#475569" stroke-opacity=".45"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function projectShellRecents(
  entries: readonly ShellRecentEntry[],
  documents: Readonly<Record<string, WorkspaceDocument>>,
  metadataLocked: boolean,
  storedDocumentIds: ReadonlySet<string> = new Set(Object.keys(documents)),
  now = Date.now(),
): ShellRecentProjection[] {
  return entries.slice(0, MAX_RECENTS).sort((a,b)=>b.lastOpenedAt-a.lastOpenedAt).map((entry) => {
    const live = documents[entry.documentId];
    const canReveal = !metadataLocked && Boolean(live?.title);
    const availability = live ? 'open' : storedDocumentIds.has(entry.documentId) ? 'stored' : 'missing';
    const label = canReveal ? live!.title.slice(0, 240) : `Protected ${entry.kind} document`;
    const modifiedAt = live?.modified_at && Number.isSafeInteger(live.modified_at) ? live.modified_at : entry.lastOpenedAt;
    let approximateSizeBytes: number | null = null;
    if (live && canReveal) { try { approximateSizeBytes = new TextEncoder().encode(JSON.stringify(live)).byteLength; } catch { approximateSizeBytes = null; } }
    const protectionClass = live ? securityProfileLabel(securityPolicyForDocument(live).profile) : 'Protected';
    return {
      ...entry, label, metadataProtected: !canReveal, availability, canOpen: availability !== 'missing',
      previewDataUrl: recentPreviewDataUrl(entry.kind, label), approximateSizeBytes,
      locationLabel: 'Local Workspace Vault', protectionClass: metadataLocked ? 'Protected' : protectionClass,
      modifiedAt, modifiedLabel: recentRelativeTime(modifiedAt, now),
    };
  });
}
