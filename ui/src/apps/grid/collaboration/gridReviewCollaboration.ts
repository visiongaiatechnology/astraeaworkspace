// STATUS: DIAMANT VGT SUPREME
// Grid review/collaboration primitives: threaded comments, history, protection and explicit conflict records.

import type {
  GridCell,
  GridCellComment,
  GridCellConflictRecord,
  GridCellHistoryEntry,
  GridRangePermissionRule,
  GridWorkbookProtectionSettings,
} from '../../../shared/contracts/grid/workspaceGrid';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { validateCellEditPermission } from '../integrations/gridWorkspaceIntegration';

const MAX_COMMENT_TEXT = 16_384;
const MAX_COMMENTS = 4_096;
const MAX_HISTORY = 10_000;
const MAX_CONFLICTS = 1_024;
const MENTION_RE = /(^|\s)@([A-Za-z0-9_.-]{1,64})\b/g;

export function extractGridMentions(text: string): string[] {
  const mentions = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) mentions.add(match[2]);
  return [...mentions].slice(0, 64);
}

export function createGridComment(params: {
  coord: string;
  author: string;
  text: string;
  parentId?: string;
  kind?: 'comment' | 'note';
  timestamp?: number;
}): GridCellComment {
  const coord = params.coord.trim().toUpperCase();
  const author = params.author.trim().slice(0, 128);
  const text = params.text.trim().slice(0, MAX_COMMENT_TEXT);
  if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(coord)) throw new Error('grid_comment_invalid_coordinate');
  if (!author || !text) throw new Error('grid_comment_required_fields');
  return {
    id: createGridSecureId('grid-comment'),
    coord,
    author,
    text,
    timestamp: params.timestamp ?? Date.now(),
    resolved: false,
    ...(params.parentId ? { parentId: params.parentId } : {}),
    mentions: extractGridMentions(text),
    kind: params.kind ?? 'comment',
  };
}

export function appendGridComment(comments: readonly GridCellComment[], comment: GridCellComment): GridCellComment[] {
  if (comment.parentId && !comments.some((candidate) => candidate.id === comment.parentId && !candidate.parentId)) {
    throw new Error('grid_comment_parent_missing');
  }
  return [...comments, comment].slice(-MAX_COMMENTS);
}

export function resolveGridCommentThread(comments: readonly GridCellComment[], rootId: string, resolved: boolean): GridCellComment[] {
  const root = comments.find((comment) => comment.id === rootId);
  if (!root) return [...comments];
  const threadRootId = root.parentId ?? root.id;
  return comments.map((comment) => (comment.id === threadRootId || comment.parentId === threadRootId ? { ...comment, resolved } : comment));
}

export function buildGridHistoryEntries(
  before: Record<string, GridCell>,
  after: Record<string, GridCell>,
  coords: readonly string[],
  author: string,
  timestamp = Date.now(),
): GridCellHistoryEntry[] {
  return coords.flatMap((rawCoord) => {
    const coord = rawCoord.toUpperCase();
    const oldValue = before[coord]?.value;
    const newValue = after[coord]?.value;
    const oldFormula = before[coord]?.formula ?? null;
    const newFormula = after[coord]?.formula ?? null;
    if (oldValue === newValue && oldFormula === newFormula) return [];
    return [{ id: createGridSecureId('grid-history'), coord, oldValue, newValue, author: author.slice(0, 128), timestamp }];
  });
}

export function appendGridHistory(current: readonly GridCellHistoryEntry[], additions: readonly GridCellHistoryEntry[]): GridCellHistoryEntry[] {
  return [...current, ...additions].slice(-MAX_HISTORY);
}

export function validateGridEditAccess(params: {
  coord: string;
  userId: string;
  userRoles: string[];
  cell?: GridCell;
  sheetProtection?: Parameters<typeof validateCellEditPermission>[3];
  rangeRules?: GridRangePermissionRule[];
}): { allowed: boolean; reason?: string } {
  return validateCellEditPermission(
    params.coord,
    params.userId,
    params.userRoles,
    params.sheetProtection,
    params.cell,
    params.rangeRules ?? [],
  );
}

export function validateWorkbookStructureMutation(protection?: GridWorkbookProtectionSettings): void {
  if (protection?.isProtected && protection.allowStructureChanges !== true) throw new Error('grid_workbook_structure_protected');
}

export function mergeGridConcurrentCellChange(params: {
  coord: string;
  baseValue?: GridCell['value'];
  localValue?: GridCell['value'];
  remoteValue?: GridCell['value'];
  localTimestamp: number;
  remoteTimestamp: number;
}): { value: GridCell['value'] | undefined; conflict?: GridCellConflictRecord } {
  const { baseValue, localValue, remoteValue } = params;
  if (remoteValue === baseValue) return { value: localValue };
  if (localValue === baseValue) return { value: remoteValue };
  if (localValue === remoteValue) return { value: localValue };
  const remoteWins = params.remoteTimestamp >= params.localTimestamp;
  const value = remoteWins ? remoteValue : localValue;
  return {
    value,
    conflict: {
      id: createGridSecureId('grid-conflict'),
      coord: params.coord.toUpperCase(),
      baseValue,
      localValue,
      remoteValue,
      resolvedValue: value,
      localTimestamp: params.localTimestamp,
      remoteTimestamp: params.remoteTimestamp,
      resolutionStrategy: 'lww',
      resolved: false,
    },
  };
}

export function appendGridConflict(current: readonly GridCellConflictRecord[], conflict: GridCellConflictRecord): GridCellConflictRecord[] {
  return [...current, conflict].slice(-MAX_CONFLICTS);
}

export function resolveGridConflict(
  conflicts: readonly GridCellConflictRecord[],
  conflictId: string,
  strategy: 'local' | 'remote' | 'manual',
  manualValue?: GridCell['value'],
): GridCellConflictRecord[] {
  return conflicts.map((conflict) => {
    if (conflict.id !== conflictId) return conflict;
    const resolvedValue = strategy === 'local' ? conflict.localValue : strategy === 'remote' ? conflict.remoteValue : manualValue;
    return { ...conflict, resolved: true, resolutionStrategy: strategy, resolvedValue };
  });
}
