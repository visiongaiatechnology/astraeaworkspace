// STATUS: DIAMANT VGT SUPREME — Canonical Workspace Operations / Undo / Version Engine
// Every editable WorkspaceDocument transition is normalized into conflict-aware reversible deltas.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { validateWorkspaceDocumentInvariants } from '../model/workspaceObjectModel';
import { cloneValue as clone, deepEqual, diffDocumentValues as diffValue, invertOperation, sameOperationValue, setValueAt, transactionBytes, validatePath, valueAt } from './workspaceOperationPatch';
import type { CommitResult, CompactedHistoryAnchor, DocumentHistoryState, GroupCommitResult, HistoryBoundary, HistoryBoundaryReason, NamedWorkspaceVersion, OperationAutosaveSnapshot, OperationEngineOptions, WorkspaceDeltaOperation, WorkspaceOperationGroup, WorkspaceOperationTransaction } from './workspaceOperationTypes';
import { WorkspaceOperationError } from './workspaceOperationTypes';
export * from './workspaceOperationTypes';

const HARD_MAX_HISTORY_TRANSACTIONS = 500;
const HARD_MAX_HISTORY_BYTES = 64 * 1024 * 1024;
const HARD_MAX_SNAPSHOT_COUNT = 500;

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(candidate)));
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export class WorkspaceOperationEngine {
  private readonly histories = new Map<string, DocumentHistoryState>();
  private readonly groups = new Map<string, WorkspaceOperationGroup>();
  private readonly maxOperationsPerTransaction: number;
  private readonly maxHistoryTransactions: number;
  private readonly maxHistoryBytes: number;
  private readonly keepRecentTransactions: number;
  private readonly maxNamedVersions: number;
  private readonly maxAutosaveSnapshots: number;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(options: OperationEngineOptions = {}) {
    this.maxOperationsPerTransaction = boundedInteger(options.maxOperationsPerTransaction, 50_000, 1, 50_000);
    this.maxHistoryTransactions = boundedInteger(options.maxHistoryTransactions, HARD_MAX_HISTORY_TRANSACTIONS, 1, HARD_MAX_HISTORY_TRANSACTIONS);
    this.maxHistoryBytes = boundedInteger(options.maxHistoryBytes, HARD_MAX_HISTORY_BYTES, 1, HARD_MAX_HISTORY_BYTES);
    this.keepRecentTransactions = boundedInteger(options.keepRecentTransactions, Math.min(256, this.maxHistoryTransactions), 1, this.maxHistoryTransactions);
    this.maxNamedVersions = boundedInteger(options.maxNamedVersions, 128, 1, HARD_MAX_SNAPSHOT_COUNT);
    this.maxAutosaveSnapshots = boundedInteger(options.maxAutosaveSnapshots, 16, 1, HARD_MAX_SNAPSHOT_COUNT);
    this.now = options.now ?? (() => Date.now());
    this.idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  }

  private history(documentId: string): DocumentHistoryState {
    let history = this.histories.get(documentId);
    if (!history) {
      history = { undo: [], redo: [], boundaryEpoch: 0, boundaries: [], namedVersions: [], autosaveSnapshots: [] };
      this.histories.set(documentId, history);
    }
    return history;
  }

  createTransaction(before: WorkspaceDocument, proposed: WorkspaceDocument, description: string, groupId?: string): WorkspaceOperationTransaction | null {
    validateWorkspaceDocumentInvariants(before, { allowFutureSchema: true });
    validateWorkspaceDocumentInvariants(proposed, { allowFutureSchema: true });
    if (before.id !== proposed.id || before.kind !== proposed.kind) throw new WorkspaceOperationError('INVALID', 'Editable transition cannot change document identity or kind');
    const operations: WorkspaceDeltaOperation[] = [];
    diffValue(before.id, before, proposed, [], operations, this.idFactory, this.maxOperationsPerTransaction);
    if (operations.length === 0) return null;
    const history = this.history(before.id);
    const transaction: WorkspaceOperationTransaction = {
      id: this.idFactory(),
      groupId,
      documentId: before.id,
      baseVersion: before.version,
      boundaryEpoch: history.boundaryEpoch,
      timestamp: this.now(),
      description: description.trim().slice(0, 512) || 'Workspace edit',
      operations,
    };
    if (transactionBytes(transaction) > this.maxHistoryBytes) throw new WorkspaceOperationError('LIMIT', 'Operation transaction exceeds the hard history byte budget');
    return transaction;
  }

  applyTransactionAtomic(document: WorkspaceDocument, transaction: WorkspaceOperationTransaction, requireExactVersion = false): WorkspaceDocument {
    if (transaction.documentId !== document.id) throw new WorkspaceOperationError('INVALID', 'Transaction targets a different document');
    if (!Number.isInteger(transaction.baseVersion) || transaction.baseVersion < 0) throw new WorkspaceOperationError('INVALID', 'Transaction base version is invalid');
    if (requireExactVersion && document.version !== transaction.baseVersion) throw new WorkspaceOperationError('CONFLICT', 'Document version changed before transaction commit');
    if (transaction.operations.length < 1 || transaction.operations.length > this.maxOperationsPerTransaction) throw new WorkspaceOperationError('LIMIT', 'Transaction operation count is invalid');

    const shadow = clone(document);
    for (const operation of transaction.operations) {
      if (operation.documentId !== document.id) throw new WorkspaceOperationError('INVALID', 'Compound transaction crosses document identity');
      validatePath(operation.path);
      const current = valueAt(shadow, operation.path);
      if (!sameOperationValue(current, operation.before)) {
        throw new WorkspaceOperationError('CONFLICT', `Operation precondition failed at ${operation.path.join('.')}`);
      }
      setValueAt(shadow, operation.path, operation.after);
    }
    shadow.version = Math.max(document.version, transaction.baseVersion) + 1;
    shadow.modified_at = transaction.timestamp;
    validateWorkspaceDocumentInvariants(shadow, { allowFutureSchema: true });
    return shadow;
  }

  commitTransition(before: WorkspaceDocument, proposed: WorkspaceDocument, description: string, groupId?: string): CommitResult {
    const transaction = this.createTransaction(before, proposed, description, groupId);
    if (!transaction) return { document: before, transaction: null };
    const document = this.applyTransactionAtomic(before, transaction, true);
    const history = this.history(before.id);
    history.undo.push(transaction);
    history.redo = [];
    this.compactHistoryIfNeeded(document);
    return { document, transaction };
  }

  commitDocumentMapTransition(
    before: Record<string, WorkspaceDocument>,
    proposed: Record<string, WorkspaceDocument>,
    description: string,
  ): GroupCommitResult {
    const candidateIds = [...new Set([...Object.keys(before), ...Object.keys(proposed)])].sort();
    const editedIds = candidateIds.filter((id) => before[id] && proposed[id] && !deepEqual(before[id], proposed[id]));
    if (editedIds.length === 0) return { documents: before, group: null, touchedDocumentIds: [] };
    const groupId = this.idFactory();
    const transactions = editedIds.map((id) => this.createTransaction(before[id], proposed[id], description, groupId)).filter((tx): tx is WorkspaceOperationTransaction => tx !== null);
    const shadow = { ...before };
    for (const transaction of transactions) shadow[transaction.documentId] = this.applyTransactionAtomic(shadow[transaction.documentId], transaction, true);

    // History is mutated only after all documents validate, preserving group atomicity.
    for (const transaction of transactions) {
      const history = this.history(transaction.documentId);
      history.undo.push(transaction);
      history.redo = [];
      this.compactHistoryIfNeeded(shadow[transaction.documentId]);
    }
    const group: WorkspaceOperationGroup = {
      id: groupId,
      description: description.trim().slice(0, 512) || 'Workspace operation group',
      timestamp: this.now(),
      transactionIds: transactions.map((tx) => tx.id),
      documentIds: transactions.map((tx) => tx.documentId),
    };
    this.groups.set(group.id, group);
    return { documents: shadow, group, touchedDocumentIds: group.documentIds };
  }

  canUndo(documentId: string): boolean {
    return (this.histories.get(documentId)?.undo.length ?? 0) > 0;
  }

  canRedo(documentId: string): boolean {
    return (this.histories.get(documentId)?.redo.length ?? 0) > 0;
  }

  undoDocumentMap(
    documents: Record<string, WorkspaceDocument>,
    documentId: string,
    allowAcrossHardBoundary = false,
  ): GroupCommitResult {
    const current = documents[documentId];
    if (!current) throw new WorkspaceOperationError('INVALID', 'Undo document is unavailable');
    const history = this.history(documentId);
    const transaction = history.undo[history.undo.length - 1];
    if (!transaction) throw new WorkspaceOperationError('EMPTY', 'Undo history is empty');
    if (transaction.groupId) {
      const group = this.groups.get(transaction.groupId);
      if (group && group.documentIds.length > 1) {
        const next = this.undoGroup(documents, transaction.groupId);
        return { documents: next, group, touchedDocumentIds: [...group.documentIds] };
      }
    }
    const result = this.undo(current, allowAcrossHardBoundary);
    return { documents: { ...documents, [documentId]: result.document }, group: null, touchedDocumentIds: [documentId] };
  }

  redoDocumentMap(documents: Record<string, WorkspaceDocument>, documentId: string): GroupCommitResult {
    const current = documents[documentId];
    if (!current) throw new WorkspaceOperationError('INVALID', 'Redo document is unavailable');
    const history = this.history(documentId);
    const transaction = history.redo[history.redo.length - 1];
    if (!transaction) throw new WorkspaceOperationError('EMPTY', 'Redo history is empty');
    if (transaction.groupId) {
      const group = this.groups.get(transaction.groupId);
      if (group && group.documentIds.length > 1) {
        const shadow = { ...documents };
        const replayed: WorkspaceOperationTransaction[] = [];
        for (const groupedDocumentId of group.documentIds) {
          const document = shadow[groupedDocumentId];
          if (!document) throw new WorkspaceOperationError('CONFLICT', `Group document ${groupedDocumentId} is unavailable`);
          const groupedHistory = this.history(groupedDocumentId);
          const original = groupedHistory.redo[groupedHistory.redo.length - 1];
          if (!original || original.groupId !== group.id) throw new WorkspaceOperationError('CONFLICT', 'Cross-document redo is no longer at every history tip');
          const replay: WorkspaceOperationTransaction = {
            ...original,
            id: this.idFactory(),
            baseVersion: document.version,
            timestamp: this.now(),
            description: `Redo: ${original.description}`,
            operations: original.operations.map((operation) => ({ ...clone(operation), operationId: this.idFactory() })),
          };
          shadow[groupedDocumentId] = this.applyTransactionAtomic(document, replay, false);
          replayed.push(original);
        }
        for (const original of replayed) {
          const groupedHistory = this.history(original.documentId);
          groupedHistory.redo.pop();
          groupedHistory.undo.push(original);
        }
        return { documents: shadow, group, touchedDocumentIds: [...group.documentIds] };
      }
    }
    const result = this.redo(current);
    return { documents: { ...documents, [documentId]: result.document }, group: null, touchedDocumentIds: [documentId] };
  }

  undo(document: WorkspaceDocument, allowAcrossHardBoundary = false): CommitResult {
    const history = this.history(document.id);
    const transaction = history.undo[history.undo.length - 1];
    if (!transaction) throw new WorkspaceOperationError('EMPTY', 'Undo history is empty');
    if (!allowAcrossHardBoundary && transaction.boundaryEpoch < history.boundaryEpoch) throw new WorkspaceOperationError('BOUNDARY', 'Undo reached a protected history boundary');
    const inverse: WorkspaceOperationTransaction = {
      ...transaction,
      id: this.idFactory(),
      baseVersion: document.version,
      timestamp: this.now(),
      description: `Undo: ${transaction.description}`,
      operations: [...transaction.operations].reverse().map((operation) => invertOperation(operation, this.idFactory)),
    };
    const next = this.applyTransactionAtomic(document, inverse, false);
    history.undo.pop();
    history.redo.push(transaction);
    return { document: next, transaction: inverse };
  }

  redo(document: WorkspaceDocument): CommitResult {
    const history = this.history(document.id);
    const transaction = history.redo[history.redo.length - 1];
    if (!transaction) throw new WorkspaceOperationError('EMPTY', 'Redo history is empty');
    const replay: WorkspaceOperationTransaction = {
      ...transaction,
      id: this.idFactory(),
      baseVersion: document.version,
      timestamp: this.now(),
      description: `Redo: ${transaction.description}`,
      operations: transaction.operations.map((operation) => ({ ...clone(operation), operationId: this.idFactory() })),
    };
    const next = this.applyTransactionAtomic(document, replay, false);
    history.redo.pop();
    history.undo.push(transaction);
    return { document: next, transaction: replay };
  }

  undoGroup(documents: Record<string, WorkspaceDocument>, groupId: string): Record<string, WorkspaceDocument> {
    const group = this.groups.get(groupId);
    if (!group) throw new WorkspaceOperationError('INVALID', 'Operation group is unknown');
    const shadow = { ...documents };
    const transactions: WorkspaceOperationTransaction[] = [];
    for (const documentId of group.documentIds) {
      const document = shadow[documentId];
      if (!document) throw new WorkspaceOperationError('CONFLICT', `Group document ${documentId} is unavailable`);
      const history = this.history(documentId);
      const transaction = history.undo[history.undo.length - 1];
      if (!transaction || transaction.groupId !== groupId) throw new WorkspaceOperationError('CONFLICT', 'Cross-document group is no longer at every history tip');
      if (transaction.boundaryEpoch < history.boundaryEpoch) throw new WorkspaceOperationError('BOUNDARY', 'Cross-document undo reached a protected boundary');
      transactions.push(transaction);
      const inverse: WorkspaceOperationTransaction = {
        ...transaction,
        id: this.idFactory(),
        baseVersion: document.version,
        timestamp: this.now(),
        operations: [...transaction.operations].reverse().map((operation) => invertOperation(operation, this.idFactory)),
      };
      shadow[documentId] = this.applyTransactionAtomic(document, inverse, false);
    }
    for (const transaction of transactions) {
      const history = this.history(transaction.documentId);
      history.undo.pop();
      history.redo.push(transaction);
    }
    return shadow;
  }

  private snapshotBytes(history: DocumentHistoryState): number {
    return history.namedVersions.reduce((sum, version) => sum + encodedBytes(version.snapshot), 0)
      + history.autosaveSnapshots.reduce((sum, snapshot) => sum + encodedBytes(snapshot.snapshot), 0)
      + (history.compactedAnchor ? encodedBytes(history.compactedAnchor.snapshot) : 0);
  }

  private enforceSnapshotBudget(history: DocumentHistoryState): void {
    const snapshotCount = () => history.namedVersions.length + history.autosaveSnapshots.length + (history.compactedAnchor ? 1 : 0);
    while (snapshotCount() > HARD_MAX_SNAPSHOT_COUNT || this.snapshotBytes(history) > this.maxHistoryBytes) {
      const named = history.namedVersions[0];
      const autosave = history.autosaveSnapshots[0];
      if (!named && !autosave) {
        history.compactedAnchor = undefined;
        break;
      }
      if (!autosave || (named && named.createdAt <= autosave.createdAt)) history.namedVersions.shift();
      else history.autosaveSnapshots.shift();
    }
    if (snapshotCount() > HARD_MAX_SNAPSHOT_COUNT || this.snapshotBytes(history) > this.maxHistoryBytes) history.compactedAnchor = undefined;
  }

  markBoundary(document: WorkspaceDocument, reason: HistoryBoundaryReason, label: string, hard = true): HistoryBoundary {
    const history = this.history(document.id);
    history.boundaryEpoch += 1;
    const boundary: HistoryBoundary = {
      id: this.idFactory(),
      documentId: document.id,
      epoch: history.boundaryEpoch,
      version: document.version,
      timestamp: this.now(),
      reason,
      label: label.trim().slice(0, 256) || reason,
      hard,
    };
    history.boundaries.push(boundary);
    if (history.boundaries.length > 256) history.boundaries.splice(0, history.boundaries.length - 256);
    return boundary;
  }

  createNamedVersion(document: WorkspaceDocument, name: string): NamedWorkspaceVersion {
    const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 128);
    if (!normalized || /[\u0000-\u001f]/.test(normalized)) throw new WorkspaceOperationError('INVALID', 'Named version label is invalid');
    validateWorkspaceDocumentInvariants(document, { allowFutureSchema: true });
    const history = this.history(document.id);
    const version: NamedWorkspaceVersion = {
      id: this.idFactory(),
      documentId: document.id,
      name: normalized,
      createdAt: this.now(),
      sourceVersion: document.version,
      snapshot: clone(document),
    };
    if (encodedBytes(version.snapshot) > this.maxHistoryBytes) throw new WorkspaceOperationError('LIMIT', 'Named version exceeds the hard snapshot byte budget');
    history.namedVersions.push(version);
    if (history.namedVersions.length > this.maxNamedVersions) history.namedVersions.splice(0, history.namedVersions.length - this.maxNamedVersions);
    this.enforceSnapshotBudget(history);
    this.markBoundary(document, 'named-version', `Named version: ${normalized}`, true);
    return clone(version);
  }

  listNamedVersions(documentId: string): NamedWorkspaceVersion[] {
    return this.history(documentId).namedVersions.map(clone).sort((a, b) => b.createdAt - a.createdAt);
  }

  restoreNamedVersion(current: WorkspaceDocument, versionId: string): CommitResult {
    const version = this.history(current.id).namedVersions.find((candidate) => candidate.id === versionId);
    if (!version) throw new WorkspaceOperationError('INVALID', 'Named version does not exist');
    return this.commitTransition(current, version.snapshot, `Restore named version: ${version.name}`);
  }

  createAutosaveSnapshot(document: WorkspaceDocument, reason = 'autosave'): OperationAutosaveSnapshot {
    validateWorkspaceDocumentInvariants(document, { allowFutureSchema: true });
    const history = this.history(document.id);
    const snapshot: OperationAutosaveSnapshot = {
      id: this.idFactory(),
      documentId: document.id,
      createdAt: this.now(),
      reason: reason.trim().slice(0, 128) || 'autosave',
      sourceVersion: document.version,
      historyCursor: history.undo[history.undo.length - 1]?.id ?? null,
      snapshot: clone(document),
    };
    if (encodedBytes(snapshot.snapshot) > this.maxHistoryBytes) throw new WorkspaceOperationError('LIMIT', 'Autosave snapshot exceeds the hard snapshot byte budget');
    history.autosaveSnapshots.push(snapshot);
    if (history.autosaveSnapshots.length > this.maxAutosaveSnapshots) history.autosaveSnapshots.splice(0, history.autosaveSnapshots.length - this.maxAutosaveSnapshots);
    this.enforceSnapshotBudget(history);
    return clone(snapshot);
  }

  recoverLatestAutosave(documentId: string): WorkspaceDocument | null {
    const latest = this.history(documentId).autosaveSnapshots[this.history(documentId).autosaveSnapshots.length - 1];
    return latest ? clone(latest.snapshot) : null;
  }

  compactHistoryIfNeeded(document: WorkspaceDocument): CompactedHistoryAnchor | null {
    const history = this.history(document.id);
    const totalBytes = history.undo.reduce((sum, tx) => sum + transactionBytes(tx), 0);
    if (history.undo.length <= this.maxHistoryTransactions && totalBytes <= this.maxHistoryBytes) return null;
    const retainedNewestFirst: WorkspaceOperationTransaction[] = [];
    let retainedBytes = 0;
    for (let index = history.undo.length - 1; index >= 0 && retainedNewestFirst.length < this.keepRecentTransactions; index -= 1) {
      const transaction = history.undo[index];
      const bytes = transactionBytes(transaction);
      if (bytes > this.maxHistoryBytes) throw new WorkspaceOperationError('LIMIT', 'History transaction exceeds hard byte budget');
      if (retainedNewestFirst.length > 0 && retainedBytes + bytes > this.maxHistoryBytes) break;
      retainedNewestFirst.push(transaction);
      retainedBytes += bytes;
    }
    const retained = retainedNewestFirst.reverse();
    const compactedCount = history.undo.length - retained.length;
    if (compactedCount <= 0) return null;

    let anchorDocument = clone(document);
    for (const transaction of [...retained].reverse()) {
      for (const operation of [...transaction.operations].reverse()) {
        const inverse = invertOperation(operation, this.idFactory);
        const current = valueAt(anchorDocument, inverse.path);
        if (!sameOperationValue(current, inverse.before)) throw new WorkspaceOperationError('CONFLICT', 'History compaction could not reconstruct the retained boundary');
        setValueAt(anchorDocument, inverse.path, inverse.after);
      }
    }
    anchorDocument.version = retained[0]?.baseVersion ?? document.version;
    validateWorkspaceDocumentInvariants(anchorDocument, { allowFutureSchema: true });
    const anchor: CompactedHistoryAnchor = {
      documentId: document.id,
      version: anchorDocument.version,
      createdAt: this.now(),
      compactedTransactions: compactedCount,
      snapshot: anchorDocument,
    };
    history.undo = retained;
    history.redo = [];
    history.compactedAnchor = encodedBytes(anchor.snapshot) <= this.maxHistoryBytes ? anchor : undefined;
    this.enforceSnapshotBudget(history);
    this.markBoundary(anchorDocument, 'compaction', `Compacted ${compactedCount} historical transaction(s)`, true);
    // Retained operations are intentionally on the new side of the compaction boundary.
    for (const transaction of history.undo) transaction.boundaryEpoch = history.boundaryEpoch;
    return clone(anchor);
  }

  historyResourceUsage(documentId: string): { transactions: number; transactionBytes: number; snapshots: number; snapshotBytes: number } {
    const history = this.history(documentId);
    return {
      transactions: history.undo.length + history.redo.length,
      transactionBytes: [...history.undo, ...history.redo].reduce((sum, transaction) => sum + transactionBytes(transaction), 0),
      snapshots: history.namedVersions.length + history.autosaveSnapshots.length + (history.compactedAnchor ? 1 : 0),
      snapshotBytes: this.snapshotBytes(history),
    };
  }

  historySummary(documentId: string): { undo: number; redo: number; boundaries: number; namedVersions: number; autosaveSnapshots: number; compactedTransactions: number } {
    const history = this.history(documentId);
    return {
      undo: history.undo.length,
      redo: history.redo.length,
      boundaries: history.boundaries.length,
      namedVersions: history.namedVersions.length,
      autosaveSnapshots: history.autosaveSnapshots.length,
      compactedTransactions: history.compactedAnchor?.compactedTransactions ?? 0,
    };
  }
}
