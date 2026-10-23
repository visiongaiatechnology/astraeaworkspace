// STATUS: DIAMANT VGT SUPREME — Pure Grid SyncGraph operation derivation and metadata-preserving remote application.
import type { GridCell, GridSheetModel, TableObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { appendGridConflict, appendGridHistory, buildGridHistoryEntries, mergeGridConcurrentCellChange } from './gridReviewCollaboration';
import type { GridSyncNode, GridSyncOperation } from './gridCollaborationTypes';

const MAX_LOCAL_OPS_PER_UPDATE = 10_000;

function tableObjects(document: WorkspaceDocument): Map<string, TableObject> {
  const out = new Map<string, TableObject>();
  for (const [objectId, object] of Object.entries(document.objects)) {
    if (object?.type === 'Table') out.set(objectId, object.data as TableObject);
  }
  return out;
}

export function gridSyncTableIdentityStable(before: WorkspaceDocument, after: WorkspaceDocument): boolean {
  const left = [...tableObjects(before).keys()].sort();
  const right = [...tableObjects(after).keys()].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function deriveGridSyncOperations(before: WorkspaceDocument, after: WorkspaceDocument): GridSyncOperation[] {
  const operations: GridSyncOperation[] = [];
  const beforeTables = tableObjects(before);
  const afterTables = tableObjects(after);
  for (const [tableId, afterTable] of afterTables) {
    const beforeTable = beforeTables.get(tableId);
    if (!beforeTable) continue;
    const coords = new Set([...Object.keys(beforeTable.cells ?? {}), ...Object.keys(afterTable.cells ?? {})]);
    for (const coord of [...coords].sort()) {
      const oldCell = beforeTable.cells?.[coord] as GridCell | undefined;
      const newCell = afterTable.cells?.[coord] as GridCell | undefined;
      const oldValue = oldCell?.value ?? '';
      const newValue = newCell?.value ?? '';
      const oldFormula = oldCell?.formula ?? null;
      const newFormula = newCell?.formula ?? null;
      if (oldValue === newValue && oldFormula === newFormula) continue;
      operations.push({ SetCell: { table_id: tableId, coord, old_value: oldValue, new_value: newValue, old_formula: oldFormula, new_formula: newFormula } });
      if (operations.length > MAX_LOCAL_OPS_PER_UPDATE) throw new Error('grid_collaboration_operation_limit');
    }
  }
  return operations;
}

export function applyGridRemoteSyncNode(document: WorkspaceDocument, node: GridSyncNode): WorkspaceDocument {
  const op = node.operation.SetCell;
  const object = document.objects[op.table_id];
  if (!object || object.type !== 'Table') return document;
  const table = object.data as TableObject;
  const current = (table.cells?.[op.coord] as GridCell | undefined) ?? { value: '' };
  const merged = mergeGridConcurrentCellChange({
    coord: op.coord,
    baseValue: op.old_value,
    localValue: current.value,
    remoteValue: op.new_value,
    localTimestamp: document.modified_at ?? 0,
    remoteTimestamp: node.timestamp_utc,
  });
  const nextCell: GridCell = {
    ...current,
    value: merged.value ?? '',
    ...(op.new_formula ? { formula: op.new_formula } : { formula: undefined }),
  };
  const nextCells = { ...(table.cells ?? {}), [op.coord]: nextCell };
  const sheet = document.gridData?.sheets.find((candidate) => candidate.tableObjectId === op.table_id);
  let sheets = document.gridData?.sheets;
  if (sheet && sheets) {
    const additions = buildGridHistoryEntries(table.cells ?? {}, nextCells, [op.coord], `remote:${node.actor_id}`, node.timestamp_utc);
    sheets = sheets.map((candidate): GridSheetModel => candidate.id === sheet.id ? {
      ...candidate,
      history: appendGridHistory(candidate.history ?? [], additions),
      ...(merged.conflict ? { conflicts: appendGridConflict(candidate.conflicts ?? [], merged.conflict) } : {}),
    } : candidate);
  }
  return {
    ...document,
    version: document.version + 1,
    modified_at: Date.now(),
    objects: { ...document.objects, [op.table_id]: { type: 'Table', data: { ...table, cells: nextCells } } },
    ...(document.gridData && sheets ? { gridData: { ...document.gridData, sheets } } : {}),
  };
}
