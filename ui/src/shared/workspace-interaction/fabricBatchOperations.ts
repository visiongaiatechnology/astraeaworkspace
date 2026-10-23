// STATUS: DIAMANT VGT SUPREME — bounded and deterministic Fabric update batches
import type { WorkspaceDocument, WorkspaceObject } from '../contracts/workspace';
import type { FabricNotification, FabricResolutionPolicy } from './fabricTypes';
import { WorkspaceFabricError } from './fabricTypes';
import { assertNoFabricCycles } from './fabricState';
import { propagateFabricUpdates } from './fabricReferenceOperations';

const MAX_FABRIC_BATCH_CHANGES = 16_384;

export interface FabricSourceChange {
  sourceDocId: string;
  sourceObjId: string;
  sourceVersion: number;
  object: WorkspaceObject;
}

/** Coalesces repeated source changes so one render tick cannot create an update cascade. */
export function coalesceFabricChanges(changes: readonly FabricSourceChange[]): FabricSourceChange[] {
  if (changes.length > MAX_FABRIC_BATCH_CHANGES) throw new WorkspaceFabricError('Workspace Fabric update batch exceeds limit');
  const latest = new Map<string, FabricSourceChange>();
  for (const change of changes) {
    if (!Number.isInteger(change.sourceVersion) || change.sourceVersion < 1 || change.object.data.id !== change.sourceObjId) throw new WorkspaceFabricError('Workspace Fabric source change is invalid');
    const key = `${change.sourceDocId}\u0000${change.sourceObjId}`;
    const previous = latest.get(key);
    if (!previous || previous.sourceVersion < change.sourceVersion) latest.set(key, change);
  }
  return [...latest.values()].sort((a, b) => `${a.sourceDocId}/${a.sourceObjId}`.localeCompare(`${b.sourceDocId}/${b.sourceObjId}`));
}

export function propagateFabricBatch(
  changes: readonly FabricSourceChange[],
  documents: Record<string, WorkspaceDocument>,
  options: { now?: number; policy?: FabricResolutionPolicy } = {},
): { updatedDocs: Record<string, WorkspaceDocument>; count: number; notifications: FabricNotification[] } {
  let working = documents;
  const notifications: FabricNotification[] = [];
  let count = 0;
  for (const change of coalesceFabricChanges(changes)) {
    const source = working[change.sourceDocId];
    if (!source || source.version !== change.sourceVersion) continue;
    const result = propagateFabricUpdates(change.sourceDocId, change.sourceObjId, change.object, working, options);
    working = result.updatedDocs;
    count += result.count;
    notifications.push(...result.notifications);
  }
  assertNoFabricCycles(working);
  return { updatedDocs: working, count, notifications };
}
