// STATUS: DIAMANT VGT SUPREME — export isolation and external clipboard projection
import type { WorkspaceDocument } from '../contracts/workspace';
import type {
  FabricExportDecision,
  FabricExportPolicy,
  FabricExternalClipboardPayload,
  FabricResolutionPolicy,
} from './fabricTypes';
import { WorkspaceFabricError } from './fabricTypes';
import { clone, referenceObject, resolveFabricReference } from './fabricState';
import { freezeFabricReference } from './fabricReferenceOperations';

const MAX_EXTERNAL_CLIPBOARD_TEXT = 1_048_576;

function escapeExternalHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** External clipboard deliberately excludes Workspace IDs, permissions, snapshots and secret metadata. */
export function buildExternalClipboardPayload(text: string): FabricExternalClipboardPayload {
  const normalized = text.replaceAll('\u0000', '').slice(0, MAX_EXTERNAL_CLIPBOARD_TEXT);
  return {
    representations: [
      { mime: 'text/plain', text: normalized },
      { mime: 'text/html', text: `<p>${escapeExternalHtml(normalized)}</p>` },
    ],
  };
}

export function planFabricExport(policy: FabricExportPolicy, destinationIsWorkspaceNative: boolean): FabricExportDecision {
  if (policy === 'RefreshThenFreeze') return { policy, requiresRefresh: true, requiresSnapshot: true, mayPreserveLiveLink: false };
  if (policy === 'FreezeCurrent') return { policy, requiresRefresh: false, requiresSnapshot: true, mayPreserveLiveLink: false };
  if (!destinationIsWorkspaceNative) throw new WorkspaceFabricError('Live links may only be preserved in native Workspace exports');
  return { policy, requiresRefresh: false, requiresSnapshot: false, mayPreserveLiveLink: true };
}

/** Applies an export-only link policy to a cloned document map. The authoritative editor map is untouched. */
export function applyFabricExportPolicy(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  policy: FabricExportPolicy,
  options: { now?: number; resolutionPolicy?: FabricResolutionPolicy; destinationIsWorkspaceNative?: boolean } = {},
): Record<string, WorkspaceDocument> {
  const decision = planFabricExport(policy, options.destinationIsWorkspaceNative === true);
  if (decision.mayPreserveLiveLink) return clone(documents);
  let working = clone(documents);
  const target = working[targetDocId];
  if (!target) throw new WorkspaceFabricError('Fabric export target document is unavailable');
  const refs = Object.entries(target.objects).filter(([, object]) => object.type === 'WorkspaceReference').map(([id]) => id).sort();
  for (const referenceId of refs) {
    const reference = referenceObject(working[targetDocId], referenceId);
    if (reference.mode === 'Frozen') continue;
    const resolution = resolveFabricReference(working, targetDocId, referenceId, options.resolutionPolicy);
    if (policy === 'FreezeCurrent' && resolution.link.status === 'changed') throw new WorkspaceFabricError('Fabric link changed; choose RefreshThenFreeze or refresh explicitly before export');
    const frozen = freezeFabricReference(working, targetDocId, referenceId, { now: options.now, policy: options.resolutionPolicy });
    working = frozen.updatedDocs;
  }
  return working;
}
