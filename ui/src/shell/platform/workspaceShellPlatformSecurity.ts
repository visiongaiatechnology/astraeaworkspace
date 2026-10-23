import type { WorkspaceDocument, DocumentKind } from '../../shared/contracts/workspace';

import { securityPolicyForDocument } from '../../platform/security/securityProfiles';

import { assertWorkspaceShellDropAllowed } from '../../platform/security/security';

export interface ShellSearchResult {
  documentId: string;
  kind: DocumentKind;
  label: string;
  metadataProtected: boolean;
}

export function searchShellDocuments(
  query: string,
  documents: Readonly<Record<string, WorkspaceDocument>>,
  metadataLocked: boolean,
  limit = 24,
): ShellSearchResult[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const results: ShellSearchResult[] = [];
  for (const document of Object.values(documents)) {
    // Generic shell search never indexes or exposes Top-Secret titles, kinds, IDs or cacheable snippets.
    if (securityPolicyForDocument(document).profile === 'VGT_TOP_SECRET') continue;
    const searchable = metadataLocked ? document.kind.toLocaleLowerCase() : `${document.title} ${document.kind}`.toLocaleLowerCase();
    if (!searchable.includes(q)) continue;
    results.push({
      documentId: document.id,
      kind: document.kind,
      label: metadataLocked ? `Protected ${document.kind} document` : document.title.slice(0, 240),
      metadataProtected: metadataLocked,
    });
    if (results.length >= Math.max(1, Math.min(100, limit))) break;
  }
  return results;
}

export function acceptShellDroppedFiles(files: readonly Pick<File, 'name' | 'size' | 'type'>[]): number {
  if (files.length !== 1) throw new Error('Drop exactly one file onto the Workspace shell');
  assertWorkspaceShellDropAllowed(files[0]);
  return 0;
}
