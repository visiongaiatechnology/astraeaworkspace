// STATUS: DIAMANT VGT SUPREME — bounded universal Workspace Search scope/deep-link core.
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import { securityPolicyForDocument } from '../security/securityProfiles';
import { assertStableWorkspaceId } from '../workspace/model/workspaceObjectModel';
import type { SearchContentGroup, SearchDocumentMetadata, SearchHubHit } from './searchTypes';

const MAX_METADATA_VALUES = 256;
const MAX_TEXT_BYTES_ESTIMATE = 64 * 1024 * 1024;
const SEARCHABLE_MODULES = new Set<DocumentKind>([
  'Writer','Grid','Present','Notes','PdfStudio','Draw','Whiteboard',
  'Tasks','Vault','Connect','Insight','Publish','Automate','AdminPolicy',
]);
const EXT_BY_KIND: Partial<Record<DocumentKind,string>> = {
  Writer:'vdoc',Grid:'vgrid',Present:'vpresent',Notes:'vnote',PdfStudio:'vpdf',Draw:'vdraw',Whiteboard:'vboard',Publish:'vpub',Insight:'vinsight',Tasks:'vtask',Vault:'vvault',Connect:'vconn',Automate:'vauto',AdminPolicy:'vadmin',
};

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null; }
function strings(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((v):v is string=>typeof v==='string').map(v=>v.trim()).filter(Boolean))].slice(0,MAX_METADATA_VALUES) : []; }
function bool(value: unknown): boolean { return value === true; }
function safeString(value: unknown, max=256): string | undefined { return typeof value === 'string' && value.trim() ? value.trim().slice(0,max) : undefined; }

export function isSearchableWorkspaceModule(kind: DocumentKind): boolean { return SEARCHABLE_MODULES.has(kind); }

export function estimateDocumentSearchBytes(document: WorkspaceDocument): number {
  let bytes = Math.min(MAX_TEXT_BYTES_ESTIMATE, document.title.length * 2 + 256);
  for (const object of Object.values(document.objects).slice(0,100_000)) {
    try { bytes = Math.min(MAX_TEXT_BYTES_ESTIMATE, bytes + JSON.stringify(object).length * 2); } catch { bytes += 256; }
    if (bytes >= MAX_TEXT_BYTES_ESTIMATE) break;
  }
  return bytes;
}

export function searchDocumentMetadata(document: WorkspaceDocument): SearchDocumentMetadata {
  const ext = document as WorkspaceDocument & Record<string,unknown>;
  const policy = securityPolicyForDocument(document);
  const permissions = record(document.permissions);
  const owner = safeString(permissions?.ownerId ?? ext.ownerId);
  const permissionMembers = permissions && Array.isArray(permissions.grants) ? (permissions.grants as Array<Record<string,unknown>>).map(grant=>grant.principalId) : [];
  const members = strings(ext.members ?? ext.memberIds ?? permissionMembers);
  const spaces = strings(ext.spaceIds ?? ext.spaces ?? ext.spaceRefs);
  const tags = strings(ext.tags ?? ext.labels);
  const statuses = strings(ext.statuses ?? (safeString(ext.status) ? [String(ext.status)] : []));
  const projects = strings(ext.projectIds ?? ext.projects ?? (safeString(ext.projectId) ? [String(ext.projectId)] : []));
  return {
    documentId: document.id,
    canonicalId: `vgt://workspace/document/${encodeURIComponent(document.id)}`,
    kind: document.kind,
    extension: EXT_BY_KIND[document.kind] ?? 'vwc',
    title: document.title.slice(0,4096),
    createdAt: Number.isFinite(document.created_at) ? document.created_at : 0,
    modifiedAt: Number.isFinite(document.modified_at) ? document.modified_at : 0,
    sizeBytes: estimateDocumentSearchBytes(document),
    owner,
    members,
    tags,
    spaces,
    statuses,
    projects,
    sensitivity: policy.profile,
    favorite: bool(ext.favorite),
    pinned: bool(ext.pinned),
  };
}

export function buildSearchDeepLink(document: WorkspaceDocument, objectId?: string): string {
  assertStableWorkspaceId(document.id, 'Search document id');
  if (objectId && Object.prototype.hasOwnProperty.call(document.objects, objectId)) {
    assertStableWorkspaceId(objectId, 'Search object id');
    return `vgt://workspace/document/${document.id}/object/${objectId}`;
  }
  return `vgt://workspace/document/${document.id}`;
}

export function groupForSearchHit(kind: DocumentKind, objectType: string): SearchContentGroup {
  if (kind === 'Connect') return 'messages';
  if (kind === 'Tasks') return 'work';
  if (kind === 'Grid' || kind === 'Insight') return 'data';
  if (/person|contact|member|owner/i.test(objectType)) return 'people';
  return 'documents';
}

export function normalizeSearchHits(hits: readonly Omit<SearchHubHit,'deepLink'|'group'|'modifiedAt'|'finalScore'|'why'>[], documents: Record<string,WorkspaceDocument>): SearchHubHit[] {
  const seen = new Set<string>();
  const out: SearchHubHit[] = [];
  for (const hit of hits.slice(0,1000)) {
    const document = documents[hit.documentId];
    if (!document || !isSearchableWorkspaceModule(document.kind)) continue;
    const objectId = Object.prototype.hasOwnProperty.call(document.objects, hit.objectId) ? hit.objectId : document.root_object_ids.find(id=>Object.prototype.hasOwnProperty.call(document.objects,id)) ?? '';
    const canonicalKey = `${document.id}\u0000${objectId}\u0000${hit.field}`;
    if (seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);
    out.push({
      ...hit,
      objectId,
      deepLink: buildSearchDeepLink(document, objectId || undefined),
      group: groupForSearchHit(document.kind, hit.objectType),
      modifiedAt: document.modified_at,
      finalScore: hit.lexicalScore,
      why: [],
    });
  }
  return out;
}
